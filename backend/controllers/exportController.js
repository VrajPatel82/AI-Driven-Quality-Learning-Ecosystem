const User = require('../models/User');
const QuizResult = require('../models/QuizResult');
const Attendance = require('../models/Attendance');
const Course = require('../models/Course');

// @desc    Export students data as JSON (CSV format can be generated client-side)
// @route   GET /api/export/students
exports.exportStudents = async (req, res, next) => {
  try {
    const { department, institution } = req.query;
    const filter = { role: 'student' };
    if (department) filter.department = department;
    if (institution) filter.institution = institution;

    const students = await User.find(filter)
      .populate('institution', 'name')
      .populate('department', 'name')
      .select('name email role institution department createdAt');

    // Format for CSV
    const csvData = students.map(s => ({
      name: s.name,
      email: s.email,
      institution: s.institution?.name || '',
      department: s.department?.name || '',
      joinedAt: s.createdAt.toISOString().split('T')[0]
    }));

    res.json({ data: csvData, count: csvData.length });
  } catch (error) {
    next(error);
  }
};

// @desc    Export course report
// @route   GET /api/export/course/:id
exports.exportCourseReport = async (req, res, next) => {
  try {
    const courseId = req.params.id;
    const course = await Course.findById(courseId).populate('department', 'name');

    if (!course) return res.status(404).json({ message: 'Course not found' });

    // Get quiz results for this course
    const Quiz = require('../models/Quiz');
    const quizzes = await Quiz.find({ course: courseId });
    const quizIds = quizzes.map(q => q._id);

    const results = await QuizResult.find({ quiz: { $in: quizIds } })
      .populate('student', 'name email')
      .populate('quiz', 'title');

    // Get attendance
    const attendance = await Attendance.find({ course: courseId })
      .populate('students.student', 'name email');

    res.json({
      course: { name: course.name, code: course.code, department: course.department?.name },
      quizResults: results.map(r => ({
        studentName: r.student?.name,
        studentEmail: r.student?.email,
        quizTitle: r.quiz?.title,
        score: r.totalScore,
        maxScore: r.maxScore,
        percentage: r.maxScore > 0 ? ((r.totalScore / r.maxScore) * 100).toFixed(1) : '0',
        submittedAt: r.submittedAt
      })),
      attendanceRecords: attendance.length
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export attendance report
// @route   GET /api/export/attendance
exports.exportAttendance = async (req, res, next) => {
  try {
    const { course, division, from, to } = req.query;
    const AttendanceSession = require('../models/AttendanceSession');
    const AttendanceRecord = require('../models/AttendanceRecord');
    const attendanceService = require('../services/attendanceService');

    const filter = {};
    if (course) {
      await attendanceService.verifyCourseAccess(req.user, course);
      filter.course = course;
    } else if (req.user.role === 'dept_admin') {
      filter.department = req.user.department;
    } else if (req.user.role === 'inst_admin') {
      filter.institution = req.user.institution;
    } else if (req.user.role === 'professor') {
      filter.markedBy = req.user._id;
    }

    if (division) filter.division = division.toUpperCase();

    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = attendanceService.normalizeDate(from);
      if (to) filter.date.$lte = attendanceService.normalizeDate(to);
    }

    const sessions = await AttendanceSession.find(filter)
      .populate('course', 'name code semester')
      .populate('department', 'name')
      .populate('institution', 'name')
      .populate('markedBy', 'name email')
      .sort({ date: -1 });

    const sessionIds = sessions.map(s => s._id);
    const records = await AttendanceRecord.find({ session: { $in: sessionIds } })
      .populate('student', 'name email enrollmentNumber division')
      .populate('session');

    const data = records.map(r => ({
      institutionName: r.session?.institution?.name || '',
      departmentName: r.session?.department?.name || '',
      courseName: r.session?.course?.name || '',
      courseCode: r.session?.course?.code || '',
      semester: r.session?.semester || '',
      division: r.session?.division || 'A',
      date: r.session?.date ? new Date(r.session.date).toISOString().split('T')[0] : '',
      studentName: r.student?.name || '',
      studentEmail: r.student?.email || '',
      enrollmentNumber: r.student?.enrollmentNumber || '',
      status: r.status,
      sessionStatus: r.session?.status || 'CONDUCTED',
      markedBy: r.session?.markedBy?.name || ''
    }));

    res.json({ data, count: data.length });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};
