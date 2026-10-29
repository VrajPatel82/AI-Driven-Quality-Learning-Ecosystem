const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    enum: [
      'create', 'update', 'delete', 'login', 'logout', 'submit', 'grade', 'enroll', 'upload',
      'privilege_change', 'university_change', 'security_incident', 'bulk_operation',
      'config_change', 'destructive_operation', 'unauthorized_access'
    ],
    required: true
  },
  resource: {
    type: String,
    enum: [
      'user', 'lecture', 'quiz', 'course', 'assignment', 'attendance', 'grade',
      'announcement', 'forum', 'timetable', 'event', 'institution', 'department',
      'university', 'platform', 'security', 'role', 'system'
    ],
    required: true
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId
  },
  description: {
    type: String,
    default: ''
  },
  changes: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String,
    default: ''
  },
  // Phase 1 Critical Security & Audit System fields
  eventFamily: {
    type: String,
    enum: ['PRIVILEGE', 'UNIVERSITY', 'SECURITY', 'BULK', 'CONFIGURATION', 'DESTRUCTIVE']
  },
  severity: {
    type: String,
    enum: ['CRITICAL', 'HIGH'],
    default: 'HIGH'
  },
  university: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'University'
  },
  eventScope: {
    type: String,
    enum: ['PLATFORM', 'UNIVERSITY'],
    default: 'PLATFORM'
  },
  status: {
    type: String,
    enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'],
    default: 'OPEN'
  },
  userAgent: {
    type: String,
    default: ''
  },
  acknowledgedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  acknowledgedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Existing Indexes
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ resource: 1 });
auditLogSchema.index({ createdAt: -1 });

// Phase 1 High-Scale Critical Event Query Indexes
auditLogSchema.index({ eventFamily: 1, createdAt: -1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });
auditLogSchema.index({ university: 1, createdAt: -1 });
auditLogSchema.index({ eventScope: 1, createdAt: -1 });
auditLogSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

