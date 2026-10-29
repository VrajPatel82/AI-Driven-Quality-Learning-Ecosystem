const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Department name is required'],
    trim: true
  },
  code: {
    type: String,
    uppercase: true,
    trim: true,
    required: [true, 'Department code is required']
  },
  departmentId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  institution: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: true
  }
}, {
  timestamps: true
});

departmentSchema.index({ institution: 1, code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Department', departmentSchema);
