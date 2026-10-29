const fs = require('fs');
const path = require('path');
const Lecture = require('../models/Lecture');
const LectureAudio = require('../models/LectureAudio');
const LectureTranscript = require('../models/LectureTranscript');
const FileMetadata = require('../models/FileMetadata');
const { generateLectureAudio, normalizeLanguage, SUPPORTED_LANGUAGES } = require('../services/audioSynthesisService');
const resourceService = require('../services/resourceService');
const { isStudentEnrolledInCourse } = require('../utils/enrollmentHelper');

/**
 * Generate translated audio for a lecture
 * @route POST /api/lectures/:lectureId/audio/generate
 */
exports.generateAudio = async (req, res, next) => {
  try {
    const { lectureId } = req.params;
    const { targetLanguage } = req.body;

    if (!targetLanguage) {
      return res.status(400).json({ message: 'targetLanguage is required' });
    }

    const normTargetLang = normalizeLanguage(targetLanguage);
    if (!SUPPORTED_LANGUAGES.includes(normTargetLang)) {
      return res.status(400).json({ message: `Language '${targetLanguage}' is not supported in V1. Supported: English, Hindi, Gujarati` });
    }

    const lecture = await Lecture.findById(lectureId);
    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Tenant / Owner RBAC Authorization
    if (req.user.role === 'professor' && lecture.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only generate audio for your own lectures.' });
    } else if (req.user.role === 'dept_admin') {
      const Course = require('../models/Course');
      const course = await Course.findById(lecture.course);
      if (!course || course.department.toString() !== (req.user.department?._id || req.user.department).toString()) {
        return res.status(403).json({ message: 'Access denied. You can only manage lectures in your department.' });
      }
    }

    const sourceLang = normalizeLanguage(lecture.transcription?.language || 'English');
    if (sourceLang === normTargetLang) {
      return res.status(400).json({ message: `Lecture source language is already ${normTargetLang}` });
    }

    // Trigger audio generation
    const audioTrack = await generateLectureAudio(lectureId, normTargetLang, req.user);

    res.status(202).json({
      message: audioTrack.status === 'completed' ? 'Audio track is ready' : 'Audio generation started',
      audioTrack
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available translated audio tracks for a lecture
 * @route GET /api/lectures/:lectureId/audio
 */
exports.getAudioTracks = async (req, res, next) => {
  try {
    const { lectureId } = req.params;

    const lecture = await Lecture.findById(lectureId);
    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Student Enrollment Authorization Check
    if (req.user && req.user.role === 'student') {
      const enrolled = await isStudentEnrolledInCourse(req.user._id, lecture.course, req.user);
      if (!enrolled) {
        return res.status(403).json({ message: 'Access denied. You are not enrolled in this course.' });
      }
    }

    const transcriptDoc = await LectureTranscript.findOne({ lecture: lectureId });
    const sourceLanguage = normalizeLanguage(transcriptDoc?.originalTranscript?.language || lecture.transcription?.language || 'Hindi');

    const audioTracks = await LectureAudio.find({ lecture: lectureId });
    const storageService = require('../services/storageService');

    const signedAudioTracks = await Promise.all(
      audioTracks.map(async (t) => {
        const tObj = t.toObject ? t.toObject() : t;
        const signedUrl = await storageService.getSignedUrl(tObj.storageKey || tObj.audioUrl, 3600, req.user);
        return {
          _id: tObj._id,
          language: tObj.language,
          status: tObj.status,
          audioUrl: signedUrl || tObj.audioUrl,
          duration: tObj.duration,
          fileSizeBytes: tObj.fileSizeBytes,
          error: tObj.error,
          createdAt: tObj.createdAt
        };
      })
    );

    res.json({
      lectureId,
      sourceLanguage,
      audioTracks: signedAudioTracks
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete translated audio track for a lecture
 * @route DELETE /api/lectures/:lectureId/audio/:language
 */
exports.deleteAudio = async (req, res, next) => {
  try {
    const { lectureId, language } = req.params;
    const normLang = normalizeLanguage(language);

    const lecture = await Lecture.findById(lectureId);
    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Authorization check
    if (req.user.role === 'professor' && lecture.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only delete audio for your own lectures.' });
    }

    const audioTrack = await LectureAudio.findOne({ lecture: lectureId, language: normLang });
    if (!audioTrack) {
      return res.status(404).json({ message: 'Audio track not found' });
    }

    // Soft-delete FileMetadata record to reclaim storage
    if (audioTrack.storageKey) {
      const fileMeta = await FileMetadata.findOne({ storageKey: audioTrack.storageKey, isDeleted: { $ne: true } });
      if (fileMeta) {
        await resourceService.deleteFile(audioTrack.storageKey);
      }
      // Unlink physical file if present on disk
      const physicalPath = path.join(__dirname, '..', 'uploads', audioTrack.storageKey);
      if (fs.existsSync(physicalPath)) {
        try { fs.unlinkSync(physicalPath); } catch (e) {}
      }
    }

    await LectureAudio.findByIdAndDelete(audioTrack._id);

    res.json({ message: `Translated ${normLang} audio deleted successfully` });
  } catch (error) {
    next(error);
  }
};
