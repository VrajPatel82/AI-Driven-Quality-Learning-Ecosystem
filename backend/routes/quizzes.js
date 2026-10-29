const express = require('express');
const router = express.Router();
const {
  getAllQuizzes,
  getQuizById,
  createQuiz,
  submitQuiz,
  getQuizResults,
  updateQuiz,
  deleteQuiz,
  generateQuizFromLecture,
  deleteQuizResult
} = require('../controllers/quizController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// @route   POST /api/quizzes/generate-from-lecture/:lectureId (professor & admins only) - MUST come before /:id routes
router.post('/generate-from-lecture/:lectureId',
  auth,
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  generateQuizFromLecture
);

// @route   POST /api/quizzes/:id/submit (students) - MUST come before generic /:id route
router.post('/:id/submit', auth, submitQuiz);

// @route   GET /api/quizzes
router.get('/', auth, getAllQuizzes);

// @route   GET /api/quizzes/:id/results - MUST come before generic /:id route
router.get('/:id/results', auth, getQuizResults);

// @route   GET /api/quizzes/:id
router.get('/:id', auth, getQuizById);

// @route   POST /api/quizzes (professor & admins only)
router.post('/',
  auth,
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  createQuiz
);

// @route   PUT /api/quizzes/:id (professor & admins only)
router.put('/:id',
  auth,
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  updateQuiz
);

// @route   DELETE /api/quizzes/:id (professor & admins only)
router.delete('/:id',
  auth,
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  deleteQuiz
);

module.exports = router;
