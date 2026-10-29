const mongoose = require('mongoose');

const lectureTranscriptSchema = new mongoose.Schema({
  lecture: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture',
    required: true,
    unique: true
  },
  originalTranscript: {
    text: String,
    language: String,
    segments: [{
      start: Number,
      end: Number,
      text: String,
      language: String,
      words: [{
        word: String,
        start: Number,
        end: Number
      }]
    }]
  },
  translations: [{
    language: {
      type: String,
      enum: ['English', 'Hindi', 'Gujarati'],
      required: true
    },
    text: String,
    segments: [{
      start: Number,
      end: Number,
      text: String
    }],
    translatedAt: Date
  }],
  pdfFiles: [{
    language: {
      type: String,
      enum: ['English', 'Hindi', 'Gujarati'],
      required: true
    },
    path: String,
    filename: String,
    isOriginal: Boolean,
    generatedAt: Date
  }],
  languagePercentages: {
    English: { type: Number, default: 0 },
    Hindi: { type: Number, default: 0 },
    Gujarati: { type: Number, default: 0 }
  },
  status: {
    type: String,
    enum: ['pending', 'transcribed', 'translated', 'completed'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
lectureTranscriptSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for fast lookups
lectureTranscriptSchema.index({ lecture: 1 });
lectureTranscriptSchema.index({ 'translations.language': 1 });
lectureTranscriptSchema.index({ status: 1 });

module.exports = mongoose.model('LectureTranscript', lectureTranscriptSchema);
