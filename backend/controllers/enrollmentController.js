const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const Course = require('../models/Course');

/**
 * @desc    Get student's authoritative enrollment records (active & history)
 * @route   GET /api/enrollments/student/:studentId
 * @access  Private (Student self, authorized department/inst/uni admins)
 */
exports.getStudentEnrollments = async (req, res, next) => {
  try {
    const { studentId } = req.params;

    // 1. Fetch Target Student
    const student = await User.findById(studentId)
      .populate('department', 'name code')
      .populate('institution', 'name code')
      .populate('university', 'name code');

    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // 2. Authorization & Tenant Isolation Checks
    const userRole = req.user.role;

    if (userRole === 'student') {
      // Student self-scope only
      if (req.user._id.toString() !== student._id.toString()) {
        return res.status(403).json({ message: 'Access denied. You can only view your own enrollment records.' });
      }
    } else if (['dept_admin', 'academic_administrator', 'academic_admin'].includes(userRole)) {
      // Department admin scope check
      const adminDeptId = (req.user.department?._id || req.user.department)?.toString();
      const studentDeptId = (student.department?._id || student.department)?.toString();
      if (!adminDeptId || !studentDeptId || adminDeptId !== studentDeptId) {
        return res.status(403).json({ message: 'Access denied. Student belongs to another department.' });
      }
    } else if (userRole === 'inst_admin') {
      // Institution admin scope check
      const adminInstId = (req.user.institution?._id || req.user.institution)?.toString();
      const studentInstId = (student.institution?._id || student.institution)?.toString();
      if (!adminInstId || !studentInstId || adminInstId !== studentInstId) {
        return res.status(403).json({ message: 'Access denied. Student belongs to another institution.' });
      }
    } else if (userRole === 'university_admin') {
      // University admin scope check
      const adminUniId = (req.user.university?._id || req.user.university)?.toString();
      const studentUniId = (student.university?._id || student.university)?.toString();
      let belongsToUni = studentUniId && studentUniId === adminUniId;
      if (!belongsToUni && student.institution) {
        const Institution = require('../models/Institution');
        const instDoc = await Institution.findById(student.institution);
        if (instDoc && instDoc.university && instDoc.university.toString() === adminUniId) {
          belongsToUni = true;
        }
      }
      if (!belongsToUni) {
        return res.status(403).json({ message: 'Access denied. Student belongs to another university.' });
      }
    } else if (userRole !== 'super_admin') {
      // Unhandled role
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    // 3. Query Authoritative Enrollment Records for Student
    const enrollments = await Enrollment.find({ student: student._id })
      .populate({
        path: 'course',
        select: 'name code semester department professor',
        populate: [
          { path: 'department', select: 'name code' },
          { path: 'professor', select: 'name email professorId' }
        ]
      })
      .sort({ createdAt: -1 });

    // 4. Separate Active from Historical Enrollments
    const active = [];
    const history = [];

    enrollments.forEach(item => {
      if (item.status === 'active') {
        active.push(item);
      } else if (item.status === 'completed' || item.status === 'dropped') {
        history.push(item);
      }
    });

    // Sort active by course semester asc / course code
    active.sort((a, b) => {
      const semA = a.course?.semester || 0;
      const semB = b.course?.semester || 0;
      return semA - semB;
    });

    // Sort history by course semester desc
    history.sort((a, b) => {
      const semA = a.course?.semester || 0;
      const semB = b.course?.semester || 0;
      return semB - semA;
    });

    // 5. Pure Read Response (ZERO writes)
    res.json({
      student: {
        _id: student._id,
        name: student.name,
        email: student.email,
        enrollmentNumber: student.enrollmentNumber,
        currentSemester: student.currentSemester,
        division: student.division,
        department: student.department,
        institution: student.institution,
        university: student.university
      },
      active,
      history
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Enroll student in one or multiple courses
 * @route   POST /api/enrollments
 * @access  Private (Academic admin, dept admin, inst admin, uni admin, super admin)
 */
exports.enrollStudentCourses = async (req, res, next) => {
  try {
    const studentId = req.body.studentId || req.body.student;
    let courseIds = req.body.courseIds;
    if (!courseIds && (req.body.courseId || req.body.course)) {
      courseIds = [req.body.courseId || req.body.course];
    }

    if (!studentId || !Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({ message: 'Student ID and at least one Course ID are required' });
    }

    // 1. Fetch Target Student
    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // 2. Authorization & Tenant Isolation Checks
    const userRole = req.user.role;
    if (!['dept_admin', 'academic_administrator', 'academic_admin', 'inst_admin', 'university_admin', 'super_admin'].includes(userRole)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    if (['dept_admin', 'academic_administrator', 'academic_admin'].includes(userRole)) {
      const adminDeptId = (req.user.department?._id || req.user.department)?.toString();
      const studentDeptId = (student.department?._id || student.department)?.toString();
      if (!adminDeptId || !studentDeptId || adminDeptId !== studentDeptId) {
        return res.status(403).json({ message: 'Access denied. Student belongs to another department.' });
      }
    } else if (userRole === 'inst_admin') {
      const adminInstId = (req.user.institution?._id || req.user.institution)?.toString();
      const studentInstId = (student.institution?._id || student.institution)?.toString();
      if (!adminInstId || !studentInstId || adminInstId !== studentInstId) {
        return res.status(403).json({ message: 'Access denied. Student belongs to another institution.' });
      }
    } else if (userRole === 'university_admin') {
      const adminUniId = (req.user.university?._id || req.user.university)?.toString();
      const studentUniId = (student.university?._id || student.university)?.toString();
      let belongsToUni = studentUniId && studentUniId === adminUniId;
      if (!belongsToUni && student.institution) {
        const Institution = require('../models/Institution');
        const instDoc = await Institution.findById(student.institution);
        if (instDoc && instDoc.university && instDoc.university.toString() === adminUniId) {
          belongsToUni = true;
        }
      }
      if (!belongsToUni) {
        return res.status(403).json({ message: 'Access denied. Student belongs to another university.' });
      }
    }

    const division = (req.body.division || student.division || 'A').toString().toUpperCase().trim();
    const academicTerm = req.body.academicTerm || 'CURRENT';
    const studentSemester = student.currentSemester || 1;

    // 3. Process each course with semester validation and duplicate check
    const enrolledResults = [];
    for (const cId of courseIds) {
      const course = await Course.findById(cId);
      if (!course) {
        continue;
      }

      // Course semester MUST match student's current semester
      const courseSemester = Number(course.semester);
      if (!courseSemester || courseSemester !== studentSemester) {
        return res.status(400).json({
          message: `Cannot enroll student in ${course.name} (${course.code}). Course is for Semester ${course.semester}, but student is currently in Semester ${studentSemester}.`
        });
      }

      // Check if active enrollment already exists (Duplicate Prevention)
      const existingActive = await Enrollment.findOne({
        student: student._id,
        course: course._id,
        status: 'active'
      });

      if (existingActive) {
        enrolledResults.push(existingActive);
        continue;
      }

      // Count prior attempts to set correct attemptNumber
      const totalPastAttempts = await Enrollment.countDocuments({
        student: student._id,
        course: course._id
      });

      const newEnrollment = await Enrollment.create({
        student: student._id,
        course: course._id,
        status: 'active',
        academicTerm,
        division,
        attemptNumber: totalPastAttempts + 1,
        isBacklog: false
      });

      enrolledResults.push(newEnrollment);
    }

    res.status(201).json({
      success: true,
      message: `Successfully enrolled in ${enrolledResults.length} course(s)`,
      enrolledCount: enrolledResults.length,
      enrollments: enrolledResults
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Enroll multiple students in multiple courses (Bulk Endpoint)
 * @route   POST /api/enrollments/bulk
 * @access  Private (Academic admin, dept admin, inst admin, uni admin, super admin)
 */
exports.enrollBulkStudents = async (req, res, next) => {
  try {
    const { studentIds, courseIds, academicTerm = 'CURRENT', validateOnly } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0 || !Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({ message: 'studentIds and courseIds arrays are required and must not be empty' });
    }

    // 1. RBAC Permissions Check
    const userRole = req.user.role;
    if (!['dept_admin', 'academic_administrator', 'academic_admin', 'inst_admin', 'university_admin', 'super_admin'].includes(userRole)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    const adminDeptId = (req.user.department?._id || req.user.department)?.toString();
    const adminInstId = (req.user.institution?._id || req.user.institution)?.toString();

    // 2. Batch Fetch Target Students & Courses
    const students = await User.find({ _id: { $in: studentIds } });
    const courses = await Course.find({ _id: { $in: courseIds } });

    const studentMap = new Map(students.map(s => [s._id.toString(), s]));
    const courseMap = new Map(courses.map(c => [c._id.toString(), c]));

    // 3. Batch Fetch All Existing Enrollments for Target Students & Courses (1 Query)
    const validStudentObjectIds = students.map(s => s._id);
    const validCourseObjectIds = courses.map(c => c._id);

    const existingEnrollments = (validStudentObjectIds.length > 0 && validCourseObjectIds.length > 0)
      ? await Enrollment.find({
          student: { $in: validStudentObjectIds },
          course: { $in: validCourseObjectIds }
        })
      : [];

    // Index existing enrollments by `${studentId}_${courseId}`
    const existingMap = new Map();
    for (const enr of existingEnrollments) {
      const key = `${enr.student.toString()}_${enr.course.toString()}`;
      if (!existingMap.has(key)) {
        existingMap.set(key, []);
      }
      existingMap.get(key).push(enr);
    }

    const errors = [];
    let eligibleCount = 0;
    let alreadyEnrolledCount = 0;
    let invalidCount = 0;

    const validPairs = []; // Array of { student, course, attemptNumber }

    // 4. Batch Pre-Validation for every student/course pair (In-Memory Validation)
    for (const stId of studentIds) {
      const student = studentMap.get(stId.toString());

      if (!student) {
        invalidCount += courseIds.length;
        errors.push(`Student ID ${stId} does not exist in the database.`);
        continue;
      }

      if (student.role !== 'student') {
        invalidCount += courseIds.length;
        errors.push(`User ${student.name || stId} is not a student (role: ${student.role}).`);
        continue;
      }

      // Department & Tenant Isolation Check
      if (['dept_admin', 'academic_administrator', 'academic_admin'].includes(userRole)) {
        const studentDeptId = (student.department?._id || student.department)?.toString();
        if (!adminDeptId || !studentDeptId || adminDeptId !== studentDeptId) {
          invalidCount += courseIds.length;
          errors.push(`Access denied for student ${student.name}: Outside your department.`);
          continue;
        }
      } else if (userRole === 'inst_admin') {
        const studentInstId = (student.institution?._id || student.institution)?.toString();
        if (!adminInstId || !studentInstId || adminInstId !== studentInstId) {
          invalidCount += courseIds.length;
          errors.push(`Access denied for student ${student.name}: Outside your institution.`);
          continue;
        }
      }

      const stSem = Number(student.currentSemester || 1);

      for (const cId of courseIds) {
        const course = courseMap.get(cId.toString());

        if (!course) {
          invalidCount++;
          errors.push(`Course ID ${cId} does not exist in the database.`);
          continue;
        }

        const crsSem = Number(course.semester || 0);
        if (!crsSem || crsSem !== stSem) {
          invalidCount++;
          errors.push(`Cannot enroll ${student.name} in ${course.name} (${course.code}). Course is Semester ${crsSem}, but student is Semester ${stSem}.`);
          continue;
        }

        // Check if active enrollment already exists using in-memory index
        const key = `${student._id.toString()}_${course._id.toString()}`;
        const pastRecords = existingMap.get(key) || [];
        const hasActive = pastRecords.some(e => e.status === 'active');

        if (hasActive) {
          alreadyEnrolledCount++;
        } else {
          eligibleCount++;
          const attemptNumber = pastRecords.length + 1;
          validPairs.push({ student, course, attemptNumber });
        }
      }
    }

    const totalCombinations = studentIds.length * courseIds.length;

    const summary = {
      totalStudents: studentIds.length,
      totalCourses: courseIds.length,
      totalCombinations,
      eligibleCount,
      alreadyEnrolledCount,
      invalidCount,
      enrollmentsToCreate: validPairs.length,
      errors,
      courses: courses.map(c => ({ _id: c._id, name: c.name, code: c.code, semester: c.semester }))
    };

    // If dry-run validateOnly is requested or validation errors prevent execution
    if (validateOnly) {
      return res.json({
        success: errors.length === 0,
        valid: errors.length === 0,
        summary
      });
    }

    if (errors.length > 0 && validPairs.length === 0) {
      return res.status(400).json({
        message: 'Bulk enrollment validation failed.',
        errors,
        summary
      });
    }

    // 5. Execution (Create valid non-duplicate enrollments via batch insertMany)
    const docsToInsert = validPairs.map(({ student, course, attemptNumber }) => ({
      student: student._id,
      course: course._id,
      status: 'active',
      academicTerm,
      division: (student.division || 'A').toUpperCase(),
      attemptNumber,
      isBacklog: false
    }));

    let createdEnrollments = [];
    if (docsToInsert.length > 0) {
      createdEnrollments = await Enrollment.insertMany(docsToInsert);
    }

    res.status(201).json({
      success: true,
      message: `Successfully created ${createdEnrollments.length} new enrollment(s). ${alreadyEnrolledCount} skipped (already enrolled).`,
      createdCount: createdEnrollments.length,
      alreadyEnrolledCount,
      invalidCount,
      summary,
      createdEnrollments
    });
  } catch (error) {
    next(error);
  }
};

