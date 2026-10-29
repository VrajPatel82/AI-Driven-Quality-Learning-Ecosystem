const mongoose = require('mongoose');

const aiConversationSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  lecture: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture',
    required: false,
    default: null,
    index: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: false,
    default: null,
    index: true
  },
  conversationType: {
    type: String,
    enum: ['lecture', 'study_assistant', 'assignment', 'quiz'],
    default: 'lecture',
    index: true
  },
  subject: {
    type: String,
    trim: true,
    default: ''
  },
  subjectRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    default: null
  },
  chatTitle: {
    type: String,
    trim: true,
    default: 'AI Learning Assistant'
  },
  lastMessagePreview: {
    type: String,
    trim: true,
    default: ''
  },
  lastUserMessagePreview: {
    type: String,
    trim: true,
    default: ''
  },
  totalMessages: {
    type: Number,
    default: 0,
    min: 0
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  lastMessageAt: {
    type: Date,
    default: null
  },
  lastMessageRole: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: false
  },
  summary: {
    type: String,
    default: ''
  },
  aiModelName: {
    type: String,
    default: ''
  },
  promptVersion: {
    type: String,
    default: 'v1'
  }
}, {
  timestamps: true
});

aiConversationSchema.index(
  { student: 1, lecture: 1 },
  { unique: true, partialFilterExpression: { conversationType: 'lecture', lecture: { $type: 'objectId' } } }
);
aiConversationSchema.index({ student: 1, conversationType: 1, lastMessageAt: -1 });
aiConversationSchema.index({ student: 1, isPinned: -1, lastMessageAt: -1 });
aiConversationSchema.index({ student: 1, isArchived: 1, updatedAt: -1 });
aiConversationSchema.index({ course: 1, updatedAt: -1 });
aiConversationSchema.index({ lecture: 1 });

module.exports = mongoose.model('AIConversation', aiConversationSchema);