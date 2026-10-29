const mongoose = require('mongoose');

const storageUsageLogSchema = new mongoose.Schema({
  professor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  institution: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null
  },
  lecture: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture',
    default: null
  },
  fileMetadata: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FileMetadata',
    default: null
  },
  action: {
    type: String,
    enum: ['UPLOADED', 'GENERATED', 'DELETED', 'RELEASED'],
    required: true
  },
  fileCategory: {
    type: String,
    enum: ['LECTURE_VIDEO', 'LECTURE_MATERIAL', 'TRANSCRIPT_PDF', 'GENERATED_AUDIO', 'LAB', 'OTHER'],
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileSizeBytes: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  storageKey: {
    type: String,
    required: true,
    trim: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Compound and single-field query indexes for performant audit lookups
storageUsageLogSchema.index({ professor: 1, createdAt: -1 });
storageUsageLogSchema.index({ department: 1, createdAt: -1 });
storageUsageLogSchema.index({ institution: 1, createdAt: -1 });
storageUsageLogSchema.index({ lecture: 1, createdAt: -1 });
storageUsageLogSchema.index({ storageKey: 1, action: 1 });

module.exports = mongoose.model('StorageUsageLog', storageUsageLogSchema);
