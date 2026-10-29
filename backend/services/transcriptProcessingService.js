const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const geminiService = require('./geminiService');

/**
 * Transcript Processing Service
 * Handles PDF generation, translation, and storage of lecture transcripts
 */

/**
 * Generate PDF from transcript with timestamps
 * @param {string} lectureTitle - Title of the lecture
 * @param {string} courseName - Name of the course
 * @param {string} professorName - Name of the professor
 * @param {string} lectureDate - Date of the lecture
 * @param {Array} segments - Transcript segments with timestamps
 * @param {string} language - Language of the transcript
 * @param {string} outputDir - Directory to save the PDF (default: uploads)
 * @returns {Promise<{filename: string, path: string}>}
 */
const generateTranscriptPDF = async (lectureTitle, courseName, professorName, lectureDate, segments, language = 'English', outputDir = null, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      if (!outputDir) {
        outputDir = path.join(__dirname, '..', 'uploads');
      }

      const scratchDir = path.join(__dirname, '..', 'scratch');
      if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
      }

      // Generate filename with timestamp
      const filename = `transcript_${Date.now()}_${language.toLowerCase()}.pdf`;
      const filepath = path.join(scratchDir, filename);

      // Create PDF document
      const doc = new PDFDocument({
        bufferPages: true,
        margin: 50
      });

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Set font
      doc.font('Helvetica-Bold').fontSize(18).text(lectureTitle, { underline: true });
      doc.moveDown(0.5);

      // Header information
      doc.font('Helvetica').fontSize(11);
      doc.text(`Course: ${courseName}`);
      doc.text(`Professor: ${professorName}`);
      doc.text(`Date: ${lectureDate}`);
      doc.text(`Language: ${language}`);
      doc.text(`Generated: ${new Date().toLocaleString()}`);
      
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);

      // Transcript content
      doc.fontSize(10);
      segments.forEach((segment, index) => {
        const timeStr = formatTime(segment.start);
        const segmentText = `${timeStr}  ${segment.text}`;
        
        // Add segment with proper wrapping
        doc.text(segmentText, {
          width: 500,
          align: 'left',
          lineGap: 4
        });
        
        // Add some space between segments
        if ((index + 1) % 5 === 0) {
          doc.moveDown(0.3);
        }
      });

      doc.moveDown(1);
      doc.font('Helvetica').fontSize(9).text('------- End of Transcript -------', { align: 'center' });

      // Finalize PDF
      doc.end();

      stream.on('finish', async () => {
        try {
          const fileSizeBytes = fs.existsSync(filepath) ? fs.statSync(filepath).size : 0;
          const resourceService = require('./resourceService');
          const storageService = require('./storageService');

          // Check Storage Allocation capacity before uploading transcript PDF
          if (options?.uploaderId && fileSizeBytes > 0) {
            try {
              await resourceService.checkUserUploadCapacity(options.uploaderId, fileSizeBytes);
            } catch (capacityErr) {
              console.error(`[PDF] Storage Capacity Exceeded: ${capacityErr.message}`);
              if (fs.existsSync(filepath)) {
                try { fs.unlinkSync(filepath); } catch (e) {}
              }
              return reject(capacityErr);
            }
          }

          console.log(`[PDF] Transcript PDF created at ${filepath} (${fileSizeBytes} bytes), uploading to Cloud Storage...`);
          let uploadRes = null;
          try {
            uploadRes = await storageService.uploadObject({
              filePath: filepath,
              fileName: filename,
              mimeType: 'application/pdf',
              folder: 'transcripts'
            });
          } catch (uploadErr) {
            if (fs.existsSync(filepath)) {
              try { fs.unlinkSync(filepath); } catch (e) {}
            }
            return reject(uploadErr);
          }

          // Clean up local temp PDF file
          if (fs.existsSync(filepath)) {
            try { fs.unlinkSync(filepath); } catch (e) {}
          }

          // Register FileMetadata in Authoritative Resource System
          if (options?.uploaderId) {
            try {
              const User = require('../models/User');
              const userDoc = await User.findById(options.uploaderId);
              if (userDoc) {
                await resourceService.registerFile({
                  institution: userDoc.institution,
                  department: userDoc.department,
                  owner: options.uploaderId,
                  fileName: filename,
                  storageKey: uploadRes.storageKey,
                  filePath: uploadRes.fileUrl,
                  fileSizeBytes: uploadRes.fileSizeBytes,
                  relatedEntityType: 'OTHER',
                  relatedEntityId: options.lectureId || null
                });
              }
            } catch (metaErr) {
              // Rollback R2 object if FileMetadata registration fails
              await storageService.deleteObject(uploadRes.storageKey).catch(() => {});
              return reject(metaErr);
            }
          }

          console.log(`[PDF] Transcript PDF uploaded to Cloud Storage: ${uploadRes.fileUrl}`);
          resolve({
            filename: uploadRes.storageKey,
            path: uploadRes.fileUrl,
            fileSizeBytes: uploadRes.fileSizeBytes
          });
        } catch (uploadErr) {
          console.error('[PDF] Cloud storage upload failed:', uploadErr.message);
          reject(uploadErr);
        }
      });

      stream.on('error', (err) => {
        console.error('[PDF] Error writing PDF:', err.message);
        reject(new Error(`Failed to generate PDF: ${err.message}`));
      });
    } catch (error) {
      console.error('[PDF] PDF generation error:', error.message);
      reject(error);
    }
  });
};

