const mongoose = require('mongoose');

const meteredAIUsageLedgerSchema = new mongoose.Schema({
  institution: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    default: null
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  resourceType: {
    type: String,
    enum: ['METERED_AI'],
    default: 'METERED_AI'
  },
  operationType: {
    type: String,
    enum: ['TRANSCRIPTION', 'TRANSLATION', 'AI_QUIZ_GENERATION', 'SUMMARIZATION', 'AUDIO_GENERATION', 'SPEECH_TO_SPEECH'],
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  relatedEntityType: {
    type: String,
    default: null
  },
  relatedEntityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  }
}, {
  timestamps: true
});

meteredAIUsageLedgerSchema.index({ institution: 1, createdAt: -1 });
meteredAIUsageLedgerSchema.index({ department: 1, createdAt: -1 });
meteredAIUsageLedgerSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('MeteredAIUsageLedger', meteredAIUsageLedgerSchema);
