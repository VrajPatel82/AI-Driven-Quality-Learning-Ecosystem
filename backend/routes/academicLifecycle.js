const express = require('express');
const router = express.Router();
const { transitionStudent, transitionBulk } = require('../controllers/academicLifecycleController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// All routes require authentication
router.use(auth);

// POST /api/academic-lifecycle/transition (Admins only)
router.post(
  '/transition',
  roleCheck('dept_admin', 'inst_admin', 'super_admin', 'university_admin', 'academic_administrator', 'academic_admin'),
  transitionStudent
);

// POST /api/academic-lifecycle/transition-bulk (Admins only)
router.post(
  '/transition-bulk',
  roleCheck('dept_admin', 'inst_admin', 'super_admin', 'university_admin', 'academic_administrator', 'academic_admin'),
  transitionBulk
);

module.exports = router;

