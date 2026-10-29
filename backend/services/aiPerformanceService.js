const AIPerformanceMetric = require('../models/AIPerformanceMetric');
const AIPerformanceConfig = require('../models/AIPerformanceConfig');
const User = require('../models/User');
const Course = require('../models/Course');
const Department = require('../models/Department');
const Institution = require('../models/Institution');
const Lecture = require('../models/Lecture');
const Assignment = require('../models/Assignment');

// Cache config for 5 seconds to minimize DB hits on high throughput
let cachedConfig = { enabled: true, lastFetched: 0 };
const CACHE_TTL_MS = 5000;

/**
 * Check if AI performance metric collection is enabled globally
 */
async function isMonitoringEnabled() {
  const now = Date.now();
  if (now - cachedConfig.lastFetched < CACHE_TTL_MS) {
    return cachedConfig.enabled;
  }
  try {
    const config = await AIPerformanceConfig.getConfig();
    cachedConfig = { enabled: config.enabled !== false, lastFetched: now };
    return cachedConfig.enabled;
  } catch (err) {
    console.warn('[aiPerformanceService] Could not read AIPerformanceConfig:', err.message);
    return true; // Default to true if config check fails
  }
}

/**
 * Update global monitoring setting (Super Admin only)
 */
async function setMonitoringEnabled(enabled, userId) {
  const config = await AIPerformanceConfig.getConfig();
  config.enabled = Boolean(enabled);
  config.updatedBy = userId || null;
  await config.save();
  cachedConfig = { enabled: config.enabled, lastFetched: Date.now() };
  return config;
}

/**
 * Classify error message into safe error category
 */
function categorizeError(errorMsg = '') {
  const msg = String(errorMsg || '').toLowerCase();
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) return 'RATE_LIMIT_429';
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')) return 'TIMEOUT';
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('key')) return 'AUTH_ERROR';
  if (msg.includes('503') || msg.includes('unavailable')) return 'PROVIDER_UNAVAILABLE_503';
  if (msg.includes('capacity') || msg.includes('storage')) return 'STORAGE_CAPACITY_ERROR';
  if (msg.includes('extract') || msg.includes('unreadable') || msg.includes('corrupt') || msg.includes('format')) return 'EXTRACTION_ERROR';
  if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('fetch failed')) return 'NETWORK_ERROR';
  if (msg.includes('invalid') || msg.includes('validation') || msg.includes('schema')) return 'VALIDATION_ERROR';
  return 'INTERNAL_ERROR';
}

/**
 * Resolve university, institution, department, and professor/user ownership
 */
async function resolveHierarchy(params = {}) {
  let university = null;
  let institution = null;
  let department = null;

  // Unpack params safely (supports userId/user, courseId/course, lectureId/lecture, assignmentId/assignment, audioId/audioRecordId)
  const rawUser = params.userId || params.user || null;
  const rawCourse = params.courseId || params.course || null;
  const rawLecture = params.lectureId || params.lecture || null;
  const rawAssignment = params.assignmentId || params.assignment || null;
  const rawAudio = params.audioId || params.audioRecordId || params.audio || null;

  let targetUser = (rawUser && typeof rawUser === 'object' && rawUser._id) ? rawUser._id : rawUser;
  let targetCourse = (rawCourse && typeof rawCourse === 'object' && rawCourse._id) ? rawCourse._id : rawCourse;
  let targetLecture = (rawLecture && typeof rawLecture === 'object' && rawLecture._id) ? rawLecture._id : rawLecture;
  let targetAssignment = (rawAssignment && typeof rawAssignment === 'object' && rawAssignment._id) ? rawAssignment._id : rawAssignment;
  let targetAudio = (rawAudio && typeof rawAudio === 'object' && rawAudio._id) ? rawAudio._id : rawAudio;

  try {
    // 0. Resolve from LectureAudio if provided
    if (targetAudio && (!targetLecture || !targetUser)) {
      const LectureAudio = require('../models/LectureAudio');
      const audioDoc = await LectureAudio.findById(targetAudio).select('lecture generatedBy');
      if (audioDoc) {
        if (!targetLecture && audioDoc.lecture) targetLecture = audioDoc.lecture;
        if (!targetUser && audioDoc.generatedBy) targetUser = audioDoc.generatedBy;
      }
    }

    // 1. Resolve from Lecture if provided
    if (targetLecture && (!targetCourse || !targetUser)) {
      const lecture = await Lecture.findById(targetLecture).select('course uploadedBy');
      if (lecture) {
        if (!targetUser && lecture.uploadedBy) targetUser = lecture.uploadedBy;
        if (!targetCourse && lecture.course) targetCourse = lecture.course;
      }
    }

    // 2. Resolve from Assignment if provided
    if (targetAssignment && (!targetCourse || !targetUser)) {
      const assignment = await Assignment.findById(targetAssignment).select('course createdBy');
      if (assignment) {
        if (!targetUser && assignment.createdBy) targetUser = assignment.createdBy;
        if (!targetCourse && assignment.course) targetCourse = assignment.course;
      }
    }

    // 3. Resolve department, institution, university from Course
    if (targetCourse) {
      const course = await Course.findById(targetCourse).select('department professor');
      if (course) {
        if (!targetUser && course.professor) targetUser = course.professor;
        if (course.department) {
          department = course.department;
          const dept = await Department.findById(course.department).select('institution');
          if (dept && dept.institution) {
            institution = dept.institution;
            const inst = await Institution.findById(dept.institution).select('university');
            if (inst && inst.university) {
              university = inst.university;
            }
          }
        }
      }
    }

    // 4. Fallback / Fill missing pieces from User
    if (targetUser && (!department || !institution || !university)) {
      const u = await User.findById(targetUser).select('department institution university');
      if (u) {
        if (!department && u.department) department = u.department;
        if (!institution && u.institution) institution = u.institution;
        if (!university && u.university) university = u.university;
      }
    }

    // 5. If institution is known but university is still missing
    if (institution && !university) {
      const inst = await Institution.findById(institution).select('university');
      if (inst && inst.university) university = inst.university;
    }
  } catch (err) {
    console.warn('[aiPerformanceService] Hierarchy resolution warning:', err.message);
  }

  return { university, institution, department, user: targetUser };
}

