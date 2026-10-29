const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const aiPerformanceService = require('./aiPerformanceService');

/**
 * Transcription service using Groq Whisper Large V3 Turbo with Word-Level Timestamps & FFmpeg Preprocessing
 * Docs: https://console.groq.com/docs/model/whisper-large-v3-turbo
 */

// Initialize Groq client lazily (when first used) to ensure env vars are loaded
let groq = null;

const getGroqClient = () => {
  if (!groq) {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured. Add it to your .env file.');
    }
    groq = new Groq({
      apiKey,
      timeout: 300000, // 5 minutes timeout
      maxRetries: 3
    });
  }
  return groq;
};

// Supported audio/video extensions for transcription
const TRANSCRIBABLE_EXTENSIONS = ['.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.mpeg', '.mpga'];

/**
 * Check if a file is transcribable (audio or video)
 * @param {string} filename 
 * @returns {boolean}
 */
const isTranscribable = (filename) => {
  if (!filename) return false;
  const ext = path.extname(filename).toLowerCase();
  return TRANSCRIBABLE_EXTENSIONS.includes(ext);
};

// Lazy-resolve FFmpeg binary location (imageio_ffmpeg static binary or system ffmpeg)
let cachedFfmpegPath = undefined;
const getFfmpegExecutable = () => {
  if (cachedFfmpegPath !== undefined) return cachedFfmpegPath;

  try {
    const pythonExec = process.env.PYTHON_PATH || 'python';
    const pyOut = execSync(`${pythonExec} -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"`).toString().trim();
    if (pyOut && fs.existsSync(pyOut)) {
      cachedFfmpegPath = pyOut;
      console.log(`[FFmpeg] Resolved static FFmpeg binary: ${cachedFfmpegPath}`);
      return cachedFfmpegPath;
    }
  } catch (e) {}

  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    cachedFfmpegPath = 'ffmpeg';
    console.log(`[FFmpeg] Resolved system ffmpeg command`);
    return cachedFfmpegPath;
  } catch (e) {}

  cachedFfmpegPath = null;
  console.log(`[FFmpeg] System FFmpeg binary not found. Will send original file to STT engine.`);
  return null;
};

/**
 * Extract clean 16kHz Mono MP3 audio from lecture video file for optimal Whisper STT accuracy & speed
 * @param {string} filePath - Path to original video/audio file
 * @returns {Promise<{ audioPath: string, isTemp: boolean }>}
 */
const prepareAudioForWhisper = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const isVideo = ['.mp4', '.webm', '.mov', '.mpeg'].includes(ext);

  const ffmpegBin = getFfmpegExecutable();
  if (!ffmpegBin || !isVideo) {
    return { audioPath: filePath, isTemp: false };
  }

  const scratchDir = path.join(__dirname, '..', 'scratch');
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  const tempMp3Path = path.join(scratchDir, `stt_audio_${Date.now()}_${Math.floor(Math.random()*10000)}.mp3`);

  return new Promise((resolve) => {
    console.log(`[FFmpeg] Extracting 16kHz mono audio from video: ${path.basename(filePath)}...`);
    const startTime = Date.now();

    const ff = spawn(ffmpegBin, [
      '-y',
      '-i', filePath,
      '-vn',
      '-ac', '1',          // Mono channel for speech
      '-ar', '16000',      // 16kHz sample rate optimal for Whisper STT
      '-b:a', '64k',
      tempMp3Path
    ]);

    let stderr = '';
    ff.stderr.on('data', d => stderr += d.toString());

    ff.on('close', code => {
      if (code === 0 && fs.existsSync(tempMp3Path) && fs.statSync(tempMp3Path).size > 0) {
        const durSec = ((Date.now() - startTime) / 1000).toFixed(1);
        const sizeMB = (fs.statSync(tempMp3Path).size / 1024 / 1024).toFixed(2);
        console.log(`[FFmpeg] Extracted clean 16kHz mono audio in ${durSec}s (${sizeMB} MB)`);
        resolve({ audioPath: tempMp3Path, isTemp: true });
      } else {
        console.warn(`[FFmpeg] Audio extraction warning (code ${code}). Using original file: ${stderr.substring(0, 150)}`);
        resolve({ audioPath: filePath, isTemp: false });
      }
    });

    ff.on('error', err => {
      console.warn(`[FFmpeg] FFmpeg process error: ${err.message}. Using original file.`);
      resolve({ audioPath: filePath, isTemp: false });
    });
  });
};

