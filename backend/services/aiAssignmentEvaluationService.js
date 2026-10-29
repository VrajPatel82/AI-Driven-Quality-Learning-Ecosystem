const Groq = require('groq-sdk');
const fs = require('fs');
const geminiService = require('./geminiService');

const PRIMARY_GEMINI_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [2000, 5000];

const EVALUATION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    suggestedMarks: { type: 'number' },
    maximumMarks: { type: 'number' },
    percentage: { type: 'number' },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          maximumMarks: { type: 'number' },
          awardedMarks: { type: 'number' },
          feedback: { type: 'string' }
        },
        required: ['name', 'maximumMarks', 'awardedMarks', 'feedback']
      }
    },
    correctness: { type: 'string' },
    completeness: { type: 'string' },
    relevance: { type: 'string' },
    conceptualUnderstanding: { type: 'string' },
    missingPoints: { type: 'array', items: { type: 'string' } },
    errors: { type: 'array', items: { type: 'string' } },
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
    overallFeedback: { type: 'string' }
  },
  required: ['suggestedMarks', 'maximumMarks', 'percentage', 'criteria', 'correctness', 'completeness', 'relevance', 'conceptualUnderstanding', 'missingPoints', 'errors', 'strengths', 'weaknesses', 'overallFeedback']
};

/**
 * Service to evaluate student assignment submissions using Groq API with fallback to Gemini.
 */
class AIAssignmentEvaluationService {
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

  buildEvaluationPrompt({ assignment, submissionText = '', nativePdf = false }) {
    const maxMarks = Number(assignment.maxMarks) || 100;
    const title = assignment.title || 'Assignment';
    const description = assignment.description || 'No additional description provided.';
    const questionPdfText = assignment.questionPdf?.extractedText || '';
    const questionPdfFileName = assignment.questionPdf?.fileName || 'Question PDF';
    const courseName = assignment.course?.name ? `${assignment.course.name} (${assignment.course.code || ''})` : 'General Course';

    let rubricPrompt = '';
    if (Array.isArray(assignment.rubric) && assignment.rubric.length > 0) {
      rubricPrompt = 'RUBRIC CRITERIA (Marking Framework):\n' +
        assignment.rubric.map((r, i) => `${i + 1}. "${r.criterion}" (Max Marks: ${r.maxMarks}): ${r.description || ''}`).join('\n');
    } else {
      rubricPrompt = `RUBRIC CRITERIA (Default Academic Framework - Total Max Marks: ${maxMarks}):
- "Correctness & Concepts": ~40% of marks
- "Completeness & Coverage": ~30% of marks
- "Relevance & Direct Answers": ~20% of marks
- "Clarity & Structure": ~10% of marks`;
    }

    let questionPaperSection = '';
    if (questionPdfText.trim()) {
      questionPaperSection = `QUESTION PDF (Primary Question Paper Source - "${questionPdfFileName}"):
"""
${questionPdfText.length > 6000 ? questionPdfText.substring(0, 6000) + '\n[Question PDF truncated for length]' : questionPdfText}
"""`;
    }

    const submissionSection = nativePdf
      ? 'STUDENT SUBMISSION: The original PDF is attached to this request. Inspect the complete attached document directly.'
      : `STUDENT SUBMISSION TEXT (Actual Answer Being Evaluated):
"""
${submissionText}
"""`;

    return `You are an expert academic evaluator. Evaluate the student's assignment submission strictly against the assignment details provided below.

ASSIGNMENT INFORMATION:
1. Title: ${title}
2. Course: ${courseName}
3. Maximum Marks: ${maxMarks}

4. DESCRIPTION (Professor Context, Requirements & Constraints):
"${description}"

${questionPaperSection ? `${questionPaperSection}\n\n5.` : '5.'} ${rubricPrompt}

${submissionSection}

EVALUATION INSTRUCTIONS:
1. Carefully inspect every page of the submission, including the final page. Do not stop after the first pages.
2. For the attached PDF, inspect handwritten and scanned visual content directly; do not assume blank-looking pages contain no answer without inspecting them.
3. Match answers to the corresponding assignment questions and evaluate only what the student actually submitted.
4. Do not invent missing answers. Give partial marks where appropriate according to the rubric.
5. Ensure criteria marks awarded do NOT exceed criterion maximum marks.
6. Total suggested marks MUST equal the sum of criterion awarded marks and cannot exceed ${maxMarks} and cannot be negative.
7. Return ONLY the JSON object. Do not return Markdown, code fences, or reasoning/thinking text.

EXACT JSON SCHEMA REQUIRED:
{
  "suggestedMarks": number,
  "maximumMarks": ${maxMarks},
  "percentage": number,
  "criteria": [
    {
      "name": "string (criterion name)",
      "maximumMarks": number,
      "awardedMarks": number,
      "feedback": "string explaining marks awarded"
    }
  ],
  "correctness": "string detailed correctness analysis",
  "completeness": "string detailed completeness analysis",
  "relevance": "string detailed relevance analysis",
  "conceptualUnderstanding": "string detailed conceptual analysis",
  "missingPoints": ["string missing point 1", "string missing point 2"],
  "errors": ["string error/mistake 1", "string error/mistake 2"],
  "strengths": ["string strength 1", "string strength 2"],
  "weaknesses": ["string weakness 1", "string weakness 2"],
  "overallFeedback": "string constructive academic summary feedback"
}`;
  }

