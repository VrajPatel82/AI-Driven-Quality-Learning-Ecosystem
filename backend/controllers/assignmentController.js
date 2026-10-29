const Assignment = require('../models/Assignment');
const { paginate } = require('../utils/pagination');
const path = require('path');
const fs = require('fs');
const textExtractionService = require('../services/textExtractionService');
const aiAssignmentEvaluationService = require('../services/aiAssignmentEvaluationService');
const nativeGeminiAssignmentEvaluatorService = require('../services/nativeGeminiAssignmentEvaluatorService');
const Notification = require('../models/Notification');
const aiPerformanceService = require('../services/aiPerformanceService');
const activeEvaluationIds = new Set();

/**
 * Asynchronous background helper to run text extraction and AI evaluation
 */
async function runAsyncEvaluation(assignmentId, submissionId, options = {}) {
  const lockKey = `${assignmentId}:${submissionId}`;
  if (activeEvaluationIds.has(lockKey)) return;
  activeEvaluationIds.add(lockKey);
  const evalStartTime = Date.now();
  const stages = [];
  let hierarchy = {};
  let resolvedProvider = '';
  let resolvedModel = '';
  try {
    const assignment = await Assignment.findById(assignmentId)
      .populate('course', 'name code department')
      .populate('submissions.student', 'name email enrollmentNumber');

    if (!assignment) return;
    hierarchy = await aiPerformanceService.resolveHierarchy({
      assignmentId,
      courseId: assignment.course?._id || assignment.course,
      userId: assignment.createdBy
    });

    const submission = assignment.submissions.id(submissionId);
    if (!submission || !submission.files || submission.files.length === 0) return;

    // Do not overwrite finalized evaluations
    if (submission.evaluationStatus === 'FINALIZED') return;

    // Prevent duplicate evaluation unless explicitly forced (e.g. initial submit or explicit professor retry) or retrying a FAILED submission
    if (!options.force && submission.evaluationStatus === 'COMPLETED') return;

    await Assignment.updateOne(
      { _id: assignmentId, 'submissions._id': submissionId, 'submissions.evaluationStatus': { $ne: 'FINALIZED' } },
      { $set: { 'submissions.$.evaluationStatus': 'PROCESSING' } }
    );

    // Use the primary submitted file
    const targetFile = submission.files[0];
    const relativeUrl = targetFile.fileUrl.startsWith('/') ? targetFile.fileUrl.slice(1) : targetFile.fileUrl;
    const fullPath = path.join(__dirname, '..', relativeUrl);

    try {
      if (!assignment.questionPdf || !assignment.questionPdf.fileUrl) {
        await Assignment.updateOne(
          { _id: assignmentId, 'submissions._id': submissionId },
          { $set: {
            'submissions.$.evaluationStatus': 'FAILED',
            'submissions.$.aiEvaluation.failureReason': 'Assignment Question PDF is missing. Evaluation requires a valid question PDF.'
          } }
        );
        aiPerformanceService.recordMetric({
          operationType: 'ASSIGNMENT_EVALUATION',
          logicalOperationId: `${assignmentId}:${submissionId}`,
          durationMs: Date.now() - evalStartTime,
          startTime: new Date(evalStartTime),
          endTime: new Date(),
          status: 'FAILED',
          errorMessage: 'Assignment Question PDF is missing.',
          resourceType: 'ASSIGNMENT',
          resourceId: assignmentId,
          stages,
          ...hierarchy
        }).catch(() => {});
        return;
      }

      const qRelativeUrl = assignment.questionPdf.fileUrl.startsWith('/') ? assignment.questionPdf.fileUrl.slice(1) : assignment.questionPdf.fileUrl;
      const qFullPath = path.join(__dirname, '..', qRelativeUrl);
      if (!fs.existsSync(qFullPath)) {
        await Assignment.updateOne(
          { _id: assignmentId, 'submissions._id': submissionId },
          { $set: {
            'submissions.$.evaluationStatus': 'FAILED',
            'submissions.$.aiEvaluation.failureReason': `Assignment Question PDF file was not found on local storage (${assignment.questionPdf.fileName || 'file missing'}).`
          } }
        );
        aiPerformanceService.recordMetric({
          operationType: 'ASSIGNMENT_EVALUATION',
          logicalOperationId: `${assignmentId}:${submissionId}`,
          durationMs: Date.now() - evalStartTime,
          startTime: new Date(evalStartTime),
          endTime: new Date(),
          status: 'FAILED',
          errorMessage: 'Assignment Question PDF file was not found on local storage.',
          resourceType: 'ASSIGNMENT',
          resourceId: assignmentId,
          stages,
          ...hierarchy
        }).catch(() => {});
        return;
      }

      const isPdf = path.extname(targetFile.fileName || fullPath).toLowerCase() === '.pdf';
      let evaluation;
      let extractedText = '';
      let evaluationMetadata = {};

      if (isPdf) {
        resolvedProvider = (process.env.ASSIGNMENT_EVALUATION_PROVIDER || 'openrouter').toUpperCase();
        const nativePdfResult = await aiPerformanceService.timeStage(
          stages,
          'NATIVE_GEMINI_PDF',
          { provider: resolvedProvider, model: process.env.ASSIGNMENT_EVALUATION_MODEL || 'gemini-2.5-flash' },
          () => nativeGeminiAssignmentEvaluatorService.evaluate({
            assignment,
            submissionId,
            studentPdfPath: fullPath
          })
        );
        evaluation = nativePdfResult.evaluation;
        resolvedModel = nativePdfResult.model || '';
        evaluationMetadata = {
          evaluationSource: 'NATIVE_GEMINI_PDF',
          pagesProcessed: null,
          totalPages: null,
          transcriptionCompletedAt: null,
          model: nativePdfResult.model || ''
        };
      } else {
        const extractRes = await aiPerformanceService.timeStage(
          stages,
          'TEXT_EXTRACTION',
          { provider: 'INTERNAL_EXTRACTION' },
          () => textExtractionService.extractText(fullPath, targetFile.fileName)
        );
        console.log(`[runAsyncEvaluation] Extraction completed (submissionId=${submissionId}, success=${extractRes.success}, chars=${extractRes.text?.length || 0})`);

        if (!extractRes.success) {
          await Assignment.updateOne(
            { _id: assignmentId, 'submissions._id': submissionId },
            { $set: {
              'submissions.$.evaluationStatus': 'FAILED',
              'submissions.$.aiEvaluation.failureReason': extractRes.reason || 'Failed to extract text from document.'
            } }
          );
          aiPerformanceService.recordMetric({
            operationType: 'ASSIGNMENT_EVALUATION',
            logicalOperationId: `${assignmentId}:${submissionId}`,
            durationMs: Date.now() - evalStartTime,
            startTime: new Date(evalStartTime),
            endTime: new Date(),
            status: 'FAILED',
            errorMessage: extractRes.reason || 'Failed to extract text from document.',
            resourceType: 'ASSIGNMENT',
            resourceId: assignmentId,
            stages,
            ...hierarchy
          }).catch(() => {});
          return;
        }

        resolvedProvider = 'GROQ';
        resolvedModel = process.env.GROQ_TUTOR_MODEL || 'groq/compound-mini';
        evaluation = await aiPerformanceService.timeStage(
          stages,
          'AI_EVALUATION',
          { provider: resolvedProvider, model: resolvedModel },
          () => aiAssignmentEvaluationService.evaluateSubmission({
            assignment,
            submissionText: extractRes.text
          })
        );
        extractedText = extractRes.text;
        evaluationMetadata = {
          evaluationSource: 'TEXT_EXTRACTION',
          pagesProcessed: null,
          totalPages: null,
          transcriptionCompletedAt: null
        };
      }

      const aiEvaluation = {
        ...evaluation,
        extractedText: extractedText.substring(0, 5000),
        ...evaluationMetadata,
        evaluatedAt: new Date()
      };
      await Assignment.updateOne(
        { _id: assignmentId, 'submissions._id': submissionId },
        { $set: { 'submissions.$.evaluationStatus': 'COMPLETED', 'submissions.$.aiEvaluation': aiEvaluation } }
      );
      console.log(`[runAsyncEvaluation] Evaluation saved (submissionId=${submissionId}, status=COMPLETED, marks=${evaluation.suggestedMarks})`);

      // Record successful AI performance metric
      aiPerformanceService.recordMetric({
        operationType: 'ASSIGNMENT_EVALUATION',
        logicalOperationId: `${assignmentId}:${submissionId}`,
        durationMs: Date.now() - evalStartTime,
        startTime: new Date(evalStartTime),
        endTime: new Date(),
        status: 'SUCCESS',
        provider: resolvedProvider,
        model: resolvedModel,
        resourceType: 'ASSIGNMENT',
        resourceId: assignmentId,
        stages,
        ...hierarchy
      }).catch(() => {});

      // Notify professor that AI evaluation is ready
      if (assignment.createdBy) {
        const studentName = submission.student?.name || 'Student';
        await Notification.create({
          userId: assignment.createdBy,
          type: 'assignment',
          title: 'AI Evaluation Ready',
          message: `AI evaluation completed for ${studentName}'s submission on "${assignment.title}".`,
          link: `/professor/assignments`,
          relatedResource: assignment._id,
          createdByUser: submission.student?._id || null
        }).catch(err => console.log('Notification create error:', err.message));
      }
    } catch (evalErr) {
      console.error(`[runAsyncEvaluation] AI evaluation failed (submissionId=${submissionId}): ${evalErr.message}`);
      console.error(evalErr.stack || evalErr);
      await Assignment.updateOne(
        { _id: assignmentId, 'submissions._id': submissionId },
        { $set: {
          'submissions.$.evaluationStatus': 'FAILED',
          'submissions.$.aiEvaluation.failureReason': evalErr.message || 'AI service evaluation failed.'
        } }
      );

      // Record failed AI performance metric
      aiPerformanceService.recordMetric({
        operationType: 'ASSIGNMENT_EVALUATION',
        logicalOperationId: `${assignmentId}:${submissionId}`,
        durationMs: Date.now() - evalStartTime,
        startTime: new Date(evalStartTime),
        endTime: new Date(),
        status: 'FAILED',
        provider: resolvedProvider,
        model: resolvedModel,
        errorMessage: evalErr.message || 'AI service evaluation failed.',
        resourceType: 'ASSIGNMENT',
        resourceId: assignmentId,
        stages,
        ...hierarchy
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[runAsyncEvaluation] Fatal error:', err);
  } finally {
    activeEvaluationIds.delete(lockKey);
  }
}

// @desc    Create assignment
// @route   POST /api/assignments
exports.createAssignment = async (req, res, next) => {
  try {
    const { title, description, course, dueDate, maxMarks, rubric, semester, academicTerm, uniquenessRequired } = req.body;

    const attachments = [];
    let questionPdfObj = null;

    if (req.files && req.files.length) {
      const uploadDir = path.join(__dirname, '..', 'uploads');
      for (const file of req.files) {
        const targetFilename = file.filename || `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        const fullPath = path.join(uploadDir, targetFilename);
        if (file.buffer) {
          fs.writeFileSync(fullPath, file.buffer);
        } else if (file.path && fs.existsSync(file.path)) {
          fs.copyFileSync(file.path, fullPath);
        }

        if (file.fieldname === 'questionPdf') {
          const extractRes = await textExtractionService.extractText(fullPath, file.originalname);
          questionPdfObj = {
            fileUrl: `/uploads/${targetFilename}`,
            fileName: file.originalname,
            extractedText: extractRes.success ? extractRes.text : ''
          };
        } else {
          attachments.push({
            fileUrl: `/uploads/${targetFilename}`,
            fileName: file.originalname
          });
        }
      }
    }

    if (!questionPdfObj) {
      return res.status(400).json({ message: 'Assignment Question PDF document is required.' });
    }

    let parsedRubric = [];
    if (rubric) {
      try {
        parsedRubric = typeof rubric === 'string' ? JSON.parse(rubric) : rubric;
      } catch (e) {
        parsedRubric = [];
      }
    }

    const Course = require('../models/Course');
    const courseDoc = await Course.findById(course);
    const resolvedSemester = semester || courseDoc?.semester || 1;
    const resolvedTerm = academicTerm || 'CURRENT';

    const assignment = await Assignment.create({
      title,
      description: description || '',
      questionPdf: questionPdfObj || undefined,
      course,
      semester: resolvedSemester,
      academicTerm: resolvedTerm,
      dueDate: new Date(dueDate),
      maxMarks: parseInt(maxMarks),
      attachments,
      rubric: Array.isArray(parsedRubric) ? parsedRubric : [],
      uniquenessRequired: uniquenessRequired === true || uniquenessRequired === 'true',
      createdBy: req.user._id
    });

    await assignment.populate('course', 'name code');
    await assignment.populate('createdBy', 'name email');

    res.status(201).json({ assignment, message: 'Assignment created successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all assignments
// @route   GET /api/assignments
exports.getAssignments = async (req, res, next) => {
  try {
    const { course, search, createdBy, status, page, limit } = req.query;
    const filter = {};
    const activeEnrollmentMap = new Map();

    if (req.user.role === 'student') {
      const Enrollment = require('../models/Enrollment');
      const activeEnrollments = await Enrollment.find({ student: req.user._id, status: 'active' });
      if (activeEnrollments.length === 0) {
        return res.json({
          data: [],
          pagination: { total: 0, totalItems: 0, currentPage: 1, totalPages: 0, limit: parseInt(limit) || 20, hasNextPage: false, hasPrevPage: false }
        });
      }

      const enrolledCourseIds = activeEnrollments.map(e => e.course.toString());
      activeEnrollments.forEach(e => activeEnrollmentMap.set(e.course.toString(), e));

      if (course) {
        const requestedIds = course.split(',').map(id => id.trim());
        const validIds = requestedIds.filter(id => enrolledCourseIds.includes(id));
        if (validIds.length === 0) {
          return res.json({
            data: [],
            pagination: { total: 0, totalItems: 0, currentPage: 1, totalPages: 0, limit: parseInt(limit) || 20, hasNextPage: false, hasPrevPage: false }
          });
        }
        filter.course = validIds.length === 1 ? validIds[0] : { $in: validIds };
      } else {
        filter.course = { $in: enrolledCourseIds };
      }
    } else if (course) {
      const courseIds = course.split(',').map(id => id.trim());
      filter.course = courseIds.length === 1 ? courseIds[0] : { $in: courseIds };
    }

    if (createdBy) filter.createdBy = createdBy;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const result = await paginate(Assignment, filter, { page, limit }, [
      { path: 'course', select: 'name code' },
      { path: 'createdBy', select: 'name email' }
    ]);

    // For students, add their submission status & sanitize other submissions
    const assignments = result.data.map(a => {
      const obj = a.toObject();
      if (req.user.role === 'student') {
        const activeEnrollment = activeEnrollmentMap.get(a.course?._id?.toString() || a.course?.toString());
        let submission = null;
        if (activeEnrollment) {
          submission = obj.submissions?.find(s => 
            s.enrollment ? s.enrollment.toString() === activeEnrollment._id.toString() : (s.student.toString() === req.user._id.toString() && activeEnrollment.attemptNumber === 1)
          );
        }
        obj.mySubmission = submission || null;
        obj.submissionCount = obj.submissions?.length || 0;
        delete obj.submissions; // Security: Don't expose other students' submissions
      } else {
        obj.submissionCount = obj.submissions?.length || 0;
      }
      obj.isOverdue = new Date() > new Date(obj.dueDate);
      return obj;
    });

    // Filter by status if requested
    let filteredAssignments = assignments;
    if (status === 'pending' && req.user.role === 'student') {
      filteredAssignments = assignments.filter(a => !a.mySubmission);
    } else if (status === 'submitted' && req.user.role === 'student') {
      filteredAssignments = assignments.filter(a => a.mySubmission && a.mySubmission.status === 'pending');
    } else if (status === 'graded' && req.user.role === 'student') {
      filteredAssignments = assignments.filter(a => a.mySubmission && a.mySubmission.status === 'graded');
    }

    res.json({
      data: filteredAssignments,
      pagination: { total: result.pagination.totalItems, ...result.pagination }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single assignment
// @route   GET /api/assignments/:id
exports.getAssignmentById = async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('course', 'name code')
      .populate('createdBy', 'name email')
      .populate('submissions.student', 'name email enrollmentNumber');

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (req.user.role === 'student') {
      const Enrollment = require('../models/Enrollment');
      const courseId = assignment.course?._id || assignment.course;
      const activeEnrollment = await Enrollment.findOne({
        student: req.user._id,
        course: courseId,
        status: 'active'
      });

      if (!activeEnrollment) {
        return res.status(403).json({ message: 'Access denied. You are not actively enrolled in this course.' });
      }

      const obj = assignment.toObject();
      obj.submissions = obj.submissions.filter(s =>
        s.enrollment ? s.enrollment.toString() === activeEnrollment._id.toString() : (s.student._id.toString() === req.user._id.toString() && activeEnrollment.attemptNumber === 1)
      );
      return res.json({ assignment: obj });
    }

    const obj = assignment.toObject();
    res.json({ assignment: obj });
  } catch (error) {
    next(error);
  }
};

// @desc    Submit assignment (students)
// @route   POST /api/assignments/:id/submit
exports.submitAssignment = async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    const Enrollment = require('../models/Enrollment');
    const courseId = assignment.course?._id || assignment.course;

    const activeEnrollment = await Enrollment.findOne({
      student: req.user._id,
      course: courseId,
      status: 'active'
    });

    if (!activeEnrollment) {
      return res.status(403).json({ message: 'Access denied. You are not actively enrolled in this course.' });
    }

    // Client enrollment validation if client provided enrollmentId
    const clientEnrollmentId = req.body.enrollmentId || req.body.enrollment;
    let targetEnrollment = activeEnrollment;

    if (clientEnrollmentId) {
      const clientEnrollment = await Enrollment.findById(clientEnrollmentId);
      if (!clientEnrollment) {
        return res.status(400).json({ message: `Enrollment ${clientEnrollmentId} not found` });
      }
      if (clientEnrollment.student.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: `Enrollment ${clientEnrollmentId} does not belong to student` });
      }
      if (clientEnrollment.course.toString() !== courseId.toString()) {
        return res.status(400).json({ message: `Enrollment ${clientEnrollmentId} does not belong to course` });
      }
      if (clientEnrollment.status !== 'active') {
        return res.status(403).json({ message: `Enrollment ${clientEnrollmentId} is not active` });
      }
      targetEnrollment = clientEnrollment;
    }

    // Check if already submitted for target Enrollment
    const existingSubmission = assignment.submissions.find(s =>
      s.enrollment ? s.enrollment.toString() === targetEnrollment._id.toString() : (s.student.toString() === req.user._id.toString() && targetEnrollment.attemptNumber === 1)
    );

    if (existingSubmission) {
      return res.status(400).json({ message: 'You have already submitted this assignment' });
    }

    const files = [];
    if (req.files && req.files.length) {
      const uploadDir = path.join(__dirname, '..', 'uploads');
      req.files.forEach(file => {
        const targetFilename = file.filename || `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        const targetPath = path.join(uploadDir, targetFilename);
        if (file.buffer) {
          fs.writeFileSync(targetPath, file.buffer);
        } else if (file.path && fs.existsSync(file.path)) {
          fs.copyFileSync(file.path, targetPath);
        }
        files.push({
          fileUrl: `/uploads/${targetFilename}`,
          fileName: file.originalname,
          fileType: path.extname(file.originalname).slice(1)
        });
      });
    }

    if (!files.length) {
      return res.status(400).json({ message: 'Please upload at least one file' });
    }

    const isLate = new Date() > new Date(assignment.dueDate);

    assignment.submissions.push({
      student: req.user._id,
      enrollment: targetEnrollment._id,
      files,
      isLate,
      evaluationStatus: 'PROCESSING'
    });

    await assignment.save();

    const createdSubmission = assignment.submissions[assignment.submissions.length - 1];

    // Trigger AI evaluation asynchronously in background without blocking response
    runAsyncEvaluation(assignment._id, createdSubmission._id, { force: true });

    res.status(201).json({
      message: 'Assignment submitted successfully',
      isLate,
      submissionId: createdSubmission._id
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all submissions for an assignment
// @route   GET /api/assignments/:id/submissions
exports.getSubmissions = async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('submissions.student', 'name email enrollmentNumber')
      .populate('course', 'name code');

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    res.json({
      assignment: {
        title: assignment.title,
        course: assignment.course,
        dueDate: assignment.dueDate,
        maxMarks: assignment.maxMarks,
        rubric: assignment.rubric || []
      },
      submissions: assignment.submissions
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Trigger/re-run AI evaluation (professors/admins)
// @route   POST /api/assignments/:assignmentId/submissions/:submissionId/evaluate
exports.triggerAIEvaluation = async (req, res, next) => {
  try {
    const { assignmentId, submissionId } = req.params;
    const assignment = await Assignment.findById(assignmentId);

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    const submission = assignment.submissions.id(submissionId);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Set status to PROCESSING so UI shows progress immediately
    await Assignment.updateOne(
      { _id: assignmentId, 'submissions._id': submissionId },
      { $set: { 'submissions.$.evaluationStatus': 'PROCESSING' } }
    );

    // Trigger evaluation in background
    runAsyncEvaluation(assignment._id, submission._id, { force: true });

    res.json({ message: 'AI Evaluation process started for submission' });
  } catch (error) {
    next(error);
  }
};

// @desc    Finalize submission evaluation (professors/admins)
// @route   PUT /api/assignments/:assignmentId/submissions/:submissionId/finalize
exports.finalizeEvaluation = async (req, res, next) => {
  try {
    const { marks, feedback } = req.body;
    const assignment = await Assignment.findById(req.params.assignmentId);

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    const submission = assignment.submissions.id(req.params.submissionId);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    const finalMarks = Number(marks);
    if (isNaN(finalMarks) || finalMarks < 0) {
      return res.status(400).json({ message: 'Valid non-negative final marks are required' });
    }

    if (finalMarks > assignment.maxMarks) {
      return res.status(400).json({ message: `Final marks cannot exceed ${assignment.maxMarks}` });
    }

    submission.marks = finalMarks;
    submission.feedback = feedback || submission.feedback || '';
    submission.professorFinalMarks = finalMarks;
    submission.professorFeedback = feedback || '';
    submission.status = 'graded';
    submission.evaluationStatus = 'FINALIZED';
    submission.finalizedAt = new Date();
    submission.finalizedBy = req.user._id;

    await assignment.save();

    // Notify student
    await Notification.create({
      userId: submission.student,
      type: 'grade',
      title: 'Assignment Graded',
      message: `Your submission for "${assignment.title}" has been graded: ${finalMarks}/${assignment.maxMarks}.`,
      link: `/student/assignments`,
      relatedResource: assignment._id,
      createdByUser: req.user._id
    }).catch(err => console.log('Notification error:', err.message));

    res.json({ submission, message: 'Assignment evaluation finalized successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Grade a submission (legacy compatibility endpoint)
// @route   PUT /api/assignments/:assignmentId/submissions/:submissionId/grade
exports.gradeSubmission = async (req, res, next) => {
  return exports.finalizeEvaluation(req, res, next);
};

// @desc    Export assignment submissions report as Excel (.xlsx)
// @route   GET /api/assignments/:id/export-excel
exports.exportAssignmentExcel = async (req, res, next) => {
  try {
    const ExcelJS = require('exceljs');
    const assignment = await Assignment.findById(req.params.id)
      .populate({
        path: 'course',
        select: 'name code department',
        populate: { path: 'department', select: 'name code' }
      })
      .populate('submissions.student', 'name email enrollmentNumber currentSemester department');

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AI Multilingual Lecture System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Evaluation Report');

    worksheet.columns = [
      { header: 'Student Name', key: 'studentName', width: 22 },
      { header: 'Enrollment Number', key: 'enrollmentNumber', width: 20 },
      { header: 'Branch / Department', key: 'department', width: 25 },
      { header: 'Semester', key: 'semester', width: 12 },
      { header: 'Assignment Name', key: 'assignmentName', width: 28 },
      { header: 'Course', key: 'course', width: 28 },
      { header: 'Submission Date', key: 'submissionDate', width: 16 },
      { header: 'Submission Time', key: 'submissionTime', width: 16 },
      { header: 'Submitted Document', key: 'fileName', width: 25 },
      { header: 'Maximum Marks', key: 'maxMarks', width: 15 },
      { header: 'AI Suggested Marks', key: 'aiSuggestedMarks', width: 20 },
      { header: 'Final Marks', key: 'finalMarks', width: 15 },
      { header: 'Evaluation Status', key: 'status', width: 20 }
    ];

    // Format Header Row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '1E3A8A' } // Dark Blue
    };

    (assignment.submissions || []).forEach(sub => {
      const student = sub.student || {};
      const subDate = sub.submittedAt ? new Date(sub.submittedAt) : null;
      const primaryFile = sub.files && sub.files.length > 0 ? sub.files[0].fileName : 'N/A';

      worksheet.addRow({
        studentName: student.name || 'Unknown',
        enrollmentNumber: student.enrollmentNumber || 'N/A',
        department: assignment.course?.department?.name || 'Computer Science',
        semester: student.currentSemester || 1,
        assignmentName: assignment.title,
        course: assignment.course ? `${assignment.course.name} (${assignment.course.code})` : 'N/A',
        submissionDate: subDate ? subDate.toISOString().split('T')[0] : 'N/A',
        submissionTime: subDate ? subDate.toTimeString().split(' ')[0] : 'N/A',
        fileName: primaryFile,
        maxMarks: assignment.maxMarks,
        aiSuggestedMarks: sub.aiEvaluation?.suggestedMarks !== null && sub.aiEvaluation?.suggestedMarks !== undefined ? sub.aiEvaluation.suggestedMarks : 'N/A',
        finalMarks: sub.marks !== null && sub.marks !== undefined ? sub.marks : 'N/A',
        status: sub.evaluationStatus || (sub.status === 'graded' ? 'FINALIZED' : 'NOT_EVALUATED')
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${assignment.title.replace(/[^a-z0-9]/gi, '_')}_evaluation_report.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

// @desc    Delete assignment
// @route   DELETE /api/assignments/:id
exports.deleteAssignment = async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (assignment.createdBy.toString() !== req.user._id.toString() &&
        !['dept_admin', 'inst_admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Assignment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    next(error);
  }
};
