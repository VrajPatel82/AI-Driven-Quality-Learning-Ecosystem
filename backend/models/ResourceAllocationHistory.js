const mongoose = require('mongoose');

const resourceAllocationHistorySchema = new mongoose.Schema({
  resourceType: {
    type: String,
    enum: ['STORAGE', 'METERED_AI'],
    required: true
  },
  parentLevel: {
    type: String,
    enum: ['SUPER_ADMIN', 'UNIVERSITY', 'INSTITUTION', 'DEPARTMENT'],
    required: true
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  childLevel: {
    type: String,
    enum: ['UNIVERSITY', 'INSTITUTION', 'DEPARTMENT', 'PROFESSOR'],
    required: true
  },
  childId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  previousAllocation: {
    type: Number,
    default: 0
  },
  newAllocation: {
    type: Number,
    required: true
  },
  difference: {
    type: Number,
    required: true
  },
  action: {
    type: String,
    enum: ['ALLOCATED', 'INCREASED', 'DECREASED', 'REVOKED'],
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reason: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

resourceAllocationHistorySchema.index({ resourceType: 1, parentId: 1, childId: 1, createdAt: -1 });

module.exports = mongoose.model('ResourceAllocationHistory', resourceAllocationHistorySchema);
