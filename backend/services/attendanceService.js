const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const Attendance = require('../models/Attendance'); // legacy model for migration
const Course = require('../models/Course');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const AuditLog = require('../models/AuditLog');

/**
 * Normalizes a date string or Date object to a clean UTC Date object set to 00:00:00.000
 * to prevent timezone-related date shifts.
 */
function normalizeDate(inputDate) {
  if (!inputDate) return new Date();
  const d = new Date(inputDate);
  if (isNaN(d.getTime())) return new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Helper to check course authorization and retrieve course scoping.
 */
async function verifyCourseAccess(user, courseId, contextDate = null, division = '', lectureType = 'NORMAL') {
  if (!courseId) {
    const error = new Error('Course ID is required');
    error.statusCode = 400;
    throw error;
  }

  const course = await Course.findById(courseId).populate({
    path: 'department',
    populate: { path: 'institution' }
  });

  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }

  const userIdStr = user._id ? user._id.toString() : user.id?.toString();
  const userRole = user.role;

  // Super Admin: full access
  if (userRole === 'super_admin') {
    return course;
  }

  // Institution Admin: must match course's institution
  if (userRole === 'inst_admin') {
    const courseInstId = course.department?.institution?._id?.toString() || course.department?.institution?.toString();
    const userInstId = user.institution?._id?.toString() || user.institution?.toString();
    if (!courseInstId || courseInstId !== userInstId) {
      const error = new Error('Forbidden: Access denied for this institution course');
      error.statusCode = 403;
      throw error;
    }
    return course;
  }

  // Department Admin: must match course's department
  if (userRole === 'dept_admin') {
    const courseDeptId = course.department?._id?.toString() || course.department?.toString();
    const userDeptId = user.department?._id?.toString() || user.department?.toString();
    if (!courseDeptId || courseDeptId !== userDeptId) {
      const error = new Error('Forbidden: Access denied for this department course');
      error.statusCode = 403;
      throw error;
    }
    return course;
  }

  // Professor: mode-based authorization
  if (userRole === 'professor') {
    const mode = (lectureType || 'NORMAL').toUpperCase();

    const courseInstId = course.department?.institution?._id?.toString() || course.department?.institution?.toString();
    const courseDeptId = course.department?._id?.toString() || course.department?.toString();

    const userInstId = user.institution?._id?.toString() || user.institution?.toString();
    const userDeptId = user.department?._id?.toString() || user.department?.toString();

    // Verification 1: Institution & Department Scope
    if (userInstId && courseInstId && userInstId !== courseInstId) {
      const error = new Error('Forbidden: Access denied for courses in another institution');
      error.statusCode = 403;
      throw error;
    }

    if (userDeptId && courseDeptId && userDeptId !== courseDeptId) {
      const error = new Error('Forbidden: Access denied for courses in another department');
      error.statusCode = 403;
      throw error;
    }

    // NORMAL Mode: Must be assigned professor or course in user.courses
    if (mode === 'NORMAL') {
      const profId = course.professor?._id?.toString() || course.professor?.toString();
      const userCourseIds = (user.courses || []).map(c => (c._id || c).toString());
      const isAssignedProf = profId && profId === userIdStr;
      const isCourseInProfList = userCourseIds.includes(course._id.toString());

      if (isAssignedProf || isCourseInProfList) {
        return course;
      }

      const error = new Error('Forbidden: You are not assigned to this course in Normal mode');
      error.statusCode = 403;
      throw error;
    }

    // PROXY Mode: Any course in own department & institution is authorized
    if (mode === 'PROXY') {
      return course;
    }

    const error = new Error('Forbidden: Invalid lecture type mode');
    error.statusCode = 403;
    throw error;
  }

  // Student: must be actively enrolled in course
  if (userRole === 'student') {
    const enrollment = await Enrollment.findOne({
      student: userIdStr,
      course: course._id,
      status: 'active'
    });
    if (!enrollment) {
      const error = new Error('Forbidden: You are not enrolled in this course');
      error.statusCode = 403;
      throw error;
    }
    return course;
  }

  const error = new Error('Forbidden: Unauthorized role');
  error.statusCode = 403;
  throw error;
}

/**
 * Gets eligible students enrolled in a course (filtered by division if specified).
 */
async function getEligibleStudents({ courseId, division = '', user, date = null, lectureType = 'NORMAL' }) {
  await verifyCourseAccess(user, courseId, date, division, lectureType);

  const query = {
    course: courseId,
    status: 'active'
  };

  if (division && division.trim() !== '') {
    query.division = division.trim().toUpperCase();
  }

  const enrollments = await Enrollment.find(query).populate({
    path: 'student',
    select: 'name email enrollmentNumber currentSemester division isActive department createdAt',
    populate: { path: 'department', select: 'name code' }
  });
  
  // Filter active student users and attach enrollment attempt metadata
  const eligibleStudents = enrollments
    .filter(e => e.student && e.student.isActive !== false)
    .map(e => {
      const sObj = e.student.toObject ? e.student.toObject() : { ...e.student };
      sObj.enrollmentId = e._id;
      sObj.attemptNumber = e.attemptNumber || 1;
      sObj.isBacklog = e.isBacklog || false;
      sObj.academicTerm = e.academicTerm || 'CURRENT';
      return sObj;
    });

  return eligibleStudents;
}

/**
 * Creates an Attendance Session and records attendance entries.
 */
