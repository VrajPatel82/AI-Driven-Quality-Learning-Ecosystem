const mongoose = require('mongoose');

const lectureSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Lecture title is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['lecture', 'lab'],
    default: 'lecture',
    required: true
  },
  subject: {
    type: String,
    trim: true
  },
  experimentTitle: {
    type: String,
    trim: true
  },
  fileUrl: {
    type: String,
    required: [true, 'File URL is required']
  },
  fileType: {
    type: String,
    enum: ['pdf', 'video', 'audio', 'document'],
    default: 'pdf'
  },
  fileName: {
    type: String
  },
  fileKey: {
    type: String,
    description: 'Actual filename saved by Multer (used for reading files from disk)'
  },
  attachmentUrl: {
    type: String
  },
  attachmentName: {
    type: String
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  semester: {
    type: Number,
    min: 1,
    max: 8,
    required: true
  },
  language: {
    type: String,
    default: 'en'
  },
  teachingLanguage: {
    type: String,
    enum: ['English', 'Hindi', 'Gujarati', 'Mixed'],
    default: 'English'
  },
  transcription: {
    status: {
      type: String,
      enum: ['none', 'processing', 'completed', 'failed'],
      default: 'none'
    },
    text: {
      type: String,
      default: ''
    },
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
    }],
    language: String,
    duration: Number,
    completedAt: Date,
    error: String
  },
  languageAnalysis: {
    English: {
      type: Number,
      default: 0
    },
    Hindi: {
      type: Number,
      default: 0
    },
    Gujarati: {
      type: Number,
      default: 0
    },
    Other: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  language_override: 'none'
});

// Database indexes for performance - explicitly set language_override: 'none' to prevent MongoDB from treating language field as text search stemmer
lectureSchema.index({ title: 'text', description: 'text' }, { name: 'title_text_description_text', default_language: 'english', language_override: 'none' });
lectureSchema.index({ course: 1, createdAt: -1 });
lectureSchema.index({ uploadedBy: 1 });
lectureSchema.index({ semester: 1 });
lectureSchema.index({ type: 1 });
lectureSchema.index({ fileType: 1 });
lectureSchema.index({ createdAt: -1 });
lectureSchema.index({ type: 1, semester: 1, uploadedBy: 1 });

const Lecture = mongoose.model('Lecture', lectureSchema);

// Self-healing index check: drop legacy text index if created with language_override: 'language'
mongoose.connection.on('connected', async () => {
  try {
    const collection = mongoose.connection.collection('lectures');
    const indexes = await collection.indexes();
    const legacyIndex = indexes.find(i => i.name === 'title_text_description_text' && i.language_override === 'language');
    if (legacyIndex) {
      console.log('[Lecture Model] Dropping legacy title_text_description_text index with language_override: language...');
      await collection.dropIndex('title_text_description_text');
      await Lecture.syncIndexes();
      console.log('[Lecture Model] Successfully synced title_text_description_text index with language_override: none');
    }
  } catch (err) {
    // Ignore index check errors if collection doesn't exist yet
  }
});

module.exports = Lecture;
