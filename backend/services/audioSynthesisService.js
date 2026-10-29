const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Lecture = require('../models/Lecture');
const LectureTranscript = require('../models/LectureTranscript');
const LectureAudio = require('../models/LectureAudio');
const { translateSegments } = require('./transcriptProcessingService');
const resourceService = require('./resourceService');
const User = require('../models/User');
const aiPerformanceService = require('./aiPerformanceService');

const SUPPORTED_LANGUAGES = ['English', 'Hindi', 'Gujarati'];

/**
 * Normalize Whisper/User language string into standard system language name
 * @param {string} lang
 * @returns {string}
 */
const normalizeLanguage = (lang) => {
  if (!lang) return 'English';
  const lower = String(lang).trim().toLowerCase();
  if (lower === 'english' || lower === 'en') return 'English';
  if (lower === 'hindi' || lower === 'hi') return 'Hindi';
  if (lower === 'gujarati' || lower === 'gu') return 'Gujarati';
  if (lower === 'marathi' || lower === 'mr') return 'Marathi';
  return lang.charAt(0).toUpperCase() + lang.slice(1).toLowerCase();
};

/**
 * Calculate supported target languages for a given source language
 * @param {string} sourceLanguage 
 * @returns {Array<string>} Array of supported target language names
 */
const getTargetLanguages = (sourceLanguage) => {
  const norm = normalizeLanguage(sourceLanguage);
  if (!SUPPORTED_LANGUAGES.includes(norm)) {
    return [];
  }
  return SUPPORTED_LANGUAGES.filter(lang => lang !== norm);
};

/**
 * Group translated segments into natural speech narration chunks (15–30 seconds per chunk)
 * Aligned to natural sentence endings (. ? ! ।)
 * @param {Array} segments 
 * @param {string} targetLanguage 
 * @returns {Array} Array of chunk objects
 */
const createNarrationChunks = (segments, targetLanguage = 'English') => {
  if (!segments || !Array.isArray(segments) || segments.length === 0) return [];

  const chunks = [];
  let currentChunkSegments = [];
  let currentText = '';
  let currentStart = null;
  let currentEnd = null;

  const TARGET_CHUNK_DURATION = 18.0; // 18 seconds target narration paragraph
  const MAX_CHUNK_DURATION = 30.0;    // 30 seconds max
  const SENTENCE_PUNCT = /[.?!|\u0964]/;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segText = (seg.text || '').trim();
    if (!segText) continue;

    if (currentStart === null) {
      currentStart = seg.start;
    }
    currentEnd = seg.end;

    currentChunkSegments.push(seg);
    currentText = currentText ? `${currentText} ${segText}` : segText;

    const currentDuration = currentEnd - currentStart;
    const hasSentencePunct = SENTENCE_PUNCT.test(segText);
    const isLast = (i === segments.length - 1);

    const isTargetReached = currentDuration >= TARGET_CHUNK_DURATION && hasSentencePunct;
    const isMaxReached = currentDuration >= MAX_CHUNK_DURATION;

    if (isLast || isTargetReached || isMaxReached) {
      chunks.push({
        chunkId: `chunk_${chunks.length + 1}`,
        sourceStart: currentStart,
        sourceEnd: currentEnd,
        sourceSegmentIds: currentChunkSegments.map(s => s._id || s.id),
        translatedText: currentText.trim(),
        targetLanguage
      });

      currentChunkSegments = [];
      currentText = '';
      currentStart = null;
      currentEnd = null;
    }
  }

  return chunks;
};

/**
 * Execute Python TTS synthesizer script with FFmpeg audio normalization
 * @param {Array} chunks - Array of narration chunk objects [{ chunkId, translatedText, targetLanguage }]
 * @param {string} outputMp3Path - Absolute path to save generated audio MP3
 * @param {string} targetLanguage - Target language ('English', 'Hindi', 'Gujarati')
 * @returns {Promise<{outputPath: string, sizeBytes: number, chunksProcessed: number}>}
 */
