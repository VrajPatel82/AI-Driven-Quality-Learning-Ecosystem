const mongoose = require('mongoose');
const User = require('../models/User');
const Quiz = require('../models/Quiz');
const QuizResult = require('../models/QuizResult');
const Enrollment = require('../models/Enrollment');
const Assignment = require('../models/Assignment');
const Lecture = require('../models/Lecture');
const AIConversation = require('../models/AIConversation');
const AIMessage = require('../models/AIMessage');
const groqService = require('./groqService');
const geminiService = require('./geminiService');
const { PROMPT_TYPES, buildPrompt } = require('../utils/aiPromptBuilder');

// Safely sync AIConversation indexes in MongoDB to support partial filtering for Study Assistant
AIConversation.syncIndexes().catch(err => {
  console.warn('[AIConversation] Index sync notice:', err.message);
});

// History limit for Groq context window
const DEFAULT_HISTORY_LIMIT = Math.max(6, Math.min(50, parseInt(process.env.AI_ASSISTANT_HISTORY_LIMIT || '20', 10)));
const DEFAULT_MODEL = process.env.GROQ_TUTOR_MODEL || 'groq/compound-mini';

/**
 * Custom Service Error Generator
 * Creates an Error instance with HTTP status code and error code for controller consumption.
 */
const createServiceError = (message, statusCode = 500, code = 'AI_CONVERSATION_ERROR') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

/**
 * Validates MongoDB ObjectId string or instance
 */
const validateObjectId = (id, fieldName = 'ID') => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw createServiceError(`Invalid ${fieldName}: '${id}'`, 400, `INVALID_${fieldName.toUpperCase().replace(/\s+/g, '_')}`);
  }
};

/**
 * Truncates text for lastMessagePreview safely
 */
const truncatePreview = (text, maxLength = 120) => {
  if (!text) return '';
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
};

/**
 * Automatically detects the appropriate prompt type based on message content
 */
const detectPromptType = (content = '') => {
  const normalized = String(content).toLowerCase();

  if (/(summarize|summary|short notes|brief notes|recap|tl;dr)/i.test(normalized)) {
    return PROMPT_TYPES.summary;
  }

  if (/(quiz|mcq|multiple choice|viva|questions|test me|exam prep|important questions)/i.test(normalized)) {
    return PROMPT_TYPES.quiz;
  }

  if (/(code|debug|algorithm|complexity|javascript|typescript|python|react|node|express|mongodb|mongo|database|programming)/i.test(normalized)) {
    return PROMPT_TYPES.programming;
  }

  return PROMPT_TYPES.educational;
};

/**
 * Formats message documents into Groq history format.
 * Converts roles ('assistant'/'model' -> 'assistant', 'user' -> 'user').
 * Enforces strict role alternation and ensures history ends with 'assistant'
 * so the upcoming user message alternates correctly.
 */
const formatGroqHistory = (messages = []) => {
  const formatted = [];
  let expectedRole = 'user';

  for (const msg of messages) {
    if (!msg || !msg.content || !String(msg.content).trim()) continue;
    if (msg.error) continue;

    const role = msg.role === 'assistant' || msg.role === 'model' ? 'assistant' : 'user';

    if (role === expectedRole) {
      formatted.push({
        role,
        content: String(msg.content).trim(),
        attachments: msg.metadata?.attachments || []
      });
      expectedRole = role === 'user' ? 'assistant' : 'user';
    } else if (role === 'user' && expectedRole === 'assistant') {
      // If consecutive user turns occur without assistant response, keep latest user turn
      if (formatted.length > 0 && formatted[formatted.length - 1].role === 'user') {
        formatted[formatted.length - 1] = {
          role: 'user',
          content: String(msg.content).trim(),
          attachments: msg.metadata?.attachments || []
        };
      }
    }
  }

  // Ensure history ends with 'assistant' turn so the subsequent user message alternates cleanly
  while (formatted.length > 0 && formatted[formatted.length - 1].role === 'user') {
    formatted.pop();
  }

  return formatted;
};

