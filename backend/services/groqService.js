const Groq = require('groq-sdk');

/**
 * Custom error class for Groq Service failures
 */
class GroqError extends Error {
  constructor(message, statusCode = 500, code = 'GROQ_ERROR', originalError = null) {
    super(message);
    this.name = 'GroqError';
    this.statusCode = statusCode;
    this.code = code;
    this.originalError = originalError;
  }
}

class GroqService {
  constructor() {
    this.client = null;
    this.defaultModel = process.env.GROQ_TUTOR_MODEL || 'groq/compound-mini';
    this.defaultTimeoutMs = Number(process.env.AI_ASSISTANT_TIMEOUT_MS || 60000);
    this.defaultTemperature = Number(process.env.AI_ASSISTANT_TEMPERATURE || 0.4);
    this.defaultMaxTokens = Number(process.env.AI_ASSISTANT_MAX_OUTPUT_TOKENS || 2048);
  }

  /**
   * Reads GROQ_API_KEY from environment and lazily initializes the Groq client.
   * @returns {Groq} Initialized Groq client
   */
  getClient() {
    if (!this.client) {
      const apiKey = process.env.GROQ_API_KEY?.trim();
      if (!apiKey) {
        throw new GroqError(
          'GROQ_API_KEY is missing or empty in environment variables (.env).',
          401,
          'MISSING_API_KEY'
        );
      }
      this.client = new Groq({ apiKey });
    }
    return this.client;
  }

  /**
   * Formats response text as clean Markdown.
   * Strips internal reasoning tags (e.g. <think>...</think>) from Qwen/DeepSeek models.
   * @param {string} text
   * @returns {string}
   */
  formatMarkdown(text = '') {
    if (typeof text !== 'string') return '';
    const cleaned = text.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim();
    return cleaned.replace(/\r\n/g, '\n').trim();
  }

  /**
   * Normalizes conversation history into Groq chat completion messages format.
   * Converts roles: 'user' -> 'user', 'assistant'/'model' -> 'assistant'.
   * Preserves chronological order and ensures alternating structure.
   *
   * @param {Array} history - Raw conversation history array
   * @returns {Array<{ role: string, content: string }>}
   */
  normalizeHistory(history = []) {
    if (!Array.isArray(history)) return [];

    const formatted = [];

    for (const msg of history) {
      if (!msg) continue;

      let content = '';
      if (typeof msg === 'string') {
        content = msg.trim();
      } else if (msg.content) {
        content = String(msg.content).trim();
      } else if (msg.text) {
        content = String(msg.text).trim();
      } else if (Array.isArray(msg.parts)) {
        content = msg.parts
          .map((p) => (typeof p === 'string' ? p : p.text || ''))
          .filter(Boolean)
          .join('\n')
          .trim();
      }

      // If there are text attachments or metadata, append readable context
      if (msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
        const attachmentTexts = msg.attachments
          .map((att) => {
            if (typeof att === 'string') return att;
            if (att.text || att.content) return att.text || att.content;
            if (att.name) return `[Attachment: ${att.name}]`;
            return '';
          })
          .filter(Boolean);

        if (attachmentTexts.length > 0) {
          content = content
            ? `${content}\n\n${attachmentTexts.join('\n')}`
            : attachmentTexts.join('\n');
        }
      }

      if (!content) continue;

      // Map role to OpenAI/Groq standard ('user' or 'assistant')
      const role =
        msg.role === 'assistant' || msg.role === 'model'
          ? 'assistant'
          : msg.role === 'system'
          ? 'system'
          : 'user';

      formatted.push({ role, content });
    }

    return formatted;
  }

  /**
   * Builds the final list of messages for the Groq chat completions API.
   *
   * @param {Object} options
   * @param {string} [options.systemPrompt]
   * @param {Array} [options.history]
   * @param {string} [options.userMessage]
   * @param {Array} [options.attachments]
   * @returns {Array<{ role: string, content: string }>}
   */
  buildMessages({ systemPrompt = '', history = [], userMessage = '', attachments = [] }) {
    const messages = [];

    // 1. Add system prompt if provided
    if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim()) {
      messages.push({
        role: 'system',
        content: systemPrompt.trim()
      });
    }