/**
 * Build natural, accurately timestamped sentence segments from raw Whisper word timestamps.
 * 
 * Rules:
 * 1. Each segment start = first_word.start, end = last_word.end.
 * 2. Segment splits occur on:
 *    a) Sentence punctuation (. ? ! | ।)
 *    b) Speech pause between consecutive words >= 0.65s (real natural silence)
 *    c) Clause boundary (, ; : -) if segment duration >= 4.0s
 *    d) Maximum segment length (~9.0s or 18 words) to prevent giant unreadable lumps
 * 3. Exact word-level timestamps are preserved for each segment.
 * 
 * @param {Array<{word: string, start: number, end: number}>} words 
 * @param {Array<{start: number, end: number, text: string}>} rawSegments 
 * @returns {Array<{start: number, end: number, text: string, words: Array}>}
 */
const buildNaturalSegmentsFromWords = (words, rawSegments = []) => {
  if (!words || !Array.isArray(words) || words.length === 0) {
    // Fallback to raw segments if word timestamps were not returned by STT engine
    return (rawSegments || []).map(seg => ({
      start: Math.round((seg.start || 0) * 100) / 100,
      end: Math.round((seg.end || seg.start || 0) * 100) / 100,
      text: (seg.text || '').trim(),
      words: []
    }));
  }

  const segments = [];
  let currentWords = [];
  let currentStart = null;

  const SENTENCE_PUNCT = /[.?!|\u0964]/; // Includes Hindi purna viram ।
  const CLAUSE_PUNCT = /[,;:-]/;
  const MIN_PAUSE_SPLIT = 0.65; // 0.65s silence between words forces segment break (preserves real pauses)
  const MAX_SEG_DURATION = 9.0;  // max 9s per segment
  const MAX_SEG_WORDS = 18;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const wordText = w.word;
    if (!wordText || !wordText.trim()) continue;

    if (currentStart === null) {
      currentStart = w.start;
    }

    currentWords.push(w);

    const segDuration = w.end - currentStart;
    const nextWord = words[i + 1];
    const pauseToNext = nextWord ? (nextWord.start - w.end) : 0;

    const isLastWord = (i === words.length - 1);
    const hasSentencePunct = SENTENCE_PUNCT.test(wordText);
    const hasClausePunct = CLAUSE_PUNCT.test(wordText);
    const isLongPause = pauseToNext >= MIN_PAUSE_SPLIT;
    const isTooLong = segDuration >= MAX_SEG_DURATION || currentWords.length >= MAX_SEG_WORDS;

    let shouldSplit = isLastWord || hasSentencePunct;

    if (!shouldSplit && isLongPause) {
      shouldSplit = true;
    }

    if (!shouldSplit && isTooLong) {
      if (hasClausePunct || pauseToNext >= 0.3 || isTooLong) {
        shouldSplit = true;
      }
    }

    if (shouldSplit && currentWords.length > 0) {
      const segText = currentWords.map(cw => cw.word.trim()).join(' ').trim();
      const segStart = currentWords[0].start;
      const segEnd = currentWords[currentWords.length - 1].end;

      if (segText) {
        segments.push({
          start: Math.round(segStart * 100) / 100,
          end: Math.round(segEnd * 100) / 100,
          text: segText,
          words: currentWords.map(cw => ({
            word: cw.word.trim(),
            start: Math.round(cw.start * 100) / 100,
            end: Math.round(cw.end * 100) / 100
          }))
        });
      }

      currentWords = [];
      currentStart = null;
    }
  }

  return segments;
};

/**
 * Transcribe an audio/video file using Groq Whisper Large V3 Turbo with Word-Level Timestamps
 * Supports multilingual audio - automatically detects language(s) in the audio
 * @param {string} filePath - Absolute path to the audio/video file
 * @returns {Promise<{text: string, segments: Array, words: Array, language: string, duration: number}>}
 */
