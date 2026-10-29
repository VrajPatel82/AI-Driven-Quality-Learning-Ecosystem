const mongoose = require('mongoose');

const facultySubstitutionSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: [true, 'Course is required'],
    index: true
  },
  institution: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: [true, 'Institution is required'],
    index: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: [true, 'Department is required'],
    index: true
  },
  regularProfessor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Regular professor is required'],
    index: true
  },
  substituteProfessor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Substitute professor is required'],
    index: true
  },
  date: {
    type: Date,
    required: [true, 'Substitution date is required'],
    index: true
  },
  semester: {
    type: Number,
    required: [true, 'Semester is required'],
    min: 1,
    max: 12
  },
  division: {
    type: String,
    trim: true,
    uppercase: true,
    default: '',
    index: true
  },
  status: {
    type: String,
    enum: ['APPROVED', 'CANCELLED'],
    default: 'APPROVED',
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index to prevent duplicate active substitutions
facultySubstitutionSchema.index({
  course: 1,
  date: 1,
  division: 1,
  substituteProfessor: 1,
  status: 1
});

module.exports = mongoose.models.FacultySubstitution || mongoose.model('FacultySubstitution', facultySubstitutionSchema);
