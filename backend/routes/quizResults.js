const express = require('express');
const router = express.Router();
const { deleteQuizResult } = require('../controllers/quizController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// @route   DELETE /api/quiz-results/:id (professor & admins only)
router.delete('/:id',
  auth,
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  deleteQuizResult
);

module.exports = router;
