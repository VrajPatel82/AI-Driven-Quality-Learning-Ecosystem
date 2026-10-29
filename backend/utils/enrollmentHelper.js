const Enrollment = require('../models/Enrollment');

/**
 * Gets active enrolled course IDs for a student from the Enrollment collection (Single Source of Truth).
 * READ-ONLY: Executes zero database writes during GET operations.
 * 
 * @param {string|ObjectId} studentId 
 * @param {Object} [userObj] Optional user object (kept for signature compatibility)
 * @returns {Promise<Array<string>>} Array of course ID strings
 */
async function getStudentEnrolledCourseIds(studentId, userObj = null) {
  if (!studentId) return [];

  // 1. Authoritative Source of Truth: Active records from Enrollment collection only
  const enrollments = await Enrollment.find({ student: studentId, status: 'active' }).select('course');
  if (!enrollments || enrollments.length === 0) {
    return [];
  }

  const courseIds = enrollments
    .map(e => e.course)
    .filter(Boolean)
    .map(c => (c._id || c).toString());

  return Array.from(new Set(courseIds));
}

/**
 * Verifies whether a student has an active Enrollment in a specific course.
 * 
 * @param {string|ObjectId} studentId 
 * @param {string|ObjectId} courseId 
 * @param {Object} [userObj] 
 * @returns {Promise<boolean>}
 */
async function isStudentEnrolledInCourse(studentId, courseId, userObj = null) {
  if (!studentId || !courseId) return false;

  const enrolledCourseIds = await getStudentEnrolledCourseIds(studentId, userObj);
  return enrolledCourseIds.includes(courseId.toString());
}

module.exports = {
  getStudentEnrolledCourseIds,
  isStudentEnrolledInCourse
};


