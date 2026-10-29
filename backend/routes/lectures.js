const express = require('express');
const router = express.Router();
const {
  getAllLectures,
  getContentByStudent,
  getLectureById,
  createLecture,
  updateLecture,
  deleteLecture,
  getTranscription,
  retryTranscription,
  generateQuizFromLecture,
  generateImportantQuestions
} = require('../controllers/lectureController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const upload = require('../middleware/upload');

// @route   GET /api/lectures
router.get('/', auth, getAllLectures);

// @route   GET /api/lectures/student/content (students can access based on semester) - MUST come before /:id
router.get('/student/content', auth, getContentByStudent);

// @route   GET /api/lectures/:id/transcription - MUST come before /:id
router.get('/:id/transcription', auth, getTranscription);

// @route   POST /api/lectures/:id/important-questions (all authenticated users) - MUST come before generic routes
router.post('/:id/important-questions', auth, generateImportantQuestions);

// @route   POST /api/lectures/:id/generate-quiz (professor & admins only) - MUST come before generic /:id
router.post('/:id/generate-quiz',
  auth,
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  generateQuizFromLecture
);

// @route   POST /api/lectures/:id/transcription/retry (professor & admins only) - MUST come before generic /:id
router.post('/:id/transcription/retry',
  auth,
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  retryTranscription
);

// @route   POST /api/lectures/:lectureId/audio/generate
router.post('/:lectureId/audio/generate',
  auth,
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  require('../controllers/audioController').generateAudio
);

// @route   GET /api/lectures/:lectureId/audio
router.get('/:lectureId/audio', auth, require('../controllers/audioController').getAudioTracks);

// @route   DELETE /api/lectures/:lectureId/audio/:language
router.delete('/:lectureId/audio/:language',
  auth,
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  require('../controllers/audioController').deleteAudio
);

// @route   POST /api/lectures/upload/initiate (professor & admins only) - MUST come before /:id
router.post('/upload/initiate',
  auth,
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  require('../controllers/lectureController').initiateDirectUpload
);

// @route   POST /api/lectures/upload/complete (professor & admins only) - MUST come before /:id
router.post('/upload/complete',
  auth,
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  require('../controllers/lectureController').completeDirectUpload
);

// @route   POST /api/lectures/upload/abort (professor & admins only) - MUST come before /:id
router.post('/upload/abort',
  auth,
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  require('../controllers/lectureController').abortDirectUpload
);

// @route   GET /api/lectures/:id - GENERIC route comes LAST
router.get('/:id', auth, getLectureById);

router.post('/',
  auth,
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'attachment', maxCount: 1 }]),
  createLecture
);

// @route   PUT /api/lectures/:id (professor & admins only)
router.put('/:id',
  auth,
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'attachment', maxCount: 1 }]),
  updateLecture
);

// @route   DELETE /api/lectures/:id (professor & admins only)
router.delete('/:id',
  auth,
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  deleteLecture
);

module.exports = router;