/**
 * Record a logical AI workflow performance metric
 * Non-blocking: catches and suppresses internal errors to guarantee main AI workflows are never disrupted
 */
async function recordMetric({
  operationType,
  logicalOperationId,
  durationMs,
  startTime,
  endTime,
  status,
  provider = '',
  model = '',
  targetLanguage = '',
  errorCategory = '',
  errorMessage = '',
  resourceType,
  resourceId,
  stages = [],
  hierarchy = null,
  university = null,
  institution = null,
  department = null,
  user = null
}) {
  try {
    const enabled = await isMonitoringEnabled();
    if (!enabled) {
      return null; // Monitoring disabled by Super Admin
    }

    // Merge hierarchy object if supplied
    if (hierarchy && typeof hierarchy === 'object') {
      if (!university && hierarchy.university) university = hierarchy.university;
      if (!institution && hierarchy.institution) institution = hierarchy.institution;
      if (!department && hierarchy.department) department = hierarchy.department;
      if (!user && hierarchy.user) user = hierarchy.user;
    }

    // Auto-resolve missing hierarchy if resource or user is available
    if (!department && !institution && !university) {
      let resolved = null;
      if (resourceType === 'LECTURE_AUDIO' && resourceId) {
        resolved = await resolveHierarchy({ audioId: resourceId, userId: user });
      } else if (resourceType === 'LECTURE' && resourceId) {
        resolved = await resolveHierarchy({ lectureId: resourceId, userId: user });
      } else if (resourceType === 'ASSIGNMENT' && resourceId) {
        resolved = await resolveHierarchy({ assignmentId: resourceId, userId: user });
      } else if (user) {
        resolved = await resolveHierarchy({ userId: user });
      }

      if (resolved) {
        if (!university && resolved.university) university = resolved.university;
        if (!institution && resolved.institution) institution = resolved.institution;
        if (!department && resolved.department) department = resolved.department;
        if (!user && resolved.user) user = resolved.user;
      }
    }

    const metric = await AIPerformanceMetric.create({
      operationType,
      logicalOperationId: String(logicalOperationId),
      durationMs: Math.max(0, Math.round(durationMs || 0)),
      startTime: startTime || new Date(Date.now() - (durationMs || 0)),
      endTime: endTime || new Date(),
      status: String(status || '').toLowerCase() === 'failed' ? 'failed' : 'success',
      provider: provider || '',
      model: model || '',
      targetLanguage: targetLanguage || '',
      errorCategory: String(status || '').toLowerCase() === 'failed' ? (errorCategory || categorizeError(errorMessage)) : '',
      errorMessage: String(status || '').toLowerCase() === 'failed' ? String(errorMessage || '').slice(0, 500) : '',
      resourceType,
      resourceId: resourceId || null,
      stages: Array.isArray(stages) ? stages.map(s => ({
        stageName: s.stageName,
        durationMs: Math.max(0, Math.round(s.durationMs || 0)),
        provider: s.provider || '',
        model: s.model || '',
        status: String(s.status || '').toLowerCase() === 'failed' ? 'failed' : 'success',
        errorMessage: s.errorMessage ? String(s.errorMessage).slice(0, 300) : ''
      })) : [],
      university: university || null,
      institution: institution || null,
      department: department || null,
      user: user || null
    });

    return metric;
  } catch (err) {
    console.error('[aiPerformanceService] Failed to record metric (suppressed):', err.message);
    return null;
  }
}

/**
 * Helper to time an individual stage and append it to a stages array
 */
async function timeStage(stagesArray, stageName, { provider = '', model = '' } = {}, asyncFn) {
  const start = Date.now();
  try {
    const result = await asyncFn();
    const durationMs = Date.now() - start;
    stagesArray.push({
      stageName,
      durationMs,
      provider,
      model,
      status: 'SUCCESS'
    });
    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    stagesArray.push({
      stageName,
      durationMs,
      provider,
      model,
      status: 'FAILED',
      errorMessage: err.message
    });
    throw err;
  }
}

module.exports = {
  isMonitoringEnabled,
  setMonitoringEnabled,
  categorizeError,
  resolveHierarchy,
  recordMetric,
  timeStage
};
