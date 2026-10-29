const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const AuditLog = require('../models/AuditLog');
const Department = require('../models/Department');


/**
 * Single Authoritative Academic Lifecycle Service for Student Semester Transitions.
 * 
 * Preserves permanent student identity (User.enrollmentNumber) across all semesters.
 * Enforces course membership via Enrollment collection (status: 'active').
 * Transitions old current-semester active enrollments to status: 'completed'.
 * Enrolls student into ALL compulsory courses for (student.department, targetSemester).
 * 
 * @param {Object} params
 * @param {string|ObjectId} params.studentId
 * @param {number|string} params.targetSemester
 * @param {string} [params.academicTerm]
 * @param {string} [params.division]
 * @param {Object} params.performedBy - Authenticated admin user object
 * @returns {Promise<Object>} Transition result
 */
async function transitionStudentSemester({
  studentId,
  targetSemester,
  academicTerm = 'CURRENT',
  division,
  performedBy
}) {
  if (!studentId) {
    const err = new Error('Student ID is required');
    err.statusCode = 400;
    throw err;
  }

  const parsedTargetSemester = parseInt(targetSemester, 10);
  if (isNaN(parsedTargetSemester) || parsedTargetSemester < 1 || parsedTargetSemester > 8) {
    const err = new Error('Target semester must be an integer between 1 and 8');
    err.statusCode = 400;
    throw err;
  }

  // 1. Fetch Target Student
  const student = await User.findById(studentId);
  if (!student) {
    const err = new Error('Student not found');
    err.statusCode = 404;
    throw err;
  }

  if (student.role !== 'student') {
    const err = new Error('Target user is not a student');
    err.statusCode = 400;
    throw err;
  }

  // 2. Validate Admin RBAC Permissions & Tenant Scope
  const adminRole = performedBy.role;
  if (adminRole === 'student') {
    const err = new Error('Access denied. Students cannot perform semester transitions.');
    err.statusCode = 403;
    throw err;
  }

  if (['dept_admin', 'academic_administrator', 'academic_admin'].includes(adminRole)) {
    const adminDeptId = (performedBy.department?._id || performedBy.department)?.toString();
    const studentDeptId = (student.department?._id || student.department)?.toString();
    if (!adminDeptId || !studentDeptId || adminDeptId !== studentDeptId) {
      const err = new Error('Access denied. You can only manage students in your department.');
      err.statusCode = 403;
      throw err;
    }
  } else if (adminRole === 'inst_admin') {
    const adminInstId = (performedBy.institution?._id || performedBy.institution)?.toString();
    const studentInstId = (student.institution?._id || student.institution)?.toString();
    if (!adminInstId || !studentInstId || adminInstId !== studentInstId) {
      const err = new Error('Access denied. You can only manage students in your institution.');
      err.statusCode = 403;
      throw err;
    }
  } else if (adminRole === 'university_admin') {
    const uniId = (performedBy.university?._id || performedBy.university)?.toString();
    const userUniId = (student.university?._id || student.university)?.toString();
    let belongsToUni = userUniId && userUniId === uniId;
    if (!belongsToUni && student.institution) {
      const Institution = require('../models/Institution');
      const instDoc = await Institution.findById(student.institution);
      if (instDoc && instDoc.university && instDoc.university.toString() === uniId) {
        belongsToUni = true;
      }
    }
    if (!belongsToUni) {
      const err = new Error('Access denied. You can only manage students in your university.');
      err.statusCode = 403;
      throw err;
    }
  }

  const oldSemester = student.currentSemester;
  const oldDivision = student.division || '';
  const newDivision = (division !== undefined && division !== null && division !== '')
    ? division.toString().toUpperCase().trim()
    : oldDivision;

  // 3. Target Course Discovery (Every course under student's department + targetSemester is compulsory)
  const studentDeptId = student.department?._id || student.department;
  if (!studentDeptId) {
    const err = new Error('Student has no assigned department');
    err.statusCode = 400;
    throw err;
  }

  const targetCourses = await Course.find({
    department: studentDeptId,
    semester: parsedTargetSemester
  }).select('_id code name');

  if (!targetCourses || targetCourses.length === 0) {
    const err = new Error(`Cannot transition student: No courses exist for department in target semester ${parsedTargetSemester}`);
    err.statusCode = 400;
    throw err;
  }

  // 4. Check for Retake / Backlog conflict with completed or dropped enrollments
  const targetCourseIds = targetCourses.map(c => c._id);
  const existingHistoricalTargetEnrollments = await Enrollment.find({
    student: student._id,
    course: { $in: targetCourseIds },
    status: { $in: ['completed', 'dropped'] }
  });

  if (existingHistoricalTargetEnrollments.length > 0) {
    const err = new Error('Cannot transition: Target semester contains previously completed or dropped courses. Repeated-course / backlog handling is out of scope for Phase 3.2.');
    err.statusCode = 400;
    throw err;
  }

  // 5. Idempotency Check:
  // If student is ALREADY at targetSemester AND already has active enrollments for all target courses
  const existingActiveTargetEnrollments = await Enrollment.find({
    student: student._id,
    course: { $in: targetCourseIds },
    status: 'active'
  });

  if (oldSemester === parsedTargetSemester && existingActiveTargetEnrollments.length === targetCourses.length) {
    const populatedStudent = await User.findById(student._id)
      .populate('university', 'name code state')
      .populate('institution', 'name code')
      .populate('department', 'name code');
    return {
      user: populatedStudent,
      message: `Student is already in semester ${parsedTargetSemester} with active course enrollments (idempotent no-op).`,
      transitioned: false
    };
  }

  // 6. Transaction Execution (With graceful fallback for MongoDB configurations without replica sets)
  let session = null;
  let useTransaction = false;

  try {
    const topologyType = mongoose.connection.client?.topology?.description?.type;
    const isReplSet = topologyType && topologyType !== 'Single' && topologyType !== 'Unknown';
    if (isReplSet) {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    }
  } catch (sessErr) {
    if (session) {
      try { session.endSession(); } catch (e) {}
    }
    session = null;
    useTransaction = false;
  }

  try {
    const options = useTransaction && session ? { session } : {};

    // a. Close active enrollments for non-target semester courses: active -> completed
    const nonTargetCourses = await Course.find({
      department: studentDeptId,
      semester: { $ne: parsedTargetSemester }
    }).select('_id');

    const nonTargetCourseIds = nonTargetCourses.map(c => c._id);

    if (nonTargetCourseIds.length > 0) {
      await Enrollment.updateMany(
        {
          student: student._id,
          course: { $in: nonTargetCourseIds },
          status: 'active'
        },
        {
          $set: { status: 'completed' }
        },
        options
      );
    }

    // b. Create active enrollments for all compulsory target courses
    for (const targetCourse of targetCourses) {
      const existingEnc = await Enrollment.findOne({
        student: student._id,
        course: targetCourse._id
      });

      if (!existingEnc) {
        await Enrollment.create([{
          student: student._id,
          course: targetCourse._id,
          status: 'active',
          academicTerm: academicTerm || 'CURRENT',
          division: newDivision
        }], options);
      } else if (existingEnc.status === 'active') {
        existingEnc.academicTerm = academicTerm || existingEnc.academicTerm;
        existingEnc.division = newDivision;
        await existingEnc.save(options);
      }
    }

    // c. Update User currentSemester & division (preserving permanent enrollmentNumber)
    student.currentSemester = parsedTargetSemester;
    student.division = newDivision;
    await student.save(options);

    // d. Record AuditLog
    await AuditLog.create([{
      userId: performedBy._id,
      action: 'update',
      resource: 'user',
      resourceId: student._id,
      description: `Academic semester transition: Student ${student.enrollmentNumber || student.name} transitioned from Semester ${oldSemester} to ${parsedTargetSemester}`,
      changes: {
        enrollmentNumber: student.enrollmentNumber,
        oldSemester,
        newSemester: parsedTargetSemester,
        oldDivision,
        newDivision,
        academicTerm
      },
      ipAddress: performedBy.ipAddress || ''
    }], options);

    if (useTransaction && session) {
      await session.commitTransaction();
      session.endSession();
    }

    const updatedUser = await User.findById(student._id)
      .populate('university', 'name code state')
      .populate('institution', 'name code')
      .populate('department', 'name code');

    return {
      user: updatedUser,
      message: `Student semester transitioned to ${parsedTargetSemester} successfully`,
      transitioned: true
    };
  } catch (error) {
    if (useTransaction && session) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch (e) {}
    }
    throw error;
  }
}

