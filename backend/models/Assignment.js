const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  enrollment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Enrollment',
    default: null,
    index: true
  },
  files: [{
    fileUrl: String,
    fileName: String,
    fileType: String
  }],
  submittedAt: {
    type: Date,
    default: Date.now
  },
  isLate: {
    type: Boolean,
    default: false
  },
  marks: {
    type: Number,
    default: null
  },
  feedback: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'graded'],
    default: 'pending'
  },
  evaluationStatus: {
    type: String,
    enum: ['NOT_EVALUATED', 'PROCESSING', 'COMPLETED', 'PROFESSOR_REVIEWED', 'FINALIZED', 'FAILED'],
    default: 'NOT_EVALUATED'
  },
  aiEvaluation: {
    suggestedMarks: { type: Number, default: null },
    maximumMarks: { type: Number, default: null },
    percentage: { type: Number, default: null },
    criteria: [{
      name: String,
      maximumMarks: Number,
      awardedMarks: Number,
      feedback: String
    }],
    correctness: { type: String, default: '' },
    completeness: { type: String, default: '' },
    relevance: { type: String, default: '' },
    conceptualUnderstanding: { type: String, default: '' },
    missingPoints: [String],
    errors: [String],
    strengths: [String],
    weaknesses: [String],
    overallFeedback: { type: String, default: '' },
    extractedText: { type: String, default: '' },
    evaluationSource: { type: String, default: 'TEXT_EXTRACTION' },
    pagesProcessed: { type: Number, default: null },
    totalPages: { type: Number, default: null },
    transcriptionCompletedAt: { type: Date, default: null },
    evaluatedAt: { type: Date, default: null },
    model: { type: String, default: '' },
    failureReason: { type: String, default: '' },
    confidence: { type: String, enum: ['high', 'medium', 'low'], default: 'low' },
    duplicateDetected: { type: Boolean, default: false },
    duplicateReason: { type: String, default: '' },
    duplicateSubmissionIds: [mongoose.Schema.Types.ObjectId]
  },
  professorFinalMarks: { type: Number, default: null },
  professorFeedback: { type: String, default: '' },
  finalizedAt: { type: Date, default: null },
  finalizedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

const assignmentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Assignment title is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  questionPdf: {
    fileUrl: { type: String, default: '' },
    fileName: { type: String, default: '' },
    extractedText: { type: String, default: '' }
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  semester: {
    type: Number,
    min: 1,
    max: 12
  },
  academicTerm: {
    type: String,
    trim: true,
    default: 'CURRENT'
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required']
  },
  maxMarks: {
    type: Number,
    required: [true, 'Maximum marks is required'],
    min: 1
  },
  attachments: [{
    fileUrl: String,
    fileName: String
  }],
  rubric: [{
    criterion: { type: String, required: true },
    maxMarks: { type: Number, required: true, min: 1 },
    description: { type: String, default: '' }
  }],
  uniquenessRequired: {
    type: Boolean,
    default: false
  },
  submissions: [submissionSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
assignmentSchema.index({ course: 1, dueDate: -1 });
assignmentSchema.index({ course: 1, academicTerm: 1, semester: 1 });
assignmentSchema.index({ createdBy: 1 });
assignmentSchema.index({ 'submissions.student': 1 });
assignmentSchema.index({ 'submissions.enrollment': 1 });
assignmentSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Assignment', assignmentSchema);