class AIConversationService {
  /**
   * Performance-optimized context builder for Study Assistant.
   * Retrieves compact real student academic profile without scanning lifetime chat logs.
   */
  async getStudentAcademicContext(studentId) {
    try {
      const student = await User.findById(studentId).select('name email department currentSemester role').lean();
      if (!student) return null;

      const Gradebook = require('../models/Gradebook');

      // 1. Enrolled courses
      const enrollments = await Enrollment.find({ student: studentId, status: 'active' })
        .populate('course', 'name code department semester')
        .limit(10)
        .lean();
      const courseIds = enrollments.map(e => e.course?._id || e.course).filter(Boolean);
      const courseNames = enrollments.map(e => e.course ? `${e.course.name} (${e.course.code || 'N/A'})` : '').filter(Boolean);

      // 2. Lecture Progress / Available Lectures for Student's Semester & Courses
      const semFilter = student.currentSemester ? { semester: student.currentSemester } : {};
      const courseFilter = courseIds.length > 0 ? { course: { $in: courseIds } } : {};

      const [totalLectures, recentLectures] = await Promise.all([
        Lecture.countDocuments({ ...courseFilter, ...semFilter }),
        Lecture.find({ ...courseFilter, ...semFilter })
          .sort({ createdAt: -1 })
          .limit(5)
          .select('title subject type semester createdAt')
          .lean()
      ]);

      const recentlyAvailableLectures = recentLectures.map(l => `${l.title} (${l.subject || 'General'})`);

      // 3. Quiz Attempts & Performance
      const quizResults = await QuizResult.find({ student: studentId })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('quiz', 'title')
        .lean();

      const totalQuizzes = quizResults.length;
      let avgQuizScore = null;
      let recentQuizScoresStr = 'None';

      if (totalQuizzes > 0) {
        const totalPct = quizResults.reduce((acc, r) => {
          const max = r.maxScore || r.totalScore || 1;
          return acc + Math.min(100, Math.round(((r.totalScore || 0) / max) * 100));
        }, 0);
        avgQuizScore = `${Math.round(totalPct / totalQuizzes)}%`;

        recentQuizScoresStr = quizResults.slice(0, 3).map(r => {
          const title = r.quiz?.title || 'Quiz';
          const max = r.maxScore || r.totalScore || 1;
          const pct = Math.round(((r.totalScore || 0) / max) * 100);
          return `${title}: ${r.totalScore}/${max} (${pct}%)`;
        }).join(', ');
      }

      // 4. Assignments & Submission Status
      const [totalCourseAssignments, userAssignmentSubmissions] = await Promise.all([
        courseIds.length > 0 ? Assignment.countDocuments({ course: { $in: courseIds } }) : 0,
        Assignment.find({ 'submissions.student': studentId })
          .select('title maxMarks submissions.$')
          .limit(10)
          .lean()
      ]);

      const submittedCount = userAssignmentSubmissions.length;
      const recentAssignmentGrades = userAssignmentSubmissions
        .slice(0, 3)
        .map(a => {
          const sub = a.submissions?.[0];
          const marksStr = sub?.marks !== null && sub?.marks !== undefined ? `${sub.marks}/${a.maxMarks}` : 'Pending evaluation';
          return `${a.title}: ${marksStr}`;
        })
        .join(', ');

      // 5. Gradebook / Academic Marks
      const gradebookDocs = await Gradebook.find({ 'grades.student': studentId })
        .populate('course', 'name code')
        .lean();

      const gradeEntries = [];
      gradebookDocs.forEach(gb => {
        const studentGrades = (gb.grades || []).filter(g => g.student?.toString() === studentId.toString());
        studentGrades.forEach(sg => {
          gradeEntries.push(`${gb.course?.name || 'Course'} - ${sg.componentName}: ${sg.marksObtained} marks`);
        });
      });

      // 6. Attendance Summary
      let attendanceSummaryStr = 'Not recorded';
      try {
        const attendanceService = require('../services/attendanceService');
        const attStats = await attendanceService.getStudentAttendance({ studentId, courseId: null, user: { role: 'super_admin' } });
        if (attStats?.stats?.totalClasses > 0) {
          attendanceSummaryStr = `${attStats.stats.percentage}% (${attStats.stats.presentClasses}/${attStats.stats.totalClasses} classes)`;
        }
      } catch (attErr) {
        // Fallback gracefully if attendance query fails
      }

      // 7. Recent Questions asked across Lecture AI Tutor chats
      const studentConversations = await AIConversation.find({ student: studentId, isDeleted: false })
        .sort({ lastMessageAt: -1 })
        .limit(5)
        .select('_id chatTitle lecture')
        .populate('lecture', 'title subject')
        .lean();

      const convIds = studentConversations.map(c => c._id);
      const recentUserMessages = convIds.length > 0
        ? await AIMessage.find({ conversation: { $in: convIds }, role: 'user' })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('content conversation createdAt')
            .lean()
        : [];

      const recentQuestions = recentUserMessages.map(msg => {
        const parentConv = studentConversations.find(c => c._id.toString() === msg.conversation.toString());
        const lectureName = parentConv?.lecture?.title || parentConv?.chatTitle || 'Lecture';
        return `"${truncatePreview(msg.content, 80)}" (${lectureName})`;
      });

      return {
        name: student.name,
        department: student.department || 'N/A',
        currentSemester: student.currentSemester ? `Semester ${student.currentSemester}` : 'N/A',
        courses: courseNames.length > 0 ? courseNames.join(', ') : 'None listed',
        totalAvailableLectures: totalLectures,
        recentlyAvailableLectures: recentlyAvailableLectures.length > 0 ? recentlyAvailableLectures.join(', ') : 'None',
        totalQuizzesAttempted: totalQuizzes,
        avgQuizScore: avgQuizScore || 'No quiz data',
        recentQuizScores: recentQuizScoresStr,
        assignmentsStatus: `${submittedCount} submitted out of ${totalCourseAssignments} total course assignments`,
        recentAssignmentGrades: recentAssignmentGrades || 'None',
        gradebookMarks: gradeEntries.length > 0 ? gradeEntries.join('; ') : 'No gradebook records',
        attendanceSummary: attendanceSummaryStr,
        recentQuestions: recentQuestions.length > 0 ? recentQuestions.join('\n- ') : 'None'
      };
    } catch (err) {
      console.warn('[AI Assistant] Error building academic context:', err.message);
      return null;
    }
  }