async function createAttendanceSession({
  courseId,
  date,
  startTime = '',
  topic = '',
  status = 'CONDUCTED',
  division = '',
  semester,
  academicTerm,
  records = [],
  user,
  ipAddress = '',
  lectureType = 'NORMAL'
}) {
  if (!['professor', 'dept_admin', 'inst_admin', 'super_admin'].includes(user.role)) {
    const error = new Error('Forbidden: Only professors and admins can create attendance sessions');
    error.statusCode = 403;
    throw error;
  }

  const sessionDate = normalizeDate(date);
  const targetDivision = division ? division.trim().toUpperCase() : '';
  const sessionLectureType = (lectureType || 'NORMAL').toUpperCase();

  const course = await verifyCourseAccess(user, courseId, sessionDate, targetDivision, sessionLectureType);

  const instId = course.department?.institution?._id || course.department?.institution;
  const deptId = course.department?._id || course.department;
  const targetSemester = semester || course.semester || 1;

  if (!['CONDUCTED', 'CANCELLED'].includes(status)) {
    const error = new Error('Invalid session status. Must be CONDUCTED or CANCELLED');
    error.statusCode = 400;
    throw error;
  }

  // Get active enrollments for this course
  const enrollQuery = {
    course: courseId,
    status: 'active'
  };
  if (targetDivision) {
    enrollQuery.division = targetDivision;
  }

  let activeEnrollments = await Enrollment.find(enrollQuery);
  const studentEnrollmentMap = new Map();
  activeEnrollments.forEach(e => {
    studentEnrollmentMap.set(e.student.toString(), e);
  });

  // Fallback lookup if division was not explicitly attached on enrollment
  if (targetDivision) {
    const allActiveEnrollments = await Enrollment.find({ course: courseId, status: 'active' });
    allActiveEnrollments.forEach(e => {
      if (!studentEnrollmentMap.has(e.student.toString())) {
        if (!e.division || e.division === targetDivision) {
          studentEnrollmentMap.set(e.student.toString(), e);
        }
      }
    });
  }

  // Validate student records
  const validatedRecords = [];
  for (const r of records) {
    const rawStudent = r.studentId || r.student;
    const studentIdStr = rawStudent?._id ? rawStudent._id.toString() : rawStudent?.toString();
    const activeEnrollment = studentEnrollmentMap.get(studentIdStr);

    if (!activeEnrollment) {
      const error = new Error(`Student ${studentIdStr} is not eligible or not actively enrolled in Division ${targetDivision || 'unspecified'} of this course`);
      error.statusCode = 400;
      throw error;
    }

    let resolvedEnrollmentId = activeEnrollment._id;
    const clientEnrollmentId = r.enrollmentId || r.enrollment;

    if (clientEnrollmentId) {
      const clientEnrollment = await Enrollment.findById(clientEnrollmentId);
      if (!clientEnrollment) {
        const error = new Error(`Enrollment ${clientEnrollmentId} not found`);
        error.statusCode = 400;
        throw error;
      }
      if (clientEnrollment.student.toString() !== studentIdStr) {
        const error = new Error(`Enrollment ${clientEnrollmentId} does not belong to student ${studentIdStr}`);
        error.statusCode = 400;
        throw error;
      }
      if (clientEnrollment.course.toString() !== courseId.toString()) {
        const error = new Error(`Enrollment ${clientEnrollmentId} does not belong to course ${courseId}`);
        error.statusCode = 400;
        throw error;
      }
      if (clientEnrollment.status !== 'active') {
        const error = new Error(`Enrollment ${clientEnrollmentId} is not active`);
        error.statusCode = 400;
        throw error;
      }

      // Tenant validation
      const studentUser = await User.findById(studentIdStr);
      if (user.role === 'dept_admin') {
        const userDeptId = user.department?._id?.toString() || user.department?.toString();
        const studentDeptId = studentUser?.department?._id?.toString() || studentUser?.department?.toString();
        if (userDeptId && studentDeptId && userDeptId !== studentDeptId) {
          const error = new Error(`Forbidden: Student ${studentIdStr} belongs to another department`);
          error.statusCode = 403;
          throw error;
        }
      } else if (user.role === 'inst_admin') {
        const userInstId = user.institution?._id?.toString() || user.institution?.toString();
        const studentInstId = studentUser?.institution?._id?.toString() || studentUser?.institution?.toString();
        if (userInstId && studentInstId && userInstId !== studentInstId) {
          const error = new Error(`Forbidden: Student ${studentIdStr} belongs to another institution`);
          error.statusCode = 403;
          throw error;
        }
      }

      resolvedEnrollmentId = clientEnrollment._id;
    }

    const recStatus = (r.status || '').toUpperCase();
    if (!['PRESENT', 'ABSENT'].includes(recStatus)) {
      const error = new Error(`Invalid status '${r.status}'. Only PRESENT and ABSENT are allowed.`);
      error.statusCode = 400;
      throw error;
    }

    validatedRecords.push({
      student: studentIdStr,
      enrollment: resolvedEnrollmentId,
      status: recStatus
    });
  }

  // Create Session Header
  const sessionTerm = academicTerm || activeEnrollments[0]?.academicTerm || 'CURRENT';
  const session = await AttendanceSession.create({
    course: courseId,
    institution: instId,
    department: deptId,
    semester: targetSemester,
    division: targetDivision,
    academicTerm: sessionTerm,
    date: sessionDate,
    startTime,
    topic,
    status,
    lectureType: sessionLectureType,
    markedBy: user._id,
    createdBy: user._id
  });

  // Save Student Records
  const createdRecords = [];
  if (validatedRecords.length > 0) {
    const recordDocs = validatedRecords.map(r => ({
      session: session._id,
      course: courseId,
      student: r.student,
      enrollment: r.enrollment,
      status: r.status,
      markedBy: user._id
    }));

    const inserted = await AttendanceRecord.insertMany(recordDocs);
    createdRecords.push(...inserted);
  }

  // Audit Logging
  try {
    await AuditLog.create({
      userId: user._id,
      action: 'create',
      resource: 'attendance',
      resourceId: session._id,
      description: `Created attendance session for course ${course.code} (${targetDivision || 'No Division'}) with ${createdRecords.length} records.`,
      ipAddress
    });
  } catch (err) {
    console.error('AuditLog creation failed:', err.message);
  }

  return { session, records: createdRecords };
}

/**
 * Updates an existing Attendance Session and its student records.
 */
