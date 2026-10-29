const express = require('express');
const router = express.Router();
const {
  createAnnouncement,
  getMyAnnouncements,
  getAllAnnouncements,
  deleteAnnouncement
} = require('../controllers/announcementController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

// Get announcements relevant to current user
router.get('/my', getMyAnnouncements);

// Get all announcements (admin)
router.get('/',
  roleCheck('dept_admin', 'inst_admin', 'super_admin'),
  getAllAnnouncements
);

// Create announcement (professor & admins)
router.post('/',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  createAnnouncement
);

// Delete announcement
router.delete('/:id', deleteAnnouncement);

module.exports = router;
