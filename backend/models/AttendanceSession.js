const mongoose = require('mongoose');

const attendanceSessionSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: [true, 'Course is required'],
    index: true
  },
  institution: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: [true, 'Institution is required'],
    index: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: [true, 'Department is required'],
    index: true
  },
  semester: {
    type: Number,
    required: [true, 'Semester is required'],
    min: 1,
    max: 12,
    index: true
  },
  division: {
    type: String,
    trim: true,
    uppercase: true,
    default: '',
    index: true
  },
  academicTerm: {
    type: String,
    trim: true,
    default: 'CURRENT'
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
    index: true
  },
  startTime: {
    type: String,
    trim: true,
    default: ''
  },
  topic: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['CONDUCTED', 'CANCELLED'],
    default: 'CONDUCTED',
    index: true
  },
  lectureType: {
    type: String,
    enum: ['NORMAL', 'PROXY'],
    default: 'NORMAL',
    index: true
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'markedBy is required'],
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for query performance
attendanceSessionSchema.index({ course: 1, date: -1 });
attendanceSessionSchema.index({ course: 1, semester: 1, division: 1 });
attendanceSessionSchema.index({ department: 1, semester: 1, division: 1 });
attendanceSessionSchema.index({ institution: 1, department: 1, date: -1 });

module.exports = mongoose.models.AttendanceSession || mongoose.model('AttendanceSession', attendanceSessionSchema);