const runPythonTTS = (chunks, outputMp3Path, targetLanguage, masterDuration = 0) => {
  return new Promise((resolve, reject) => {
    const payload = {
      masterDuration: masterDuration || 0,
      chunks: chunks
    };
    const tempJsonPath = `${outputMp3Path}_chunks_input.json`;
    fs.writeFileSync(tempJsonPath, JSON.stringify(payload, null, 2), 'utf-8');

    const scriptPath = path.join(__dirname, '..', 'scripts', 'tts_synthesizer.py');
    const pythonExec = process.env.PYTHON_PATH || 'python';

    console.log(`[TTS Exec] ${pythonExec} ${scriptPath} ${tempJsonPath} ${outputMp3Path} ${targetLanguage} ${masterDuration}`);
    const pythonProcess = spawn(pythonExec, [scriptPath, tempJsonPath, outputMp3Path, targetLanguage, String(masterDuration || 0)]);

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (fs.existsSync(tempJsonPath)) {
        try { fs.unlinkSync(tempJsonPath); } catch (e) {}
      }

      if (code !== 0) {
        console.error('[TTS] Python script exited with code:', code);
        console.error('[TTS] Stderr:', stderrData);
        return reject(new Error(`TTS generation failed: ${stderrData || 'Python execution error'}`));
      }

      try {
        const result = JSON.parse(stdoutData.trim());
        resolve(result);
      } catch (err) {
        if (fs.existsSync(outputMp3Path)) {
          resolve({
            outputPath: outputMp3Path,
            sizeBytes: fs.statSync(outputMp3Path).size,
            chunksProcessed: chunks.length
          });
        } else {
          reject(new Error(`Failed to parse TTS script output: ${stdoutData}`));
        }
      }
    });
  });
};

/**
 * Generate Translated Audio Track for a Lecture
 * @param {string} lectureId - Lecture MongoDB ID
 * @param {string} targetLanguage - Target language ('English', 'Hindi', 'Gujarati')
 * @param {Object} [reqUser] - Request user object (or uploader user object)
 * @returns {Promise<Object>}
 */