async function updateAttendanceSession({
  sessionId,
  topic,
  status,
  records = [],
  user,
  ipAddress = ''
}) {
  if (!['professor', 'dept_admin', 'inst_admin', 'super_admin'].includes(user.role)) {
    const error = new Error('Forbidden: Only professors and admins can update attendance sessions');
    error.statusCode = 403;
    throw error;
  }

  const session = await AttendanceSession.findById(sessionId);
  if (!session) {
    const error = new Error('Attendance session not found');
    error.statusCode = 404;
    throw error;
  }

  await verifyCourseAccess(user, session.course);

  if (status && !['CONDUCTED', 'CANCELLED'].includes(status)) {
    const error = new Error('Invalid status. Must be CONDUCTED or CANCELLED');
    error.statusCode = 400;
    throw error;
  }

  if (topic !== undefined) session.topic = topic;
  if (status !== undefined) session.status = status;
  session.updatedBy = user._id;
  await session.save();

  const updatedRecords = [];
  const changes = [];

  if (records && records.length > 0) {
    for (const r of records) {
      const studentIdStr = r.student?._id ? r.student._id.toString() : r.student?.toString();
      const recStatus = (r.status || '').toUpperCase();
      if (!['PRESENT', 'ABSENT'].includes(recStatus)) {
        const error = new Error(`Invalid status '${r.status}'. Only PRESENT and ABSENT are allowed.`);
        error.statusCode = 400;
        throw error;
      }

      let recordDoc = await AttendanceRecord.findOne({ session: session._id, student: studentIdStr });
      if (recordDoc) {
        if (recordDoc.status !== recStatus) {
          changes.push({ student: studentIdStr, oldStatus: recordDoc.status, newStatus: recStatus });
          recordDoc.status = recStatus;
          recordDoc.updatedBy = user._id;
          await recordDoc.save();
        }
      } else {
        const activeEnrollment = await Enrollment.findOne({
          student: studentIdStr,
          course: session.course,
          status: 'active'
        });

        if (!activeEnrollment) {
          const error = new Error(`Student ${studentIdStr} is not actively enrolled in this course`);
          error.statusCode = 400;
          throw error;
        }

        recordDoc = await AttendanceRecord.create({
          session: session._id,
          course: session.course,
          student: studentIdStr,
          enrollment: activeEnrollment._id,
          status: recStatus,
          markedBy: user._id
        });
        changes.push({ student: studentIdStr, oldStatus: null, newStatus: recStatus });
      }
      updatedRecords.push(recordDoc);
    }
  }

  // Audit Logging
  try {
    await AuditLog.create({
      userId: user._id,
      action: 'update',
      resource: 'attendance',
      resourceId: session._id,
      description: `Updated attendance session ${session._id}`,
      changes: { changesCount: changes.length, changes },
      ipAddress
    });
  } catch (err) {
    console.error('AuditLog creation failed:', err.message);
  }

  return { session, records: updatedRecords };
}

/**
 * Gets attendance records for a student with strict RBAC / tenant checking.
 */
async function getStudentAttendance({ studentId, courseId, enrollmentId, user }) {
  const userIdStr = user._id ? user._id.toString() : user.id?.toString();

  // Student role check: can only view own attendance
  if (user.role === 'student' && userIdStr !== studentId.toString()) {
    const error = new Error('Forbidden: You are only allowed to view your own attendance records');
    error.statusCode = 403;
    throw error;
  }

  const targetStudent = await User.findById(studentId);
  if (!targetStudent) {
    const error = new Error('Student not found');
    error.statusCode = 404;
    throw error;
  }

  // Department Admin tenant check
  if (user.role === 'dept_admin') {
    const userDeptId = user.department?._id?.toString() || user.department?.toString();
    const studentDeptId = targetStudent.department?._id?.toString() || targetStudent.department?.toString();
    if (userDeptId !== studentDeptId) {
      const error = new Error('Forbidden: Student belongs to another department');
      error.statusCode = 403;
      throw error;
    }
  }

  // Institution Admin tenant check
  if (user.role === 'inst_admin') {
    const userInstId = user.institution?._id?.toString() || user.institution?.toString();
    const studentInstId = targetStudent.institution?._id?.toString() || targetStudent.institution?.toString();
    if (userInstId !== studentInstId) {
      const error = new Error('Forbidden: Student belongs to another institution');
      error.statusCode = 403;
      throw error;
    }
  }

  // Find enrollments for student
  const enrollments = await Enrollment.find({ student: studentId }).populate('course', 'name code semester');
  
  let targetEnrollment = null;
  if (enrollmentId) {
    targetEnrollment = enrollments.find(e => e._id.toString() === enrollmentId.toString());
    if (!targetEnrollment) {
      const error = new Error('Forbidden: Enrollment not found for this student');
      error.statusCode = 403;
      throw error;
    }
    if (user.role === 'professor') {
      await verifyCourseAccess(user, targetEnrollment.course._id || targetEnrollment.course);
    }
  } else if (courseId) {
    const matchingCourseEnrollment = enrollments.find(e => e.course._id.toString() === courseId.toString() && e.status === 'active')
      || enrollments.find(e => e.course._id.toString() === courseId.toString());
    if (!matchingCourseEnrollment) {
      const error = new Error('Forbidden: Student is not enrolled in this course');
      error.statusCode = 403;
      throw error;
    }
    if (user.role === 'professor') {
      await verifyCourseAccess(user, courseId);
    }
  }

  const recordQuery = { student: studentId };
  if (targetEnrollment) {
    recordQuery.$or = [
      { enrollment: targetEnrollment._id },
      ...(targetEnrollment.attemptNumber === 1 ? [{ enrollment: null, course: targetEnrollment.course._id }] : [])
    ];
  } else if (courseId) {
    recordQuery.course = courseId;
  }

  const records = await AttendanceRecord.find(recordQuery)
    .populate({
      path: 'session',
      select: 'date startTime topic status division semester academicTerm',
      match: { status: 'CONDUCTED' }
    })
    .populate('course', 'name code semester')
    .populate('enrollment', 'attemptNumber isBacklog academicTerm status')
    .sort({ createdAt: -1 });

  const validRecords = records.filter(r => r.session !== null);

  let present = 0;
  let absent = 0;
  validRecords.forEach(r => {
    if (r.status === 'PRESENT') present++;
    else if (r.status === 'ABSENT') absent++;
  });

  let totalConducted = validRecords.length;
  if (targetEnrollment) {
    const sessionQuery = {
      course: targetEnrollment.course._id || targetEnrollment.course,
      status: 'CONDUCTED'
    };
    if (targetEnrollment.division) {
      sessionQuery.division = targetEnrollment.division;
    }
    if (targetEnrollment.academicTerm) {
      sessionQuery.$or = [
        { academicTerm: targetEnrollment.academicTerm },
        { academicTerm: 'CURRENT' },
        { academicTerm: '' },
        { academicTerm: { $exists: false } }
      ];
    }
    const totalSessions = await AttendanceSession.countDocuments(sessionQuery);
    totalConducted = Math.max(validRecords.length, totalSessions);
  }

  const percentage = totalConducted > 0 ? parseFloat(((present / totalConducted) * 100).toFixed(1)) : 0;

  return {
    records: validRecords,
    stats: {
      totalClasses: totalConducted,
      present,
      absent,
      percentage
    },
    enrollment: targetEnrollment ? {
      enrollmentId: targetEnrollment._id,
      attemptNumber: targetEnrollment.attemptNumber || 1,
      isBacklog: targetEnrollment.isBacklog || false,
      academicTerm: targetEnrollment.academicTerm || 'CURRENT',
      status: targetEnrollment.status,
      division: targetEnrollment.division || ''
    } : null
  };
}

