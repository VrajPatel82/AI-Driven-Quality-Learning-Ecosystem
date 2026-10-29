const express = require('express');
const router = express.Router();
const {
  getInstitutions,
  createInstitution,
  updateInstitution,
  deleteInstitution,
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  getStats,
  getReports,
  getUniversities,
  getUniversityById,
  createUniversity,
  updateUniversity,
  deleteUniversity,
  getUniversityStats,
  getUniversityInstitutions,
  getUniversityAdmins,
  createUniversityAdmin,
  updateUniversityAdmin,
  deleteUniversityAdmin,
  getUniversityAnalytics,
  assignDivisions
} = require('../controllers/adminController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// All routes require authentication
router.use(auth);

// Base admin access allows all admin roles
router.use(roleCheck('dept_admin', 'inst_admin', 'super_admin', 'university_admin', 'academic_administrator', 'academic_admin'));

// Stats & Reports
router.get('/stats', getStats);
router.get('/reports', getReports);

// Universities (Super Admin & University Admin)
router.get('/universities', roleCheck('super_admin', 'university_admin'), getUniversities);
router.post('/universities', roleCheck('super_admin'), createUniversity);
router.get('/universities/:id', roleCheck('super_admin', 'university_admin'), getUniversityById);
router.put('/universities/:id', roleCheck('super_admin'), updateUniversity);
router.delete('/universities/:id', roleCheck('super_admin'), deleteUniversity);
router.get('/universities/:id/stats', roleCheck('super_admin', 'university_admin'), getUniversityStats);
router.get('/universities/:id/institutions', roleCheck('super_admin', 'university_admin'), getUniversityInstitutions);

// University Admins (Super Admin only)
router.get('/university-admins', roleCheck('super_admin'), getUniversityAdmins);
router.post('/university-admins', roleCheck('super_admin'), createUniversityAdmin);
router.put('/university-admins/:id', roleCheck('super_admin'), updateUniversityAdmin);
router.delete('/university-admins/:id', roleCheck('super_admin'), deleteUniversityAdmin);

// University Analytics (Super Admin only)
router.get('/university-analytics', roleCheck('super_admin'), getUniversityAnalytics);

// Institutions
router.get('/institutions', roleCheck('super_admin', 'university_admin', 'inst_admin'), getInstitutions);
router.post('/institutions', roleCheck('super_admin', 'university_admin'), createInstitution);
router.put('/institutions/:id', roleCheck('super_admin', 'university_admin'), updateInstitution);
router.delete('/institutions/:id', roleCheck('super_admin', 'university_admin'), deleteInstitution);

// Departments
router.get('/departments', getDepartments);
router.post('/departments', roleCheck('super_admin', 'university_admin', 'inst_admin'), createDepartment);
router.put('/departments/:id', roleCheck('super_admin', 'university_admin', 'inst_admin'), updateDepartment);
router.delete('/departments/:id', roleCheck('super_admin', 'university_admin', 'inst_admin'), deleteDepartment);

// Courses
router.get('/courses', getCourses);
router.post('/courses', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin', 'academic_administrator', 'academic_admin'), createCourse);
router.put('/courses/:id', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin', 'academic_administrator', 'academic_admin'), updateCourse);
router.delete('/courses/:id', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin', 'academic_administrator', 'academic_admin'), deleteCourse);

// Divisions (Bulk Division Assignment)
router.post('/divisions/assign', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin', 'academic_administrator', 'academic_admin'), assignDivisions);

module.exports = router;