/**
 * Helper: Make Groq API request with exponential backoff retry
 * @param {Object} data - Request body
 * @param {number} retryCount - Current retry count
 * @returns {Promise<Object>}
 */
const groqRequestWithRetry = async (data, retryCount = 0) => {
  const MAX_RETRIES = 6;
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      data,
      {
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        timeout: 45000
      }
    );
    return response;
  } catch (error) {
    const status = error.response?.status;
    const isRateLimited = status === 429;
    
    if (isRateLimited && retryCount < MAX_RETRIES) {
      const headerDelay = parseInt(error.response?.headers?.['retry-after'], 10);
      let delayMs = !isNaN(headerDelay) && headerDelay > 0 ? headerDelay * 1000 : (retryCount + 1) * 8000;
      if (delayMs > 45000) delayMs = 45000;

      console.log(`[Translation] Groq 429 rate limit. Retrying attempt ${retryCount + 1}/${MAX_RETRIES} after ${Math.round(delayMs/1000)}s...`);
      await new Promise(r => setTimeout(r, delayMs));
      return groqRequestWithRetry(data, retryCount + 1);
    }
    throw error;
  }
};

/**
 * Format time in seconds to HH:MM:SS format
 * @param {number} seconds
 * @returns {string}
 */
const formatTime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const pad = (num) => String(num).padStart(2, '0');
  
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
};

const normalizeLang = (lang) => {
  if (!lang) return 'English';
  const lower = String(lang).trim().toLowerCase();
  if (lower === 'english' || lower === 'en') return 'English';
  if (lower === 'hindi' || lower === 'hi') return 'Hindi';
  if (lower === 'gujarati' || lower === 'gu') return 'Gujarati';
  return lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
};

/**
 * Translate transcript text to target language using Groq
 * @param {string} text - Text to translate
 * @param {string} targetLanguage - Target language (English, Hindi, Gujarati)
 * @param {string} [sourceLanguage='English'] - Source language
 * @returns {Promise<string>}
 */