const transcribeFile = async (filePath, stages = []) => {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured. Add it to your .env file.');
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  let preparedAudio = { audioPath: filePath, isTemp: false };

  try {
    // 1. Preprocess audio via FFmpeg to 16kHz Mono MP3 for optimal speed & Whisper STT accuracy
    const tFf = Date.now();
    preparedAudio = await prepareAudioForWhisper(filePath);
    if (preparedAudio.isTemp) {
      stages.push({
        stageName: 'FFMPEG_AUDIO_EXTRACTION',
        durationMs: Date.now() - tFf,
        provider: 'INTERNAL_FFMPEG',
        status: 'SUCCESS'
      });
    }

    const targetFile = preparedAudio.audioPath;
    const fileSizeMB = (fs.statSync(targetFile).size / 1024 / 1024).toFixed(2);
    console.log(`[Groq] Starting transcription with Whisper Large V3 Turbo & Word Timestamps`);
    console.log(`[Groq] File: ${targetFile} (${fileSizeMB} MB)`);
    
    // Prepare file payload with explicit MIME type & clean filename to prevent multipart header overflow
    const ext = path.extname(targetFile).toLowerCase();
    const mimeMap = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.flac': 'audio/flac',
      '.mpeg': 'video/mpeg',
      '.mpga': 'audio/mpeg'
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';
    const cleanFilename = `stt_audio_${Date.now()}${ext}`;

    const filePayload = await Groq.toFile(fs.createReadStream(targetFile), cleanFilename, { type: mimeType });
    
    console.log(`[Groq] Sending request to Groq API with timestamp_granularities: ["word", "segment"]...`);
    const groqClient = getGroqClient();
    
    // Call Groq Whisper Large V3 Turbo requesting word-level timestamps
    const tGroq = Date.now();
    let transcription;
    try {
      transcription = await groqClient.audio.transcriptions.create({
        file: filePayload,
        model: 'whisper-large-v3-turbo',
        response_format: 'verbose_json',
        timestamp_granularities: ['word', 'segment'],
        temperature: 0.0
      });
      stages.push({
        stageName: 'GROQ_WHISPER_STT',
        durationMs: Date.now() - tGroq,
        provider: 'GROQ',
        model: 'whisper-large-v3-turbo',
        status: 'SUCCESS'
      });
    } catch (groqErr) {
      stages.push({
        stageName: 'GROQ_WHISPER_STT',
        durationMs: Date.now() - tGroq,
        provider: 'GROQ',
        model: 'whisper-large-v3-turbo',
        status: 'FAILED',
        errorMessage: groqErr.message
      });
      throw groqErr;
    }

    console.log(`[Groq] STT Response received successfully`);
    console.log(`[Groq] Text length: ${transcription.text?.length || 0} characters`);
    console.log(`[Groq] Detected language: ${transcription.language}`);
    console.log(`[Groq] Word timestamps count: ${transcription.words?.length || 0}`);
    console.log(`[Groq] Raw segments count: ${transcription.segments?.length || 0}`);

    // Build natural sentence segments using word timestamps & pause detection
    const naturalSegments = buildNaturalSegmentsFromWords(transcription.words, transcription.segments);
    console.log(`[Groq] Built ${naturalSegments.length} natural sentence segments from STT word timestamps.`);

    return {
      text: transcription.text || '',
      segments: naturalSegments,
      words: transcription.words || [],
      language: transcription.language || 'unknown',
      duration: transcription.duration || (naturalSegments.length > 0 ? naturalSegments[naturalSegments.length - 1].end : 0)
    };
  } catch (error) {
    console.error('[Groq] Transcription error:', error.message);
    
    let errorMsg = error.message;
    if (error.status === 401 || error.message.includes('401')) {
      errorMsg = 'Groq API authentication failed - GROQ_API_KEY may be invalid or expired';
    } else if (error.status === 403 || error.message.includes('403')) {
      errorMsg = 'Groq API access denied - check your API key permissions';
    } else if (error.status === 429 || error.message.includes('429')) {
      errorMsg = 'Groq API rate limit exceeded - please try again later';
    } else if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
      errorMsg = 'Connection error to Groq API - check your internet connection';
    } else if (error.message.includes('timeout')) {
      errorMsg = 'Groq API request timeout - file may be too large or network is slow';
    } else if (error.message.includes('ENOENT')) {
      errorMsg = 'File not found on disk';
    }
    
    throw new Error(`Transcription failed: ${errorMsg}`);
  } finally {
    // Clean up temporary extracted audio file if created
    if (preparedAudio.isTemp && preparedAudio.audioPath && fs.existsSync(preparedAudio.audioPath)) {
      try {
        fs.unlinkSync(preparedAudio.audioPath);
        console.log(`[Groq] Cleaned up temp audio: ${path.basename(preparedAudio.audioPath)}`);
      } catch (e) {}
    }
  }
};

