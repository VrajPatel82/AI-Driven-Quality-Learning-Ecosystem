const LectureTranscript = require('../models/LectureTranscript');
const Lecture = require('../models/Lecture');
const User = require('../models/User');
const Course = require('../models/Course');
const { generateTranscriptPDF, translateTranscript, translateSegments } = require('../services/transcriptProcessingService');
const fs = require('fs');
const path = require('path');

/**
 * Get transcript with optional translation
 * @route GET /api/transcripts/:lectureId
 */
exports.getTranscript = async (req, res, next) => {
  try {
    const { lectureId } = req.params;
    const { language } = req.query;

    let transcript = await LectureTranscript.findOne({ lecture: lectureId });

    const lecture = await Lecture.findById(lectureId)
      .select('title description course uploadedBy transcription languageAnalysis createdAt')
      .populate('course', 'name')
      .populate('uploadedBy', 'name');

    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Fallback: If LectureTranscript record is missing, but Lecture model has completed transcription, self-heal
    if (!transcript) {
      if (lecture.transcription?.status === 'completed' && lecture.transcription?.text) {
        console.log(`[Transcript] Self-healing missing LectureTranscript doc for lecture ${lectureId}...`);
        const { normalizeLanguage } = require('../services/audioSynthesisService');
        const normLang = normalizeLanguage(lecture.transcription.language || 'Hindi');
        transcript = new LectureTranscript({
          lecture: lectureId,
          originalTranscript: {
            text: lecture.transcription.text,
            language: normLang,
            segments: lecture.transcription.segments || []
          },
          languagePercentages: lecture.languageAnalysis || {},
          status: 'transcribed'
        });
        await transcript.save();
      } else if (lecture.transcription?.status === 'processing') {
        return res.json({
          lectureId,
          title: lecture.title,
          course: lecture.course?.name,
          professor: lecture.uploadedBy?.name,
          status: 'processing',
          message: 'Transcription is currently in progress. Please refresh in a moment.',
          segments: []
        });
      } else {
        return res.status(404).json({ message: 'Transcript not found for this lecture' });
      }
    }

    const { normalizeLanguage } = require('../services/audioSynthesisService');
    let originalLang = normalizeLanguage(transcript.originalTranscript?.language || 'Hindi');

    // Auto-correct stale originalTranscript.language mislabeling if segments contain Devanagari text
    const origSampleText = (transcript.originalTranscript?.segments || []).slice(0, 10).map(s => s.text).join(' ');
    const origDevanagariCount = (origSampleText.match(/[\u0900-\u097F]/g) || []).length;
    if (originalLang === 'English' && origDevanagariCount > 10) {
      console.warn(`[Transcript] originalTranscript.language mislabeled as English for Hindi text. Auto-correcting to Hindi...`);
      originalLang = 'Hindi';
      transcript.originalTranscript.language = 'Hindi';
      await transcript.save();
      await Lecture.findByIdAndUpdate(lectureId, {
        language: 'Hindi',
        teachingLanguage: 'Hindi',
        'transcription.language': 'Hindi'
      });
    }

    // Determine student's target language preference
    let targetLanguage = originalLang;
    if (language) {
      targetLanguage = normalizeLanguage(language);
    } else if (req.user && req.user.role === 'student') {
      const student = await User.findById(req.user._id).select('preferredLanguage');
      if (student?.preferredLanguage) {
        targetLanguage = normalizeLanguage(student.preferredLanguage);
      }
    }

    // Build response structure
    const response = {
      lectureId,
      title: lecture.title,
      course: lecture.course?.name,
      professor: lecture.uploadedBy?.name,
      originalLanguage: originalLang,
      currentLanguage: targetLanguage,
      segments: [],
      languagePercentages: transcript.languagePercentages,
      translationStatus: transcript.status
    };

    console.log(`[Transcript] Lecture Original language: ${originalLang}, Target requested: ${targetLanguage}`);

    // If target language is the same as the original transcript language, return original
    if (targetLanguage === originalLang) {
      console.log(`[Transcript] Returning original transcript (${originalLang})`);
      response.segments = transcript.originalTranscript?.segments || [];
      response.isOriginal = true;
    } else {
      // Target language requires translation
      let translationIndex = transcript.translations.findIndex(t => normalizeLanguage(t.language) === targetLanguage);
      let translation = translationIndex >= 0 ? transcript.translations[translationIndex] : null;

      // Validate cached translation if present (Stale / Invalid Cache Check)
      let isStaleOrInvalid = false;
      if (translation && translation.segments && translation.segments.length > 0) {
        const sampleText = translation.segments.slice(0, 10).map(s => s.text).join(' ');
        
        if (targetLanguage === 'English') {
          const devanagariCount = (sampleText.match(/[\u0900-\u097F]/g) || []).length;
          if (devanagariCount > 10) {
            console.warn(`[Transcript] Stale invalid translation cache detected for English (contains Devanagari text). Purging and regenerating...`);
            isStaleOrInvalid = true;
          }
        } else if (targetLanguage === 'Hindi') {
          const devanagariCount = (sampleText.match(/[\u0900-\u097F]/g) || []).length;
          if (devanagariCount === 0 && sampleText.length > 50) {
            console.warn(`[Transcript] Invalid translation cache detected for Hindi (lacks Devanagari text). Purging and regenerating...`);
            isStaleOrInvalid = true;
          }
        } else if (targetLanguage === 'Gujarati') {
          const gujaratiCount = (sampleText.match(/[\u0A80-\u0AFF]/g) || []).length;
          if (gujaratiCount === 0 && sampleText.length > 50) {
            console.warn(`[Transcript] Invalid translation cache detected for Gujarati (lacks Gujarati text). Purging and regenerating...`);
            isStaleOrInvalid = true;
          }
        }
      } else {
        isStaleOrInvalid = true;
      }

      if (isStaleOrInvalid) {
        if (translationIndex >= 0) {
          transcript.translations.splice(translationIndex, 1);
        }

        try {
          console.log(`[Transcript] Generating high-fidelity translation ${originalLang} → ${targetLanguage}`);
          
          if (req.user) {
            const resourceService = require('../services/resourceService');
            await resourceService.checkAndConsumeMeteredAIQuota({
              user: req.user._id,
              operationType: 'TRANSLATION',
              quantity: 1,
              relatedEntityType: 'LECTURE',
              relatedEntityId: lectureId
            });
          }

          const translatedSegments = await translateSegments(
            transcript.originalTranscript.segments,
            targetLanguage,
            originalLang,
            { title: lecture.title, description: lecture.description || 'Lecture' }
          );
          
          console.log(`[Transcript] Translation completed. Got ${translatedSegments.length} segments`);
          
          const fullText = translatedSegments.map(s => s.text).join(' ');
          translation = {
            language: targetLanguage,
            text: fullText,
            segments: translatedSegments,
            translatedAt: new Date()
          };

          transcript.translations.push(translation);
          await transcript.save();
          console.log(`[Transcript] Translation saved to database`);
        } catch (err) {
          console.error(`[Transcript] Auto-translation FAILED:`, err.message);
        }
      }
      
      if (translation && translation.segments && translation.segments.length > 0) {
        console.log(`[Transcript] Returning ${translation.segments.length} translated segments in ${targetLanguage}`);
        response.segments = translation.segments;
        response.translatedAt = translation.translatedAt;
        response.isOriginal = false;
      } else {
        // Translation unavailable: NEVER return original raw Hindi text as English!
        console.warn(`[Transcript] Translation unavailable for ${targetLanguage}. Returning empty array instead of wrong language.`);
        response.segments = [];
        response.isOriginal = false;
        response.message = `Translation to ${targetLanguage} is currently being processed.`;
      }
    }

    // Get available PDFs
    response.pdfFiles = transcript.pdfFiles.map(pdf => ({
      language: pdf.language,
      downloadUrl: `/api/transcripts/${lectureId}/pdf/${pdf.language}`,
      generatedAt: pdf.generatedAt
    }));

    res.json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Translate transcript to a specific language
 * @route POST /api/transcripts/:lectureId/translate
 */
exports.translateTranscript = async (req, res, next) => {
  try {
    const { lectureId } = req.params;
    const { targetLanguage } = req.body;
    const { normalizeLanguage } = require('../services/audioSynthesisService');

    const normTargetLang = normalizeLanguage(targetLanguage);
    if (!['English', 'Hindi', 'Gujarati'].includes(normTargetLang)) {
      return res.status(400).json({ message: 'Invalid target language' });
    }

    let transcript = await LectureTranscript.findOne({ lecture: lectureId });
    if (!transcript) {
      return res.status(404).json({ message: 'Transcript not found' });
    }

    const originalLang = normalizeLanguage(transcript.originalTranscript?.language || 'Hindi');

    if (normTargetLang === originalLang) {
      return res.json({
        message: 'Original transcript language requested',
        translation: {
          language: originalLang,
          text: transcript.originalTranscript.text,
          segments: transcript.originalTranscript.segments
        }
      });
    }

    // Check if translation already exists
    const existingTranslation = transcript.translations.find(t => normalizeLanguage(t.language) === normTargetLang);
    if (existingTranslation) {
      return res.json({
        message: 'Translation already exists',
        translation: existingTranslation
      });
    }

    // Get lecture details for PDF generation
    const lecture = await Lecture.findById(lectureId)
      .select('title createdAt')
      .populate('course', 'name')
      .populate('uploadedBy', 'name');

    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Generate PDF for original transcript if not already done
    try {
      const hasOriginalPDF = transcript.pdfFiles.find(p => p.isOriginal && p.language === 'English');
      if (!hasOriginalPDF) {
        console.log('[Transcript] Generating PDF for original transcript...');
        const originalPdfResult = await generateTranscriptPDF(
          lecture.title,
          lecture.course.name,
          lecture.uploadedBy.name,
          new Date(lecture.createdAt).toLocaleDateString(),
          transcript.originalTranscript.segments,
          'English',
          null,
          { uploaderId: lecture.uploadedBy?._id || lecture.uploadedBy, lectureId: lecture._id }
        );

        transcript.pdfFiles.push({
          language: 'English',
          path: originalPdfResult.path,
          filename: originalPdfResult.filename,
          isOriginal: true,
          generatedAt: new Date()
        });

        console.log('[Transcript] Original PDF generated and saved');
      }
    } catch (pdfError) {
      console.error('[Transcript] Original PDF generation failed:', pdfError.message);
    }

    // Translate full text using Gemini
    console.log(`[Transcript] Starting translation of full text to ${targetLanguage}...`);
    let translatedText;
    try {
      translatedText = await translateTranscript(
        transcript.originalTranscript.text,
        targetLanguage
      );
      console.log(`[Transcript] Full text translated to ${targetLanguage}`);
    } catch (translateError) {
      console.error(`[Transcript] Translation failed:`, translateError.message);
      return res.status(500).json({ 
        message: `Translation failed: ${translateError.message}`,
        error: translateError.message
      });
    }

    // Translate segments using Gemini
    console.log(`[Transcript] Starting segment translation to ${targetLanguage}...`);
    let translatedSegments;
    try {
      translatedSegments = await translateSegments(
        transcript.originalTranscript.segments,
        targetLanguage
      );
      console.log(`[Transcript] ${translatedSegments.length} segments translated to ${targetLanguage}`);
    } catch (segmentError) {
      console.error(`[Transcript] Segment translation failed:`, segmentError.message);
      return res.status(500).json({ 
        message: `Segment translation failed: ${segmentError.message}`,
        error: segmentError.message
      });
    }

    // Save translation
    console.log(`[Transcript] Saving translation to database...`);
    transcript.translations.push({
      language: targetLanguage,
      text: translatedText,
      segments: translatedSegments,
      translatedAt: new Date()
    });

    transcript.status = 'translated';
    await transcript.save();
    console.log(`[Transcript] Translation saved to database`);

    // Generate PDF for translated transcript
    try {
      console.log(`[Transcript] Generating PDF for ${targetLanguage} translation...`);
      const pdfResult = await generateTranscriptPDF(
        lecture.title,
        lecture.course.name,
        lecture.uploadedBy.name,
        new Date(lecture.createdAt).toLocaleDateString(),
        translatedSegments,
        targetLanguage,
        null,
        { uploaderId: lecture.uploadedBy?._id || lecture.uploadedBy, lectureId: lecture._id }
      );

      transcript.pdfFiles.push({
        language: targetLanguage,
        path: pdfResult.path,
        filename: pdfResult.filename,
        isOriginal: false,
        generatedAt: new Date()
      });

      await transcript.save();
      console.log(`[Transcript] ${targetLanguage} PDF generated and saved`);
    } catch (pdfError) {
      console.error('[Transcript] Translated PDF generation failed:', pdfError.message);
      // Continue without PDF - translation still succeeded
    }

    res.json({
      message: 'Translation completed successfully',
      translation: {
        language: targetLanguage,
        text: translatedText,
        segments: translatedSegments,
        translatedAt: new Date()
      },
      pdfGenerated: true,
      downloadUrl: `/api/transcripts/${lectureId}/pdf/${targetLanguage}`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Download transcript PDF
 * @route GET /api/transcripts/:lectureId/pdf/:language
 */
exports.downloadTranscriptPDF = async (req, res, next) => {
  try {
    const { lectureId, language } = req.params;

    const transcript = await LectureTranscript.findOne({ lecture: lectureId });
    if (!transcript) {
      return res.status(404).json({ message: 'Transcript not found' });
    }

    const pdfFile = transcript.pdfFiles.find(p => p.language === language);
    if (!pdfFile) {
      return res.status(404).json({ message: `PDF not available for ${language}` });
    }

    const targetKey = pdfFile.filename || pdfFile.path;
    const storageService = require('../services/storageService');

    // Check if file is legacy local file in uploads folder
    if (pdfFile.path && pdfFile.path.startsWith('/uploads/')) {
      const filepath = path.join(__dirname, '..', pdfFile.path);
      if (fs.existsSync(filepath)) {
        return res.download(filepath, `transcript_${language}.pdf`);
      }
    }

    try {
      const { stream, contentType, contentLength } = await storageService.getObjectStream(targetKey);
      res.setHeader('Content-Type', contentType || 'application/pdf');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      res.setHeader('Content-Disposition', `attachment; filename="transcript_${language}.pdf"`);
      return stream.pipe(res);
    } catch (err) {
      return res.status(404).json({ message: 'PDF file not found in storage' });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Get available languages for a transcript
 * @route GET /api/transcripts/:lectureId/languages
 */
exports.getAvailableLanguages = async (req, res, next) => {
  try {
    const { lectureId } = req.params;

    let transcript = await LectureTranscript.findOne({ lecture: lectureId });
    if (!transcript) {
      const lecture = await Lecture.findById(lectureId);
      if (lecture?.transcription?.status === 'completed' && lecture?.transcription?.text) {
        const { normalizeLanguage } = require('../services/audioSynthesisService');
        const normLang = normalizeLanguage(lecture.transcription.language || 'Hindi');
        transcript = new LectureTranscript({
          lecture: lectureId,
          originalTranscript: {
            text: lecture.transcription.text,
            language: normLang,
            segments: lecture.transcription.segments || []
          },
          languagePercentages: lecture.languageAnalysis || {},
          status: 'transcribed'
        });
        await transcript.save();
      } else {
        return res.status(404).json({ message: 'Transcript not found' });
      }
    }

    const { normalizeLanguage } = require('../services/audioSynthesisService');
    let originalLang = normalizeLanguage(transcript.originalTranscript?.language || 'Hindi');
    const origSampleText = (transcript.originalTranscript?.segments || []).slice(0, 10).map(s => s.text).join(' ');
    if (originalLang === 'English' && (origSampleText.match(/[\u0900-\u097F]/g) || []).length > 10) {
      originalLang = 'Hindi';
    }

    const availableLanguages = ['English', 'Hindi', 'Gujarati'].map(lang => {
      const isOriginal = lang === originalLang;
      const translation = transcript.translations.find(t => normalizeLanguage(t.language) === lang);
      return {
        name: lang,
        available: true,
        translated: !isOriginal && !!translation && translation.segments?.length > 0,
        isOriginal,
        translatedAt: translation?.translatedAt || null
      };
    });

    res.json({
      lectureId,
      languages: availableLanguages,
      originalLanguage: originalLang,
      status: transcript.status
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update student preferred language
 * @route PUT /api/transcripts/student/preferred-language
 */
exports.updatePreferredLanguage = async (req, res, next) => {
  try {
    const { preferredLanguage } = req.body;

    if (!['English', 'Hindi', 'Gujarati'].includes(preferredLanguage)) {
      return res.status(400).json({ message: 'Invalid language' });
    }

    const student = await User.findByIdAndUpdate(
      req.user._id,
      { preferredLanguage },
      { new: true }
    ).select('preferredLanguage name email');

    res.json({
      message: 'Preferred language updated',
      preferredLanguage: student.preferredLanguage
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get student preferred language
 * @route GET /api/transcripts/student/preferred-language
 */
exports.getPreferredLanguage = async (req, res, next) => {
  try {
    const student = await User.findById(req.user._id).select('preferredLanguage');
    res.json({
      preferredLanguage: student?.preferredLanguage || 'English'
    });
  } catch (error) {
    next(error);
  }
};