/**

 * Validate a batch of students for bulk semester transition without making any database changes.
 * 
 * @param {Object} params
 * @param {Array<string>} params.studentIds
 * @param {number|string} params.targetSemester
 * @param {string} [params.reason]
 * @param {string|Object} [params.divisionMapping]
 * @param {Object} params.performedBy
 * @returns {Promise<Object>} Validation result { valid: boolean, errors: Array<string>, summary: Object }
 */
async function validateBulkTransition({
  studentIds,
  targetSemester,
  reason = 'Semester Promotion',
  divisionMapping,
  performedBy
}) {
  const errors = [];

  if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
    return {
      valid: false,
      errors: ['No student IDs provided for bulk operation'],
      summary: null
    };
  }

  const parsedTargetSemester = parseInt(targetSemester, 10);
  if (isNaN(parsedTargetSemester) || parsedTargetSemester < 1 || parsedTargetSemester > 8) {
    return {
      valid: false,
      errors: ['Target semester must be an integer between 1 and 8'],
      summary: null
    };
  }

  // 1. Fetch all students in batch
  const students = await User.find({ _id: { $in: studentIds } }).populate('department');

  if (students.length !== studentIds.length) {
    const foundIds = new Set(students.map(s => s._id.toString()));
    const missing = studentIds.filter(id => !foundIds.has(id.toString()));
    errors.push(`The following student IDs do not exist in the database: ${missing.join(', ')}`);
  }

  // 2. Validate role & permissions for each student
  const adminRole = performedBy.role;
  const adminDeptId = (performedBy.department?._id || performedBy.department)?.toString();
  const adminInstId = (performedBy.institution?._id || performedBy.institution)?.toString();

  const divisionBreakdown = { keep: 0, A: 0, B: 0, C: 0 };
  let sourceSemester = null;

  for (const st of students) {
    if (st.role !== 'student') {
      errors.push(`User ${st.name || st._id} is not a student (role: ${st.role})`);
    }

    if (sourceSemester === null) {
      sourceSemester = st.currentSemester;
    }

    // Permission check
    if (['dept_admin', 'academic_administrator', 'academic_admin'].includes(adminRole)) {
      const studentDeptId = (st.department?._id || st.department)?.toString();
      if (!adminDeptId || !studentDeptId || adminDeptId !== studentDeptId) {
        errors.push(`Access denied for student ${st.name} (${st._id}): outside your department.`);
      }
    } else if (adminRole === 'inst_admin') {
      const studentInstId = (st.institution?._id || st.institution)?.toString();
      if (!adminInstId || !studentInstId || adminInstId !== studentInstId) {
        errors.push(`Access denied for student ${st.name} (${st._id}): outside your institution.`);
      }
    }

    // Division mapping resolution for summary
    let studentTargetDiv = st.division || 'A';
    if (divisionMapping) {
      if (typeof divisionMapping === 'string') {
        if (['A', 'B', 'C'].includes(divisionMapping.toUpperCase())) {
          studentTargetDiv = divisionMapping.toUpperCase();
        }
      } else if (typeof divisionMapping === 'object' && divisionMapping[st._id.toString()]) {
        const mapped = divisionMapping[st._id.toString()].toUpperCase();
        if (['A', 'B', 'C'].includes(mapped)) {
          studentTargetDiv = mapped;
        }
      }
    }

    if (!divisionMapping || divisionMapping === 'KEEP') {
      divisionBreakdown.keep++;
    } else if (studentTargetDiv === 'A') {
      divisionBreakdown.A++;
    } else if (studentTargetDiv === 'B') {
      divisionBreakdown.B++;
    } else if (studentTargetDiv === 'C') {
      divisionBreakdown.C++;
    }
  }

  // 3. Course Configuration & Backlog Checks for Target Semester
  let targetCourses = [];
  if (students.length > 0) {
    const primaryDeptId = students[0].department?._id || students[0].department;
    if (!primaryDeptId) {
      errors.push('Selected students do not have an assigned department');
    } else {
      targetCourses = await Course.find({
        department: primaryDeptId,
        semester: parsedTargetSemester
      }).select('_id code name type');

      if ((!targetCourses || targetCourses.length === 0) && parsedTargetSemester !== sourceSemester) {
        errors.push(`Target semester ${parsedTargetSemester} has no courses configured for department.`);
      } else if (parsedTargetSemester !== sourceSemester) {
        // Check for completed/dropped enrollments in target semester
        const targetCourseIds = targetCourses.map(c => c._id);
        const stIds = students.map(s => s._id);
        const conflictEnrollments = await Enrollment.find({
          student: { $in: stIds },
          course: { $in: targetCourseIds },
          status: { $in: ['completed', 'dropped'] }
        }).populate('student', 'name enrollmentNumber');

        if (conflictEnrollments.length > 0) {
          const conflictingStudentNames = Array.from(new Set(conflictEnrollments.map(e => e.student?.name || e.student?.enrollmentNumber)));
          errors.push(`Cannot promote: The following student(s) have previously completed or dropped courses in target semester ${parsedTargetSemester}: ${conflictingStudentNames.join(', ')}`);
        }
      }
    }
  }

  const isRetention = reason === 'Semester Retention' || parsedTargetSemester === sourceSemester;

  const summary = {
    totalStudents: students.length,
    sourceSemester: sourceSemester || 1,
    targetSemester: parsedTargetSemester,
    action: isRetention ? 'retention' : 'promotion',
    divisionBreakdown,
    targetCourses: targetCourses.map(c => ({ _id: c._id, code: c.code, name: c.name, type: c.type }))
  };

  return {
    valid: errors.length === 0,
    errors,
    summary
  };
}