/**
 * Gets attendance for a course (session-based) with strict authorization.
 */
async function getCourseAttendance({ courseId, division, from, to, user }) {
  await verifyCourseAccess(user, courseId);

  const query = { course: courseId };
  if (division) query.division = division.toUpperCase();
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = normalizeDate(from);
    if (to) query.date.$lte = normalizeDate(to);
  }

  const sessions = await AttendanceSession.find(query)
    .populate('markedBy', 'name email')
    .sort({ date: -1 });

  const sessionIds = sessions.map(s => s._id);
  const records = await AttendanceRecord.find({ session: { $in: sessionIds } })
    .populate('student', 'name email enrollmentNumber division')
    .populate('enrollment', 'attemptNumber isBacklog academicTerm status');

  return { sessions, records };
}

/**
 * Migration helper: Idempotently converts legacy Attendance collection to AttendanceSession & AttendanceRecord.
 * NOTE: Preserves empty division ('') for historical records without fabricating Division 'A'.
 */
async function migrateLegacyAttendance() {
  const legacyDocs = await Attendance.find({});
  let migratedSessionsCount = 0;
  let migratedRecordsCount = 0;

  for (const doc of legacyDocs) {
    const course = await Course.findById(doc.course).populate({ path: 'department', populate: { path: 'institution' } });
    if (!course) continue;

    const instId = course.department?.institution?._id || course.department?.institution;
    const deptId = course.department?._id || course.department;

    let session = await AttendanceSession.findOne({
      course: doc.course,
      date: doc.date
    });

    if (!session) {
      session = await AttendanceSession.create({
        course: doc.course,
        institution: instId,
        department: deptId,
        semester: course.semester || 1,
        division: '',
        academicTerm: 'CURRENT',
        date: doc.date,
        status: 'CONDUCTED',
        markedBy: doc.markedBy,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      });
      migratedSessionsCount++;
    }

    if (doc.students && doc.students.length > 0) {
      for (const s of doc.students) {
        const studentId = s.student;
        const legacyStatus = (s.status || '').toLowerCase();
        const erpStatus = (legacyStatus === 'present' || legacyStatus === 'late') ? 'PRESENT' : 'ABSENT';

        const existingRecord = await AttendanceRecord.findOne({ session: session._id, student: studentId });
        if (!existingRecord) {
          const attempt1Enrollment = await Enrollment.findOne({ student: studentId, course: doc.course, attemptNumber: 1 });
          await AttendanceRecord.create({
            session: session._id,
            course: doc.course,
            student: studentId,
            enrollment: attempt1Enrollment ? attempt1Enrollment._id : null,
            status: erpStatus,
            markedBy: doc.markedBy,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt
          });
          migratedRecordsCount++;
        }
      }
    }
  }

  return { migratedSessionsCount, migratedRecordsCount };
}

/**
 * Centralized calculation helper for attendance percentages.
 * Always returns 0 when conducted is 0, avoiding NaN/Infinity.
 */
function calculateAttendancePercentage(present, conducted) {
  if (!conducted || conducted <= 0) return 0;
  if (!present || present <= 0) return 0;
  return parseFloat(((present / conducted) * 100).toFixed(1));
}

/**
 * Gets attendance history with pagination, filtering, and role-based access control.
 */
async function getAttendanceHistory({
  user,
  courseId,
  semester,
  division,
  professorId,
  studentId,
  departmentId,
  institutionId,
  from,
  to,
  status,
  page = 1,
  limit = 20
}) {
  const query = {};
  const userIdStr = user._id ? user._id.toString() : user.id?.toString();

  if (user.role === 'student') {
    studentId = userIdStr;
  } else if (user.role === 'professor') {
    if (courseId) {
      await verifyCourseAccess(user, courseId);
      query.course = courseId;
    } else {
      const userCourseIds = (user.courses || []).map(c => c._id || c);
      query.$or = [{ markedBy: userIdStr }, { course: { $in: userCourseIds } }];
    }
  } else if (user.role === 'dept_admin') {
    const userDeptId = user.department?._id || user.department;
    query.department = userDeptId;
    if (departmentId && departmentId.toString() !== userDeptId.toString()) {
      const error = new Error('Forbidden: Access denied for this department');
      error.statusCode = 403;
      throw error;
    }
  } else if (user.role === 'inst_admin') {
    const userInstId = user.institution?._id || user.institution;
    query.institution = userInstId;
    if (institutionId && institutionId.toString() !== userInstId.toString()) {
      const error = new Error('Forbidden: Access denied for this institution');
      error.statusCode = 403;
      throw error;
    }
  }

  if (courseId && user.role !== 'professor') query.course = courseId;
  if (semester) query.semester = parseInt(semester, 10);
  if (division) query.division = division.toUpperCase();
  if (departmentId && user.role === 'super_admin') query.department = departmentId;
  if (institutionId && user.role === 'super_admin') query.institution = institutionId;
  if (professorId) query.markedBy = professorId;
  if (status) query.status = status.toUpperCase();

  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = normalizeDate(from);
    if (to) query.date.$lte = normalizeDate(to);
  }

  let sessionIdsFilter = null;

  if (studentId) {
    if (user.role === 'student' && userIdStr !== studentId.toString()) {
      const error = new Error('Forbidden: You can only view your own attendance history');
      error.statusCode = 403;
      throw error;
    }
    const studentRecords = await AttendanceRecord.find({ student: studentId }).select('session');
    sessionIdsFilter = studentRecords.map(r => r.session);
    query._id = { $in: sessionIdsFilter };
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [sessions, total] = await Promise.all([
    AttendanceSession.find(query)
      .populate('course', 'name code semester')
      .populate('department', 'name')
      .populate('institution', 'name')
      .populate('markedBy', 'name email')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    AttendanceSession.countDocuments(query)
  ]);

  let recordMap = {};
  if (sessions.length > 0) {
    const sessionIds = sessions.map(s => s._id);
    const recQuery = { session: { $in: sessionIds } };
    if (studentId) recQuery.student = studentId;

    const records = await AttendanceRecord.find(recQuery)
      .populate('student', 'name email enrollmentNumber division')
      .populate('enrollment', 'attemptNumber isBacklog academicTerm status');
    records.forEach(r => {
      const sId = r.session.toString();
      if (!recordMap[sId]) recordMap[sId] = [];
      recordMap[sId].push(r);
    });
  }

  const data = sessions.map(s => ({
    session: s,
    records: recordMap[s._id.toString()] || []
  }));

  return {
    data,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1
    }
  };
}

