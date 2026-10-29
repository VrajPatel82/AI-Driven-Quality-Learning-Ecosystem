const express = require('express');
const router = express.Router();
const {
  exportStudents,
  exportCourseReport,
  exportAttendance
} = require('../controllers/exportController');
const { getAuditLogs } = require('../controllers/auditController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

// Export students data
router.get('/students', roleCheck('dept_admin', 'inst_admin', 'super_admin'), exportStudents);

// Export course report
router.get('/course/:id', roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'), exportCourseReport);

// Export attendance
router.get('/attendance', roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'), exportAttendance);

// Audit logs
router.get('/audit-logs', getAuditLogs);

module.exports = router;
