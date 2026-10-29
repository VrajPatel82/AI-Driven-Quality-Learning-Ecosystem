const aiConversationService = require('../services/aiConversationService');

/**
 * AI Assistant Controller
 * Thin HTTP layer that interfaces between Express requests and aiConversationService.
 * Contains no business logic, database queries, or direct AI provider API calls.
 */

// @desc    Find or create an active AI conversation for student and lecture
// @route   POST /api/ai-assistant/conversations/resolve
exports.resolveConversation = async (req, res, next) => {
  try {
    const { lectureId } = req.body;
    if (!lectureId) {
      return res.status(400).json({ success: false, message: 'Lecture ID is required' });
    }

    const result = await aiConversationService.resolveConversation({
      studentId: req.user._id,
      lectureId
    });

    res.status(200).json({
      success: true,
      message: 'Conversation resolved successfully',
      conversation: result.conversation,
      messages: result.messages
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a specific conversation by ID for the authenticated student
// @route   GET /api/ai-assistant/conversations/:conversationId
exports.getConversation = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    if (!conversationId) {
      return res.status(400).json({ success: false, message: 'Conversation ID is required' });
    }

    const conversation = await aiConversationService.getConversationById(
      conversationId,
      req.user._id
    );

    res.status(200).json({
      success: true,
      message: 'Conversation loaded successfully',
      conversation
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get paginated message history for a conversation
// @route   GET /api/ai-assistant/conversations/:conversationId/history
exports.getConversationHistory = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    if (!conversationId) {
      return res.status(400).json({ success: false, message: 'Conversation ID is required' });
    }

    const { page, limit } = req.query;

    const result = await aiConversationService.getConversationHistory({
      conversationId,
      studentId: req.user._id,
      page,
      limit
    });

    res.status(200).json({
      success: true,
      message: 'Conversation history loaded successfully',
      conversation: result.conversation,
      messages: result.messages,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a standalone Study Assistant conversation for authenticated student
// @route   POST /api/ai-assistant/conversations/study-assistant
exports.createStudyAssistantConversation = async (req, res, next) => {
  try {
    const { initialTitle } = req.body;
    const result = await aiConversationService.createStudyAssistantConversation({
      studentId: req.user._id,
      initialTitle
    });

    res.status(201).json({
      success: true,
      message: 'Study Assistant conversation created successfully',
      conversation: result.conversation,
      messages: result.messages
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all conversations belonging to the authenticated student
// @route   GET /api/ai-assistant/conversations
exports.getStudentConversations = async (req, res, next) => {
  try {
    const { page, limit, includeArchived, search } = req.query;

    const result = await aiConversationService.getStudentConversations({
      studentId: req.user._id,
      page,
      limit,
      includeArchived: includeArchived === 'true',
      search
    });

    res.status(200).json({
      success: true,
      message: 'Conversations loaded successfully',
      conversations: result.conversations,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send a message to AI and retrieve generated response
// @route   POST /api/ai-assistant/conversations/:conversationId/messages
exports.sendMessage = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    if (!conversationId) {
      return res.status(400).json({ success: false, message: 'Conversation ID is required' });
    }

    const { content, messageType, promptType, attachments } = req.body;
    if (!content && (!Array.isArray(attachments) || attachments.length === 0)) {
      return res.status(400).json({ success: false, message: 'Message content or attachments are required' });
    }

    const result = await aiConversationService.sendMessage({
      conversationId,
      studentId: req.user._id,
      content,
      messageType,
      promptType,
      attachments
    });

    res.status(200).json({
      success: true,
      message: 'Message sent successfully',
      conversation: result.conversation,
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage,
      aiResponse: {
        text: result.assistantMessage.content,
        modelName: result.assistantMessage.aiModelName,
        responseTimeMs: result.assistantMessage.responseTimeMs,
        tokenUsage: result.assistantMessage.tokenUsage
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Clear all message history in a conversation
// @route   DELETE /api/ai-assistant/conversations/:conversationId/messages
exports.clearConversationMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    if (!conversationId) {
      return res.status(400).json({ success: false, message: 'Conversation ID is required' });
    }

    const conversation = await aiConversationService.clearConversationMessages({
      conversationId,
      studentId: req.user._id
    });

    res.status(200).json({
      success: true,
      message: 'Conversation messages cleared successfully',
      conversation
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Soft-delete a conversation for authenticated student
// @route   DELETE /api/ai-assistant/conversations/:conversationId
exports.deleteConversation = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    if (!conversationId) {
      return res.status(400).json({ success: false, message: 'Conversation ID is required' });
    }

    const conversation = await aiConversationService.deleteConversation({
      conversationId,
      studentId: req.user._id
    });

    res.status(200).json({
      success: true,
      message: 'Conversation deleted successfully',
      conversation
    });
  } catch (error) {
    next(error);
  }
};