/**
 * Gets student attendance summary across all enrolled courses using centralized formulas.
 */
async function getStudentSummary({ studentId, user }) {
  const userIdStr = user._id ? user._id.toString() : user.id?.toString();

  if (user.role === 'student' && userIdStr !== studentId.toString()) {
    const error = new Error('Forbidden: You are only allowed to view your own summary');
    error.statusCode = 403;
    throw error;
  }

  const targetStudent = await User.findById(studentId);
  if (!targetStudent) {
    const error = new Error('Student not found');
    error.statusCode = 404;
    throw error;
  }

  const enrollments = await Enrollment.find({ student: studentId }).populate('course', 'name code semester');

  const records = await AttendanceRecord.find({ student: studentId })
    .populate({
      path: 'session',
      select: 'date startTime topic status division semester academicTerm',
      match: { status: 'CONDUCTED' }
    })
    .populate('course', 'name code semester')
    .sort({ createdAt: -1 });

  const validRecords = records.filter(r => r.session !== null);

  const courseList = [];
  let overallActiveConducted = 0;
  let overallActivePresent = 0;
  let overallActiveAbsent = 0;

  for (const e of enrollments) {
    if (!e.course) continue;

    const eRecords = validRecords.filter(r => {
      if (r.enrollment) {
        return r.enrollment.toString() === e._id.toString();
      }
      return e.attemptNumber === 1 && r.course?._id?.toString() === e.course._id.toString();
    });

    let present = 0;
    let absent = 0;
    eRecords.forEach(r => {
      if (r.status === 'PRESENT') present++;
      else if (r.status === 'ABSENT') absent++;
    });

    const sessionQuery = {
      course: e.course._id,
      status: 'CONDUCTED'
    };
    if (e.division) {
      sessionQuery.division = e.division;
    }
    if (e.academicTerm) {
      sessionQuery.$or = [
        { academicTerm: e.academicTerm },
        { academicTerm: 'CURRENT' },
        { academicTerm: '' },
        { academicTerm: { $exists: false } }
      ];
    }

    const totalSessions = await AttendanceSession.countDocuments(sessionQuery);
    const conducted = Math.max(eRecords.length, totalSessions);
    const percentage = calculateAttendancePercentage(present, conducted);

    const summaryItem = {
      enrollmentId: e._id,
      courseId: e.course._id,
      courseName: e.course.name || '',
      courseCode: e.course.code || '',
      semester: e.course.semester || 1,
      division: e.division || '',
      academicTerm: e.academicTerm || 'CURRENT',
      attemptNumber: e.attemptNumber || 1,
      isBacklog: e.isBacklog || false,
      status: e.status,
      conducted,
      present,
      absent,
      percentage
    };

    courseList.push(summaryItem);

    if (e.status === 'active') {
      overallActiveConducted += conducted;
      overallActivePresent += present;
      overallActiveAbsent += absent;
    }
  }

  let overallConducted = overallActiveConducted;
  let overallPresent = overallActivePresent;
  let overallAbsent = overallActiveAbsent;

  if (enrollments.length > 0 && overallActiveConducted === 0) {
    courseList.forEach(c => {
      overallConducted += c.conducted;
      overallPresent += c.present;
      overallAbsent += c.absent;
    });
  }

  const overallPercentage = calculateAttendancePercentage(overallPresent, overallConducted);

  return {
    overall: {
      conducted: overallConducted,
      present: overallPresent,
      absent: overallAbsent,
      percentage: overallPercentage
    },
    courses: courseList
  };
}

/**
 * Gets course attendance summary with student-wise breakdown.
 */
