const mongoose = require('mongoose');

const stageMetricSchema = new mongoose.Schema({
  stageName: {
    type: String,
    required: true,
    enum: [
      'NATIVE_GEMINI_PDF',
      'TEXT_EXTRACTION',
      'AI_EVALUATION',
      'B2_DOWNLOAD',
      'FFMPEG_AUDIO_EXTRACTION',
      'GROQ_WHISPER_STT',
      'GEMINI_LANGUAGE_ANALYSIS',
      'TRANSCRIPT_PDF_GENERATION',
      'TRANSLATION_CACHE_HIT',
      'GEMINI_TRANSLATION',
      'EDGE_TTS_SYNTHESIS',
      'B2_AUDIO_UPLOAD'
    ]
  },
  durationMs: {
    type: Number,
    required: true,
    min: 0
  },
  provider: {
    type: String,
    default: ''
  },
  model: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'SUCCESS', 'FAILED'],
    default: 'success'
  },
  errorMessage: {
    type: String,
    default: ''
  }
}, { _id: false });

const aiPerformanceMetricSchema = new mongoose.Schema({
  operationType: {
    type: String,
    enum: ['ASSIGNMENT_EVALUATION', 'TRANSCRIPTION', 'TTS_SYNTHESIS'],
    required: true,
    index: true
  },
  logicalOperationId: {
    type: String,
    required: true,
    index: true
  },
  durationMs: {
    type: Number,
    required: true,
    min: 0
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'SUCCESS', 'FAILED'],
    required: true,
    index: true
  },
  provider: {
    type: String,
    default: ''
  },
  model: {
    type: String,
    default: ''
  },
  targetLanguage: {
    type: String,
    default: ''
  },
  errorCategory: {
    type: String,
    default: ''
  },
  errorMessage: {
    type: String,
    default: ''
  },
  resourceType: {
    type: String,
    default: ''
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  stages: [stageMetricSchema],
  // Academic Hierarchy References
  university: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'University',
    index: true
  },
  institution: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    index: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }
}, {
  timestamps: true
});

aiPerformanceMetricSchema.index({ createdAt: -1 });
aiPerformanceMetricSchema.index({ university: 1, createdAt: -1 });
aiPerformanceMetricSchema.index({ institution: 1, createdAt: -1 });
aiPerformanceMetricSchema.index({ department: 1, createdAt: -1 });
aiPerformanceMetricSchema.index({ user: 1, createdAt: -1 });
aiPerformanceMetricSchema.index({ operationType: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('AIPerformanceMetric', aiPerformanceMetricSchema);
