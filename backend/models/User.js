const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/, 'Please enter a valid email']
  },
  personalEmail: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/, 'Please enter a valid personal email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  role: {
    type: String,
    enum: ['student', 'professor', 'dept_admin', 'inst_admin', 'super_admin', 'university_admin', 'academic_administrator', 'academic_admin'],
    default: 'student'
  },
  university: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'University'
  },
  institution: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution'
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  phone: {
    type: String,
    trim: true
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 500
  },
  currentSemester: {
    type: Number,
    min: 1,
    max: 8,
    default: 1
  },
  division: {
    type: String,
    trim: true,
    uppercase: true,
    default: ''
  },
  enrollmentNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  professorId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  courses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  }],
  preferredLanguage: {
    type: String,
    enum: ['English', 'Hindi', 'Gujarati'],
    default: 'English'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// Database indexes
userSchema.index({ name: 'text', email: 'text' });
userSchema.index({ role: 1 });
userSchema.index({ university: 1 });
userSchema.index({ institution: 1 });
userSchema.index({ department: 1 });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', userSchema);
