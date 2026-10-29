const mongoose = require('mongoose');
const Lecture = require('../models/Lecture');
const path = require('path');
const fs = require('fs');
const { paginate } = require('../utils/pagination');
const { isTranscribable, transcribeLectureAsync } = require('../services/transcription');

const cleanupTempFiles = (files = []) => {
  for (const f of files) {
    if (f && f.path && fs.existsSync(f.path)) {
      try { fs.unlinkSync(f.path); } catch (e) {}
    }
  }
};

// @desc    Get all lectures (with filters & pagination)
// @route   GET /api/lectures?page=1&limit=20&course=id&semester=3&type=lecture&search=keyword&fileType=pdf&uploadedAfter=date&uploadedBy=id
// @desc    Get all lectures (with filters & pagination)
// @route   GET /api/lectures?page=1&limit=20&course=id&semester=3&type=lecture&search=keyword&fileType=pdf&uploadedAfter=date&uploadedBy=id
exports.getAllLectures = async (req, res, next) => {
  try {
    const { course, semester, type, search, fileType, uploadedAfter, uploadedBy, department, page, limit } = req.query;
    const filter = {};

    // For students, lecture access MUST be restricted to enrolled courses ONLY
    if (req.user && req.user.role === 'student') {
      const { getStudentEnrolledCourseIds } = require('../utils/enrollmentHelper');
      const enrolledCourseIds = await getStudentEnrolledCourseIds(req.user._id, req.user);
      if (enrolledCourseIds.length === 0) {
        return res.json({
          data: [],
          pagination: { total: 0, totalItems: 0, currentPage: 1, totalPages: 0, limit: parseInt(limit) || 20, hasNextPage: false, hasPrevPage: false }
        });
      }

      if (course) {
        const requestedIds = course.split(',').map(id => id.trim());
        const validIds = requestedIds.filter(id => enrolledCourseIds.includes(id));
        if (validIds.length === 0) {
          return res.json({
            data: [],
            pagination: { total: 0, totalItems: 0, currentPage: 1, totalPages: 0, limit: parseInt(limit) || 20, hasNextPage: false, hasPrevPage: false }
          });
        }
        filter.course = { $in: validIds.map(id => new mongoose.Types.ObjectId(id)) };
      } else {
        filter.course = { $in: enrolledCourseIds.map(id => new mongoose.Types.ObjectId(id)) };
      }
    } else if (req.user && req.user.role === 'university_admin') {
      const uniId = req.user.university?._id || req.user.university;
      const Institution = require('../models/Institution');
      const Department = require('../models/Department');
      const Course = require('../models/Course');
      const insts = uniId ? await Institution.find({ university: uniId }).select('_id') : [];
      const depts = insts.length ? await Department.find({ institution: { $in: insts.map(i => i._id) } }).select('_id') : [];
      const uniCourses = depts.length ? await Course.find({ department: { $in: depts.map(d => d._id) } }).select('_id') : [];
      const uniCourseIds = uniCourses.map(c => c._id);
      if (course) {
        const requestedIds = course.split(',').map(id => id.trim());
        const validIds = requestedIds.filter(id => uniCourseIds.some(cid => cid.toString() === id));
        filter.course = { $in: validIds.map(id => new mongoose.Types.ObjectId(id)) };
      } else {
        filter.course = { $in: uniCourseIds };
      }
    } else if (course) {
      const courseIds = course.split(',').map(id => id.trim());
      if (courseIds.length === 1) {
        filter.course = new mongoose.Types.ObjectId(courseIds[0]);
      } else {
        filter.course = { $in: courseIds.map(id => new mongoose.Types.ObjectId(id)) };
      }
    }

    if (semester) filter.semester = parseInt(semester);
    if (type && ['lecture', 'lab'].includes(type)) filter.type = type;
    if (fileType) filter.fileType = fileType;
    if (uploadedBy) filter.uploadedBy = new mongoose.Types.ObjectId(uploadedBy);
    if (uploadedAfter) filter.createdAt = { $gte: new Date(uploadedAfter) };

    if (department && (!req.user || req.user.role !== 'student')) {
      const Course = require('../models/Course');
      const courses = await Course.find({ department: new mongoose.Types.ObjectId(department) }).select('_id');
      filter.course = { $in: courses.map(c => c._id) };
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { experimentTitle: { $regex: search, $options: 'i' } }
      ];
    }

    const result = await paginate(Lecture, filter, { page, limit }, [
      { path: 'course', select: 'name code' },
      { path: 'uploadedBy', select: 'name email' }
    ]);

    res.json({
      data: result.data,
      pagination: { total: result.pagination.totalItems, ...result.pagination }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get content accessible to student (filtered by enrolled courses)
// @route   GET /api/lectures/student/content?type=lecture&page=1&limit=20
exports.getContentByStudent = async (req, res, next) => {
  try {
    const User = require('../models/User');
    const { getStudentEnrolledCourseIds } = require('../utils/enrollmentHelper');
    const { type, course, semester, search, page = 1, limit = 20 } = req.query;
    
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const filter = {};
    const enrolledCourseIds = await getStudentEnrolledCourseIds(req.user._id, user);

    if (enrolledCourseIds.length === 0) {
      return res.json({
        currentSemester: user.currentSemester,
        data: [],
        pagination: { total: 0, totalItems: 0, currentPage: 1, totalPages: 0, limit: parseInt(limit) || 20, hasNextPage: false, hasPrevPage: false }
      });
    }

    if (course) {
      const requestedIds = course.split(',').map(id => id.trim());
      const validIds = requestedIds.filter(id => enrolledCourseIds.includes(id));
      if (validIds.length === 0) {
        return res.json({
          currentSemester: user.currentSemester,
          data: [],
          pagination: { total: 0, totalItems: 0, currentPage: 1, totalPages: 0, limit: parseInt(limit) || 20, hasNextPage: false, hasPrevPage: false }
        });
      }
      filter.course = { $in: validIds.map(id => new mongoose.Types.ObjectId(id)) };
    } else {
      filter.course = { $in: enrolledCourseIds.map(id => new mongoose.Types.ObjectId(id)) };
    }

    if (semester) filter.semester = parseInt(semester);

    if (type && ['lecture', 'lab'].includes(type)) {
      filter.type = type;
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { experimentTitle: { $regex: search, $options: 'i' } }
      ];
    }

    const result = await paginate(Lecture, filter, { page, limit }, [
      { path: 'course', select: 'name code' },
      { path: 'uploadedBy', select: 'name email' }
    ]);

    res.json({
      currentSemester: user.currentSemester,
      data: result.data,
      pagination: { total: result.pagination.totalItems, ...result.pagination }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get lecture by ID
// @route   GET /api/lectures/:id
exports.getLectureById = async (req, res, next) => {
  try {
    const lecture = await Lecture.findById(req.params.id)
      .populate('course', 'name code')
      .populate('uploadedBy', 'name email');

    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    if (req.user && req.user.role === 'student') {
      const { isStudentEnrolledInCourse } = require('../utils/enrollmentHelper');
      const courseId = lecture.course?._id || lecture.course;
      const enrolled = await isStudentEnrolledInCourse(req.user._id, courseId, req.user);
      if (!enrolled) {
        return res.status(403).json({ message: 'Access denied. You are not enrolled in this course.' });
      }
    }

    const storageService = require('../services/storageService');
    const lectureObj = lecture.toObject();
    if (lectureObj.fileUrl) {
      lectureObj.fileUrl = await storageService.getSignedUrl(lectureObj.fileKey || lectureObj.fileUrl, 3600, req.user);
    }

    res.json({
      success: true,
      data: lectureObj
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create lecture
// @route   POST /api/lectures
exports.createLecture = async (req, res, next) => {
  try {
    console.log('========== BACKEND UPLOAD DEBUG ==========');
    console.log('req.headers[content-type]:', req.headers['content-type']);
    console.log('req.file:', req.file);
    console.log('req.files:', req.files);
    console.log('req.files.file:', req.files?.file);
    console.log('req.files.attachment:', req.files?.attachment);
    console.log('req.body:', req.body);
    console.log('==========================================');

    const { title, description, type = 'lecture', subject, experimentTitle, course, semester, language } = req.body;

    const mainFile = req.files?.file ? req.files.file[0] : (req.file || null);
    const attachmentFile = req.files?.attachment ? req.files.attachment[0] : null;

    // Validate required fields
    if (!title) return res.status(400).json({ message: 'Title is required' });
    if (!course) return res.status(400).json({ message: 'Course is required' });
    if (!semester) return res.status(400).json({ message: 'Semester is required' });
    if (!mainFile) return res.status(400).json({ message: 'Please upload a primary file (Video, Audio, or PDF)' });

    // Authoritative Pre-Upload Storage Capacity Check
    const resourceService = require('../services/resourceService');
    const storageService = require('../services/storageService');
    const totalIncomingBytes = (mainFile?.size || 0) + (attachmentFile?.size || 0);
    if (totalIncomingBytes > 0) {
      await resourceService.checkUserUploadCapacity(req.user._id, totalIncomingBytes);
    }

    // Upload main file to Cloud Storage (R2 / Storage Service)
    const mainUploadRes = await storageService.uploadObject({
      fileBuffer: mainFile.buffer,
      filePath: mainFile.path,
      fileName: mainFile.originalname,
      mimeType: mainFile.mimetype,
      folder: 'lectures'
    });

    let attachUploadRes = null;
    if (attachmentFile) {
      try {
        attachUploadRes = await storageService.uploadObject({
          fileBuffer: attachmentFile.buffer,
          filePath: attachmentFile.path,
          fileName: attachmentFile.originalname,
          mimeType: attachmentFile.mimetype,
          folder: 'lectures/attachments'
        });
      } catch (attachErr) {
        // Rollback main upload if attachment upload fails
        await storageService.deleteObject(mainUploadRes.storageKey);
        throw attachErr;
      }
    }

    // Determine file type
    const ext = path.extname(mainFile.originalname).toLowerCase();
    let fileType = 'document';
    if (ext === '.pdf') fileType = 'pdf';
    else if (['.mp4', '.webm', '.mov', '.mkv', '.avi', '.flv'].includes(ext)) fileType = 'video';
    else if (['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.mpeg', '.mpga'].includes(ext)) fileType = 'audio';

    // Check if file is transcribable
    const canTranscribe = isTranscribable(mainFile.originalname);

    const { normalizeLanguage } = require('../services/audioSynthesisService');
    const normLang = normalizeLanguage(language || 'en');

    const lectureData = {
      title,
      description,
      type: type === 'lab' ? 'lab' : 'lecture',
      fileUrl: mainUploadRes.fileUrl,
      fileType,
      fileName: mainFile.originalname,
      fileKey: mainUploadRes.storageKey,
      attachmentUrl: attachUploadRes ? attachUploadRes.fileUrl : undefined,
      attachmentName: attachmentFile ? attachmentFile.originalname : undefined,
      course,
      uploadedBy: req.user._id,
      semester: parseInt(semester),
      language: normLang,
      teachingLanguage: normLang,
      transcription: {
        status: canTranscribe ? 'processing' : 'none'
      }
    };

    // Add type-specific fields
    if (type === 'lab') {
      if (!subject) return res.status(400).json({ message: 'Subject is required for labs' });
      lectureData.subject = subject;
      if (experimentTitle) lectureData.experimentTitle = experimentTitle;
    }

    let lecture = null;
    try {
      lecture = await Lecture.create(lectureData);

      await lecture.populate('course', 'name code');
      await lecture.populate('uploadedBy', 'name email');

      // Register FileMetadata in Authoritative Resource Service
      const User = require('../models/User');
      const userDoc = await User.findById(req.user._id);

      if (mainFile && userDoc) {
        await resourceService.registerFile({
          institution: userDoc.institution,
          department: userDoc.department,
          owner: req.user._id,
          fileName: mainFile.originalname,
          storageKey: mainUploadRes.storageKey,
          filePath: mainUploadRes.fileUrl,
          fileSizeBytes: mainUploadRes.fileSizeBytes,
          relatedEntityType: type === 'lab' ? 'LAB' : 'LECTURE',
          relatedEntityId: lecture._id
        });
      }

      if (attachmentFile && attachUploadRes && userDoc) {
        await resourceService.registerFile({
          institution: userDoc.institution,
          department: userDoc.department,
          owner: req.user._id,
          fileName: attachmentFile.originalname,
          storageKey: attachUploadRes.storageKey,
          filePath: attachUploadRes.fileUrl,
          fileSizeBytes: attachUploadRes.fileSizeBytes,
          relatedEntityType: 'LECTURE_MATERIAL',
          relatedEntityId: lecture._id
        });
      }
    } catch (createErr) {
      // Rollback uploaded cloud objects if DB record or metadata registration fails
      if (mainUploadRes?.storageKey) {
        await storageService.deleteObject(mainUploadRes.storageKey).catch(() => {});
      }
      if (attachUploadRes?.storageKey) {
        await storageService.deleteObject(attachUploadRes.storageKey).catch(() => {});
      }
      if (lecture?._id) {
        await Lecture.findByIdAndDelete(lecture._id).catch(() => {});
      }
      throw createErr;
    }

    // Trigger transcription asynchronously (don't block the response)
    if (canTranscribe && mainFile) {
      transcribeLectureAsync(lecture._id, mainUploadRes.storageKey)
        .catch(err => console.error('Background transcription error:', err.message));
    } else if (!mainFile && isTranscribable(lectureData.fileName || '')) {
      console.log(`[Lecture] Lecture has external URL, skipping transcription: ${lecture._id}`);
    }

    res.status(201).json({ lecture, message: 'Content uploaded successfully' });
  } catch (error) {
    next(error);
  } finally {
    const mainFile = req.files?.file ? req.files.file[0] : (req.file || null);
    const attachmentFile = req.files?.attachment ? req.files.attachment[0] : null;
    cleanupTempFiles([mainFile, attachmentFile]);
  }
};

// @desc    Update lecture
// @route   PUT /api/lectures/:id
exports.updateLecture = async (req, res, next) => {
  try {
    let lecture = await Lecture.findById(req.params.id);

    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Only the uploader or admin can update
    if (lecture.uploadedBy.toString() !== req.user._id.toString() &&
        !['dept_admin', 'inst_admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized to update this lecture' });
    }

    const updates = {};
    if (req.body.title) updates.title = req.body.title;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.course) updates.course = req.body.course;
    if (req.body.semester) updates.semester = parseInt(req.body.semester);
    if (req.body.subject) updates.subject = req.body.subject;
    if (req.body.experimentTitle) updates.experimentTitle = req.body.experimentTitle;

    const resourceService = require('../services/resourceService');
    const storageService = require('../services/storageService');
    const User = require('../models/User');
    const userDoc = await User.findById(req.user._id);

    // If new main file or attachment uploaded, check user capacity
    if (req.files?.file || req.files?.attachment) {
      const mainFile = req.files?.file ? req.files.file[0] : null;
      const attachmentFile = req.files?.attachment ? req.files.attachment[0] : null;
      const totalIncomingBytes = (mainFile?.size || 0) + (attachmentFile?.size || 0);
      if (totalIncomingBytes > 0) {
        await resourceService.checkUserUploadCapacity(req.user._id, totalIncomingBytes);
      }
    }

    // If new main file uploaded
    let newMainUploadRes = null;
    if (req.files?.file) {
      const mainFile = req.files.file[0];
      // Soft-delete old FileMetadata to reclaim space
      const oldKey = lecture.fileKey || path.basename(lecture.fileUrl || '');
      if (oldKey) {
        await resourceService.softDeleteFile(oldKey);
        await storageService.deleteObject(oldKey);
      }

      newMainUploadRes = await storageService.uploadObject({
        fileBuffer: mainFile.buffer,
        filePath: mainFile.path,
        fileName: mainFile.originalname,
        mimeType: mainFile.mimetype,
        folder: 'lectures'
      });

      updates.fileUrl = newMainUploadRes.fileUrl;
      updates.fileName = mainFile.originalname;
      updates.fileKey = newMainUploadRes.storageKey;

      // Register new FileMetadata
      if (userDoc) {
        await resourceService.registerFile({
          institution: userDoc.institution,
          department: userDoc.department,
          owner: req.user._id,
          fileName: mainFile.originalname,
          storageKey: newMainUploadRes.storageKey,
          filePath: newMainUploadRes.fileUrl,
          fileSizeBytes: newMainUploadRes.fileSizeBytes,
          relatedEntityType: lecture.type === 'lab' ? 'LAB' : 'LECTURE',
          relatedEntityId: lecture._id
        });
      }

      const ext = path.extname(mainFile.originalname).toLowerCase();
      updates.fileType = ext === '.pdf' ? 'pdf' :
        ['.mp4', '.webm', '.mov'].includes(ext) ? 'video' :
        ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.mpeg', '.mpga'].includes(ext) ? 'audio' : 'document';

      // Re-trigger transcription if the new file is transcribable
      if (isTranscribable(mainFile.originalname)) {
        updates.transcription = { status: 'processing', text: '', segments: [], error: null };
      } else {
        updates.transcription = { status: 'none', text: '', segments: [] };
      }
    }

    // If new attachment uploaded
    if (req.files?.attachment) {
      const attachmentFile = req.files.attachment[0];
      if (lecture.attachmentUrl) {
        const oldAttachKey = path.basename(lecture.attachmentUrl);
        await resourceService.softDeleteFile(oldAttachKey);
        await storageService.deleteObject(oldAttachKey);
      }

      const attachUploadRes = await storageService.uploadObject({
        fileBuffer: attachmentFile.buffer,
        filePath: attachmentFile.path,
        fileName: attachmentFile.originalname,
        mimeType: attachmentFile.mimetype,
        folder: 'lectures/attachments'
      });

      updates.attachmentUrl = attachUploadRes.fileUrl;
      updates.attachmentName = attachmentFile.originalname;

      if (userDoc) {
        await resourceService.registerFile({
          institution: userDoc.institution,
          department: userDoc.department,
          owner: req.user._id,
          fileName: attachmentFile.originalname,
          storageKey: attachUploadRes.storageKey,
          filePath: attachUploadRes.fileUrl,
          fileSizeBytes: attachUploadRes.fileSizeBytes,
          relatedEntityType: 'LECTURE_MATERIAL',
          relatedEntityId: lecture._id
        });
      }
    }

    lecture = await Lecture.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    })
      .populate('course', 'name code')
      .populate('uploadedBy', 'name email');

    // Re-trigger transcription if new file is transcribable
    if (req.files?.file && isTranscribable(req.files.file[0].originalname) && newMainUploadRes) {
      transcribeLectureAsync(lecture._id, newMainUploadRes.storageKey)
        .catch(err => console.error('Background transcription error:', err.message));
    }

    res.json({ lecture, message: 'Lecture updated successfully' });
  } catch (error) {
    next(error);
  } finally {
    const mainFile = req.files?.file ? req.files.file[0] : null;
    const attachmentFile = req.files?.attachment ? req.files.attachment[0] : null;
    cleanupTempFiles([mainFile, attachmentFile]);
  }
};

// @desc    Delete lecture
// @route   DELETE /api/lectures/:id
exports.deleteLecture = async (req, res, next) => {
  try {
    const lecture = await Lecture.findById(req.params.id);

    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Only the uploader or admin can delete
    if (lecture.uploadedBy.toString() !== req.user._id.toString() &&
        !['dept_admin', 'inst_admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized to delete this lecture' });
    }

    // Soft delete FileMetadata in Resource Service to reclaim actual storage
    const resourceService = require('../services/resourceService');
    const storageService = require('../services/storageService');

    const mainKey = lecture.fileKey || (lecture.fileUrl ? path.basename(lecture.fileUrl) : null);
    if (mainKey) {
      await resourceService.softDeleteFile(mainKey);
      await storageService.deleteObject(mainKey);
    }
    if (lecture.attachmentUrl) {
      const attachKey = path.basename(lecture.attachmentUrl);
      await resourceService.softDeleteFile(attachKey);
      await storageService.deleteObject(attachKey);
    }

    await Lecture.findByIdAndDelete(req.params.id);

    res.json({ message: 'Lecture deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get transcription for a lecture
// @route   GET /api/lectures/:id/transcription
exports.getTranscription = async (req, res, next) => {
  try {
    const lecture = await Lecture.findById(req.params.id).select('title transcription fileType');

    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    res.json({
      lectureId: lecture._id,
      title: lecture.title,
      fileType: lecture.fileType,
      transcription: lecture.transcription || { status: 'none' }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Retry transcription for a lecture
// @route   POST /api/lectures/:id/transcription/retry
exports.retryTranscription = async (req, res, next) => {
  try {
    const lecture = await Lecture.findById(req.params.id);

    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    // Only the uploader or admin can retry
    if (lecture.uploadedBy.toString() !== req.user._id.toString() &&
        !['dept_admin', 'inst_admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (!isTranscribable(lecture.fileName)) {
      return res.status(400).json({ message: 'This file type does not support transcription' });
    }

    if (lecture.transcription?.status === 'processing') {
      return res.status(400).json({ message: 'Transcription is already in progress' });
    }

    // Check if lecture has a local file (not just external URL)
    if (!lecture.fileName) {
      return res.status(400).json({ 
        message: 'This lecture uses an external file URL and cannot be transcribed locally. Please upload a local audio/video file to enable transcription.' 
      });
    }

    // Check metered AI quota before transcription retry
    const resourceService = require('../services/resourceService');
    await resourceService.checkAndConsumeMeteredAIQuota({
      user: req.user._id,
      operationType: 'TRANSCRIPTION',
      quantity: 1,
      relatedEntityType: 'LECTURE',
      relatedEntityId: lecture._id
    });

    console.log(`[Retry] Retrying transcription for lecture ${lecture._id}, fileKey: ${lecture.fileKey}`);

    // Mark as processing
    await Lecture.findByIdAndUpdate(lecture._id, {
      'transcription.status': 'processing',
      'transcription.error': null
    });

    // Determine the actual storage key or file reference:
    // 1. Use fileKey if available (R2 object key or local storage key)
    // 2. Otherwise use fileUrl (backward compatibility for legacy local files)
    // 3. Fall back to fileName if all else fails
    const storageKey = lecture.fileKey || lecture.fileUrl || lecture.fileName;
    
    console.log(`[Retry] Storage reference: ${storageKey}`);
    
    transcribeLectureAsync(lecture._id, storageKey)
      .catch(err => console.error('[Retry] Background transcription error:', err.message));

    res.json({ message: 'Transcription retry started' });
  } catch (error) {
    next(error);
  }
};

// @desc    Generate AI Quiz from lecture/lab transcript
// @route   POST /api/lectures/:id/generate-quiz
exports.generateQuizFromLecture = async (req, res, next) => {
  try {
    const Quiz = require('../models/Quiz');
    const axios = require('axios');

    const lecture = await Lecture.findById(req.params.id)
      .populate('course', 'name code _id');

    if (!lecture) {
      return res.status(404).json({ message: 'Content not found' });
    }

    // Check if transcription is available
    if (!lecture.transcription || lecture.transcription.status !== 'completed' || !lecture.transcription.text) {
      return res.status(400).json({ message: 'Transcription not available yet. Please wait for transcription to complete.' });
    }

    // Check metered AI quota for AI Quiz Generation
    const resourceService = require('../services/resourceService');
    await resourceService.checkAndConsumeMeteredAIQuota({
      user: req.user._id,
      operationType: 'AI_QUIZ_GENERATION',
      quantity: 1,
      relatedEntityType: 'LECTURE',
      relatedEntityId: lecture._id
    });

    const aiQuizService = require('../services/aiQuizService');
    const sessionType = lecture.type === 'lab' ? 'Lab' : 'Lecture';

    try {
      const quizData = await aiQuizService.generateQuizFromLecture(
        lecture.transcription.text,
        5
      );
      
      const formattedQuestions = aiQuizService.transformToDBFormat(quizData, lecture.title);

      // Create quiz
      const quiz = await Quiz.create({
        title: `${sessionType} Quiz: ${lecture.title}`,
        course: lecture.course._id,
        questions: formattedQuestions,
        timeLimit: 20,
        createdBy: req.user._id,
        aiGenerated: true,
        sourceLecture: lecture._id
      });

      await quiz.populate('course', 'name code');

      res.status(201).json({
        message: 'Quiz generated successfully',
        quiz,
        questionCount: quiz.questions.length
      });
    } catch (apiError) {
      console.error('Quiz Generation Error:', apiError.message);
      return res.status(500).json({ 
        message: 'Failed to generate quiz. Please try again.',
        error: process.env.NODE_ENV === 'development' ? apiError.message : undefined
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Generate important questions from lecture transcript using AI
// @route   POST /api/lectures/:id/important-questions
exports.generateImportantQuestions = async (req, res, next) => {
  try {
    const aiQuizService = require('../services/aiQuizService');

    const lecture = await Lecture.findById(req.params.id);

    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    if (!lecture.transcription || lecture.transcription.status !== 'completed' || !lecture.transcription.text) {
      return res.status(400).json({ message: 'Transcription not available yet.' });
    }

    // Check metered AI quota for Summarization / Important Questions
    const resourceService = require('../services/resourceService');
    await resourceService.checkAndConsumeMeteredAIQuota({
      user: req.user._id,
      operationType: 'SUMMARIZATION',
      quantity: 1,
      relatedEntityType: 'LECTURE',
      relatedEntityId: lecture._id
    });

    try {
      const questions = await aiQuizService.generateImportantQuestions(
        lecture.transcription.text,
        lecture.type
      );

      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(500).json({ message: 'Failed to generate valid questions' });
      }

      res.json({
        message: 'Important questions generated successfully',
        lectureTitle: lecture.title,
        questions
      });
    } catch (apiError) {
      console.error('AI Service Error:', apiError.message);
      return res.status(500).json({ message: 'Failed to generate important questions. Please try again.' });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Initiate direct B2 multipart upload (quota check + presigned URLs)
// @route   POST /api/lectures/upload/initiate
exports.initiateDirectUpload = async (req, res, next) => {
  try {
    const { fileName, fileSize, mimeType, folder = 'lectures', isAttachment = false } = req.body;

    if (!fileName) return res.status(400).json({ message: 'fileName is required' });
    if (!fileSize || fileSize <= 0) return res.status(400).json({ message: 'Valid fileSize is required' });

    // Validate Storage Capacity / Allocation BEFORE upload
    const resourceService = require('../services/resourceService');
    await resourceService.checkUserUploadCapacity(req.user._id, fileSize);

    const storageService = require('../services/storageService');
    if (!storageService.isB2Configured()) {
      return res.status(400).json({ message: 'Direct B2 upload requires active cloud storage configuration' });
    }

    const { uploadId, storageKey } = await storageService.initiateMultipartUpload({
      fileName,
      mimeType,
      folder: isAttachment ? 'lectures/attachments' : folder
    });

    // Part size configuration: default 5MB (S3 standard minimum part size), minimum 5MB unless total size <= 5MB
    const DEFAULT_PART_SIZE = 5 * 1024 * 1024;  // 5 MB
    const MIN_PART_SIZE = 5 * 1024 * 1024;      // 5 MB

    let partSize = DEFAULT_PART_SIZE;
    if (fileSize <= MIN_PART_SIZE) {
      partSize = fileSize; // single part
    } else {
      const calculatedParts = Math.ceil(fileSize / partSize);
      if (calculatedParts > 10000) {
        partSize = Math.ceil(fileSize / 10000);
      }
    }

    const totalParts = Math.max(1, Math.ceil(fileSize / partSize));

    const parts = await storageService.getPresignedPartUrls({
      storageKey,
      uploadId,
      totalParts,
      expiresIn: 1800 // 30 mins
    });

    res.json({
      success: true,
      uploadId,
      key: storageKey,
      storageKey,
      partSize,
      totalParts,
      parts
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Complete direct B2 multipart upload (verify B2 object + create Lecture & FileMetadata)
// @route   POST /api/lectures/upload/complete
exports.completeDirectUpload = async (req, res, next) => {
  const storageService = require('../services/storageService');
  const resourceService = require('../services/resourceService');
  const User = require('../models/User');

  const {
    mainUpload,       // { uploadId, key, parts, fileName, fileSize }
    attachmentUpload, // optional { uploadId, key, parts, fileName, fileSize }
    lectureData = {}, // { title, description, type, course, semester, language, subject, experimentTitle }
    lectureId         // if updating existing lecture
  } = req.body;

  let mainCompletedRes = null;
  let attachCompletedRes = null;
  let lecture = null;

  try {
    if (!mainUpload || !mainUpload.uploadId || !mainUpload.key || !Array.isArray(mainUpload.parts)) {
      return res.status(400).json({ message: 'Invalid mainUpload payload' });
    }

    // 1. Complete B2 Multipart Upload for main file
    mainCompletedRes = await storageService.completeMultipartUpload({
      storageKey: mainUpload.key,
      uploadId: mainUpload.uploadId,
      parts: mainUpload.parts
    });

    // 2. Complete B2 Multipart Upload for attachment if provided
    if (attachmentUpload && attachmentUpload.uploadId && attachmentUpload.key && Array.isArray(attachmentUpload.parts)) {
      attachCompletedRes = await storageService.completeMultipartUpload({
        storageKey: attachmentUpload.key,
        uploadId: attachmentUpload.uploadId,
        parts: attachmentUpload.parts
      });
    }

    const ext = path.extname(mainUpload.fileName || mainUpload.key).toLowerCase();
    let fileType = 'document';
    if (ext === '.pdf') fileType = 'pdf';
    else if (['.mp4', '.webm', '.mov', '.mkv', '.avi', '.flv'].includes(ext)) fileType = 'video';
    else if (['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.mpeg', '.mpga'].includes(ext)) fileType = 'audio';

    const canTranscribe = isTranscribable(mainUpload.fileName || mainUpload.key);
    const { normalizeLanguage } = require('../services/audioSynthesisService');
    const normLang = normalizeLanguage(lectureData.language || 'en');

    const userDoc = await User.findById(req.user._id);
    if (!userDoc) {
      throw new Error('Authenticated user not found');
    }

    if (lectureId) {
      // UPDATE existing lecture
      lecture = await Lecture.findById(lectureId);
      if (!lecture) {
        return res.status(404).json({ message: 'Lecture not found' });
      }

      if (lecture.uploadedBy.toString() !== req.user._id.toString() &&
          !['dept_admin', 'inst_admin', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Not authorized to update this lecture' });
      }

      if (lecture.fileKey) {
        await resourceService.softDeleteFile(lecture.fileKey).catch(() => {});
        await storageService.deleteObject(lecture.fileKey).catch(() => {});
      }

      const updates = {
        title: lectureData.title || lecture.title,
        description: lectureData.description !== undefined ? lectureData.description : lecture.description,
        course: lectureData.course || lecture.course,
        semester: lectureData.semester ? parseInt(lectureData.semester) : lecture.semester,
        type: lectureData.type === 'lab' ? 'lab' : (lectureData.type || lecture.type),
        fileUrl: mainCompletedRes.fileUrl,
        fileType,
        fileName: mainUpload.fileName || path.basename(mainUpload.key),
        fileKey: mainCompletedRes.storageKey,
        language: normLang,
        teachingLanguage: normLang
      };

      if (lectureData.type === 'lab' || lecture.type === 'lab') {
        if (lectureData.subject) updates.subject = lectureData.subject;
        if (lectureData.experimentTitle) updates.experimentTitle = lectureData.experimentTitle;
      }

      if (canTranscribe) {
        updates.transcription = { status: 'processing', text: '', segments: [], error: null };
      }

      if (attachCompletedRes) {
        if (lecture.attachmentUrl) {
          const oldAttachKey = path.basename(lecture.attachmentUrl);
          await resourceService.softDeleteFile(oldAttachKey).catch(() => {});
          await storageService.deleteObject(oldAttachKey).catch(() => {});
        }
        updates.attachmentUrl = attachCompletedRes.fileUrl;
        updates.attachmentName = attachmentUpload.fileName || path.basename(attachmentUpload.key);
      }

      lecture = await Lecture.findByIdAndUpdate(lectureId, updates, { new: true })
        .populate('course', 'name code')
        .populate('uploadedBy', 'name email');
    } else {
      // CREATE new lecture
      const newLectureData = {
        title: lectureData.title,
        description: lectureData.description || '',
        type: lectureData.type === 'lab' ? 'lab' : 'lecture',
        fileUrl: mainCompletedRes.fileUrl,
        fileType,
        fileName: mainUpload.fileName || path.basename(mainUpload.key),
        fileKey: mainCompletedRes.storageKey,
        attachmentUrl: attachCompletedRes ? attachCompletedRes.fileUrl : undefined,
        attachmentName: attachCompletedRes ? (attachmentUpload.fileName || path.basename(attachmentUpload.key)) : undefined,
        course: lectureData.course,
        uploadedBy: req.user._id,
        semester: parseInt(lectureData.semester),
        language: normLang,
        teachingLanguage: normLang,
        transcription: {
          status: canTranscribe ? 'processing' : 'none'
        }
      };

      if (lectureData.type === 'lab') {
        newLectureData.subject = lectureData.subject;
        if (lectureData.experimentTitle) newLectureData.experimentTitle = lectureData.experimentTitle;
      }

      lecture = await Lecture.create(newLectureData);
      await lecture.populate('course', 'name code');
      await lecture.populate('uploadedBy', 'name email');
    }

    // Register FileMetadata in Authoritative Resource System
    await resourceService.registerFile({
      institution: userDoc.institution,
      department: userDoc.department,
      owner: req.user._id,
      fileName: mainUpload.fileName || path.basename(mainUpload.key),
      storageKey: mainCompletedRes.storageKey,
      filePath: mainCompletedRes.fileUrl,
      fileSizeBytes: mainCompletedRes.fileSizeBytes || mainUpload.fileSize || 0,
      relatedEntityType: (lectureData.type === 'lab' || lecture.type === 'lab') ? 'LAB' : 'LECTURE',
      relatedEntityId: lecture._id
    });

    if (attachCompletedRes) {
      await resourceService.registerFile({
        institution: userDoc.institution,
        department: userDoc.department,
        owner: req.user._id,
        fileName: attachmentUpload.fileName || path.basename(attachmentUpload.key),
        storageKey: attachCompletedRes.storageKey,
        filePath: attachCompletedRes.fileUrl,
        fileSizeBytes: attachCompletedRes.fileSizeBytes || attachmentUpload.fileSize || 0,
        relatedEntityType: 'LECTURE_MATERIAL',
        relatedEntityId: lecture._id
      });
    }

    // Trigger background transcription (don't block response)
    if (canTranscribe) {
      transcribeLectureAsync(lecture._id, mainCompletedRes.storageKey)
        .catch(err => console.error('Background transcription error:', err.message));
    }

    res.status(201).json({ lecture, message: 'Content uploaded and finalized successfully' });
  } catch (error) {
    console.error('[CompleteDirectUpload Error]:', error);

    // Rollback uploaded cloud objects if DB record or metadata registration fails
    if (mainCompletedRes?.storageKey) {
      await storageService.deleteObject(mainCompletedRes.storageKey).catch(() => {});
    }
    if (attachCompletedRes?.storageKey) {
      await storageService.deleteObject(attachCompletedRes.storageKey).catch(() => {});
    }
    if (lecture?._id && !lectureId) {
      await Lecture.findByIdAndDelete(lecture._id).catch(() => {});
    }

    next(error);
  }
};

// @desc    Abort direct B2 multipart upload
// @route   POST /api/lectures/upload/abort
exports.abortDirectUpload = async (req, res, next) => {
  try {
    const { uploadId, key } = req.body;
    if (uploadId && key) {
      const storageService = require('../services/storageService');
      await storageService.abortMultipartUpload({ uploadId, storageKey: key });
    }
    res.json({ success: true, message: 'Upload aborted' });
  } catch (error) {
    next(error);
  }
};