async function getCourseSummary({ courseId, semester, division, user }) {
  const course = await verifyCourseAccess(user, courseId);

  const enrollQuery = {
    course: courseId,
    status: 'active'
  };
  if (division) enrollQuery.division = division.toUpperCase();

  const activeEnrollments = await Enrollment.find(enrollQuery)
    .populate('student', 'name email enrollmentNumber division isActive');

  const sessionQuery = { course: courseId, status: 'CONDUCTED' };
  if (division) sessionQuery.division = division.toUpperCase();
  if (semester) sessionQuery.semester = parseInt(semester, 10);
  if (activeEnrollments.length > 0 && activeEnrollments[0].academicTerm) {
    const term = activeEnrollments[0].academicTerm;
    sessionQuery.$or = [{ academicTerm: term }, { academicTerm: 'CURRENT' }, { academicTerm: '' }, { academicTerm: { $exists: false } }];
  }

  const sessions = await AttendanceSession.find(sessionQuery).select('_id date division semester');
  const sessionIds = sessions.map(s => s._id);
  const totalConducted = sessions.length;

  const records = await AttendanceRecord.find({ session: { $in: sessionIds } });

  const studentsList = [];

  for (const e of activeEnrollments) {
    if (!e.student || e.student.isActive === false) continue;

    const studentIdStr = e.student._id.toString();

    const studentRecords = records.filter(r => {
      if (r.enrollment) {
        return r.enrollment.toString() === e._id.toString();
      }
      return e.attemptNumber === 1 && r.student.toString() === studentIdStr;
    });

    let present = 0;
    let absent = 0;
    studentRecords.forEach(r => {
      if (r.status === 'PRESENT') present++;
      else if (r.status === 'ABSENT') absent++;
    });

    studentsList.push({
      studentId: e.student._id,
      enrollmentId: e._id,
      attemptNumber: e.attemptNumber || 1,
      isBacklog: e.isBacklog || false,
      academicTerm: e.academicTerm || 'CURRENT',
      name: e.student.name,
      email: e.student.email,
      enrollmentNumber: e.student.enrollmentNumber || '',
      division: e.division || division || '',
      present,
      absent,
      percentage: calculateAttendancePercentage(present, totalConducted)
    });
  }

  return {
    course: {
      id: course._id,
      name: course.name,
      code: course.code,
      semester: course.semester
    },
    summary: {
      conducted: totalConducted
    },
    students: studentsList
  };
}

/**
 * Gets professor attendance summary across assigned courses.
 */
async function getProfessorSummary({ user }) {
  if (user.role !== 'professor' && user.role !== 'super_admin') {
    const error = new Error('Forbidden: Professor access required');
    error.statusCode = 403;
    throw error;
  }

  const userIdStr = user._id ? user._id.toString() : user.id?.toString();
  const userCourseIds = (user.courses || []).map(c => c._id || c);

  const courses = await Course.find({
    $or: [{ professor: userIdStr }, { _id: { $in: userCourseIds } }]
  });

  const courseSummaries = await Promise.all(
    courses.map(async (c) => {
      const summary = await getCourseSummary({ courseId: c._id, user });
      return {
        courseId: c._id,
        courseName: c.name,
        courseCode: c.code,
        semester: c.semester,
        conducted: summary.summary.conducted,
        totalStudents: summary.students.length,
        students: summary.students
      };
    })
  );

  return {
    professor: { id: user._id, name: user.name, email: user.email },
    courses: courseSummaries
  };
}

/**
 * Gets department-level attendance aggregation.
 */
async function getDepartmentSummary({ departmentId, semester, division, courseId, professorId, from, to, user }) {
  if (user.role === 'dept_admin') {
    const userDeptId = user.department?._id?.toString() || user.department?.toString();
    if (userDeptId !== departmentId.toString()) {
      const error = new Error('Forbidden: Access denied for this department');
      error.statusCode = 403;
      throw error;
    }
  } else if (user.role === 'inst_admin') {
    const userInstId = user.institution?._id?.toString() || user.institution?.toString();
    const dept = await require('../models/Department').findById(departmentId);
    if (!dept || dept.institution?.toString() !== userInstId) {
      const error = new Error('Forbidden: Department belongs to another institution');
      error.statusCode = 403;
      throw error;
    }
  } else if (user.role !== 'super_admin') {
    const error = new Error('Forbidden: Admin access required');
    error.statusCode = 403;
    throw error;
  }

  const sessionQuery = { department: departmentId, status: 'CONDUCTED' };
  if (semester) sessionQuery.semester = parseInt(semester, 10);
  if (division) sessionQuery.division = division.toUpperCase();
  if (courseId) sessionQuery.course = courseId;
  if (professorId) sessionQuery.markedBy = professorId;
  if (from || to) {
    sessionQuery.date = {};
    if (from) sessionQuery.date.$gte = normalizeDate(from);
    if (to) sessionQuery.date.$lte = normalizeDate(to);
  }

  const sessions = await AttendanceSession.find(sessionQuery);
  const sessionIds = sessions.map(s => s._id);
  const records = await AttendanceRecord.find({ session: { $in: sessionIds } });

  const totalConductedSessions = sessions.length;
  let totalPresent = 0;
  let totalAbsent = 0;

  records.forEach(r => {
    if (r.status === 'PRESENT') totalPresent++;
    else if (r.status === 'ABSENT') absent++;
  });

  const totalRecords = records.length;
  const overallPercentage = calculateAttendancePercentage(totalPresent, totalRecords);

  return {
    departmentId,
    summary: {
      conductedSessions: totalConductedSessions,
      totalRecords,
      presentRecords: totalPresent,
      absentRecords: totalAbsent,
      percentage: overallPercentage
    }
  };
}

/**
 * Gets institution-level attendance aggregation.
 */
async function getInstitutionSummary({ institutionId, departmentId, semester, division, from, to, user }) {
  if (user.role === 'inst_admin') {
    const userInstId = user.institution?._id?.toString() || user.institution?.toString();
    if (userInstId !== institutionId.toString()) {
      const error = new Error('Forbidden: Access denied for this institution');
      error.statusCode = 403;
      throw error;
    }
  } else if (user.role !== 'super_admin') {
    const error = new Error('Forbidden: Institution admin access required');
    error.statusCode = 403;
    throw error;
  }

  const sessionQuery = { institution: institutionId, status: 'CONDUCTED' };
  if (departmentId) sessionQuery.department = departmentId;
  if (semester) sessionQuery.semester = parseInt(semester, 10);
  if (division) sessionQuery.division = division.toUpperCase();
  if (from || to) {
    sessionQuery.date = {};
    if (from) sessionQuery.date.$gte = normalizeDate(from);
    if (to) sessionQuery.date.$lte = normalizeDate(to);
  }

  const sessions = await AttendanceSession.find(sessionQuery);
  const sessionIds = sessions.map(s => s._id);
  const records = await AttendanceRecord.find({ session: { $in: sessionIds } });

  let totalPresent = 0;
  records.forEach(r => {
    if (r.status === 'PRESENT') totalPresent++;
  });

  const overallPercentage = calculateAttendancePercentage(totalPresent, records.length);

  return {
    institutionId,
    summary: {
      conductedSessions: sessions.length,
      totalRecords: records.length,
      presentRecords: totalPresent,
      percentage: overallPercentage
    }
  };
}

