const Groq = require('groq-sdk');
const geminiService = require('./geminiService');

/**
 * AI Quiz Generation Service
 * Uses Groq API with fallback to Gemini API to generate quizzes from lecture transcripts
 */

class AIQuizService {
  constructor() {
    this.groq = null;
    this.model = process.env.GROQ_TUTOR_MODEL || 'groq/compound-mini';
  }

  getGroqClient() {
    if (!this.groq) {
      const apiKey = process.env.GROQ_API_KEY?.trim();
      if (!apiKey) {
        throw new Error('GROQ_API_KEY is not configured in environment variables');
      }
      this.groq = new Groq({ apiKey });
    }
    return this.groq;
  }

  /**
   * Generates a quiz from lecture transcript/text
   * @param {string} lectureText - The lecture transcription text
   * @param {number} questionCount - Number of questions to generate (default: 5)
   * @returns {Promise<Array>} - Array of quiz question objects
   */
  async generateQuizFromLecture(lectureText, questionCount = 5) {
    try {
      // Validate input
      if (!lectureText || lectureText.trim().length === 0) {
        throw new Error('Lecture text cannot be empty');
      }

      if (lectureText.length > 20000) {
        console.log('Truncating lecture text to 20000 characters for API limits');
        lectureText = lectureText.substring(0, 20000);
      }

      // Create the prompt with exact format requirements
      const prompt = `You are an AI tutor. Create a multiple-choice quiz from the following lecture.

IMPORTANT: Return ONLY a valid JSON array. No other text before or after.

Format:
[
  {
    "question": "question text",
    "options": ["option1", "option2", "option3", "option4"],
    "answer": "correct option text"
  }
]

Requirements:
- Generate exactly ${questionCount} questions
- Each question must have exactly 4 options
- The "answer" field must be ONE of the options (exact text match)
- Questions should test understanding, not memorization
- Use clear, simple language
- NO explanations, NO markdown, NO code blocks - just pure JSON

Lecture content:
${lectureText}`;

      let responseText = '';
      try {
        console.log('Calling Groq API for quiz generation...');
        const groqClient = this.getGroqClient();
        const result = await groqClient.chat.completions.create({
          messages: [
            {
              role: "system",
              content: "You are a professional quiz generator. You must return ONLY a JSON array of questions based on the provided lecture content."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          model: this.model,
          temperature: 0.1,
          response_format: { type: "json_object" }
        });
        responseText = result.choices[0]?.message?.content || '';
      } catch (groqErr) {
        console.warn('Groq quiz generation failed, trying Gemini fallback:', groqErr.message);
        const geminiRes = await geminiService.sendMessage({
          systemPrompt: "You are a professional quiz generator. You must return ONLY a JSON array of questions based on the provided lecture content.",
          userMessage: prompt
        });
        responseText = geminiRes.text;
      }

      console.log('Raw AI response:', responseText.substring(0, 200) + '...');
      
      // Handle the case where the model returns an object with a 'questions' or 'quiz' key
      try {
        const parsed = JSON.parse(responseText);
        if (parsed.questions && Array.isArray(parsed.questions)) {
          responseText = JSON.stringify(parsed.questions);
        } else if (parsed.quiz && Array.isArray(parsed.quiz)) {
          responseText = JSON.stringify(parsed.quiz);
        } else if (!Array.isArray(parsed) && typeof parsed === 'object') {
          // If it's a single object that isn't an array, look for any array property
          const arrayProp = Object.values(parsed).find(val => Array.isArray(val));
          if (arrayProp) responseText = JSON.stringify(arrayProp);
        }
      } catch (e) {
        // Not a direct JSON object or already a string, continue with cleaning
      }

      // Clean response - remove markdown code blocks if present
      responseText = this.cleanJsonResponse(responseText);

      // Parse JSON
      let quizData;
      try {
        quizData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError.message);
        console.error('Cleaned response (first 1000 chars):', responseText.substring(0, 1000));
        throw new Error(`Failed to parse quiz JSON from API response: ${parseError.message}. Response: ${responseText.substring(0, 200)}`);
      }

      // Validate quiz format
      if (!quizData) {
        throw new Error('No quiz data returned from API');
      }
      
      if (!Array.isArray(quizData)) {
        throw new Error(`Expected array of questions, got ${typeof quizData}`);
      }
      
      if (quizData.length === 0) {
        throw new Error('API returned empty quiz array');
      }
      
      this.validateQuizFormat(quizData, questionCount);
      console.log('Quiz validation passed, returning', quizData.length, 'questions');

      return quizData;
    } catch (error) {
      console.error('Error generating quiz:', error);
      throw error;
    }
  }

  /**
   * Cleans Groq API response by removing markdown code blocks
   * @param {string} text - Raw API response
   * @returns {string} - Cleaned JSON string
   */
  cleanJsonResponse(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Response text must be a non-empty string');
    }
    
    try {
      // Remove markdown code blocks (```json ... ``` or ``` ... ```)
      let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '');
      
      // Remove any leading/trailing whitespace and non-JSON characters
      cleaned = cleaned.trim();
      
      // Find the first '[' and last ']' to extract JSON array
      const startIdx = cleaned.indexOf('[');
      const endIdx = cleaned.lastIndexOf(']');
      
      if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
        cleaned = cleaned.substring(startIdx, endIdx + 1);
      }
      