    // 2. Add normalized history messages
    const normalizedHistory = this.normalizeHistory(history);
    for (const msg of normalizedHistory) {
      messages.push(msg);
    }

    // 3. Prepare current user message and attachments
    let currentUserContent = '';
    if (typeof userMessage === 'string') {
      currentUserContent = userMessage.trim();
    } else if (userMessage && typeof userMessage === 'object') {
      currentUserContent = String(userMessage.content || userMessage.text || userMessage.prompt || '').trim();
    }

    if (Array.isArray(attachments) && attachments.length > 0) {
      const attachmentSummaries = attachments
        .map((att) => {
          if (typeof att === 'string') return att;
          if (att.text || att.content) return att.text || att.content;
          if (att.name) return `[Attachment: ${att.name}]`;
          return '';
        })
        .filter(Boolean);

      if (attachmentSummaries.length > 0) {
        currentUserContent = currentUserContent
          ? `${currentUserContent}\n\n${attachmentSummaries.join('\n')}`
          : attachmentSummaries.join('\n');
      }
    }

    if (currentUserContent) {
      messages.push({
        role: 'user',
        content: currentUserContent
      });
    }

    return messages;
  }

  /**
   * Wraps a promise with a configurable timeout.
   * @param {Promise} promise
   * @param {number} timeoutMs
   * @returns {Promise}
   */
  withTimeout(promise, timeoutMs) {
    const resolvedTimeout =
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : this.defaultTimeoutMs;

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new GroqError(
            `Groq request timed out after ${resolvedTimeout}ms.`,
            504,
            'TIMEOUT_ERROR'
          )
        );
      }, resolvedTimeout);
    });

    return Promise.race([
      promise.finally(() => clearTimeout(timeoutId)),
      timeoutPromise
    ]);
  }

  /**
   * Maps low-level Groq API errors or network errors into clean GroqErrors.
   * @param {Error} error
   * @returns {GroqError}
   */
  mapError(error) {
    if (error instanceof GroqError) {
      return error;
    }

    const message =
      error?.error?.message ||
      error?.response?.data?.error?.message ||
      error?.message ||
      'Groq service request failed.';

    const status =
      error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.error?.status;

    // 401 Unauthorized / Invalid API Key
    if (status === 401 || /401|unauthorized|invalid api key|invalid_api_key/i.test(message)) {
      return new GroqError(
        'Groq authentication failed. Please verify your GROQ_API_KEY in .env.',
        401,
        'UNAUTHORIZED',
        error
      );
    }

    // 403 Forbidden / Permission Issue
    if (status === 403 || /403|permission|forbidden|access denied/i.test(message)) {
      return new GroqError(
        'Groq access denied. Check permissions and API limits.',
        403,
        'FORBIDDEN',
        error
      );
    }

    // 404 Model Not Found / Unavailable
    if (status === 404 || /404|model_not_found|model.*not found|model is unavailable/i.test(message)) {
      return new GroqError(
        'Groq model is unavailable. Check your GROQ_TUTOR_MODEL configuration.',
        404,
        'MODEL_NOT_FOUND',
        error
      );
    }

    // 429 Rate Limit / Quota Exceeded
    if (status === 429 || /429|rate limit|rate_limit_exceeded|quota/i.test(message)) {
      return new GroqError(
        'Groq rate limit exceeded. Please wait a moment before trying again.',
        429,
        'RATE_LIMIT_EXCEEDED',
        error
      );
    }

    // 400 Bad Request / Invalid Request
    if (status === 400 || /400|bad request|invalid request/i.test(message)) {
      return new GroqError(
        `Groq invalid request: ${message}`,
        400,
        'INVALID_REQUEST',
        error
      );
    }

    // 408 / 504 Timeout
    if (status === 408 || status === 504 || /timeout|timed out/i.test(message)) {
      return new GroqError(
        'Groq request timed out. Please try again.',
        504,
        'TIMEOUT_ERROR',
        error
      );
    }

    // 5xx Server Error
    if ((status >= 500 && status < 600) || /internal server error|service unavailable|groq server error/i.test(message)) {
      return new GroqError(
        'Groq server error. Please try again later.',
        502,
        'GROQ_SERVER_ERROR',
        error
      );
    }

    // Network connectivity error
    if (/network|fetch|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(message)) {
      return new GroqError(
        'Groq network connectivity error. Check server internet connection.',
        503,
        'NETWORK_ERROR',
        error
      );
    }

    return new GroqError(
      `Groq service error: ${message}`,
      status || 500,
      'INTERNAL_GROQ_ERROR',
      error
    );
  }

  /**
   * Primary service method to generate chat responses via Groq.
   * Compatible with previous Gemini service calling interface.
   *
   * @param {Object|Array} params - Options object or history array (positional)
   * @param {string|Object} [userMsgParam] - Latest user message if positional
   * @param {Object} [optionsParam] - Extra options if positional
   * @returns {Promise<{ text: string, markdown: string, usageMetadata: Object, modelName: string, responseTimeMs: number }>}
   */
  async sendMessage(params = {}, userMsgParam, optionsParam = {}) {
    let history = [];
    let userMessage = '';
    let messages = [];
    let attachments = [];
    let systemPrompt = '';
    let modelName = '';
    let temperature;
    let maxOutputTokens;
    let timeoutMs;

    if (Array.isArray(params)) {
      history = params;
      userMessage = userMsgParam || '';
      ({
        attachments = [],
        systemPrompt = '',
        modelName = '',
        temperature,
        maxOutputTokens,
        timeoutMs
      } = optionsParam);
    } else {
      ({
        history = [],
        userMessage = '',
        messages = [],
        attachments = [],
        systemPrompt = '',
        modelName = '',
        temperature,
        maxOutputTokens,
        timeoutMs
      } = params);

      if (messages.length > 0 && !userMessage) {
        history = messages.slice(0, -1);
        const lastMsg = messages[messages.length - 1];
        userMessage = lastMsg?.content || lastMsg?.text || lastMsg || '';
      }
    }

    const startTime = Date.now();

    try {
      const client = this.getClient();
      const resolvedModelName = modelName || process.env.GROQ_TUTOR_MODEL || this.defaultModel;

      const chatMessages = this.buildMessages({
        systemPrompt,
        history,
        userMessage,
        attachments
      });

      if (chatMessages.length === 0 || (chatMessages.length === 1 && chatMessages[0].role === 'system')) {
        throw new GroqError(
          'User message content cannot be empty.',
          400,
          'EMPTY_USER_MESSAGE'
        );
      }

      const resolvedTemperature = Number.isFinite(temperature)
        ? temperature
        : this.defaultTemperature;

      const resolvedMaxTokens = Math.min(
        Number.isFinite(maxOutputTokens) ? maxOutputTokens : this.defaultMaxTokens,
        1000
      );

      const chatCompletionPromise = client.chat.completions.create({
        model: resolvedModelName,
        messages: chatMessages,
        temperature: resolvedTemperature,
        max_tokens: resolvedMaxTokens
      });

      const chatCompletion = await this.withTimeout(chatCompletionPromise, timeoutMs);

      const rawText = chatCompletion?.choices?.[0]?.message?.content || '';
      const formattedMarkdown = this.formatMarkdown(rawText);

      return {
        text: formattedMarkdown,
        markdown: formattedMarkdown,
        usageMetadata: {
          promptTokenCount: chatCompletion?.usage?.prompt_tokens ?? null,
          candidatesTokenCount: chatCompletion?.usage?.completion_tokens ?? null,
          totalTokenCount: chatCompletion?.usage?.total_tokens ?? null
        },
        modelName: resolvedModelName,
        responseTimeMs: Date.now() - startTime
      };
    } catch (error) {
      console.log("\n========== GROQ ORIGINAL ERROR ==========");
      console.error(error?.message || error);
      if (error?.status) console.log("Status:", error.status);
      console.log("==========================================\n");

      throw this.mapError(error);
    }
  }

  /**
   * Alias for backward compatibility with existing codebase callers
   */
  async generateChatResponse(params) {
    return this.sendMessage(params);
  }
}

const groqService = new GroqService();
groqService.GroqError = GroqError;
module.exports = groqService;
