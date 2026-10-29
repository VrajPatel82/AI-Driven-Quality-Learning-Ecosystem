const express = require('express');
const router = express.Router();
const { getStudentEnrollments, enrollStudentCourses, enrollBulkStudents } = require('../controllers/enrollmentController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// All routes require authentication
router.use(auth);

// GET /api/enrollments/student/:studentId
router.get('/student/:studentId', getStudentEnrollments);

// POST /api/enrollments - Enroll student in course(s)
router.post('/', enrollStudentCourses);

// POST /api/enrollments/bulk - Bulk enroll multiple students in multiple courses
router.post(
  '/bulk',
  roleCheck('dept_admin', 'inst_admin', 'super_admin', 'university_admin', 'academic_administrator', 'academic_admin'),
  enrollBulkStudents
);

module.exports = router;