/**
 * Transcribe a lecture file and update the lecture document in DB
 * Runs asynchronously — caller should not await unless they need the result immediately
 * Supports multilingual audio with automatic language detection
 * @param {string} lectureId - Lecture MongoDB document ID
 * @param {string} fileAbsolutePath - Absolute path to the uploaded file
 */
const transcribeLectureAsync = async (lectureId, fileAbsolutePath, retryCount = 0, stages = [], initialStartTime = null) => {
  const Lecture = require('../models/Lecture');
  require('../models/Course');
  require('../models/User');
  const { normalizeLanguage } = require('./audioSynthesisService');
  const storageService = require('./storageService');
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 5000;
  const startTime = initialStartTime || Date.now();

  let tempFileObj = null;

  try {
    console.log(`[Transcription] Starting transcription for lecture ${lectureId}`);
    console.log(`[Transcription] File key/path: ${fileAbsolutePath}`);

    try {
      const tB2 = Date.now();
      tempFileObj = await storageService.downloadObjectToTempFile(fileAbsolutePath);
      stages.push({
        stageName: 'B2_DOWNLOAD',
        durationMs: Date.now() - tB2,
        provider: 'BACKBLAZE_B2',
        status: 'SUCCESS'
      });
    } catch (err) {
      console.log(`[Transcription] Failed to fetch file for transcription: ${err.message}`);
      stages.push({
        stageName: 'B2_DOWNLOAD',
        durationMs: 0,
        provider: 'BACKBLAZE_B2',
        status: 'FAILED',
        errorMessage: err.message
      });
      await Lecture.findByIdAndUpdate(lectureId, {
        'transcription.status': 'failed',
        'transcription.error': `File not available for transcription: ${err.message}`
      });

      const hierarchy = await aiPerformanceService.resolveHierarchy({ lectureId });
      aiPerformanceService.recordMetric({
        operationType: 'TRANSCRIPTION',
        logicalOperationId: `${lectureId}:transcription`,
        durationMs: Date.now() - startTime,
        startTime: new Date(startTime),
        endTime: new Date(),
        status: 'FAILED',
        provider: 'BACKBLAZE_B2',
        errorMessage: `File not available for transcription: ${err.message}`,
        resourceType: 'LECTURE',
        resourceId: lectureId,
        stages,
        ...hierarchy
      }).catch(() => {});
      return;
    }

    const workingPath = tempFileObj.tempPath;
    
    // Mark as processing
    await Lecture.findByIdAndUpdate(lectureId, {
      'transcription.status': 'processing',
      'transcription.error': null
    });

    const result = await transcribeFile(workingPath, stages);
    console.log(`[Transcription] File transcribed successfully, text length: ${result.text.length}`);

    // Normalize raw language (e.g. 'hi' -> 'Hindi', 'en' -> 'English', 'gu' -> 'Gujarati')
    let normalizedSourceLang = normalizeLanguage(result.language);
    const devanagariCount = (result.text?.match(/[\u0900-\u097F]/g) || []).length;
    const gujaratiCount = (result.text?.match(/[\u0A80-\u0AFF]/g) || []).length;

    if (devanagariCount > 20) {
      normalizedSourceLang = 'Hindi';
      console.log(`[Transcription] Script analysis: Detected Devanagari text (${devanagariCount} chars). Setting source language = 'Hindi'`);
    } else if (gujaratiCount > 20) {
      normalizedSourceLang = 'Gujarati';
      console.log(`[Transcription] Script analysis: Detected Gujarati text (${gujaratiCount} chars). Setting source language = 'Gujarati'`);
    }

    // Call Gemini API to analyze the language percentages
    const { analyzeLanguage, analyzeSegmentsLanguage } = require('./languageAnalysisService');
    
    let languageAnalysis = null;
    try {
      console.log(`[Transcription] Analyzing language content...`);
      const tLang = Date.now();
      languageAnalysis = await analyzeLanguage(result.text);
      stages.push({
        stageName: 'GEMINI_LANGUAGE_ANALYSIS',
        durationMs: Date.now() - tLang,
        provider: 'GEMINI',
        model: 'gemini-2.5-flash',
        status: 'SUCCESS'
      });
      console.log(`[Transcription] Language analysis completed`);
    } catch (langErr) {
      console.error('[Transcription] Failed to analyze language:', langErr.message);
      stages.push({
        stageName: 'GEMINI_LANGUAGE_ANALYSIS',
        durationMs: 0,
        provider: 'GEMINI',
        status: 'FAILED',
        errorMessage: langErr.message
      });
    }

    // Call Gemini API to analyze language for each segment
    let segmentsWithLanguage = result.segments;
    try {
      console.log(`[Transcription] Analyzing segment languages...`);
      segmentsWithLanguage = await analyzeSegmentsLanguage(result.segments);
      console.log(`[Transcription] Segment language analysis completed`);
    } catch (segErr) {
      console.error('[Transcription] Failed to analyze segment languages:', segErr.message);
    }

    const updateData = {
      'transcription.status': 'completed',
      'transcription.text': result.text,
      'transcription.segments': segmentsWithLanguage,
      'transcription.language': normalizedSourceLang,
      'transcription.duration': result.duration,
      'transcription.completedAt': new Date(),
      'transcription.error': null,
      language: normalizedSourceLang,
      teachingLanguage: normalizedSourceLang
    };

    if (languageAnalysis) {
      updateData.languageAnalysis = languageAnalysis;
    }

    // Save transcription and analysis to the lecture document
    await Lecture.findByIdAndUpdate(lectureId, updateData);

    // Create/Update LectureTranscript record and generate PDF
    try {
      const LectureTranscript = require('../models/LectureTranscript');
      const { generateTranscriptPDF } = require('./transcriptProcessingService');
      
      const lecture = await Lecture.findById(lectureId)
        .select('title course uploadedBy createdAt')
        .populate('course', 'name')
        .populate('uploadedBy', 'name');

      let lectureTranscript = await LectureTranscript.findOne({ lecture: lectureId });
      
      const transcriptPayload = {
        lecture: lectureId,
        originalTranscript: {
          text: result.text,
          language: normalizedSourceLang,
          segments: segmentsWithLanguage
        },
        status: 'transcribed'
      };

      if (!lectureTranscript) {
        lectureTranscript = new LectureTranscript(transcriptPayload);
        if (languageAnalysis) {
          lectureTranscript.languagePercentages = languageAnalysis;
        }
        await lectureTranscript.save();
      } else {
        lectureTranscript.originalTranscript = transcriptPayload.originalTranscript;
        lectureTranscript.status = 'transcribed';
        if (languageAnalysis) {
          lectureTranscript.languagePercentages = languageAnalysis;
        }
        await lectureTranscript.save();
      }

      // Generate PDF for original transcript using valid enum language ('English', 'Hindi', 'Gujarati')
      try {
        const pdfLang = ['English', 'Hindi', 'Gujarati'].includes(normalizedSourceLang) ? normalizedSourceLang : 'English';
        const tPdf = Date.now();
        const pdfResult = await generateTranscriptPDF(
          lecture.title,
          lecture.course?.name || 'Course',
          lecture.uploadedBy?.name || 'Professor',
          new Date(lecture.createdAt).toLocaleDateString(),
          segmentsWithLanguage,
          pdfLang,
          null,
          { uploaderId: lecture.uploadedBy?._id || lecture.uploadedBy, lectureId: lecture._id }
        );
        stages.push({
          stageName: 'TRANSCRIPT_PDF_GENERATION',
          durationMs: Date.now() - tPdf,
          provider: 'INTERNAL_PDF',
          status: 'SUCCESS'
        });

        // Check if PDF entry already exists
        const pdfExists = lectureTranscript.pdfFiles.some(p => p.language === pdfLang);
        if (!pdfExists) {
          lectureTranscript.pdfFiles.push({
            language: pdfLang,
            path: pdfResult.path,
            filename: pdfResult.filename,
            isOriginal: true,
            generatedAt: new Date()
          });
          await lectureTranscript.save();
        }
        console.log(`[Transcription] PDF generated for original transcript (${pdfLang})`);
      } catch (pdfError) {
        console.error('[Transcription] PDF generation failed:', pdfError.message);
      }
    } catch (transcriptError) {
      console.error('[Transcription] Failed to create LectureTranscript:', transcriptError.message);
    }

    console.log(`[Transcription] Success! Transcription completed for lecture ${lectureId}`);

    // Record successful Lecture Transcription AI performance metric
    const hierarchy = await aiPerformanceService.resolveHierarchy({
      lectureId,
      userId: updateData.uploadedBy
    });
    aiPerformanceService.recordMetric({
      operationType: 'TRANSCRIPTION',
      logicalOperationId: `${lectureId}:transcription`,
      durationMs: Date.now() - startTime,
      startTime: new Date(startTime),
      endTime: new Date(),
      status: 'SUCCESS',
      provider: 'GROQ',
      model: 'whisper-large-v3-turbo',
      resourceType: 'LECTURE',
      resourceId: lectureId,
      stages,
      ...hierarchy
    }).catch(() => {});

    // Auto-trigger Speech-to-Speech audio generation for supported target languages (non-blocking)
    try {
      const { autoGenerateSpeechToSpeech } = require('./audioSynthesisService');
      autoGenerateSpeechToSpeech(lectureId).catch(err => {
        console.error(`[Transcription] Auto Speech-to-Speech background error for lecture ${lectureId}:`, err.message);
      });
    } catch (autoErr) {
      console.error('[Transcription] Failed to trigger auto Speech-to-Speech:', autoErr.message);
    }

    return result;
  } catch (error) {
    console.error(`[Transcription] Failed for lecture ${lectureId}:`, error.message);
    
    // Check if we should retry
    const isRetryable = error.message.includes('429') || 
                       error.message.includes('timeout') ||
                       error.message.includes('ECONNREFUSED') ||
                       error.code === 'ENOTFOUND';
    
    if (isRetryable && retryCount < MAX_RETRIES) {
      const delayMs = RETRY_DELAY * Math.pow(2, retryCount);
      console.log(`[Transcription] Retrying in ${delayMs}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return transcribeLectureAsync(lectureId, fileAbsolutePath, retryCount + 1, stages, startTime);
    }

    try {
      await Lecture.findByIdAndUpdate(lectureId, {
        'transcription.status': 'failed',
        'transcription.error': error.message
      });
    } catch (updateErr) {
      console.error(`[Transcription] Failed to update lecture with error:`, updateErr.message);
    }

    // Record failed Lecture Transcription AI performance metric
    const hierarchy = await aiPerformanceService.resolveHierarchy({ lectureId });
    aiPerformanceService.recordMetric({
      operationType: 'TRANSCRIPTION',
      logicalOperationId: `${lectureId}:transcription`,
      durationMs: Date.now() - startTime,
      startTime: new Date(startTime),
      endTime: new Date(),
      status: 'FAILED',
      provider: 'GROQ',
      model: 'whisper-large-v3-turbo',
      errorMessage: error.message,
      resourceType: 'LECTURE',
      resourceId: lectureId,
      stages,
      ...hierarchy
    }).catch(() => {});

    throw error;
  } finally {
    if (tempFileObj && typeof tempFileObj.cleanup === 'function') {
      tempFileObj.cleanup();
    }
  }
};

module.exports = {
  isTranscribable,
  transcribeFile,
  transcribeLectureAsync,
  buildNaturalSegmentsFromWords,
  TRANSCRIBABLE_EXTENSIONS
};
