const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  date: {
    type: Date,
    required: [true, 'Attendance date is required']
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  students: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'late'],
      default: 'absent'
    }
  }]
}, {
  timestamps: true
});

// Indexes
attendanceSchema.index({ course: 1, date: -1 });
attendanceSchema.index({ 'students.student': 1 });
attendanceSchema.index({ markedBy: 1 });
attendanceSchema.index({ course: 1, date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
