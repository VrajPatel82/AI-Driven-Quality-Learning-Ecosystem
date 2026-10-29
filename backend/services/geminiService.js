const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Custom error class for Gemini Service failures
 */
class GeminiError extends Error {
  constructor(message, statusCode = 500, code = 'GEMINI_ERROR', originalError = null) {
    super(message);
    this.name = 'GeminiError';
    this.statusCode = statusCode;
    this.code = code;
    this.originalError = originalError;
  }
}

class GeminiService {
  constructor() {
    this.client = null;
    this.defaultModel = process.env.GEMINI_MODEL_NAME || 'gemini-3.6-flash';
    this.defaultTimeoutMs = Number(process.env.AI_ASSISTANT_TIMEOUT_MS || 60000);
    this.defaultTemperature = Number(process.env.AI_ASSISTANT_TEMPERATURE || 0.4);
    this.defaultMaxTokens = Number(process.env.AI_ASSISTANT_MAX_OUTPUT_TOKENS || 2048);
  }

  /**
   * Reads GEMINI_API_KEY from environment and lazily initializes the Gemini client.
   * @returns {GoogleGenerativeAI} Initialized GoogleGenerativeAI client
   */
  getClient() {
    if (!this.client) {
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) {
        throw new GeminiError(
          'GEMINI_API_KEY is missing or empty in environment variables (.env).',
          401,
          'MISSING_API_KEY'
        );
      }
      this.client = new GoogleGenerativeAI(apiKey);
    }
    return this.client;
  }

  /**
   * Configures and gets a GenerativeModel instance.
   */
  getModel({ modelName, systemPrompt, temperature, maxOutputTokens, responseMimeType, responseSchema }) {
    const resolvedModelName = modelName || process.env.GEMINI_MODEL_NAME || this.defaultModel;

    const generationConfig = {
      temperature: Number.isFinite(temperature) ? temperature : this.defaultTemperature,
      maxOutputTokens: Number.isFinite(maxOutputTokens) ? maxOutputTokens : this.defaultMaxTokens
    };

    if (responseMimeType) generationConfig.responseMimeType = responseMimeType;
    if (responseSchema) generationConfig.responseSchema = responseSchema;

    const modelOptions = {
      model: resolvedModelName,
      generationConfig
    };

    if (systemPrompt && typeof systemPrompt === 'string' && systemPrompt.trim()) {
      modelOptions.systemInstruction = systemPrompt.trim();
    }

    return this.getClient().getGenerativeModel(modelOptions);
  }

  /**
   * Formats a single message or attachment part for Gemini API.
   * Supports plain text strings as well as Multimodal input (Images & PDFs).
   *
   * Attachment formats supported:
   * - { mimeType: 'image/png'|'application/pdf'|..., data: 'base64...' }
   * - { mimeType: 'image/jpeg', buffer: Buffer }
   * - { inlineData: { mimeType: '...', data: '...' } }
   * - { fileData: { fileUri: '...', mimeType: '...' } }
   */
  formatPart(part) {
    if (!part) return null;

    // String input
    if (typeof part === 'string') {
      const trimmed = part.trim();
      return trimmed ? { text: trimmed } : null;
    }

    // Standard Gemini part object
    if (part.text) {
      return { text: String(part.text).trim() };
    }

    // Direct inlineData
    if (part.inlineData && part.inlineData.mimeType && part.inlineData.data) {
      return {
        inlineData: {
          mimeType: part.inlineData.mimeType,
          data: part.inlineData.data
        }
      };
    }

    // Direct fileData
    if (part.fileData && part.fileData.fileUri && part.fileData.mimeType) {
      return {
        fileData: {
          fileUri: part.fileData.fileUri,
          mimeType: part.fileData.mimeType
        }
      };
    }

    // Attachment object with base64 string or Buffer
    if (part.mimeType) {
      let base64Data = part.data || part.base64;
      if (!base64Data && part.buffer && Buffer.isBuffer(part.buffer)) {
        base64Data = part.buffer.toString('base64');
      }

      if (base64Data) {
        return {
          inlineData: {
            mimeType: part.mimeType,
            data: base64Data
          }
        };
      }
    }

    return null;
  }

  /**
   * Converts a flexible userMessage input (string, object with text/attachments, or array of parts)
   * plus optional explicit attachments array into Gemini's `parts` format.
   * Supports multimodal input (images, PDFs) seamlessly.
   */
  buildUserParts(userMessage, attachments = []) {
    const parts = [];

    // Parse userMessage
    if (typeof userMessage === 'string') {
      const textPart = this.formatPart(userMessage);
      if (textPart) parts.push(textPart);
    } else if (Array.isArray(userMessage)) {
      userMessage.forEach((item) => {
        const formatted = this.formatPart(item);
        if (formatted) parts.push(formatted);
      });
    } else if (userMessage && typeof userMessage === 'object') {
      // Extract text content
      const text = userMessage.text || userMessage.content || userMessage.prompt;
      if (text) {
        const textPart = this.formatPart(text);
        if (textPart) parts.push(textPart);
      }

      // Extract embedded attachments (images, pdfs, files, attachments)
      const embeddedAttachments = [
        ...(userMessage.attachments || []),
        ...(userMessage.images || []),
        ...(userMessage.pdfs || []),
        ...(userMessage.files || [])
      ];

      embeddedAttachments.forEach((att) => {
        const formatted = this.formatPart(att);
        if (formatted) parts.push(formatted);
      });
    }

    // Parse explicit attachments array passed in parameters
    if (Array.isArray(attachments)) {
      attachments.forEach((att) => {
        const formatted = this.formatPart(att);
        if (formatted) parts.push(formatted);
      });
    }

    return parts;
  }

  /**
   * Normalizes conversation history into Gemini API's expected contents array format.
   * Maps roles ('user', 'assistant' -> 'model') and structures parts correctly.
   */
  normalizeHistory(history = []) {
    if (!Array.isArray(history)) return [];

    return history
      .filter((msg) => msg && (msg.content || msg.parts || msg.text))
      .map((msg) => {
        const role = msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user';
        let parts = [];

        if (Array.isArray(msg.parts)) {
          parts = msg.parts.map((p) => this.formatPart(p)).filter(Boolean);
        } else if (msg.attachments && Array.isArray(msg.attachments)) {
          parts = this.buildUserParts(msg.content || msg.text, msg.attachments);
        } else {
          const textContent = typeof msg.content === 'string' ? msg.content : (msg.text || '');
          const formatted = this.formatPart(textContent);
          if (formatted) parts.push(formatted);
        }

        return { role, parts };
      })
      .filter((msg) => msg.parts.length > 0);
  }

  /**
   * Wraps a promise with a configurable timeout.
   */
  withTimeout(promise, timeoutMs) {
    const resolvedTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : this.defaultTimeoutMs;

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new GeminiError(
          `Gemini request timed out after ${resolvedTimeout}ms.`,
          504,
          'TIMEOUT_ERROR'
        ));
      }, resolvedTimeout);
    });

    return Promise.race([
      promise.finally(() => clearTimeout(timeoutId)),
      timeoutPromise
    ]);
  }

  /**
   * Formats response text as clean Markdown.
   */
  formatMarkdown(text = '') {
    if (typeof text !== 'string') return '';
    
    let formatted = text.trim();
    
    // Normalize newlines
    formatted = formatted.replace(/\r\n/g, '\n');
    
    return formatted;
  }

  /**
   * Maps low-level Gemini API errors or network errors into clean GeminiErrors.
   */
  mapError(error) {
    if (error instanceof GeminiError) {
      return error;
    }

    const message = error?.message || 'Gemini service request failed.';
    const status = error?.status || error?.response?.status;

    if (status === 429 || /429|rate limit|resource_exhausted|quota|too many requests/i.test(message)) {
      return new GeminiError(
        'Gemini rate limit or quota exceeded. Please wait a moment before trying again.',
        429,
        'RATE_LIMIT_EXCEEDED',
        error
      );
    }

    if (status === 401 || /401|unauthorized|invalid api key/i.test(message)) {
      return new GeminiError(
        'Gemini authentication failed. Please verify your GEMINI_API_KEY.',
        401,
        'UNAUTHORIZED',
        error
      );
    }

    if (status === 403 || /403|permission|forbidden/i.test(message)) {
      return new GeminiError(
        'Gemini access denied. Check permissions.',
        403,
        'FORBIDDEN',
        error
      );
    }

    if (/timeout|timed out/i.test(message)) {
      return new GeminiError(
        'Gemini request timed out. Please try again.',
        504,
        'TIMEOUT_ERROR',
        error
      );
    }

    if (/network|fetch|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(message)) {
      return new GeminiError(
        'Gemini network connectivity error. Check server internet connection.',
        503,
        'NETWORK_ERROR',
        error
      );
    }

    return new GeminiError(
      `Gemini service error: ${message}`,
      status || 500,
      'INTERNAL_GEMINI_ERROR',
      error
    );
  }

  /**
   * Primary service method to generate chat response.
   * Supports conversation history, latest user message, system prompt, and future multimodal attachments (images, PDFs).
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
      const model = this.getModel({
        modelName,
        systemPrompt,
        temperature,
        maxOutputTokens
      });

      const contents = this.normalizeHistory(history);
      const userParts = this.buildUserParts(userMessage, attachments);

      if (userParts.length === 0 && contents.length === 0) {
        throw new GeminiError(
          'User message content cannot be empty.',
          400,
          'EMPTY_USER_MESSAGE'
        );
      }

      if (userParts.length > 0) {
        contents.push({
          role: 'user',
          parts: userParts
        });
      }

      const result = await this.withTimeout(
        model.generateContent({ contents }),
        timeoutMs
      );

      const response = await result.response;
      let rawText = '';

      if (typeof response.text === 'function') {
        rawText = response.text();
      } else if (response?.candidates?.[0]?.content?.parts) {
        rawText = response.candidates[0].content.parts.map((p) => p.text || '').join('');
      }

      const formattedMarkdown = this.formatMarkdown(rawText);

      return {
        text: formattedMarkdown,
        markdown: formattedMarkdown,
        usageMetadata: response?.usageMetadata || {
          promptTokenCount: null,
          candidatesTokenCount: null,
          totalTokenCount: null
        },
        modelName: modelName || process.env.GEMINI_MODEL_NAME || this.defaultModel,
        responseTimeMs: Date.now() - startTime
      };
    } catch (error) {
      console.log("\n========== GEMINI ORIGINAL ERROR ==========");
      console.error(error);
      console.log("Status:", error?.status);
      console.log("Message:", error?.message);
      console.log("Response:", error?.response);
      console.log("===========================================\n");

      throw this.mapError(error);
    }
  }

  /**
   * Alias for backward compatibility with existing codebase callers (e.g., aiConversationService)
   */
  async generateChatResponse(params) {
    return this.sendMessage(params);
  }
}

const geminiService = new GeminiService();
geminiService.GeminiError = GeminiError;
module.exports = geminiService;
