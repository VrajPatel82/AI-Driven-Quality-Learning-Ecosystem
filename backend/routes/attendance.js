const express = require('express');
const router = express.Router();
const {
  markAttendance,
  getCourseAttendance,
  getStudentAttendance,
  getEligibleStudents,
  createSession,
  getSessionById,
  updateSession,
  getAttendanceHistory,
  getStudentSummary,
  getCourseSummary,
  getProfessorSummary,
  getDepartmentSummary,
  getInstitutionSummary,
  getLowAttendance,
  createSubstitution,
  getSubstitutions,
  getMySubstitutions,
  updateSubstitution
} = require('../controllers/attendanceController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

// Faculty Substitutions
router.post('/substitutions',
  roleCheck('dept_admin', 'inst_admin', 'super_admin'),
  createSubstitution
);

router.get('/substitutions/my',
  roleCheck('professor', 'super_admin'),
  getMySubstitutions
);

router.get('/substitutions',
  roleCheck('dept_admin', 'inst_admin', 'professor', 'super_admin'),
  getSubstitutions
);

router.put('/substitutions/:id',
  roleCheck('dept_admin', 'inst_admin', 'super_admin'),
  updateSubstitution
);

// History & Pagination
router.get('/history', getAttendanceHistory);

// Low Attendance List
router.get('/low-attendance',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  getLowAttendance
);

// Summaries
router.get('/professor/summary',
  roleCheck('professor', 'super_admin'),
  getProfessorSummary
);

router.get('/department/:departmentId/summary',
  roleCheck('dept_admin', 'inst_admin', 'super_admin'),
  getDepartmentSummary
);

router.get('/institution/:institutionId/summary',
  roleCheck('inst_admin', 'super_admin'),
  getInstitutionSummary
);

router.get('/student/:studentId/summary', getStudentSummary);
router.get('/course/:courseId/summary', getCourseSummary);

// Get eligible students for course + division based on Enrollment
router.get('/eligible-students', getEligibleStudents);

// Legacy & core mark attendance endpoint
router.post('/',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  markAttendance
);

// Get attendance for a course (Session-based)
router.get('/course/:courseId', getCourseAttendance);

// Get student's attendance history & official stats
router.get('/student/:studentId', getStudentAttendance);

// ERP Session endpoints
router.post('/sessions',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  createSession
);

router.get('/sessions/:id', getSessionById);

router.put('/sessions/:id',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  updateSession
);

module.exports = router;


