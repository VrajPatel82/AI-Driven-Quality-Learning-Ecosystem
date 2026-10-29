const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Event title is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  type: {
    type: String,
    enum: ['exam', 'holiday', 'event', 'deadline', 'meeting'],
    default: 'event'
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date
  },
  isAllDay: {
    type: Boolean,
    default: false
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
eventSchema.index({ startDate: 1 });
eventSchema.index({ type: 1 });
eventSchema.index({ course: 1 });
eventSchema.index({ department: 1 });

module.exports = mongoose.model('Event', eventSchema);