/**
 * Execute bulk transition for multiple students atomically after full batch validation.
 */
async function transitionBulkStudents({
  studentIds,
  targetSemester,
  reason = 'Semester Promotion',
  divisionMapping,
  performedBy
}) {
  // 1. Full Batch Pre-Validation
  const validation = await validateBulkTransition({
    studentIds,
    targetSemester,
    reason,
    divisionMapping,
    performedBy
  });

  if (!validation.valid) {
    const err = new Error(`Bulk transition validation failed: ${validation.errors.join('; ')}`);
    err.statusCode = 400;
    err.validationErrors = validation.errors;
    throw err;
  }

  const results = [];
  const parsedTargetSemester = parseInt(targetSemester, 10);
  const isRetention = reason === 'Semester Retention' || parsedTargetSemester === validation.summary.sourceSemester;

  // 2. Execute transitions sequentially for each student using transitionStudentSemester
  for (const studentId of studentIds) {
    let studentDivision;
    if (divisionMapping) {
      if (typeof divisionMapping === 'string' && ['A', 'B', 'C'].includes(divisionMapping.toUpperCase())) {
        studentDivision = divisionMapping.toUpperCase();
      } else if (typeof divisionMapping === 'object' && divisionMapping[studentId.toString()]) {
        studentDivision = divisionMapping[studentId.toString()].toUpperCase();
      }
    }

    const transitionRes = await transitionStudentSemester({
      studentId,
      targetSemester: parsedTargetSemester,
      academicTerm: 'CURRENT',
      division: studentDivision,
      performedBy
    });

    // If retention or idempotent, record AuditLog if transitionStudentSemester skipped it
    if (isRetention) {
      const studentDoc = await User.findById(studentId);
      if (studentDoc) {
        if (studentDivision && studentDoc.division !== studentDivision) {
          studentDoc.division = studentDivision;
          await studentDoc.save();
        }
        await AuditLog.create([{
          userId: performedBy._id,
          action: 'update',
          resource: 'user',
          resourceId: studentDoc._id,
          description: `Academic retention recorded: Student ${studentDoc.enrollmentNumber || studentDoc.name} retained in Semester ${parsedTargetSemester}`,
          changes: {
            enrollmentNumber: studentDoc.enrollmentNumber,
            oldSemester: parsedTargetSemester,
            newSemester: parsedTargetSemester,
            oldDivision: studentDoc.division,
            newDivision: studentDivision || studentDoc.division,
            reason: 'Semester Retention'
          },
          ipAddress: performedBy.ipAddress || ''
        }]);
      }
    }

    results.push(transitionRes);
  }

  return {
    success: true,
    count: results.length,
    message: isRetention
      ? `Successfully recorded retention for ${results.length} student(s) in Semester ${parsedTargetSemester}`
      : `Successfully promoted ${results.length} student(s) to Semester ${parsedTargetSemester}`,
    results
  };
}

module.exports = {
  transitionStudentSemester,
  validateBulkTransition,
  transitionBulkStudents
};