const generateLectureAudio = async (lectureId, targetLanguage, reqUser = null) => {
  const normTargetLang = normalizeLanguage(targetLanguage);
  if (!SUPPORTED_LANGUAGES.includes(normTargetLang)) {
    throw new Error(`Target language '${targetLanguage}' is not supported. Supported languages: English, Hindi, Gujarati`);
  }

  const lecture = await Lecture.findById(lectureId);
  if (!lecture) {
    throw new Error('Lecture not found');
  }

  const transcriptDoc = await LectureTranscript.findOne({ lecture: lectureId });
  if (!transcriptDoc || !transcriptDoc.originalTranscript?.segments?.length) {
    throw new Error('Lecture transcript is not ready or has no segments');
  }

  let sourceLang = normalizeLanguage(transcriptDoc.originalTranscript?.language || lecture.transcription?.language || 'Hindi');
  const sampleOrigText = (transcriptDoc.originalTranscript?.segments || []).slice(0, 10).map(s => s.text).join(' ');
  if (sourceLang === 'English' && (sampleOrigText.match(/[\u0900-\u097F]/g) || []).length > 10) {
    sourceLang = 'Hindi';
  }

  if (sourceLang === normTargetLang) {
    throw new Error(`Lecture source language is already ${normTargetLang}. Cannot generate translated audio for source language.`);
  }

  const STALE_PROCESSING_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

  // Check for existing LectureAudio record
  let audioRecord = await LectureAudio.findOne({ lecture: lectureId, language: normTargetLang });

  if (audioRecord && audioRecord.status === 'completed' && audioRecord.storageKey) {
    console.log(`[AudioSynthesis] Returning existing completed audio track for lecture ${lectureId} in ${normTargetLang}`);
    return audioRecord;
  }

  // Concurrent generation protection with Stale-Processing Recovery:
  // If record is 'processing' and updated within the last 10 minutes, return existing record.
  // If 'processing' record is older than 10 minutes (abandoned due to server restart), reclaim it.
  if (audioRecord && audioRecord.status === 'processing') {
    const lastUpdated = new Date(audioRecord.updatedAt || audioRecord.createdAt || 0).getTime();
    const ageMs = Date.now() - lastUpdated;
    if (ageMs < STALE_PROCESSING_THRESHOLD_MS) {
      console.log(`[AudioSynthesis] Audio track for lecture ${lectureId} in ${normTargetLang} is actively processing (${Math.round(ageMs / 1000)}s old).`);
      return audioRecord;
    }
    console.warn(`[AudioSynthesis] Reclaiming stale abandoned processing record for lecture ${lectureId} in ${normTargetLang} (${Math.round(ageMs / 1000)}s old). Re-starting generation.`);
  }

  // Determine user to charge for metered AI quota (reqUser or lecture uploader)
  const uploaderId = reqUser?._id || lecture.uploadedBy;
  if (uploaderId) {
    await resourceService.checkAndConsumeMeteredAIQuota({
      user: uploaderId,
      operationType: 'AUDIO_GENERATION',
      quantity: 1,
      relatedEntityType: 'LECTURE',
      relatedEntityId: lectureId
    });
  }

  // Create or update LectureAudio record to 'processing'
  const storageKey = `lecture_audio_${lectureId}_${normTargetLang.toLowerCase()}_${Date.now()}.mp3`;
  const audioUrl = `/uploads/${storageKey}`;

  if (!audioRecord) {
    audioRecord = new LectureAudio({
      lecture: lectureId,
      language: normTargetLang,
      sourceLanguage: sourceLang,
      audioUrl,
      storageKey,
      status: 'processing',
      generatedBy: uploaderId
    });
  } else {
    audioRecord.status = 'processing';
    audioRecord.error = null;
    audioRecord.storageKey = storageKey;
    audioRecord.audioUrl = audioUrl;
  }
  await audioRecord.save();

  // Immediately register FileMetadata record in Authoritative Resource System
  const userDoc = await User.findById(uploaderId);
  if (userDoc) {
    await resourceService.registerFile({
      institution: userDoc.institution,
      department: userDoc.department,
      owner: userDoc._id,
      fileName: `Lecture_${lecture.title}_${normTargetLang}.mp3`,
      storageKey: storageKey,
      filePath: audioUrl,
      fileSizeBytes: 0,
      relatedEntityType: 'GENERATED_AUDIO',
      relatedEntityId: audioRecord._id
    });
  }

  // Async audio synthesis process (non-blocking)
  (async () => {
    const ttsStartTime = Date.now();
    const stages = [];
    const logicalOpId = `tts_${audioRecord._id}_${Date.now()}`;
    let hierarchy = null;

    try {
      console.log(`[AudioSynthesis] Starting translation & narration synthesis for lecture ${lectureId} (${sourceLang} -> ${normTargetLang})`);
      
      // Resolve hierarchy asynchronously for metrics
      hierarchy = await aiPerformanceService.resolveHierarchy({
        courseId: lecture.course,
        userId: uploaderId,
        lectureId: lectureId
      });

      // 1. Translate segments if not already translated
      let targetSegments = [];
      let existingTranslation = transcriptDoc.translations?.find(t => normalizeLanguage(t.language) === normTargetLang);

      // Validate cached translation language matching
      const hasDevanagari = (str) => /[\u0900-\u097F]/.test(str || '');
      const hasGujarati = (str) => /[\u0A80-\u0AFF]/.test(str || '');

      const isEnglishCacheInvalid = (normTargetLang === 'English' && existingTranslation && existingTranslation.segments?.some(s => hasDevanagari(s.text)));
      const isHindiCacheInvalid = (normTargetLang === 'Hindi' && existingTranslation && existingTranslation.segments?.some(s => !hasDevanagari(s.text) && s.text.length > 50));
      const isGujaratiCacheInvalid = (normTargetLang === 'Gujarati' && existingTranslation && existingTranslation.segments?.some(s => !hasGujarati(s.text) && s.text.length > 50));

      if (isEnglishCacheInvalid || isHindiCacheInvalid || isGujaratiCacheInvalid) {
        console.warn(`[AudioSynthesis] Invalid cached ${normTargetLang} translation detected. Clearing stale cache.`);
        transcriptDoc.translations = transcriptDoc.translations.filter(t => normalizeLanguage(t.language) !== normTargetLang);
        await transcriptDoc.save();
        existingTranslation = null;
      }

      if (existingTranslation && existingTranslation.segments?.length > 0) {
        targetSegments = existingTranslation.segments;
        stages.push({
          stageName: 'TRANSLATION_CACHE_HIT',
          durationMs: 0,
          provider: 'Local Cache',
          model: 'MongoDB LectureTranscript',
          status: 'success'
        });
      } else {
        console.log(`[AudioSynthesis] Translating segments (${sourceLang} -> ${normTargetLang})...`);
        const lectureContext = {
          title: lecture.title,
          description: lecture.description || lecture.title
        };
        const transStageStart = Date.now();
        try {
          targetSegments = await translateSegments(transcriptDoc.originalTranscript.segments, normTargetLang, sourceLang, lectureContext);
          stages.push({
            stageName: 'GEMINI_TRANSLATION',
            durationMs: Date.now() - transStageStart,
            provider: 'Google Gemini',
            model: 'gemini-1.5-flash',
            status: 'success'
          });
        } catch (transErr) {
          stages.push({
            stageName: 'GEMINI_TRANSLATION',
            durationMs: Date.now() - transStageStart,
            provider: 'Google Gemini',
            model: 'gemini-1.5-flash',
            status: 'failed',
            errorMessage: transErr.message
          });
          throw transErr;
        }
        
        // Cache translation in LectureTranscript
        transcriptDoc.translations.push({
          language: normTargetLang,
          text: targetSegments.map(s => s.text).join(' '),
          segments: targetSegments,
          translatedAt: new Date()
        });
        await transcriptDoc.save();
      }

      // 2. Group translated segments into natural narration chunks (15-30s paragraphs)
      const narrationChunks = createNarrationChunks(targetSegments, normTargetLang);
      console.log(`[AudioSynthesis] Grouped ${targetSegments.length} segments into ${narrationChunks.length} natural narration chunks`);

      // 3. Run Python TTS synthesis with Master Timeline Alignment
      const scratchDir = path.join(__dirname, '..', 'scratch');
      if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
      }
      const tempLocalPath = path.join(scratchDir, `tts_${Date.now()}_${storageKey}`);
      const masterDuration = lecture.transcription?.duration || transcriptDoc.originalTranscript?.duration || lecture.duration || 0;
      console.log(`[AudioSynthesis] Generating continuous TTS narration at ${tempLocalPath} (Master Duration: ${masterDuration}s)...`);
      
      const ttsStageStart = Date.now();
      let ttsResult = null;
      try {
        ttsResult = await runPythonTTS(narrationChunks, tempLocalPath, normTargetLang, masterDuration);
        stages.push({
          stageName: 'EDGE_TTS_SYNTHESIS',
          durationMs: Date.now() - ttsStageStart,
          provider: 'Microsoft Edge TTS / Python',
          model: 'edge-tts',
          status: 'success'
        });
      } catch (ttsErr) {
        stages.push({
          stageName: 'EDGE_TTS_SYNTHESIS',
          durationMs: Date.now() - ttsStageStart,
          provider: 'Microsoft Edge TTS / Python',
          model: 'edge-tts',
          status: 'failed',
          errorMessage: ttsErr.message
        });
        throw ttsErr;
      }

      const fileSizeBytes = fs.existsSync(tempLocalPath) ? fs.statSync(tempLocalPath).size : (ttsResult.sizeBytes || 0);

      // Check Storage Allocation capacity for the generated audio file
      if (uploaderId && fileSizeBytes > 0) {
        try {
          await resourceService.checkUserUploadCapacity(uploaderId, fileSizeBytes);
        } catch (capacityErr) {
          console.error(`[AudioSynthesis] Storage Allocation Capacity Exceeded for lecture ${lectureId}: ${capacityErr.message}`);
          if (fs.existsSync(tempLocalPath)) {
            try { fs.unlinkSync(tempLocalPath); } catch (e) {}
          }
          await resourceService.softDeleteFile(storageKey).catch(() => {});
          const exists = await LectureAudio.findById(audioRecord._id);
          if (exists) {
            exists.status = 'failed';
            exists.error = `Storage Capacity Exceeded: ${capacityErr.message}`;
            await exists.save();
          }

          aiPerformanceService.recordMetric({
            operationType: 'TTS_SYNTHESIS',
            logicalOperationId: logicalOpId,
            durationMs: Date.now() - ttsStartTime,
            startTime: new Date(ttsStartTime),
            endTime: new Date(),
            status: 'failed',
            provider: 'Microsoft Edge TTS',
            model: 'edge-tts',
            targetLanguage: normTargetLang,
            errorCategory: 'QUOTA_EXCEEDED',
            errorMessage: capacityErr.message,
            resourceType: 'LECTURE_AUDIO',
            resourceId: audioRecord._id,
            stages: stages,
            ...(hierarchy || {})
          });

          return audioRecord;
        }
      }

      const storageService = require('./storageService');
      let uploadRes = null;
      const uploadStageStart = Date.now();
      try {
        uploadRes = await storageService.uploadObject({
          filePath: tempLocalPath,
          fileName: `Lecture_${lecture.title}_${normTargetLang}.mp3`,
          mimeType: 'audio/mpeg',
          folder: 'audio',
          customKey: storageKey
        });
        stages.push({
          stageName: 'B2_AUDIO_UPLOAD',
          durationMs: Date.now() - uploadStageStart,
          provider: 'Backblaze B2',
          model: 'R2/S3-Compatible Storage',
          status: 'success'
        });
      } catch (uploadErr) {
        stages.push({
          stageName: 'B2_AUDIO_UPLOAD',
          durationMs: Date.now() - uploadStageStart,
          provider: 'Backblaze B2',
          model: 'R2/S3-Compatible Storage',
          status: 'failed',
          errorMessage: uploadErr.message
        });
        if (fs.existsSync(tempLocalPath)) {
          try { fs.unlinkSync(tempLocalPath); } catch (e) {}
        }
        await resourceService.softDeleteFile(storageKey).catch(() => {});
        throw uploadErr;
      }

      const duration = ttsResult.duration || masterDuration;

      // Clean up temporary local MP3 file
      if (fs.existsSync(tempLocalPath)) {
        try { fs.unlinkSync(tempLocalPath); } catch (e) {}
      }

      // 4. Update FileMetadata record in Authoritative Resource System
      try {
        const FileMetadata = require('../models/FileMetadata');
        await FileMetadata.findOneAndUpdate(
          { storageKey: storageKey },
          { 
            storageKey: uploadRes.storageKey,
            filePath: uploadRes.fileUrl,
            fileSizeBytes: fileSizeBytes 
          }
        );
      } catch (metaErr) {
        // Rollback R2 object if FileMetadata update fails
        await storageService.deleteObject(uploadRes.storageKey).catch(() => {});
        throw metaErr;
      }

      // 5. Update LectureAudio to completed if still present
      const exists = await LectureAudio.findById(audioRecord._id);
      if (exists) {
        exists.status = 'completed';
        exists.duration = duration;
        exists.fileSizeBytes = fileSizeBytes;
        exists.audioUrl = uploadRes.fileUrl;
        exists.storageKey = uploadRes.storageKey;
        exists.error = null;
        await exists.save();
      }

      console.log(`[AudioSynthesis] Successfully uploaded generated audio track to Cloud Storage for lecture ${lectureId} (${normTargetLang}) - Size: ${fileSizeBytes} bytes`);

      // Record successful metric
      aiPerformanceService.recordMetric({
        operationType: 'TTS_SYNTHESIS',
        logicalOperationId: logicalOpId,
        durationMs: Date.now() - ttsStartTime,
        startTime: new Date(ttsStartTime),
        endTime: new Date(),
        status: 'success',
        provider: 'Microsoft Edge TTS',
        model: 'edge-tts',
        targetLanguage: normTargetLang,
        resourceType: 'LECTURE_AUDIO',
        resourceId: audioRecord._id,
        stages: stages,
        ...(hierarchy || {})
      });

    } catch (err) {
      console.error(`[AudioSynthesis] Failed to generate audio for lecture ${lectureId}:`, err.message);
      try {
        const exists = await LectureAudio.findById(audioRecord._id);
        if (exists) {
          exists.status = 'failed';
          exists.error = err.message;
          await exists.save();
        }
      } catch (e) {}

      // Record failure metric
      aiPerformanceService.recordMetric({
        operationType: 'TTS_SYNTHESIS',
        logicalOperationId: logicalOpId,
        durationMs: Date.now() - ttsStartTime,
        startTime: new Date(ttsStartTime),
        endTime: new Date(),
        status: 'failed',
        provider: 'Microsoft Edge TTS',
        model: 'edge-tts',
        targetLanguage: normTargetLang,
        errorCategory: aiPerformanceService.categorizeError(err),
        errorMessage: err.message,
        resourceType: 'LECTURE_AUDIO',
        resourceId: audioRecord._id,
        stages: stages,
        ...(hierarchy || {})
      });
    }
  })();

  return audioRecord;
};

