const express = require('express');
const router = express.Router();
const transcriptController = require('../controllers/transcriptController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// Student preferred language endpoints (must come BEFORE parameterized routes)
router.get('/student/preferred-language', auth, roleCheck('student'), transcriptController.getPreferredLanguage);
router.put('/student/preferred-language', auth, roleCheck('student'), transcriptController.updatePreferredLanguage);

// Get transcript with optional language preference
router.get('/:lectureId', auth, transcriptController.getTranscript);

// Get available languages for a transcript
router.get('/:lectureId/languages', auth, transcriptController.getAvailableLanguages);

// Translate transcript to specific language
router.post('/:lectureId/translate', auth, transcriptController.translateTranscript);

// Download transcript PDF
router.get('/:lectureId/pdf/:language', auth, transcriptController.downloadTranscriptPDF);

module.exports = router;