      // Final trim
      cleaned = cleaned.trim();
      
      if (!cleaned.startsWith('[')) {
        throw new Error('Could not find JSON array in response');
      }
      
      return cleaned;
    } catch (err) {
      console.error('Error cleaning JSON response:', err.message);
      console.error('Original text (first 300 chars):', text.substring(0, 300));
      throw new Error(`Failed to extract JSON from response: ${err.message}`);
    }
  }

  /**
   * Validates the quiz format returned by Groq
   * @param {Array} quizData - Array of questions
   * @param {number} expectedCount - Expected number of questions
   */
  validateQuizFormat(quizData, expectedCount) {
    if (!Array.isArray(quizData)) {
      throw new Error('Quiz data must be an array');
    }

    if (quizData.length !== expectedCount) {
      throw new Error(`Expected ${expectedCount} questions, got ${quizData.length}`);
    }

    quizData.forEach((item, index) => {
      if (!item.question || typeof item.question !== 'string') {
        throw new Error(`Question ${index + 1}: question field is missing or invalid`);
      }

      if (!Array.isArray(item.options) || item.options.length !== 4) {
        throw new Error(`Question ${index + 1}: options must be an array of exactly 4 items`);
      }

      if (!item.answer || typeof item.answer !== 'string') {
        throw new Error(`Question ${index + 1}: answer field is missing or invalid`);
      }

      // Verify answer is one of the options
      if (!item.options.includes(item.answer)) {
        throw new Error(`Question ${index + 1}: answer must be one of the options`);
      }
    });
  }

  /**
   * Transforms Groq quiz format to database format
   * @param {Array} quizzes - Array of quiz objects from Groq
   * @param {string} lectureTitle - Title of the lecture
   * @returns {Array} - Transformed questions for database
   */
  transformToDBFormat(quizzes, lectureTitle = '') {
    return quizzes.map(q => ({
      question: q.question,
      type: 'mcq',
      options: q.options,
      correctAnswer: q.answer,
      points: 1
    }));
  }

  /**
   * Generates important questions and answers from lecture transcript
   * @param {string} transcript - The lecture transcription text
   * @param {string} type - 'lecture' or 'lab'
   * @returns {Promise<Array>} - Array of question-answer objects
   */
  async generateImportantQuestions(transcript, type = 'lecture') {
    try {
      if (!transcript || transcript.trim().length === 0) {
        throw new Error('Transcript cannot be empty');
      }

      const sessionType = type === 'lab' ? 'Lab' : 'Lecture';
      const prompt = `You are an AI tutor. Analyze the following ${sessionType} transcript and generate the 8 most important questions a student should be able to answer after studying this content.
      
IMPORTANT: Return ONLY a valid JSON array. No other text.

Format:
[
  {
    "question": "The question text here?",
    "answer": "A concise but complete answer to the question"
  }
]

Rules:
- Generate exactly 8 important questions
- Questions should cover key concepts, definitions, and important topics
- Answers should be clear, concise, and accurate (2-4 sentences each)
- Focus on conceptual understanding
- Order questions from fundamental to advanced
- NO explanations, NO markdown, NO code blocks - just pure JSON

Transcript:
${transcript.substring(0, 15000)}`;

      let responseText = '';
      try {
        console.log('Calling Groq API for important questions...');
        const groqClient = this.getGroqClient();
        const result = await groqClient.chat.completions.create({
          messages: [
            {
              role: "system",
              content: "You are a professional educational content generator. Return ONLY a JSON array."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          model: this.model,
          temperature: 0.2,
          response_format: { type: "json_object" }
        });
        responseText = result.choices[0]?.message?.content || '';
      } catch (groqErr) {
        console.warn('Groq important questions failed, trying Gemini fallback:', groqErr.message);
        const geminiRes = await geminiService.sendMessage({
          systemPrompt: "You are a professional educational content generator. Return ONLY a JSON array.",
          userMessage: prompt
        });
        responseText = geminiRes.text;
      }
      
      // Clean and parse
      responseText = this.cleanJsonResponse(responseText);
      
      try {
        const parsed = JSON.parse(responseText);
        // Handle wrap objects
        if (Array.isArray(parsed)) return parsed;
        const arrayProp = Object.values(parsed).find(val => Array.isArray(val));
        return arrayProp || [];
      } catch (e) {
        console.error('JSON Parse Error for Important Questions:', e.message);
        throw new Error('Failed to parse AI response for important questions');
      }
    } catch (error) {
      console.error('Error generating important questions with Groq:', error);
      throw error;
    }
  }
}

module.exports = new AIQuizService();
