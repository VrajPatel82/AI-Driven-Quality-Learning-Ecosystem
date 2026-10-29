const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'dropped', 'completed'],
    default: 'active',
    index: true
  },
  academicTerm: {
    type: String,
    trim: true
  },
  division: {
    type: String,
    trim: true,
    uppercase: true,
    default: '',
    index: true
  },
  attemptNumber: {
    type: Number,
    required: true,
    default: 1,
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: 'attemptNumber must be an integer'
    }
  },
  isBacklog: {
    type: Boolean,
    required: true,
    default: false
  }
}, {
  timestamps: true
});

enrollmentSchema.index({ student: 1, course: 1, attemptNumber: 1 }, { unique: true });
enrollmentSchema.index({ student: 1, status: 1 });
enrollmentSchema.index({ course: 1, division: 1, status: 1 });

module.exports = mongoose.models.Enrollment || mongoose.model('Enrollment', enrollmentSchema);

