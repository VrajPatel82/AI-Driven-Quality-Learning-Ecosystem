const mongoose = require('mongoose');

const gradeComponentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  weightage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  maxMarks: {
    type: Number,
    required: true,
    min: 1
  }
});

const gradeEntrySchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  enrollment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Enrollment'
  },
  componentName: {
    type: String,
    required: true
  },
  marksObtained: {
    type: Number,
    default: 0,
    min: 0
  },
  date: {
    type: Date,
    default: Date.now
  }
});

const gradebookSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  academicTerm: {
    type: String,
    required: true,
    default: 'CURRENT',
    trim: true
  },
  components: [gradeComponentSchema],
  grades: [gradeEntrySchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
gradebookSchema.index({ course: 1, academicTerm: 1 }, { unique: true });
gradebookSchema.index({ 'grades.student': 1 });
gradebookSchema.index({ 'grades.enrollment': 1 });

module.exports = mongoose.models.Gradebook || mongoose.model('Gradebook', gradebookSchema);

