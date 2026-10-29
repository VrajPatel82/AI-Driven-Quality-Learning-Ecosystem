const mongoose = require('mongoose');

const aiMessageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AIConversation',
    required: true,
    index: true
  },
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'voice', 'pdf', 'video', 'code', 'mixed', 'system'],
    default: 'text',
    index: true
  },
  aiModelName: {
    type: String,
    default: ''
  },
  responseTimeMs: {
    type: Number,
    default: null
  },
  tokenUsage: {
    promptTokens: {
      type: Number,
      default: null
    },
    completionTokens: {
      type: Number,
      default: null
    },
    totalTokens: {
      type: Number,
      default: null
    }
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  error: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

aiMessageSchema.index({ conversation: 1, createdAt: 1 });
aiMessageSchema.index({ conversation: 1, role: 1, createdAt: 1 });
aiMessageSchema.index({ messageType: 1, createdAt: -1 });

module.exports = mongoose.model('AIMessage', aiMessageSchema);