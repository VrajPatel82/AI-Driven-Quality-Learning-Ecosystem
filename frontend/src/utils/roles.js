/**
 * Standardized Role Constants & Helpers
 * Supports both canonical lowercase and uppercase role identifiers
 */

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  UNIVERSITY_ADMIN: 'university_admin',
  INSTITUTION_ADMIN: 'inst_admin',
  DEPARTMENT_ADMIN: 'dept_admin',
  ACADEMIC_ADMINISTRATOR: 'academic_administrator',
  PROFESSOR: 'professor',
  STUDENT: 'student'
};

/**
 * Normalizes any role string to canonical lowercase format
 * @param {string} role 
 * @returns {string} normalized role
 */
export const normalizeRole = (role) => {
  if (!role) return '';
  const lower = String(role).trim().toLowerCase();
  
  if (lower === 'universityadmin' || lower === 'university_admin') return ROLES.UNIVERSITY_ADMIN;
  if (lower === 'academicadmin' || lower === 'academic_admin' || lower === 'academicadministrator' || lower === 'academic_administrator') {
    return ROLES.ACADEMIC_ADMINISTRATOR;
  }
  if (lower === 'departmentadmin' || lower === 'department_admin' || lower === 'deptadmin' || lower === 'dept_admin') {
    return ROLES.DEPARTMENT_ADMIN;
  }
  if (lower === 'institutionadmin' || lower === 'institution_admin' || lower === 'instadmin' || lower === 'inst_admin') {
    return ROLES.INSTITUTION_ADMIN;
  }
  if (lower === 'superadmin' || lower === 'super_admin') return ROLES.SUPER_ADMIN;
  if (lower === 'prof' || lower === 'faculty' || lower === 'professor') return ROLES.PROFESSOR;
  if (lower === 'student') return ROLES.STUDENT;

  return lower;
};

/**
 * Get human-readable role label
 * @param {string} role 
 * @returns {string} display label
 */
export const getRoleLabel = (role) => {
  const norm = normalizeRole(role);
  switch (norm) {
    case ROLES.SUPER_ADMIN: return 'Super Admin';
    case ROLES.UNIVERSITY_ADMIN: return 'University Admin';
    case ROLES.INSTITUTION_ADMIN: return 'Institutional Admin';
    case ROLES.DEPARTMENT_ADMIN: return 'Department Admin';
    case ROLES.ACADEMIC_ADMINISTRATOR: return 'Academic Administrator';
    case ROLES.PROFESSOR: return 'Professor';
    case ROLES.STUDENT: return 'Student';
    default: return role || 'User';
  }
};
