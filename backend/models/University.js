const mongoose = require('mongoose');

const universitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'University name is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'University code/acronym is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  acronym: {
    type: String,
    uppercase: true,
    trim: true,
    sparse: true
  },
  state: {
    type: String,
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
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

universitySchema.pre('validate', function(next) {
  if (this.acronym && !this.code) {
    this.code = this.acronym.trim().toUpperCase();
  } else if (this.code && !this.acronym) {
    this.acronym = this.code.trim().toUpperCase();
  } else if (this.acronym && this.code) {
    this.acronym = this.acronym.trim().toUpperCase();
    this.code = this.code.trim().toUpperCase();
  }
  next();
});

universitySchema.index({ name: 'text', code: 'text', acronym: 'text' });
universitySchema.index({ status: 1 });

module.exports = mongoose.model('University', universitySchema);