  /**
   * Creates a new standalone global Study Assistant conversation for a student.
   */
  async createStudyAssistantConversation({ studentId, initialTitle }) {
    validateObjectId(studentId, 'Student ID');

    const conversation = await AIConversation.create({
      student: studentId,
      lecture: null,
      course: null,
      conversationType: 'study_assistant',
      subject: '',
      chatTitle: initialTitle || 'New Conversation',
      lastMessagePreview: '',
      lastUserMessagePreview: '',
      totalMessages: 0,
      isPinned: false,
      isArchived: false,
      isDeleted: false,
      lastMessageAt: new Date(),
      aiModelName: process.env.GROQ_TUTOR_MODEL || DEFAULT_MODEL,
      promptVersion: 'v1'
    });

    const populated = await AIConversation.findById(conversation._id)
      .populate('student', 'name email role');

    return {
      conversation: populated,
      messages: []
    };
  }

  /**
   * 1. Find or Create Conversation for Lecture
   * Finds an active conversation for a student and lecture, or creates a new one.
   * Restores soft-deleted conversations if re-opened.
   * Enforces 1 active conversation per student per lecture.
   */
  async resolveConversation({ studentId, lectureId }) {
    validateObjectId(studentId, 'Student ID');
    validateObjectId(lectureId, 'Lecture ID');

    // 1. Verify lecture exists
    const lecture = await Lecture.findById(lectureId)
      .populate('course', 'name code')
      .populate('uploadedBy', 'name email');

    if (!lecture) {
      throw createServiceError('Lecture not found', 404, 'LECTURE_NOT_FOUND');
    }

    // 2. Find existing conversation or create atomic record
    let conversation = await AIConversation.findOne({
      student: studentId,
      lecture: lectureId
    });

    if (conversation) {
      // Restore soft-deleted conversation if needed
      if (conversation.isDeleted) {
        conversation.isDeleted = false;
        conversation.deletedAt = null;
        conversation.isArchived = false;
        await conversation.save();
      }
    } else {
      try {
        conversation = await AIConversation.create({
          student: studentId,
          lecture: lecture._id,
          course: lecture.course?._id || lecture.course,
          conversationType: 'lecture',
          subject: lecture.subject || lecture.experimentTitle || '',
          chatTitle: lecture.title || 'AI Learning Assistant',
          lastMessagePreview: '',
          lastUserMessagePreview: '',
          totalMessages: 0,
          isPinned: false,
          isArchived: false,
          isDeleted: false,
          lastMessageAt: null,
          aiModelName: process.env.GROQ_TUTOR_MODEL || DEFAULT_MODEL,
          promptVersion: 'v1'
        });
      } catch (err) {
        // Handle race condition for unique index (student + lecture)
        if (err.code === 11000) {
          conversation = await AIConversation.findOne({
            student: studentId,
            lecture: lectureId
          });
          if (!conversation) {
            throw createServiceError('Failed to create or find conversation', 500, 'CONVERSATION_CREATE_FAILED');
          }
        } else {
          throw createServiceError(`Database error creating conversation: ${err.message}`, 500, 'DB_ERROR');
        }
      }
    }

    // 3. Populate conversation reference fields
    const populatedConversation = await AIConversation.findById(conversation._id)
      .populate('student', 'name email role')
      .populate('lecture', 'title type subject experimentTitle semester course')
      .populate('course', 'name code');

    // 4. Load messages in chronological order
    const messages = await AIMessage.find({ conversation: conversation._id })
      .sort({ createdAt: 1 })
      .select('role content messageType aiModelName responseTimeMs tokenUsage metadata createdAt');

    return {
      conversation: populatedConversation,
      messages
    };
  }