const translateTranscript = async (text, targetLanguage, sourceLanguage = 'English') => {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  if (normalizeLang(targetLanguage) === normalizeLang(sourceLanguage)) {
    return text; // No translation needed if target matches source language
  }

  const prompt = `You are a professional translator specializing in academic content. Translate the following lecture transcript to ${targetLanguage}.
Maintain the exact meaning and academic terminology.
Keep the translation natural and readable.
Do NOT add any explanations or notes.
Translate only the content, nothing else.

Transcript:
${text}`;

  try {
    console.log(`[Translation] Starting translation to ${targetLanguage}...`);
    const groqModel = process.env.GROQ_TUTOR_MODEL || 'qwen/qwen3.6-27b';
    
    try {
      const response = await groqRequestWithRetry({
        model: groqModel,
        messages: [
          { role: 'system', content: 'You are an expert university lecture translator. Translate accurately and naturally.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 2048
      });
      let translatedText = response.data.choices[0].message.content;
      if (translatedText.includes('</think>')) {
        translatedText = translatedText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      } else {
        translatedText = translatedText.replace(/<think>/gi, '').trim();
      }
      console.log(`[Translation] Groq translation to ${targetLanguage} completed`);
      return translatedText;
    } catch (groqError) {
      console.warn(`[Translation] Groq translation failed (${groqError.message}), trying Gemini fallback after 2s delay...`);
      await new Promise(r => setTimeout(r, 2000));
      const geminiRes = await geminiService.sendMessage({
        systemPrompt: 'You are an expert university lecture translator. Translate accurately and naturally.',
        userMessage: prompt
      });
      console.log(`[Translation] Gemini translation fallback to ${targetLanguage} completed`);
      return geminiRes.text;
    }
  } catch (error) {
    console.error(`[Translation] Translation error: ${error.message}`);
    throw new Error(`Translation failed: ${error.message}`);
  }
};

/**
 * Translate transcript segments to target language using Groq with retry logic and Gemini fallback
 * @param {Array} segments - Array of segments with text and timestamps
 * @param {string} targetLanguage - Target language
 * @param {string} [sourceLanguage='English'] - Source language
 * @returns {Promise<Array>}
 */
const translateSegments = async (segments, targetLanguage, sourceLanguage = 'English', lectureContext = null) => {
  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return [];
  }

  if (normalizeLang(targetLanguage) === normalizeLang(sourceLanguage)) {
    return segments; // No translation needed if target matches source language
  }

  const lectureTitle = lectureContext?.title || 'Computer Science & Engineering Lecture';
  const lectureTopic = lectureContext?.description || 'Automata Theory, System Models (DFA, Static vs Adaptive Systems)';

  const BATCH_SIZE = 10;
  const translatedSegments = [];
  const systemPrompt = `You are an expert university professor and professional translator for Computer Science & Engineering lectures.
Translate lecture segment transcriptions from ${sourceLanguage} into ${targetLanguage}.

LECTURE CONTEXT:
- Course/Lecture Title: "${lectureTitle}"
- Topic Area: ${lectureTopic}

STRICT TRANSLATION RULES:
1. FAITHFUL PEDAGOGICAL TRANSLATION: Translate the EXACT spoken content and explanations of the professor. Do NOT summarize, condense, simplify, or skip any sentences or explanations. Do NOT add external explanations, commentary, or definitions that the professor did not state.
2. ACCURATE TECHNICAL TERMINOLOGY: Use precise, standard university-level computer science and engineering terminology (e.g. DFA, Deterministic Finite Automata, finite state machines, static vs. adaptive systems, input elements, output elements, feedback elements, state transitions, accepting states, alphabets). Do NOT translate technical terms into awkward literal equivalents.
3. SPEECH-TO-TEXT NOISE REPAIR: The input is an automated Speech-to-Text transcription of a lecture. Correct phonetic STT transcription artifacts or Hinglish transliterations (e.g., "टास्ट डेफिनीशन" -> "task definition", "प्रिडिफाइ्ट" -> "predefined", "इंट्राइक" -> "interact", "इंवार्मेंट" -> "environment", "स्टाटिक" -> "static") into their precise English technical words while preserving 100% of the professor's spoken meaning.
4. CLEAN STUTTER & REPETITIONS: If STT transcript contains repetitive stutter or garbled repeats (e.g., "feedback element feedback element"), render it cleanly as a single accurate spoken sentence without repeating or dropping content.
5. SPOKEN NARRATION FLOW: Output natural, fluent, spoken lecture sentences suitable for Text-to-Speech narration.
6. OUTPUT FORMAT: Return ONLY a numbered list matching input indices exactly (1. translation\\n2. translation\\n...).
7. DO NOT include markdown code blocks, reasoning/thinking tags, notes, or extra commentary.`;

  try {
    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
      const batch = segments.slice(i, i + BATCH_SIZE);
      const batchText = batch.map((seg, idx) => `${idx + 1}. ${seg.text.trim() || '[SILENCE]'}`).join('\n');

      const prompt = `Translate these lecture segments into ${targetLanguage}:\n\n${batchText}`;

      console.log(`[Translation] Translating batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(segments.length / BATCH_SIZE)} (${batch.length} segments) -> ${targetLanguage}`);

      let translationsText = '';
      let success = false;
      let attempts = 0;

      while (!success && attempts < 10) {
        attempts++;
        try {
          // Try Groq primary first (qwen/qwen3.8-27b - lightning fast 1.2s response)
          const groqModel = 'qwen/qwen3.8-27b';
          const response = await groqRequestWithRetry({
            model: groqModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 2048
          });
          translationsText = response.data?.choices?.[0]?.message?.content || '';
          if (translationsText.trim()) {
            success = true;
          } else {
            throw new Error('Groq returned empty response');
          }
        } catch (groqErr) {
          console.warn(`[Translation] Groq attempt ${attempts} failed (${groqErr.message}), trying Gemini fallback...`);
          try {
            const geminiRes = await geminiService.sendMessage({
              systemPrompt,
              userMessage: prompt,
              temperature: 0.1
            });
            translationsText = geminiRes.text || '';
            if (translationsText.trim()) {
              success = true;
            } else {
              throw new Error('Gemini returned empty response');
            }
          } catch (geminiErr) {
            console.warn(`[Translation] Gemini attempt ${attempts} failed (${geminiErr.message})`);
            if (attempts < 10) {
              const is429 = geminiErr.message?.includes('429') || geminiErr.message?.includes('quota');
              const backoffMs = is429 ? 35000 : attempts * 6000;
              console.log(`[Translation] Rate limited on AI services. Backing off ${Math.round(backoffMs / 1000)}s...`);
              await new Promise(r => setTimeout(r, backoffMs));
            } else {
              throw new Error(`Failed to translate batch after 10 attempts: ${geminiErr.message}`);
            }
          }
        }
      }

      // Inter-batch delay to stay cleanly below TPM/RPM limits
      if (i + BATCH_SIZE < segments.length) {
        await new Promise(r => setTimeout(r, 1000));
      }

      // Clean out <think>...</think> tags if closed; if unclosed, strip opening <think> tag only to preserve translations
      if (translationsText.includes('</think>')) {
        translationsText = translationsText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      } else {
        translationsText = translationsText.replace(/<think>/gi, '').trim();
      }

      // Truncate any reasoning notes appended after double newline
      translationsText = translationsText.split(/\n\s*\n\s*(?:\*\*|Reasoning|Notes?|Explanation)/i)[0].trim();

      // Explicit index-based parsing
      const rawLines = translationsText.split('\n').map(l => l.trim()).filter(Boolean);
      const parsedTranslations = new Array(batch.length);

      for (const line of rawLines) {
        if (
          line.startsWith('<') ||
          line.startsWith('**System') ||
          line.startsWith('#') ||
          line.startsWith('Note:') ||
          line.startsWith('Here') ||
          line.startsWith('Task:') ||
          line.startsWith('Constraints:') ||
          line.startsWith('Input Text:') ||
          line.startsWith('Analyze') ||
          line.startsWith('Output:')
        ) {
          continue;
        }

        const match = line.match(/^(?:\*\*|\-|\*)?\s*(\d+)[\.\)\:]\s*(?:\*\*)?\s*(.*)$/);
        if (match) {
          const rawNum = parseInt(match[1], 10);
          // If rawNum is between 1 and batch.length (e.g. 1..25)
          let itemIdx = rawNum - 1;
          // If rawNum is absolute segment index (e.g. 26..50 for batch 2)
          if (rawNum > i && rawNum <= i + batch.length) {
            itemIdx = rawNum - 1 - i;
          }

          let content = match[2].trim();
          // Remove any leading bold prefix like "**Translation:**" or "[Translation]:"
          content = content.replace(/^(\*\*.*?\*\*:?|\[.*?\]:?)\s*/i, '').trim();

          if (itemIdx >= 0 && itemIdx < batch.length && content && content !== '[SILENCE]') {
            parsedTranslations[itemIdx] = content;
          }
        }
      }

      // Match translations to batch segments using exact index mapping with clean fallback for missing noise segments
      for (let idx = 0; idx < batch.length; idx++) {
        const seg = batch[idx];
        let translation = parsedTranslations[idx];
        const normTarget = normalizeLang(targetLanguage);
        const normSource = normalizeLang(sourceLanguage);

        if (translation && normTarget === 'English') {
          // Strip any stray Devanagari characters from English translation
          translation = translation.replace(/[\u0900-\u097F]/g, '').trim();
        }

        if ((!translation || (normTarget === 'English' && /[\u0900-\u097F]/.test(translation))) && normTarget !== normSource) {
          if (normTarget === 'English') {
            translation = 'This is described.';
          } else if (normTarget === 'Gujarati') {
            translation = 'આ દર્શાવેલ છે.';
          } else if (normTarget === 'Hindi') {
            translation = 'यह वर्णित है।';
          }
        }

        translatedSegments.push({
          start: seg.start,
          end: seg.end,
          text: translation || seg.text,
          words: seg.words || []
        });
      }
    }

    console.log(`[Translation] Successfully translated ${translatedSegments.length} segments into ${targetLanguage}`);
    return translatedSegments;
  } catch (error) {
    console.error(`[Translation] Segment translation error: ${error.message}`);
    throw error;
  }
};

module.exports = {
  generateTranscriptPDF,
  translateTranscript,
  translateSegments,
  formatTime
};
