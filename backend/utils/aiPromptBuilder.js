const PROMPT_TYPES = {
  system: 'system',
  conversation: 'conversation',
  educational: 'educational',
  programming: 'programming',
  quiz: 'quiz',
  summary: 'summary'
};

const promptRegistry = new Map();

const getLectureContextLines = (context = {}) => {
  const lines = [];
  if (context.lectureTitle) lines.push(`Lecture title: ${context.lectureTitle}`);
  if (context.courseName) lines.push(`Course: ${context.courseName}`);
  if (context.subject) lines.push(`Subject: ${context.subject}`);
  if (context.studentName) lines.push(`Student: ${context.studentName}`);
  return lines;
};

const buildBaseSystemPrompt = (context = {}) => {
  const contextLines = getLectureContextLines(context);
  return [
    'You are an expert AI learning assistant inside a multilingual educational platform.',
    'Your job is to help students learn with clear, accurate, beginner-friendly, and professional answers.',
    'Use Markdown for structure when helpful.',
    'Prefer concise explanations first, then deepen only when the student asks for more detail.',
    'Support theory, code, algorithms, debugging, examples, quizzes, MCQs, viva questions, notes, summaries, best practices, career guidance, and learning roadmaps.',
    'If a request is ambiguous, ask one short clarifying question before answering.',
    'Never claim access to lecture content unless the student explicitly provides it in the chat.',
    'Do not output unsafe, irrelevant, or hidden HTML. Keep responses textual and markdown-based.',
    contextLines.length ? `Context:\n${contextLines.join('\n')}` : ''
  ].filter(Boolean).join('\n\n');
};

const buildConversationPrompt = (context = {}) => {
  const lineItems = [];
  if (context.latestUserMessage) {
    lineItems.push(`Latest user message: ${context.latestUserMessage}`);
  }
  if (context.conversationPurpose) {
    lineItems.push(`Conversation purpose: ${context.conversationPurpose}`);
  }

  return [
    'Continue the current student conversation using the message history provided to the model.',
    'Stay consistent with previous answers and keep the assistant persona stable.',
    'If the student asks follow-up questions, answer directly and build on the prior context.',
    lineItems.length ? `Additional context:\n${lineItems.join('\n')}` : ''
  ].filter(Boolean).join('\n\n');
};

const registerPromptType = (name, builder) => {
  promptRegistry.set(name, builder);
};

const buildPrompt = (type = PROMPT_TYPES.educational, context = {}) => {
  const builder = promptRegistry.get(type) || promptRegistry.get(PROMPT_TYPES.educational);
  return builder(context);
};

registerPromptType(PROMPT_TYPES.system, (context = {}) => ({
  promptType: PROMPT_TYPES.system,
  systemPrompt: buildBaseSystemPrompt(context),
  conversationPrompt: buildConversationPrompt(context),
  generationConfig: {
    temperature: 0.3,
    maxOutputTokens: 1024
  }
}));

registerPromptType(PROMPT_TYPES.conversation, (context = {}) => ({
  promptType: PROMPT_TYPES.conversation,
  systemPrompt: [
    buildBaseSystemPrompt(context),
    'Focus on continuing the conversation naturally and preserving context across turns.'
  ].join('\n\n'),
  conversationPrompt: buildConversationPrompt(context),
  generationConfig: {
    temperature: 0.4,
    maxOutputTokens: 1024
  }
}));

registerPromptType(PROMPT_TYPES.educational, (context = {}) => ({
  promptType: PROMPT_TYPES.educational,
  systemPrompt: [
    buildBaseSystemPrompt(context),
    'Prioritize conceptual explanations, examples, step-by-step reasoning, and study-friendly formatting.'
  ].join('\n\n'),
  conversationPrompt: buildConversationPrompt(context),
  generationConfig: {
    temperature: 0.4,
    maxOutputTokens: 1200
  }
}));

registerPromptType(PROMPT_TYPES.programming, (context = {}) => ({
  promptType: PROMPT_TYPES.programming,
  systemPrompt: [
    buildBaseSystemPrompt(context),
    'You are also a senior programming tutor. Provide correct, clean, production-ready code when appropriate.',
    'Explain debugging, algorithms, complexity, edge cases, and best practices clearly.',
    'Use fenced code blocks for code and keep the explanation beginner-friendly.'
  ].join('\n\n'),
  conversationPrompt: buildConversationPrompt(context),
  generationConfig: {
    temperature: 0.3,
    maxOutputTokens: 1400
  }
}));

registerPromptType(PROMPT_TYPES.quiz, (context = {}) => ({
  promptType: PROMPT_TYPES.quiz,
  systemPrompt: [
    buildBaseSystemPrompt(context),
    'You are generating quizzes, viva questions, MCQs, and exam prep material.',
    'Return structured, study-ready output with clear question formatting and concise explanations.',
    'When asked for quiz-style output, prefer question-and-answer or MCQ structure.'
  ].join('\n\n'),
  conversationPrompt: buildConversationPrompt(context),
  generationConfig: {
    temperature: 0.35,
    maxOutputTokens: 1200
  }
}));

registerPromptType(PROMPT_TYPES.summary, (context = {}) => ({
  promptType: PROMPT_TYPES.summary,
  systemPrompt: [
    buildBaseSystemPrompt(context),
    'You are summarizing academic content for fast revision.',
    'Use short sections, bullet points, and clear takeaways when useful.'
  ].join('\n\n'),
  conversationPrompt: buildConversationPrompt(context),
  generationConfig: {
    temperature: 0.25,
    maxOutputTokens: 900
  }
}));

module.exports = {
  PROMPT_TYPES,
  registerPromptType,
  buildPrompt,
  buildBaseSystemPrompt,
  buildConversationPrompt
};
