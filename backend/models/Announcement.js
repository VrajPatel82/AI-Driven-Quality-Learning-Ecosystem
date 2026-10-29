const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Announcement title is required'],
    trim: true
  },
  content: {
    type: String,
    required: [true, 'Announcement content is required'],
    trim: true
  },
  type: {
    type: String,
    enum: ['institute', 'department', 'course'],
    default: 'institute'
  },
  targetAudience: {
    institution: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' }
  },
  priority: {
    type: String,
    enum: ['normal', 'important', 'high', 'urgent'],
    default: 'normal'
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  expiryDate: {
    type: Date
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
announcementSchema.index({ type: 1, createdAt: -1 });
announcementSchema.index({ priority: 1 });
announcementSchema.index({ expiryDate: 1 });
announcementSchema.index({ 'targetAudience.institution': 1 });
announcementSchema.index({ 'targetAudience.department': 1 });
announcementSchema.index({ 'targetAudience.course': 1 });
announcementSchema.index({ title: 'text', content: 'text' });

module.exports = mongoose.model('Announcement', announcementSchema);
