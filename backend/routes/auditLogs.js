const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const {
  getAuditLogs,
  streamAuditLogs,
  acknowledgeAuditLog
} = require('../controllers/auditController');

// All audit log routes require authentication
router.use(auth);

// SSE Stream route (Must come before /:id parameter route)
router.get('/stream', roleCheck('super_admin', 'university_admin'), streamAuditLogs);

// Query critical audit logs
router.get('/', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin'), getAuditLogs);

// Acknowledge a critical audit log event
router.patch('/:id/acknowledge', roleCheck('super_admin', 'university_admin'), acknowledgeAuditLog);

module.exports = router;