/**
 * Identifies low attendance students below configurable threshold.
 */
async function getLowAttendance({ threshold = 75, departmentId, institutionId, courseId, semester, division, user }) {
  const filterThreshold = parseFloat(threshold) || 75;

  const enrollQuery = { status: 'active' };
  if (courseId) {
    await verifyCourseAccess(user, courseId);
    enrollQuery.course = courseId;
  }
  if (division) enrollQuery.division = division.toUpperCase();

  const enrollments = await Enrollment.find(enrollQuery)
    .populate('student', 'name email enrollmentNumber department institution isActive division')
    .populate('course', 'name code semester');

  const lowAttendanceList = [];

  for (const e of enrollments) {
    const s = e.student;
    if (!s || s.isActive === false) continue;

    // Tenant Scoping check
    if (user.role === 'dept_admin') {
      const userDeptId = user.department?._id?.toString() || user.department?.toString();
      const studentDeptId = s.department?._id?.toString() || s.department?.toString();
      if (userDeptId !== studentDeptId) continue;
    } else if (user.role === 'inst_admin') {
      const userInstId = user.institution?._id?.toString() || user.institution?.toString();
      const studentInstId = s.institution?._id?.toString() || s.institution?.toString();
      if (userInstId !== studentInstId) continue;
    }

    const records = await AttendanceRecord.find({
      student: s._id,
      $or: [
        { enrollment: e._id },
        ...(e.attemptNumber === 1 ? [{ enrollment: null, course: e.course._id || e.course }] : [])
      ]
    }).populate({
      path: 'session',
      select: 'status division academicTerm',
      match: { status: 'CONDUCTED' }
    });

    const validRecords = records.filter(r => r.session !== null);
    let present = 0;
    let absent = 0;
    validRecords.forEach(r => {
      if (r.status === 'PRESENT') present++;
      else if (r.status === 'ABSENT') absent++;
    });

    const sessionQuery = {
      course: e.course._id || e.course,
      status: 'CONDUCTED'
    };
    if (e.division) sessionQuery.division = e.division;
    if (e.academicTerm) {
      sessionQuery.$or = [
        { academicTerm: e.academicTerm },
        { academicTerm: 'CURRENT' },
        { academicTerm: '' },
        { academicTerm: { $exists: false } }
      ];
    }

    const totalSessions = await AttendanceSession.countDocuments(sessionQuery);
    const conducted = Math.max(validRecords.length, totalSessions);
    const percentage = calculateAttendancePercentage(present, conducted);

    if (conducted > 0 && percentage < filterThreshold) {
      lowAttendanceList.push({
        student: {
          id: s._id,
          name: s.name,
          email: s.email,
          enrollmentNumber: s.enrollmentNumber || '',
          division: e.division || s.division || ''
        },
        enrollmentId: e._id,
        attemptNumber: e.attemptNumber || 1,
        isBacklog: e.isBacklog || false,
        academicTerm: e.academicTerm || 'CURRENT',
        courseId: e.course._id || e.course,
        courseCode: e.course.code || '',
        conducted,
        present,
        absent,
        percentage
      });
    }
  }

  return {
    threshold: filterThreshold,
    count: lowAttendanceList.length,
    students: lowAttendanceList
  };
}

/**
 * Creates a FacultySubstitution record with strict validation & tenant scoping.
 */
async function createFacultySubstitution({
  courseId,
  substituteProfessorId,
  date,
  division = '',
  user,
  ipAddress = ''
}) {
  if (!['dept_admin', 'inst_admin', 'super_admin'].includes(user.role)) {
    const error = new Error('Forbidden: Only Department, Institution, or Super Admins can create faculty substitutions');
    error.statusCode = 403;
    throw error;
  }

  const course = await Course.findById(courseId).populate({
    path: 'department',
    populate: { path: 'institution' }
  });

  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }

  // Tenant Scoping
  if (user.role === 'dept_admin') {
    const courseDeptId = course.department?._id?.toString() || course.department?.toString();
    const userDeptId = user.department?._id?.toString() || user.department?.toString();
    if (!courseDeptId || courseDeptId !== userDeptId) {
      const error = new Error('Forbidden: Cannot create substitution for another department course');
      error.statusCode = 403;
      throw error;
    }
  } else if (user.role === 'inst_admin') {
    const courseInstId = course.department?.institution?._id?.toString() || course.department?.institution?.toString();
    const userInstId = user.institution?._id?.toString() || user.institution?.toString();
    if (!courseInstId || courseInstId !== userInstId) {
      const error = new Error('Forbidden: Cannot create substitution for another institution course');
      error.statusCode = 403;
      throw error;
    }
  }

  const regularProfId = course.professor?._id?.toString() || course.professor?.toString();
  if (!regularProfId) {
    const error = new Error('Course does not have an assigned regular professor');
    error.statusCode = 400;
    throw error;
  }

  if (regularProfId === substituteProfessorId.toString()) {
    const error = new Error('Regular professor and substitute professor cannot be the same user');
    error.statusCode = 400;
    throw error;
  }

  const substituteUser = await User.findById(substituteProfessorId);
  if (!substituteUser) {
    const error = new Error('Substitute professor user not found');
    error.statusCode = 404;
    throw error;
  }

  if (substituteUser.role !== 'professor') {
    const error = new Error('Substitute user must have role professor');
    error.statusCode = 400;
    throw error;
  }

  // Verify substitute belongs to same institution scope
  if (user.role !== 'super_admin') {
    const userInstId = user.institution?._id?.toString() || user.institution?.toString();
    const subInstId = substituteUser.institution?._id?.toString() || substituteUser.institution?.toString();
    if (userInstId && subInstId && userInstId !== subInstId) {
      const error = new Error('Forbidden: Substitute professor belongs to another institution');
      error.statusCode = 403;
      throw error;
    }
  }

  const targetDate = normalizeDate(date);
  const targetDivision = division ? division.trim().toUpperCase() : '';

  const FacultySubstitution = require('../models/FacultySubstitution');

  const existingSub = await FacultySubstitution.findOne({
    course: course._id,
    date: targetDate,
    division: targetDivision,
    substituteProfessor: substituteProfessorId,
    status: 'APPROVED'
  });

  if (existingSub) {
    const error = new Error('Duplicate active faculty substitution already exists for this course, date, division, and substitute professor');
    error.statusCode = 409;
    throw error;
  }

  const substitution = await FacultySubstitution.create({
    course: course._id,
    institution: course.department?.institution?._id || course.department?.institution,
    department: course.department?._id || course.department,
    regularProfessor: regularProfId,
    substituteProfessor: substituteProfessorId,
    date: targetDate,
    semester: course.semester || 1,
    division: targetDivision,
    status: 'APPROVED',
    createdBy: user._id
  });

  try {
    await AuditLog.create({
      userId: user._id,
      action: 'create',
      resource: 'attendance',
      resourceId: substitution._id,
      description: `Created faculty substitution for course ${course.code} on ${targetDate.toISOString().split('T')[0]} assigned to Prof ${substituteUser.name}`,
      ipAddress
    });
  } catch (err) {
    console.error('AuditLog error:', err.message);
  }

  return substitution;
}