/**
 * Automatically trigger Speech-to-Speech generation for all supported target languages
 * Executed after lecture transcription reaches status 'completed'
 * @param {string} lectureId 
 */
const autoGenerateSpeechToSpeech = async (lectureId) => {
  const lecture = await Lecture.findById(lectureId);
  if (!lecture) return;

  const transcriptDoc = await LectureTranscript.findOne({ lecture: lectureId });
  const rawLang = transcriptDoc?.originalTranscript?.language || lecture.transcription?.language || 'Hindi';
  const sourceLang = normalizeLanguage(rawLang);

  const targetLangs = getTargetLanguages(sourceLang);
  if (targetLangs.length === 0) {
    console.log(`[AudioSynthesis] Source language '${sourceLang}' is not supported for auto TTS generation. Skipping.`);
    return;
  }

  console.log(`[AudioSynthesis] Auto-triggering Speech-to-Speech for lecture ${lectureId} (Source: ${sourceLang}, Targets: ${targetLangs.join(', ')})`);

  const uploader = await User.findById(lecture.uploadedBy);

  await Promise.allSettled(
    targetLangs.map(async (targetLang) => {
      try {
        await generateLectureAudio(lectureId, targetLang, uploader);
      } catch (err) {
        console.error(`[AudioSynthesis] Auto-generation failed for ${targetLang}:`, err.message);
      }
    })
  );
};

