const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttendanceSession',
    required: [true, 'Session reference is required'],
    index: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: [true, 'Course reference is required'],
    index: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Student reference is required'],
    index: true
  },
  enrollment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Enrollment',
    default: null,
    index: true
  },
  status: {
    type: String,
    enum: ['PRESENT', 'ABSENT'],
    required: [true, 'Status must be PRESENT or ABSENT'],
    index: true
  },
  markedAt: {
    type: Date,
    default: Date.now
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'markedBy reference is required']
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Ensure a student has only ONE record per session
attendanceRecordSchema.index({ session: 1, student: 1 }, { unique: true });
attendanceRecordSchema.index({ student: 1, course: 1, status: 1 });
attendanceRecordSchema.index({ student: 1, course: 1, enrollment: 1 });
attendanceRecordSchema.index({ enrollment: 1, status: 1 });

module.exports = mongoose.models.AttendanceRecord || mongoose.model('AttendanceRecord', attendanceRecordSchema);
