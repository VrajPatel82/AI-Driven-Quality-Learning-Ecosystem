const express = require('express');
const router = express.Router();
const {
  getStudentAnalytics,
  getCourseAnalytics,
  getDepartmentAnalytics,
  getLectureUploadAnalytics,
  getLanguageUsageAnalytics,
  getAcademicAdminOverview,
  getUniversityAdminOverview,
  getProfessorStudentsOverview,
  getProfessorStudentDetail
} = require('../controllers/analyticsController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const {
  getAIPerformanceOverview,
  getAIPerformanceHistory,
  getAIPerformanceConfig,
  updateAIPerformanceConfig
} = require('../controllers/aiPerformanceController');

router.use(auth);

// AI & API Performance Analytics (Super Admin, University Admin, Institution Admin, Department Admin ONLY)
router.get('/ai-performance/overview', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin'), getAIPerformanceOverview);
router.get('/ai-performance/history', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin'), getAIPerformanceHistory);
router.get('/ai-performance/config', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin'), getAIPerformanceConfig);
router.put('/ai-performance/config', roleCheck('super_admin'), updateAIPerformanceConfig);


// Professor student overview aggregation analytics
router.get('/professor/students-overview', roleCheck('professor', 'inst_admin', 'dept_admin', 'super_admin', 'university_admin', 'academic_admin', 'academic_administrator'), getProfessorStudentsOverview);
router.get('/professor/student-detail/:studentId', roleCheck('professor', 'inst_admin', 'dept_admin', 'super_admin', 'university_admin', 'academic_admin', 'academic_administrator'), getProfessorStudentDetail);

// University Admin overview analytics
router.get('/university-admin/overview', roleCheck('super_admin', 'university_admin'), getUniversityAdminOverview);

// Academic Admin overview analytics
router.get('/academic-admin/overview', getAcademicAdminOverview);

// Student performance analytics
router.get('/student/:id', getStudentAnalytics);

// Course analytics
router.get('/course/:id', getCourseAnalytics);

// Department analytics
router.get('/department/:id', getDepartmentAnalytics);

// Lecture upload analytics
router.get('/department/:id/lecture-uploads', getLectureUploadAnalytics);

// Language usage analytics
router.get('/department/:id/language-usage', getLanguageUsageAnalytics);

module.exports = router;
