const mongoose = require('mongoose');

const fileMetadataSchema = new mongoose.Schema({
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
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  resourceType: {
    type: String,
    enum: ['STORAGE'],
    default: 'STORAGE'
  },
  fileName: {
    type: String,
    required: true
  },
  storageKey: {
    type: String,
    required: true,
    trim: true
  },
  filePath: {
    type: String,
    required: true
  },
  fileSizeBytes: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  relatedEntityType: {
    type: String,
    enum: ['LECTURE', 'LECTURE_MATERIAL', 'LAB', 'LAB_SUBMISSION', 'GENERATED_AUDIO', 'OTHER'],
    required: true
  },
  relatedEntityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

fileMetadataSchema.index({ storageKey: 1 }, { unique: true });
fileMetadataSchema.index({ institution: 1, isDeleted: 1 });
fileMetadataSchema.index({ department: 1, isDeleted: 1 });
fileMetadataSchema.index({ owner: 1, isDeleted: 1 });

module.exports = mongoose.model('FileMetadata', fileMetadataSchema);
