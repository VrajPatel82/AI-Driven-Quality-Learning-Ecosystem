const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  answer: {
    type: String,
    default: ''
  },
  isCorrect: {
    type: Boolean,
    default: false
  },
  pointsEarned: {
    type: Number,
    default: 0
  }
});

const quizResultSchema = new mongoose.Schema({
  quiz: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true
  },
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
  answers: [answerSchema],
  totalScore: {
    type: Number,
    default: 0
  },
  maxScore: {
    type: Number,
    default: 0
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Attempt-safe uniqueness indexes
// 1. For modern enrollment-linked results: quiz + student + enrollment must be unique
quizResultSchema.index(
  { quiz: 1, student: 1, enrollment: 1 },
  { unique: true, partialFilterExpression: { enrollment: { $type: "objectId" } } }
);

// 2. For legacy results (enrollment is null): quiz + student must be unique among null-enrollment records
quizResultSchema.index(
  { quiz: 1, student: 1 },
  { unique: true, partialFilterExpression: { enrollment: null } }
);

module.exports = mongoose.model('QuizResult', quizResultSchema);