/**
 * Gets paginated faculty substitutions matching criteria & role scoping.
 */
async function getFacultySubstitutions({
  user,
  courseId,
  regularProfessorId,
  substituteProfessorId,
  date,
  division,
  status,
  page = 1,
  limit = 20
}) {
  const query = {};
  const userIdStr = user._id ? user._id.toString() : user.id?.toString();

  if (user.role === 'dept_admin') {
    query.department = user.department?._id || user.department;
  } else if (user.role === 'inst_admin') {
    query.institution = user.institution?._id || user.institution;
  } else if (user.role === 'professor') {
    query.$or = [{ regularProfessor: userIdStr }, { substituteProfessor: userIdStr }];
  }

  if (courseId) query.course = courseId;
  if (regularProfessorId) query.regularProfessor = regularProfessorId;
  if (substituteProfessorId) query.substituteProfessor = substituteProfessorId;
  if (division) query.division = division.toUpperCase();
  if (status) query.status = status.toUpperCase();
  if (date) query.date = normalizeDate(date);

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const FacultySubstitution = require('../models/FacultySubstitution');

  const [substitutions, total] = await Promise.all([
    FacultySubstitution.find(query)
      .populate('course', 'name code semester')
      .populate('regularProfessor', 'name email professorId')
      .populate('substituteProfessor', 'name email professorId')
      .populate('department', 'name')
      .populate('institution', 'name')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    FacultySubstitution.countDocuments(query)
  ]);

  return {
    data: substitutions,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1
    }
  };
}

/**
 * Gets currently active approved substitutions where logged in user is the substitute professor.
 */
async function getMySubstitutions({ user }) {
  if (user.role !== 'professor' && user.role !== 'super_admin') {
    const error = new Error('Forbidden: Professor access required');
    error.statusCode = 403;
    throw error;
  }

  const userIdStr = user._id ? user._id.toString() : user.id?.toString();
  const FacultySubstitution = require('../models/FacultySubstitution');

  const substitutions = await FacultySubstitution.find({
    substituteProfessor: userIdStr,
    status: 'APPROVED'
  })
    .populate('course', 'name code semester')
    .populate('regularProfessor', 'name email professorId')
    .populate('department', 'name')
    .populate('institution', 'name')
    .sort({ date: -1 });

  return substitutions;
}

/**
 * Updates FacultySubstitution status (e.g. APPROVED -> CANCELLED).
 */
async function updateFacultySubstitutionStatus({ substitutionId, status, user, ipAddress = '' }) {
  if (!['dept_admin', 'inst_admin', 'super_admin'].includes(user.role)) {
    const error = new Error('Forbidden: Only admins can update faculty substitutions');
    error.statusCode = 403;
    throw error;
  }

  const FacultySubstitution = require('../models/FacultySubstitution');
  const substitution = await FacultySubstitution.findById(substitutionId);
  if (!substitution) {
    const error = new Error('Faculty substitution record not found');
    error.statusCode = 404;
    throw error;
  }

  // Tenant Scoping
  if (user.role === 'dept_admin') {
    const subDeptId = substitution.department?._id?.toString() || substitution.department?.toString();
    const userDeptId = user.department?._id?.toString() || user.department?.toString();
    if (subDeptId !== userDeptId) {
      const error = new Error('Forbidden: Access denied for this department substitution');
      error.statusCode = 403;
      throw error;
    }
  } else if (user.role === 'inst_admin') {
    const subInstId = substitution.institution?._id?.toString() || substitution.institution?.toString();
    const userInstId = user.institution?._id?.toString() || user.institution?.toString();
    if (subInstId !== userInstId) {
      const error = new Error('Forbidden: Access denied for this institution substitution');
      error.statusCode = 403;
      throw error;
    }
  }

  if (status && !['APPROVED', 'CANCELLED'].includes(status.toUpperCase())) {
    const error = new Error('Invalid substitution status. Must be APPROVED or CANCELLED');
    error.statusCode = 400;
    throw error;
  }

  if (status) substitution.status = status.toUpperCase();
  substitution.updatedBy = user._id;
  await substitution.save();

  try {
    await AuditLog.create({
      userId: user._id,
      action: 'update',
      resource: 'attendance',
      resourceId: substitution._id,
      description: `Updated status of substitution ${substitution._id} to ${substitution.status}`,
      ipAddress
    });
  } catch (err) {
    console.error('AuditLog error:', err.message);
  }

  return substitution;
}

module.exports = {
  normalizeDate,
  verifyCourseAccess,
  getEligibleStudents,
  createAttendanceSession,
  updateAttendanceSession,
  getStudentAttendance,
  getCourseAttendance,
  migrateLegacyAttendance,
  calculateAttendancePercentage,
  getAttendanceHistory,
  getStudentSummary,
  getCourseSummary,
  getProfessorSummary,
  getDepartmentSummary,
  getInstitutionSummary,
  getLowAttendance,
  createFacultySubstitution,
  getFacultySubstitutions,
  getMySubstitutions,
  updateFacultySubstitutionStatus
};
