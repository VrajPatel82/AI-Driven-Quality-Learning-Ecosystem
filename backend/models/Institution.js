const mongoose = require('mongoose');

const institutionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Institution name is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Institution code is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  contactEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  contactPhone: {
    type: String,
    trim: true
  },
  university: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'University'
  }
}, {
  timestamps: true
});

institutionSchema.index({ university: 1 });

module.exports = mongoose.model('Institution', institutionSchema);