  /**
   * Helper: Fetch active conversation by ID and student ID
   */
  async getConversationById(conversationId, studentId) {
    validateObjectId(conversationId, 'Conversation ID');
    validateObjectId(studentId, 'Student ID');

    const conversation = await AIConversation.findOne({
      _id: conversationId,
      student: studentId,
      isDeleted: false
    })
      .populate('student', 'name email role')
      .populate('lecture', 'title type subject experimentTitle semester course')
      .populate('course', 'name code');

    if (!conversation) {
      throw createServiceError('Conversation not found or access denied', 404, 'CONVERSATION_NOT_FOUND');
    }

    return conversation;
  }

  /**
   * 2. Load Conversation History
   */
  async getConversationHistory({ conversationId, studentId, page = 1, limit = DEFAULT_HISTORY_LIMIT }) {
    const conversation = await this.getConversationById(conversationId, studentId);

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || DEFAULT_HISTORY_LIMIT));
    const skip = (pageNumber - 1) * pageSize;

    const [totalItems, messages] = await Promise.all([
      AIMessage.countDocuments({ conversation: conversation._id }),
      AIMessage.find({ conversation: conversation._id })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(pageSize)
        .select('role content messageType aiModelName responseTimeMs tokenUsage metadata createdAt')
    ]);

    const totalPages = Math.ceil(totalItems / pageSize) || 1;

    return {
      conversation,
      messages,
      pagination: {
        totalItems,
        totalPages,
        currentPage: pageNumber,
        limit: pageSize,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1
      }
    };
  }

  /**
   * Retrieves list of all conversations for a student (Unified Recent Chats view).
   */
  async getStudentConversations({ studentId, page = 1, limit = 20, includeArchived = false, search = '' }) {
    validateObjectId(studentId, 'Student ID');

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNumber - 1) * pageSize;

    const filter = {
      student: studentId,
      isDeleted: false
    };

    if (!includeArchived) {
      filter.isArchived = false;
    }

    if (search && String(search).trim()) {
      const searchRegex = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { chatTitle: searchRegex },
        { lastUserMessagePreview: searchRegex },
        { lastMessagePreview: searchRegex },
        { subject: searchRegex }
      ];
    }

    const [totalItems, rawConversations] = await Promise.all([
      AIConversation.countDocuments(filter),
      AIConversation.find(filter)
        .sort({ isPinned: -1, lastMessageAt: -1, updatedAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate('lecture', 'title type subject experimentTitle semester')
        .populate('course', 'name code')
        .select('chatTitle conversationType lastMessagePreview lastUserMessagePreview totalMessages isPinned isArchived lastMessageAt createdAt updatedAt lecture course subject')
        .lean()
    ]);

    // For any existing lecture conversations where lastUserMessagePreview is not set,
    // fetch the latest user message preview dynamically so Recent Chats displays real questions!
    const conversations = await Promise.all(
      rawConversations.map(async (conv) => {
        let userQuestionPreview = conv.lastUserMessagePreview || '';
        if (!userQuestionPreview && conv.totalMessages > 0) {
          const lastUserMsg = await AIMessage.findOne({ conversation: conv._id, role: 'user' })
            .sort({ createdAt: -1 })
            .select('content')
            .lean();
          if (lastUserMsg && lastUserMsg.content) {
            userQuestionPreview = truncatePreview(lastUserMsg.content);
          }
        }
        return {
          ...conv,
          conversationType: conv.conversationType || (conv.lecture ? 'lecture' : 'study_assistant'),
          lastUserMessagePreview: userQuestionPreview
        };
      })
    );

    const totalPages = Math.ceil(totalItems / pageSize) || 1;

    return {
      conversations,
      pagination: {
        totalItems,
        totalPages,
        currentPage: pageNumber,
        limit: pageSize,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1
      }
    };
  }

  /**
   * Send Message & Handle AI Response
   */
  async sendMessage({ conversationId, studentId, content, messageType = 'text', promptType, attachments = [] }) {
    validateObjectId(conversationId, 'Conversation ID');
    validateObjectId(studentId, 'Student ID');

    const normalizedContent = String(content || '').trim();
    if (!normalizedContent && (!Array.isArray(attachments) || attachments.length === 0)) {
      throw createServiceError('Message content or attachments cannot be empty', 400, 'EMPTY_MESSAGE');
    }

    // 1. Load active conversation
    const conversation = await this.getConversationById(conversationId, studentId);

    // 2. Determine prompt mode & build system prompt
    const promptMode = promptType || detectPromptType(normalizedContent);
    let promptBundle = buildPrompt(promptMode, {
      lectureTitle: conversation.lecture?.title,
      courseName: conversation.course?.name,
      subject: conversation.subject,
      conversationPurpose: conversation.conversationType === 'study_assistant'
        ? 'Global personal academic assistant for a student inside the LMS'
        : 'Educational assistant conversation for a student watching a lecture inside the LMS'
    });

    // If this is a global Study Assistant conversation, append compact student academic context
    if (conversation.conversationType === 'study_assistant') {
      const academicContext = await this.getStudentAcademicContext(studentId);
      if (academicContext) {
        const academicSystemContext = `\n\n[STUDENT ACADEMIC PROFILE & CONTEXT]
Student Name: ${academicContext.name}
Department: ${academicContext.department}
Current Semester: ${academicContext.currentSemester}
Enrolled Courses: ${academicContext.courses}
Average Quiz Performance: ${academicContext.avgQuizScore}
Submitted Assignments Count: ${academicContext.submittedAssignments}
Recent Lecture Questions Asked:
- ${academicContext.recentQuestions}

BEHAVIORAL INSTRUCTIONS:
1. You are the student's personal global Study Assistant & Academic Teacher. Help them excel as a student, prepare study plans, revise difficult topics, and prepare for exams.
2. Use the provided real academic profile data when giving advice.
3. If specific academic data is unavailable, explicitly state: "I don't have enough data to determine that." NEVER invent fake grades, attendance, or quiz scores.
4. Keep explanations clean, academic, clear, and professional without using childish emojis or AI slogans.`;

        promptBundle.systemPrompt = (promptBundle.systemPrompt || '') + academicSystemContext;
      }
    }

    // 3. Save User Message
    const userMessage = await AIMessage.create({
      conversation: conversation._id,
      role: 'user',
      content: normalizedContent || (attachments.length > 0 ? '[Attachment]' : ''),
      messageType: messageType || (attachments.length > 0 ? 'mixed' : 'text'),
      aiModelName: '',
      metadata: {
        promptType: promptMode,
        attachments: attachments || []
      }
    });

    // Update conversation title automatically on 1st user message if default
    if (conversation.totalMessages === 0 && (conversation.chatTitle === 'New Conversation' || conversation.chatTitle === 'AI Learning Assistant')) {
      conversation.chatTitle = truncatePreview(normalizedContent, 40);
    }

    // Save student question preview
    conversation.lastUserMessagePreview = truncatePreview(normalizedContent);

    // 4. Load recent conversation history (excluding current user message)
    const historyMessages = await AIMessage.find({
      conversation: conversation._id,
      _id: { $ne: userMessage._id }
    })
      .sort({ createdAt: -1 })
      .limit(DEFAULT_HISTORY_LIMIT)
      .select('role content metadata createdAt');

    const orderedHistory = historyMessages.reverse();
    const formattedHistory = formatGroqHistory(orderedHistory);

    // 5. Send Request to AI Provider (Groq primary, Gemini fallback)
    let response;
    let primaryError = null;
    let fallbackError = null;

    try {
      response = await groqService.sendMessage({
        systemPrompt: [promptBundle.systemPrompt, promptBundle.conversationPrompt].filter(Boolean).join('\n\n'),
        history: formattedHistory,
        userMessage: normalizedContent,
        attachments: attachments || [],
        modelName: process.env.GROQ_TUTOR_MODEL || DEFAULT_MODEL,
        temperature: promptBundle.generationConfig?.temperature,
        maxOutputTokens: promptBundle.generationConfig?.maxOutputTokens || 1000,
        timeoutMs: Number(process.env.AI_ASSISTANT_TIMEOUT_MS || 60000)
      });
    } catch (groqErr) {
      primaryError = groqErr;
      console.warn(`[AI Assistant] Groq primary failed (${groqErr.message}), falling back to Gemini...`);
      try {
        response = await geminiService.sendMessage({
          systemPrompt: [promptBundle.systemPrompt, promptBundle.conversationPrompt].filter(Boolean).join('\n\n'),
          history: formattedHistory,
          userMessage: normalizedContent,
          attachments: attachments || [],
          modelName: process.env.GEMINI_MODEL_NAME || 'gemini-3.6-flash',
          temperature: promptBundle.generationConfig?.temperature,
          maxOutputTokens: promptBundle.generationConfig?.maxOutputTokens || 1000,
          timeoutMs: Number(process.env.AI_ASSISTANT_TIMEOUT_MS || 60000)
        });
      } catch (geminiErr) {
        fallbackError = geminiErr;
        console.error('[AI Assistant] Gemini fallback failed:', geminiErr.message);
      }
    }

    // If both providers failed or returned no text:
    // IMPORTANT: DO NOT delete userMessage! Preserve user message in MongoDB database.
    if (!response || !response.text) {
      conversation.lastMessageAt = new Date();
      await conversation.save();

      const finalError = fallbackError || primaryError || new Error('AI provider request failed');
      const statusCode = finalError.statusCode || 429;
      const isRateLimit = statusCode === 429 || /rate limit|quota|429/i.test(finalError.message);
      const errorMsg = isRateLimit
        ? 'Rate limit exceeded. Please wait a moment before trying again.'
        : (finalError.message || 'AI assistant service temporarily unavailable.');

      throw createServiceError(errorMsg, statusCode, finalError.code || 'RATE_LIMIT_EXCEEDED');
    }

    // 6. Save AI Assistant Response
    const assistantMessage = await AIMessage.create({
      conversation: conversation._id,
      role: 'assistant',
      content: response.text,
      messageType: 'text',
      aiModelName: response.modelName,
      responseTimeMs: response.responseTimeMs,
      tokenUsage: {
        promptTokens: response.usageMetadata?.promptTokenCount || null,
        completionTokens: response.usageMetadata?.candidatesTokenCount || null,
        totalTokens: response.usageMetadata?.totalTokenCount || null
      },
      metadata: {
        promptType: promptMode
      }
    });

    // 7. Update Conversation document state
    conversation.lastMessagePreview = truncatePreview(response.text);
    conversation.lastMessageRole = 'assistant';
    conversation.totalMessages = (conversation.totalMessages || 0) + 2;
    conversation.lastMessageAt = new Date();
    conversation.aiModelName = response.modelName;
    conversation.promptVersion = 'v1';
    await conversation.save();

    return {
      conversation,
      userMessage,
      assistantMessage,
      response
    };
  }

  /**
   * Clears all messages from a conversation and resets message metadata.
   */
  async clearConversationMessages({ conversationId, studentId }) {
    const conversation = await this.getConversationById(conversationId, studentId);

    await AIMessage.deleteMany({ conversation: conversation._id });

    conversation.lastMessagePreview = '';
    conversation.lastUserMessagePreview = '';
    conversation.lastMessageRole = undefined;
    conversation.totalMessages = 0;
    conversation.lastMessageAt = null;
    conversation.summary = '';
    await conversation.save();

    return conversation;
  }

  /**
   * Soft-deletes a conversation.
   */
  async deleteConversation({ conversationId, studentId }) {
    const conversation = await this.getConversationById(conversationId, studentId);

    conversation.isDeleted = true;
    conversation.deletedAt = new Date();
    conversation.isArchived = true;
    await conversation.save();

    return conversation;
  }
}

module.exports = new AIConversationService();

