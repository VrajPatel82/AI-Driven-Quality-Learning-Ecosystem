const express = require('express');
const router = express.Router();
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateStudentSemester,
  importStudents
} = require('../controllers/userController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// All routes require authentication
router.use(auth);

// GET users - allowed for professor (to view their students) and admin roles
// POST, PUT, DELETE - admin roles
router.get('/', roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin', 'university_admin', 'academic_administrator', 'academic_admin'), getAllUsers);
router.get('/:id', roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin', 'university_admin', 'academic_administrator', 'academic_admin'), getUserById);
router.post('/', roleCheck('dept_admin', 'inst_admin', 'super_admin', 'university_admin', 'academic_administrator', 'academic_admin'), createUser);
router.post('/import-students', roleCheck('dept_admin', 'inst_admin', 'super_admin', 'university_admin', 'academic_administrator', 'academic_admin'), importStudents);
router.put('/:id', roleCheck('dept_admin', 'inst_admin', 'super_admin', 'university_admin', 'academic_administrator', 'academic_admin'), updateUser);
router.put('/:id/update-semester', roleCheck('dept_admin', 'inst_admin', 'super_admin', 'university_admin', 'academic_administrator', 'academic_admin'), updateStudentSemester);
router.delete('/:id', roleCheck('dept_admin', 'inst_admin', 'super_admin', 'university_admin', 'academic_administrator', 'academic_admin'), deleteUser);

module.exports = router;
