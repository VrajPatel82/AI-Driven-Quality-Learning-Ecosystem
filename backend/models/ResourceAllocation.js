const mongoose = require('mongoose');

const resourceAllocationSchema = new mongoose.Schema({
  resourceType: {
    type: String,
    enum: ['STORAGE'],
    default: 'STORAGE',
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
  allocatedAmount: {
    type: Number,
    required: true,
    min: 0
  }
}, {
  timestamps: true
});

// Ensure a parent can have only ONE active allocation record per child per resourceType
resourceAllocationSchema.index(
  { resourceType: 1, parentLevel: 1, parentId: 1, childLevel: 1, childId: 1 },
  { unique: true }
);

module.exports = mongoose.model('ResourceAllocation', resourceAllocationSchema);
