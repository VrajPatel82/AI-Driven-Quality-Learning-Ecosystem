const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const PRIMARY_RETRY_DELAY_MS = 2000;

const EVALUATION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    totalMarks: { type: 'number' },
    maxMarks: { type: 'number' },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string' },
          marksAwarded: { type: 'number' },
          maxMarks: { type: 'number' },
          feedback: { type: 'string' }
        },
        required: ['criterion', 'marksAwarded', 'maxMarks', 'feedback']
      }
    },
    overallFeedback: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    duplicateDetected: { type: 'boolean' },
    duplicateReason: { type: 'string' },
    duplicateSubmissionIds: { type: 'array', items: { type: 'string' } }
  },
  required: ['totalMarks', 'maxMarks', 'criteria', 'overallFeedback', 'confidence']
};

class NativeGeminiAssignmentEvaluatorService {
  constructor({ clientFactory } = {}) {
    this.clientFactory = clientFactory || (apiKey => new GoogleGenerativeAI(apiKey));
  }

  resolvePdfPath(fileUrl) {
    if (typeof fileUrl !== 'string' || !fileUrl.startsWith('/uploads/')) {
      throw new Error(`Stored PDF URL is invalid: ${fileUrl || 'missing'}`);
    }
    return path.resolve(__dirname, '..', fileUrl.slice(1));
  }

