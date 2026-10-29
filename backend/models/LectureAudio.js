const mongoose = require('mongoose');

const lectureAudioSchema = new mongoose.Schema({
  lecture: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture',
    required: true
  },
  language: {
    type: String,
    enum: ['English', 'Hindi', 'Gujarati'],
    required: true
  },
  sourceLanguage: {
    type: String,
    required: true,
    default: 'English'
  },
  audioUrl: {
    type: String,
    required: true
  },
  storageKey: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    default: 0
  },
  fileSizeBytes: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  error: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Unique compound index: ONE active audio track per lecture + target language
lectureAudioSchema.index({ lecture: 1, language: 1 }, { unique: true });
lectureAudioSchema.index({ status: 1 });

module.exports = mongoose.model('LectureAudio', lectureAudioSchema);
