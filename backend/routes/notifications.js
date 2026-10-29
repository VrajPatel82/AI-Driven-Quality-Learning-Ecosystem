const express = require('express');
const router = express.Router();
const {
  sendNotification,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
} = require('../controllers/notificationController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

// Get current user's notifications
router.get('/my', getMyNotifications);

// Mark notification as read
router.put('/:id/read', markAsRead);

// Mark all as read
router.put('/read-all', markAllAsRead);

// Send notification (admin/professor)
router.post('/send',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  sendNotification
);

// Delete notification
router.delete('/:id', deleteNotification);

module.exports = router;
