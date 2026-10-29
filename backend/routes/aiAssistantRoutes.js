const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

const auth = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const userRateLimit = require('../middleware/userRateLimit');
const {
  resolveConversation,
  createStudyAssistantConversation,
  getConversation,
  getConversationHistory,
  getStudentConversations,
  sendMessage,
  clearConversationMessages,
  deleteConversation
} = require('../controllers/aiAssistantController');

// All AI Assistant routes require valid JWT authentication
router.use(auth);

// Common parameter validators
const conversationIdValidator = param('conversationId')
  .isMongoId()
  .withMessage('Valid conversation ID is required');

// =============================================================================
// Conversation Routes
// =============================================================================

// @route   POST /api/ai/conversations/study-assistant
// @desc    Create a new global Study Assistant conversation for authenticated student
router.post(
  '/conversations/study-assistant',
  [
    body('initialTitle').optional().isString().trim()
  ],
  validateRequest,
  createStudyAssistantConversation
);

// @route   POST /api/ai/conversations
// @desc    Resolve existing or create a new conversation for student and lecture
router.post(
  '/conversations',
  [
    body('lectureId')
      .isMongoId()
      .withMessage('Valid lecture ID is required')
  ],
  validateRequest,
  resolveConversation
);

// @route   POST /api/ai/conversations/resolve (Alias)
// @desc    Resolve existing or create a new conversation for student and lecture
router.post(
  '/conversations/resolve',
  [
    body('lectureId')
      .isMongoId()
      .withMessage('Valid lecture ID is required')
  ],
  validateRequest,
  resolveConversation
);

// @route   GET /api/ai/conversations
// @desc    Get all conversations belonging to the authenticated student
router.get(
  '/conversations',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validateRequest,
  getStudentConversations
);

// @route   GET /api/ai/conversations/:conversationId
// @desc    Get a specific conversation by ID for the authenticated student
router.get(
  '/conversations/:conversationId',
  [conversationIdValidator],
  validateRequest,
  getConversation
);

// @route   DELETE /api/ai/conversations/:conversationId
// @desc    Soft-delete a conversation
router.delete(
  '/conversations/:conversationId',
  [conversationIdValidator],
  validateRequest,
  deleteConversation
);

// =============================================================================
// Message Routes
// =============================================================================

// @route   GET /api/ai/conversations/:conversationId/messages
// @desc    Get conversation message history (supports pagination)
router.get(
  '/conversations/:conversationId/messages',
  [
    conversationIdValidator,
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validateRequest,
  getConversationHistory
);

// @route   GET /api/ai/conversations/:conversationId/history (Alias)
// @desc    Get conversation message history (supports pagination)
router.get(
  '/conversations/:conversationId/history',
  [
    conversationIdValidator,
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validateRequest,
  getConversationHistory
);

// @route   POST /api/ai/conversations/:conversationId/messages
// @desc    Send a user message to AI and retrieve generated response
router.post(
  '/conversations/:conversationId/messages',
  [
    conversationIdValidator,
    body('content').optional().isString(),
    body('messageType')
      .optional()
      .isIn(['text', 'image', 'voice', 'pdf', 'video', 'code', 'mixed'])
      .withMessage('Invalid message type'),
    body('promptType')
      .optional()
      .isIn(['system', 'conversation', 'educational', 'programming', 'quiz', 'summary'])
      .withMessage('Invalid prompt type')
  ],
  validateRequest,
  userRateLimit,
  sendMessage
);

// @route   DELETE /api/ai/conversations/:conversationId/messages
// @desc    Clear all message history in a conversation
router.delete(
  '/conversations/:conversationId/messages',
  [conversationIdValidator],
  validateRequest,
  clearConversationMessages
);

module.exports = router;
