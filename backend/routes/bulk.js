const express = require('express');
const router = express.Router();
const {
  bulkCreateUsers,
  bulkDeleteUsers,
  parseCsvUsers
} = require('../controllers/bulkController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

router.use(auth);
router.use(roleCheck('dept_admin', 'inst_admin', 'super_admin'));

// Bulk create users
router.post('/users', bulkCreateUsers);

// Parse CSV for user import
router.post('/users/parse-csv', parseCsvUsers);

// Bulk delete users
router.delete('/users', bulkDeleteUsers);

module.exports = router;
