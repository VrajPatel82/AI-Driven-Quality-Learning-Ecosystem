const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const userRateLimit = require('../middleware/userRateLimit');
const validateRequest = require('../middleware/validateRequest');
const {
  resolveConversation,
  createStudyAssistantConversation,
  getConversationHistory,
  getStudentConversations,
  sendMessage,
  clearConversationMessages,
  deleteConversation
} = require('../controllers/aiAssistantController');

const conversationIdValidator = param('conversationId').isMongoId().withMessage('Valid conversation ID is required');

router.use(auth, roleCheck('student'));

// @route   POST /api/ai-assistant/conversations/study-assistant
router.post('/conversations/study-assistant', [
  body('initialTitle').optional().isString().trim()
], validateRequest, createStudyAssistantConversation);

// @route   POST /api/ai-assistant/conversations/resolve
router.post('/conversations/resolve', [
  body('lectureId').isMongoId().withMessage('Valid lecture ID is required')
], validateRequest, resolveConversation);

// @route   GET /api/ai-assistant/conversations
router.get('/conversations', getStudentConversations);

// @route   GET /api/ai-assistant/conversations/:conversationId/history
router.get('/conversations/:conversationId/history', [
  conversationIdValidator,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
], validateRequest, getConversationHistory);

// @route   POST /api/ai-assistant/conversations/:conversationId/messages
router.post('/conversations/:conversationId/messages', [
  conversationIdValidator,
  body('content').trim().notEmpty().withMessage('Message content is required'),
  body('messageType').optional().isIn(['text', 'image', 'voice', 'pdf', 'video', 'code', 'mixed']).withMessage('Invalid message type'),
  body('promptType').optional().isIn(['system', 'conversation', 'educational', 'programming', 'quiz', 'summary']).withMessage('Invalid prompt type')
], validateRequest, userRateLimit, sendMessage);

// @route   DELETE /api/ai-assistant/conversations/:conversationId/messages
router.delete('/conversations/:conversationId/messages', [
  conversationIdValidator
], validateRequest, clearConversationMessages);

// @route   DELETE /api/ai-assistant/conversations/:conversationId
router.delete('/conversations/:conversationId', [
  conversationIdValidator
], validateRequest, deleteConversation);

module.exports = router;
