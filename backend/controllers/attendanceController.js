const attendanceService = require('../services/attendanceService');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');

// @desc    Mark / Create attendance for a class session
// @route   POST /api/attendance
exports.markAttendance = async (req, res, next) => {
  try {
    const { course, date, students, division, semester, academicTerm, startTime, topic, status, lectureType } = req.body;

    if (!course) {
      return res.status(400).json({ message: 'Course ID is required' });
    }

    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ message: 'Students list is required' });
    }

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';

    const result = await attendanceService.createAttendanceSession({
      courseId: course,
      date: date || new Date(),
      startTime: startTime || '',
      topic: topic || '',
      status: status || 'CONDUCTED',
      division: division !== undefined && division !== null ? String(division).trim() : '',
      semester,
      academicTerm,
      records: students,
      user: req.user,
      ipAddress,
      lectureType: lectureType || 'NORMAL'
    });

    res.status(201).json({
      message: 'Attendance recorded successfully',
      session: result.session,
      records: result.records
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    Get attendance for a course (Session-based)
// @route   GET /api/attendance/course/:courseId
exports.getCourseAttendance = async (req, res, next) => {
  try {
    const courseId = req.params.courseId;
    const { division, from, to } = req.query;

    const result = await attendanceService.getCourseAttendance({
      courseId,
      division,
      from,
      to,
      user: req.user
    });

    res.json({
      sessions: result.sessions,
      records: result.records,
      data: result.sessions // compatibility
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    Get student's attendance history & official stats
// @route   GET /api/attendance/student/:studentId
exports.getStudentAttendance = async (req, res, next) => {
  try {
    const studentId = req.params.studentId;
    const { course, enrollment, enrollmentId } = req.query;

    const result = await attendanceService.getStudentAttendance({
      studentId,
      courseId: course,
      enrollmentId: enrollmentId || enrollment,
      user: req.user
    });

    res.json({
      records: result.records,
      data: result.records,
      attendance: result.records,
      stats: result.stats,
      enrollment: result.enrollment
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    Get eligible students for a course & division based on Enrollment
// @route   GET /api/attendance/eligible-students
exports.getEligibleStudents = async (req, res, next) => {
  try {
    const { course, division, date, lectureType } = req.query;
    if (!course) {
      return res.status(400).json({ message: 'Course ID is required' });
    }

    const students = await attendanceService.getEligibleStudents({
      courseId: course,
      division: division !== undefined && division !== null ? String(division).trim() : '',
      date: date || null,
      user: req.user,
      lectureType: lectureType || 'NORMAL'
    });

    res.json({ students, count: students.length });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    ERP Create Attendance Session
// @route   POST /api/attendance/sessions
exports.createSession = async (req, res, next) => {
  try {
    const { courseId, date, startTime, topic, status, division, semester, academicTerm, records, lectureType } = req.body;

    const result = await attendanceService.createAttendanceSession({
      courseId,
      date,
      startTime,
      topic,
      status,
      division,
      semester,
      academicTerm,
      records: records || [],
      user: req.user,
      ipAddress: req.ip,
      lectureType: lectureType || 'NORMAL'
    });

    res.status(201).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    ERP Get Attendance Session details by ID
// @route   GET /api/attendance/sessions/:id
exports.getSessionById = async (req, res, next) => {
  try {
    const session = await AttendanceSession.findById(req.params.id)
      .populate('course', 'name code semester')
      .populate('markedBy', 'name email');

    if (!session) {
      return res.status(404).json({ message: 'Attendance session not found' });
    }

    await attendanceService.verifyCourseAccess(req.user, session.course._id || session.course);

    const records = await AttendanceRecord.find({ session: session._id })
      .populate('student', 'name email enrollmentNumber division');

    res.json({ session, records });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    ERP Update Attendance Session / Records
// @route   PUT /api/attendance/sessions/:id
exports.updateSession = async (req, res, next) => {
  try {
    const { topic, status, records } = req.body;

    const result = await attendanceService.updateAttendanceSession({
      sessionId: req.params.id,
      topic,
      status,
      records: records || [],
      user: req.user,
      ipAddress: req.ip
    });

    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    Get attendance history with filtering & pagination
// @route   GET /api/attendance/history
exports.getAttendanceHistory = async (req, res, next) => {
  try {
    const { course, semester, division, professor, student, department, institution, from, to, status, page, limit } = req.query;

    const result = await attendanceService.getAttendanceHistory({
      user: req.user,
      courseId: course,
      semester,
      division,
      professorId: professor,
      studentId: student,
      departmentId: department,
      institutionId: institution,
      from,
      to,
      status,
      page,
      limit
    });

    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    Get student attendance summary across enrolled courses
// @route   GET /api/attendance/student/:studentId/summary
exports.getStudentSummary = async (req, res, next) => {
  try {
    const result = await attendanceService.getStudentSummary({
      studentId: req.params.studentId,
      user: req.user
    });

    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    Get course attendance summary with student-wise breakdown
// @route   GET /api/attendance/course/:courseId/summary
exports.getCourseSummary = async (req, res, next) => {
  try {
    const { semester, division } = req.query;
    const result = await attendanceService.getCourseSummary({
      courseId: req.params.courseId,
      semester,
      division,
      user: req.user
    });

    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    Get professor attendance summary across assigned courses
// @route   GET /api/attendance/professor/summary
exports.getProfessorSummary = async (req, res, next) => {
  try {
    const result = await attendanceService.getProfessorSummary({ user: req.user });
    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    Get department attendance summary & metrics
// @route   GET /api/attendance/department/:departmentId/summary
exports.getDepartmentSummary = async (req, res, next) => {
  try {
    const { semester, division, course, professor, from, to } = req.query;
    const result = await attendanceService.getDepartmentSummary({
      departmentId: req.params.departmentId,
      semester,
      division,
      courseId: course,
      professorId: professor,
      from,
      to,
      user: req.user
    });

    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    Get institution attendance summary & metrics
// @route   GET /api/attendance/institution/:institutionId/summary
exports.getInstitutionSummary = async (req, res, next) => {
  try {
    const { department, semester, division, from, to } = req.query;
    const result = await attendanceService.getInstitutionSummary({
      institutionId: req.params.institutionId,
      departmentId: department,
      semester,
      division,
      from,
      to,
      user: req.user
    });

    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    Get low-attendance students below threshold
// @route   GET /api/attendance/low-attendance
exports.getLowAttendance = async (req, res, next) => {
  try {
    const { threshold, department, institution, course, semester, division } = req.query;
    const result = await attendanceService.getLowAttendance({
      threshold,
      departmentId: department,
      institutionId: institution,
      courseId: course,
      semester,
      division,
      user: req.user
    });

    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    Create a new Faculty Substitution (Dept Admin / Inst Admin / Super Admin)
// @route   POST /api/attendance/substitutions
exports.createSubstitution = async (req, res, next) => {
  try {
    const { courseId, substituteProfessorId, date, division } = req.body;
    const result = await attendanceService.createFacultySubstitution({
      courseId,
      substituteProfessorId,
      date,
      division,
      user: req.user,
      ipAddress: req.ip
    });

    res.status(201).json({
      message: 'Faculty substitution created successfully',
      substitution: result
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    Get paginated Faculty Substitutions
// @route   GET /api/attendance/substitutions
exports.getSubstitutions = async (req, res, next) => {
  try {
    const { course, regularProfessor, substituteProfessor, date, division, status, page, limit } = req.query;
    const result = await attendanceService.getFacultySubstitutions({
      user: req.user,
      courseId: course,
      regularProfessorId: regularProfessor,
      substituteProfessorId: substituteProfessor,
      date,
      division,
      status,
      page,
      limit
    });

    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    Get active approved substitutions for logged in professor
// @route   GET /api/attendance/substitutions/my
exports.getMySubstitutions = async (req, res, next) => {
  try {
    const result = await attendanceService.getMySubstitutions({ user: req.user });
    res.json({ substitutions: result });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    Update Faculty Substitution status (e.g. APPROVED -> CANCELLED)
// @route   PUT /api/attendance/substitutions/:id
exports.updateSubstitution = async (req, res, next) => {
  try {
    const { status } = req.body;
    const result = await attendanceService.updateFacultySubstitutionStatus({
      substitutionId: req.params.id,
      status,
      user: req.user,
      ipAddress: req.ip
    });

    res.json({
      message: 'Substitution updated successfully',
      substitution: result
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};


