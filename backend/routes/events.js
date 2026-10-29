const express = require('express');
const router = express.Router();
const {
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent
} = require('../controllers/eventController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);

// Get events
router.get('/', getEvents);

// Create event (admin/professor)
router.post('/',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  createEvent
);

// Update event
router.put('/:id',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  updateEvent
);

// Delete event
router.delete('/:id',
  roleCheck('dept_admin', 'inst_admin', 'super_admin'),
  deleteEvent
);

module.exports = router;
