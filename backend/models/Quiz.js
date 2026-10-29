const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['mcq', 'descriptive'],
    default: 'mcq'
  },
  options: [{
    type: String
  }],
  correctAnswer: {
    type: String
  },
  points: {
    type: Number,
    default: 1
  }
});

const quizSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Quiz title is required'],
    trim: true
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
  questions: [questionSchema],
  timeLimit: {
    type: Number, // in minutes
    default: 30
  },
  deadline: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // AI Generation tracking
  aiGenerated: {
    type: Boolean,
    default: false
  },
  sourceLecture: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture',
    default: null
  },
  generatedAt: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Database indexes
quizSchema.index({ title: 'text' });
quizSchema.index({ course: 1, createdAt: -1 });
quizSchema.index({ course: 1, academicTerm: 1, semester: 1 });
quizSchema.index({ createdBy: 1 });
quizSchema.index({ deadline: 1 });
quizSchema.index({ aiGenerated: 1 });
quizSchema.index({ sourceLecture: 1 });

module.exports = mongoose.model('Quiz', quizSchema);