  readOriginalPdf(filePath, label) {
    if (!fs.existsSync(filePath)) throw new Error(`${label} PDF not found at ${filePath}`);
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size === 0) throw new Error(`${label} PDF is empty or unreadable at ${filePath}`);
    const data = fs.readFileSync(filePath);
    if (data.subarray(0, 5).toString() !== '%PDF-') throw new Error(`${label} file is not a valid PDF document.`);
    return data;
  }

  buildPrompt({ assignment, criteria }) {
    const questionFileName = assignment.questionPdf?.fileName || 'Professor question PDF';
    const description = assignment.description?.trim();
    const descriptionSection = description
      ? `ADDITIONAL PROFESSOR INSTRUCTIONS AND GUIDELINES:\n${description}\n`
      : `ADDITIONAL PROFESSOR INSTRUCTIONS AND GUIDELINES:\nNo additional instructions were provided.\n`;

    return `You are an academic assignment evaluator.

Evaluate the student's complete submitted assignment against the professor's primary question document and evaluation criteria.

The student submission may contain handwritten answers, typed text, diagrams, images, tables, mathematical notation, and mixed visual content. Inspect the complete original student PDF directly. Do not assume text extraction is complete. Do not invent missing content. If handwriting is unclear, say so in the relevant feedback.

PRIMARY PROFESSOR ASSIGNMENT / QUESTIONS (ATTACHED PDF)
Question document filename: ${questionFileName}

${descriptionSection}
PROFESSOR EVALUATION CRITERIA
${criteria.map(item => `- ${item.criterion}: ${item.maxMarks} marks${item.description ? `. ${item.description}` : ''}`).join('\n')}

STUDENT SUBMISSION / ANSWERS
The original student answer PDF is attached separately. Evaluate only the attached student work.

Return only valid JSON with this exact shape. totalMarks must equal the sum of marksAwarded, no mark may be negative, and no mark may exceed its criterion maximum:
{
  "totalMarks": number,
  "maxMarks": ${assignment.maxMarks},
  "criteria": [{ "criterion": "string", "marksAwarded": number, "maxMarks": number, "feedback": "string" }],
  "overallFeedback": "string",
  "confidence": "high | medium | low"
}`;
  }

  isTransientError(error) {
    const status = Number(error?.status || error?.statusCode || error?.response?.status);
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toUpperCase();
    return status === 503 || status === 429 || code === 'UNAVAILABLE' || message.includes('503 SERVICE UNAVAILABLE') || message.includes('UNAVAILABLE') || message.includes('FETCH FAILED');
  }

  parseResponse(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Evaluation model returned empty output.');
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    const json = firstBrace >= 0 && lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1) : text;
    try {
      return JSON.parse(json);
    } catch (err) {
      throw new Error(`Evaluation model output could not be parsed as JSON: ${err.message}`);
    }
  }

  normalizeAndValidate(raw, assignment, criteria) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.criteria) || raw.criteria.length === 0) {
      throw new Error('Evaluation model returned an incomplete evaluation response object.');
    }
    const maxMarks = Number(assignment.maxMarks);

    const returnedCriteria = raw.criteria.map((item, index) => {
      const criterionMax = Number(item.maxMarks !== undefined && item.maxMarks !== null ? item.maxMarks : (criteria[index]?.maxMarks || maxMarks));
      const awarded = Number(item.marksAwarded !== undefined && item.marksAwarded !== null ? item.marksAwarded : 0);
      if (!Number.isFinite(criterionMax) || !Number.isFinite(awarded) || awarded < 0) {
        throw new Error(`Invalid marks awarded for criterion ${index + 1} ("${item.criterion || 'Criterion'}").`);
      }
      return {
        name: String(item.criterion || criteria[index]?.criterion || `Criterion ${index + 1}`),
        maximumMarks: criterionMax,
        awardedMarks: awarded,
        feedback: String(item.feedback || '').trim()
      };
    });

    const calculatedTotal = returnedCriteria.reduce((sum, item) => sum + item.awardedMarks, 0);
    const totalMarks = Number.isFinite(Number(raw.totalMarks)) ? Number(raw.totalMarks) : calculatedTotal;

    if (!Number.isFinite(maxMarks) || totalMarks > maxMarks) {
      throw new Error(`Evaluation total marks (${totalMarks}) exceeds assignment maximum marks (${maxMarks}).`);
    }
    return {
      suggestedMarks: totalMarks,
      maximumMarks: maxMarks,
      percentage: Number(((totalMarks / maxMarks) * 100).toFixed(1)),
      criteria: returnedCriteria,
      overallFeedback: String(raw.overallFeedback || '').trim(),
      confidence: ['high', 'medium', 'low'].includes(raw.confidence) ? raw.confidence : 'low',
      duplicateDetected: false,
      duplicateReason: '',
      duplicateSubmissionIds: [],
      evaluatedAt: new Date()
    };
  }

  async findExactDuplicate({ assignment, submissionId, studentBuffer }) {
    if (!assignment.uniquenessRequired) return null;
    const hash = crypto.createHash('sha256').update(studentBuffer).digest('hex');
    for (const previous of assignment.submissions || []) {
      if (String(previous._id) === String(submissionId)) continue;
      const file = previous.files?.[0];
      if (!file?.fileUrl) continue;
      try {
        const previousBuffer = this.readOriginalPdf(this.resolvePdfPath(file.fileUrl), 'Previous student answer');
        if (crypto.createHash('sha256').update(previousBuffer).digest('hex') === hash) {
          return { duplicateDetected: true, duplicateReason: 'Exact duplicate student PDF detected.', duplicateSubmissionIds: [String(previous._id)] };
        }
      } catch (error) {
        console.warn(`[NativeGeminiAssignmentEvaluator] Could not inspect previous submission ${previous._id}: ${error.message}`);
      }
    }
    return { duplicateDetected: false, duplicateReason: '', duplicateSubmissionIds: [] };
  }

  duplicateEvaluation(assignment, duplicate) {
    return {
      suggestedMarks: 0,
      maximumMarks: Number(assignment.maxMarks),
      percentage: 0,
      criteria: (assignment.rubric || []).map(item => ({ name: item.criterion, maximumMarks: item.maxMarks, awardedMarks: 0, feedback: 'Exact duplicate submission detected; no marks awarded.' })),
      overallFeedback: duplicate.duplicateReason,
      confidence: 'high',
      duplicateDetected: true,
      duplicateReason: duplicate.duplicateReason,
      duplicateSubmissionIds: duplicate.duplicateSubmissionIds,
      evaluatedAt: new Date()
    };
  }

  async evaluateOpenRouter({ assignment, criteria, questionBuffer, studentBuffer }) {
    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is missing or empty in configuration.');
    }
    const modelName = (process.env.ASSIGNMENT_EVALUATION_MODEL || process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash').trim();

    const promptText = this.buildPrompt({ assignment, criteria });
    const payload = {
      model: modelName,
      messages: [
        {
          role: 'system',
          content: 'Return only valid JSON matching the requested evaluation schema. Do not output markdown code blocks or text outside JSON.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: `data:application/pdf;base64,${questionBuffer.toString('base64')}` } },
            { type: 'image_url', image_url: { url: `data:application/pdf;base64,${studentBuffer.toString('base64')}` } }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: 'json_object' }
    };

    let requestCount = 0;
    const executeRequest = async () => {
      requestCount += 1;
      let res;
      try {
        res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(180000)
        });
      } catch (err) {
        const fetchErr = new Error(`OpenRouter connectivity error: ${err.message}`);
        fetchErr.status = 503;
        throw fetchErr;
      }

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        let parsedError = {};
        try { parsedError = JSON.parse(bodyText); } catch (_) {}
        const errorMsg = parsedError.error?.message || res.statusText || bodyText;

        if (res.status === 401 || res.status === 403) {
          throw new Error('OpenRouter authentication failed (401/403): Invalid API key or unauthorized access.');
        } else if (res.status === 429) {
          const err = new Error('OpenRouter rate limit or quota exceeded (429). Please try again later.');
          err.status = 429;
          throw err;
        } else if (res.status === 503) {
          const err = new Error('OpenRouter AI service is temporarily unavailable (503).');
          err.status = 503;
          throw err;
        } else if (res.status === 400) {
          throw new Error(`OpenRouter bad request (400): ${errorMsg}`);
        } else {
          throw new Error(`OpenRouter evaluation request failed (HTTP ${res.status}): ${errorMsg}`);
        }
      }

      const responseData = await res.json();
      const content = responseData.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('OpenRouter evaluation model returned an empty choice content.');
      }
      return this.normalizeAndValidate(this.parseResponse(content), assignment, criteria);
    };

    try {
      const evaluation = await executeRequest();
      return { evaluation, model: modelName, requestCount };
    } catch (error) {
      if (!this.isTransientError(error)) throw error;
      console.warn(`[NativeGeminiAssignmentEvaluator] Retrying OpenRouter evaluation after transient error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, PRIMARY_RETRY_DELAY_MS));
      const evaluation = await executeRequest();
      return { evaluation, model: modelName, requestCount };
    }
  }

  async evaluateGeminiDirect({ assignment, criteria, questionBuffer, studentBuffer }) {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) throw new Error('GEMINI_API_KEY is missing or empty.');
    const modelName = process.env.GEMINI_MODEL_NAME || 'gemini-3.6-flash';
    const model = this.clientFactory(apiKey).getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: 'application/json', responseSchema: EVALUATION_RESPONSE_SCHEMA },
      systemInstruction: 'Return only valid JSON matching the requested evaluation schema. Do not expose reasoning.'
    });
    const request = {
      contents: [{ role: 'user', parts: [
        { text: this.buildPrompt({ assignment, criteria }) },
        { inlineData: { mimeType: 'application/pdf', data: questionBuffer.toString('base64') } },
        { inlineData: { mimeType: 'application/pdf', data: studentBuffer.toString('base64') } }
      ] }]
    };

    let requestCount = 0;
    const generate = async () => {
      requestCount += 1;
      const result = await model.generateContent(request);
      const response = await result.response;
      return this.normalizeAndValidate(this.parseResponse(response.text()), assignment, criteria);
    };
    try {
      return { evaluation: await generate(), model: modelName, requestCount };
    } catch (error) {
      if (!this.isTransientError(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, PRIMARY_RETRY_DELAY_MS));
      return { evaluation: await generate(), model: modelName, requestCount };
    }
  }

  async evaluate({ assignment, submissionId, studentPdfPath }) {
    if (!assignment.questionPdf || !assignment.questionPdf.fileUrl) {
      throw new Error('Assignment Question PDF document is required for evaluation. No question PDF was provided for this assignment.');
    }

    const questionPdfPath = this.resolvePdfPath(assignment.questionPdf.fileUrl);
    const questionBuffer = this.readOriginalPdf(questionPdfPath, 'Professor question');
    const studentBuffer = this.readOriginalPdf(studentPdfPath, 'Student answer');
    const criteria = Array.isArray(assignment.rubric) && assignment.rubric.length
      ? assignment.rubric.map(item => ({ criterion: item.criterion, maxMarks: Number(item.maxMarks), description: item.description || '' }))
      : [{ criterion: 'Overall assignment evaluation', maxMarks: Number(assignment.maxMarks), description: 'Evaluate the complete assignment against the attached question document.' }];

    const duplicate = await this.findExactDuplicate({ assignment, submissionId, studentBuffer });
    if (duplicate?.duplicateDetected) return { evaluation: this.duplicateEvaluation(assignment, duplicate), model: null, requestCount: 0 };

    const provider = (process.env.ASSIGNMENT_EVALUATION_PROVIDER || 'openrouter').toLowerCase().trim();

    if (provider === 'openrouter') {
      return this.evaluateOpenRouter({ assignment, criteria, questionBuffer, studentBuffer });
    } else {
      return this.evaluateGeminiDirect({ assignment, criteria, questionBuffer, studentBuffer });
    }
  }
}

module.exports = new NativeGeminiAssignmentEvaluatorService();
module.exports.NativeGeminiAssignmentEvaluatorService = NativeGeminiAssignmentEvaluatorService;