  async evaluatePdfSubmission({ assignment, pdfFilePath }) {
    if (!fs.existsSync(pdfFilePath)) {
      throw new Error(`Student PDF not found at ${pdfFilePath}`);
    }

    delete globalThis.pdfjsWorker;
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    const pdfBuffer = fs.readFileSync(pdfFilePath);
    const pdfDocument = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
    const totalPages = pdfDocument.numPages;

    console.log(`[AI Assignment] PDF page count: ${totalPages}`);
    if (!totalPages || totalPages === 0) {
      throw new Error('Uploaded assignment PDF contains zero readable pages.');
    }
    const modelName = process.env.GEMINI_MODEL_NAME || geminiService.defaultModel;
    console.log('[AI Assignment] PDF evaluation mode: native-gemini-pdf');
    console.log(`[AI Assignment] Gemini model: ${modelName}`);
    const prompt = this.buildEvaluationPrompt({ assignment, nativePdf: true });
    const request = {
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'application/pdf', data: pdfBuffer.toString('base64') } }
        ]
      }]
    };

    console.log('[AI Assignment] Native PDF uploaded/provided successfully');
    console.log('[AI Assignment] Gemini evaluation request started');
    const { result, modelName: respondingModel } = await this.generateNativePdfContent({
      request,
      primaryModelName: modelName
    });
    const response = await result.response;
    const responseText = response.text();
    const finishReason = response.candidates?.[0]?.finishReason || 'unknown';
    console.log(`[AI Assignment] Gemini evaluation response received (chars=${responseText.length})`);
    console.log(`[AI Assignment] Response finish reason: ${finishReason}`);
    if (finishReason === 'MAX_TOKENS' || finishReason === 'SAFETY') {
      throw new Error(`Gemini returned incomplete assignment evaluation (finish reason: ${finishReason}).`);
    }
    const evaluation = this.parseAndValidateResponse(responseText, Number(assignment.maxMarks) || 100, assignment.rubric, respondingModel);
    console.log('[AI Assignment] Structured JSON parsing: success');

    return {
      evaluation,
      pagesProcessed: totalPages,
      totalPages,
      evaluationSource: 'NATIVE_GEMINI_PDF'
    };
  }

  sleep(delayMs) {
    return new Promise(resolve => setTimeout(resolve, delayMs));
  }

  isTransientGeminiAvailabilityError(error) {
    const status = error?.status || error?.statusCode || error?.response?.status;
    const code = String(error?.code || error?.errorDetails?.[0]?.reason || '').toUpperCase();
    const message = String(error?.message || '').toUpperCase();
    return Number(status) === 503 || code === 'UNAVAILABLE' || message.includes('503 SERVICE UNAVAILABLE') || message.includes('UNAVAILABLE');
  }

  getProviderDiagnostic(error, { modelName, attempt, stage }) {
    const status = error?.status || error?.statusCode || error?.response?.status || 'unknown';
    const code = error?.code || error?.errorDetails?.[0]?.reason || 'unknown';
    const message = error?.message || 'Gemini provider request failed.';
    const diagnostic = `provider=Gemini; model=${modelName}; status=${status}; code=${code}; attempt=${attempt}; stage=${stage}; message=${message}`;
    const diagnosticError = new Error(`Gemini evaluation failed: ${diagnostic}`);
    diagnosticError.status = status;
    diagnosticError.code = code;
    diagnosticError.providerDiagnostics = diagnostic;
    diagnosticError.originalError = error;
    return diagnosticError;
  }

  async findVerifiedFallbackModel(primaryModelName) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return null;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`);
    if (!response.ok) {
      throw new Error(`Gemini model discovery failed with HTTP ${response.status}`);
    }

    const data = await response.json();
    const primary = primaryModelName.replace(/^models\//, '');
    const fallback = (data.models || [])
      .filter(model => {
        const name = String(model.name || '').replace(/^models\//, '');
        const methods = model.supportedGenerationMethods || [];
        return name && name !== primary && name.startsWith('gemini-') &&
          methods.includes('generateContent') && Number(model.inputTokenLimit || 0) >= 100000 &&
          !/(image|embedding|tts|live|robotics|computer-use)/i.test(name);
      })
      .sort((a, b) => Number(b.inputTokenLimit || 0) - Number(a.inputTokenLimit || 0));

    return fallback[0]?.name?.replace(/^models\//, '') || null;
  }

  async generateNativePdfContent({ request, primaryModelName }) {
    const attempt = async (modelName, attemptNumber) => {
      const model = geminiService.getModel({
        modelName,
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseSchema: EVALUATION_RESPONSE_SCHEMA,
        systemPrompt: 'You are a professional academic assignment grader. Return only valid JSON matching the requested schema. Do not expose reasoning.'
      });

      try {
        return await model.generateContent(request);
      } catch (error) {
        const diagnosticError = this.getProviderDiagnostic(error, {
          modelName,
          attempt: attemptNumber,
          stage: 'native Gemini PDF generateContent'
        });
        console.error(`[AI Assignment] ${diagnosticError.message}`);
        throw diagnosticError;
      }
    };

    let lastPrimaryError;
    for (let attemptNumber = 1; attemptNumber <= PRIMARY_GEMINI_ATTEMPTS; attemptNumber++) {
      try {
        return { result: await attempt(primaryModelName, attemptNumber), modelName: primaryModelName };
      } catch (error) {
        lastPrimaryError = error;
        if (!this.isTransientGeminiAvailabilityError(error) || attemptNumber === PRIMARY_GEMINI_ATTEMPTS) break;
        await this.sleep(RETRY_DELAYS_MS[attemptNumber - 1]);
      }
    }

    if (!this.isTransientGeminiAvailabilityError(lastPrimaryError)) {
      throw lastPrimaryError;
    }

    let fallbackModelName;
    try {
      fallbackModelName = await this.findVerifiedFallbackModel(primaryModelName);
    } catch (discoveryError) {
      throw new Error(`${lastPrimaryError.message}; fallback discovery failed: ${discoveryError.message}`);
    }

    if (!fallbackModelName) {
      throw new Error(`${lastPrimaryError.message}; no verified compatible fallback model is available`);
    }

    console.log(`[AI Assignment] Verified Gemini fallback model selected: ${fallbackModelName}`);
    try {
      return { result: await attempt(fallbackModelName, 1), modelName: fallbackModelName };
    } catch (fallbackError) {
      throw new Error(`${lastPrimaryError.message}; fallback ${fallbackError.message}`);
    }
  }

  /**
   * Main evaluation method
   * @param {Object} params
   * @param {Object} params.assignment Assignment document (title, description, maxMarks, rubric, course)
   * @param {string} params.submissionText Extracted plain text of student submission
   * @returns {Promise<Object>} Evaluated structured JSON object
   */
  async evaluateSubmission({ assignment, submissionText }) {
    if (!submissionText || submissionText.trim().length === 0) {
      throw new Error('Submission text cannot be empty');
    }

    const maxMarks = Number(assignment.maxMarks) || 100;
    const prompt = this.buildEvaluationPrompt({ assignment, submissionText });
    console.log(`[AIAssignmentEvaluationService] Grading request prepared (submissionChars=${submissionText.length}, promptChars=${prompt.length}, model=${this.model})`);

    let responseText = '';
  let responseProvider = '';
    try {
      console.log('[AIAssignmentEvaluationService] Requesting evaluation from Groq API...');
      const client = this.getGroqClient();
      const completion = await client.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are a professional academic assignment grader. You MUST return ONLY valid JSON matching the specified schema."
          },
          { role: "user", content: prompt }
        ],
        model: this.model,
        temperature: 0.2,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
        reasoning_format: 'hidden'
      });
      responseText = completion.choices[0]?.message?.content || '';
      responseProvider = 'Groq';
      console.log(`[AIAssignmentEvaluationService] Groq grading response received (chars=${responseText.length}, finishReason=${completion.choices[0]?.finish_reason || 'unknown'})`);
    } catch (groqErr) {
      console.warn(`[AIAssignmentEvaluationService] Groq API failed (${groqErr.status || groqErr.code || 'unknown'}): ${groqErr.message}. Falling back to Gemini Service.`);
      try {
        const geminiModel = geminiService.getModel({
          temperature: 0.2,
          maxOutputTokens: 2048,
          systemPrompt: "You are a professional academic assignment grader. You MUST return ONLY valid JSON matching the specified schema."
        });
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        responseText = response.text();
        responseProvider = 'Gemini';
        console.log(`[AIAssignmentEvaluationService] Gemini grading response received (chars=${responseText.length})`);
      } catch (geminiErr) {
        console.error('[AIAssignmentEvaluationService] Both Groq and Gemini API calls failed');
        console.error(geminiErr.stack || geminiErr);
        throw new Error(`AI Evaluation Provider Error: Groq (${groqErr.message}), Gemini (${geminiErr.message})`);
      }
    }

    console.log(`[AIAssignmentEvaluationService] Parsing ${responseProvider} grading response (chars=${responseText.length})`);
    try {
      return this.parseAndValidateResponse(responseText, maxMarks, assignment.rubric);
    } catch (parseErr) {
      if (responseProvider !== 'Groq') {
        throw parseErr;
      }

      console.warn(`[AIAssignmentEvaluationService] Groq returned non-JSON grading output (${parseErr.message}); retrying the same grading request with Gemini.`);
      const geminiModel = geminiService.getModel({
        temperature: 0.2,
        maxOutputTokens: 2048,
        systemPrompt: "You are a professional academic assignment grader. You MUST return ONLY valid JSON matching the specified schema."
      });
      const result = await geminiModel.generateContent(prompt);
      const response = await result.response;
      responseText = response.text();
      console.log(`[AIAssignmentEvaluationService] Gemini grading retry response received (chars=${responseText.length})`);
      return this.parseAndValidateResponse(responseText, maxMarks, assignment.rubric);
    }
  }

  /**
   * Clean, parse JSON response and enforce mathematical & schema integrity
   */
  parseAndValidateResponse(rawText, maxMarks, rubric, modelName = this.model) {
    if (!rawText || !rawText.trim()) {
      throw new Error('AI Provider returned empty response');
    }

    let cleaned = rawText.trim();
    
    // Remove <think>...</think> reasoning blocks from models (e.g. DeepSeek/Groq reasoning)
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // Strip markdown code fences if present (e.g. ```json ... ```)
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    }

    // Isolate JSON object substring between first '{' and last '}'
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    // Fix unescaped control characters in LLM string literals if needed
    cleaned = cleaned.replace(/[\u0000-\u001F]+/g, (match) => {
      if (match === '\n' || match === '\r\n') return ' ';
      return '';
    });

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error(`[AIAssignmentEvaluationService] JSON parse failed (rawChars=${rawText.length}, cleanedChars=${cleaned.length}, startsWith=${JSON.stringify(cleaned.slice(0, 80))}, endsWith=${JSON.stringify(cleaned.slice(-160))})`);
      console.error(e.stack || e);
      throw new Error('AI Provider response was not valid JSON');
    }

    console.log('[AIAssignmentEvaluationService] JSON parsing succeeded');

    // Mathematical & criteria validation
    let criteria = Array.isArray(parsed.criteria) ? parsed.criteria : [];
    let calculatedSuggested = 0;

    criteria = criteria.map((c, i) => {
      const cMax = Number(c.maximumMarks) || 1;
      let cAwarded = Number(c.awardedMarks) || 0;
      cAwarded = Math.min(cMax, Math.max(0, cAwarded));
      calculatedSuggested += cAwarded;
      return {
        name: String(c.name || `Criterion ${i + 1}`).trim(),
        maximumMarks: cMax,
        awardedMarks: cAwarded,
        feedback: String(c.feedback || '').trim()
      };
    });

    let suggestedMarks = Number(parsed.suggestedMarks);
    if (isNaN(suggestedMarks) || criteria.length > 0) {
      suggestedMarks = calculatedSuggested;
    }
    suggestedMarks = Math.min(maxMarks, Math.max(0, suggestedMarks));

    const percentage = Number(((suggestedMarks / maxMarks) * 100).toFixed(1));

    return {
      suggestedMarks,
      maximumMarks: maxMarks,
      percentage,
      criteria,
      correctness: String(parsed.correctness || 'Answer verified for technical correctness.').trim(),
      completeness: String(parsed.completeness || 'Answer checked for required content.').trim(),
      relevance: String(parsed.relevance || 'Answer addresses the assigned question.').trim(),
      conceptualUnderstanding: String(parsed.conceptualUnderstanding || 'Demonstrates understanding.').trim(),
      missingPoints: Array.isArray(parsed.missingPoints) ? parsed.missingPoints.map(p => String(p).trim()).filter(Boolean) : [],
      errors: Array.isArray(parsed.errors) ? parsed.errors.map(e => String(e).trim()).filter(Boolean) : [],
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(s => String(s).trim()).filter(Boolean) : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(w => String(w).trim()).filter(Boolean) : [],
      overallFeedback: String(parsed.overallFeedback || 'Evaluation complete. Review criteria breakdown.').trim(),
      evaluatedAt: new Date(),
      model: modelName
    };
  }
}

module.exports = new AIAssignmentEvaluationService();
