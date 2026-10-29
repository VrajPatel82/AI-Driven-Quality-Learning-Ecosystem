const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Course name is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Course code is required'],
    unique: true,
    uppercase: true,
    trim: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  professor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  professors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  semester: {
    type: Number,
    min: 1,
    max: 12
  }
}, {
  timestamps: true
});

// Database indexes
courseSchema.index({ name: 'text', code: 'text' });
courseSchema.index({ department: 1 });
courseSchema.index({ semester: 1 });
courseSchema.index({ professor: 1 });

module.exports = mongoose.model('Course', courseSchema);