/**
 * Recover or resume orphaned processing records on backend startup
 */
const recoverStaleAudioGenerations = async () => {
  try {
    const STALE_PROCESSING_THRESHOLD_MS = 10 * 60 * 1000;
    const cutoff = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS);
    const staleRecords = await LectureAudio.find({
      status: 'processing',
      updatedAt: { $lt: cutoff }
    });

    if (staleRecords.length > 0) {
      console.log(`[AudioSynthesis Startup Recovery] Found ${staleRecords.length} orphaned processing records older than 10 minutes.`);
      for (const rec of staleRecords) {
        try {
          const uploader = await User.findById(rec.generatedBy);
          console.log(`[AudioSynthesis Startup Recovery] Re-starting audio generation for lecture ${rec.lecture} (${rec.language})...`);
          generateLectureAudio(rec.lecture, rec.language, uploader).catch(err => {
            console.error(`[AudioSynthesis Startup Recovery] Failed for lecture ${rec.lecture} (${rec.language}):`, err.message);
          });
        } catch (e) {
          rec.status = 'failed';
          rec.error = 'Abandoned due to server restart';
          await rec.save().catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('[AudioSynthesis Startup Recovery] Recovery check error:', err.message);
  }
};

module.exports = {
  normalizeLanguage,
  getTargetLanguages,
  createNarrationChunks,
  runPythonTTS,
  generateLectureAudio,
  autoGenerateSpeechToSpeech,
  recoverStaleAudioGenerations,
  SUPPORTED_LANGUAGES
};

