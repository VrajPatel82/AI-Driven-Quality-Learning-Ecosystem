import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { ROLES, normalizeRole } from '../../utils/roles';

/**
 * Safely extracts a clean display name from an entity or property.
 * Prevents displaying raw MongoDB ObjectIds (24-character hexadecimal strings).
 */
const cleanName = (val) => {
  if (!val) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^[0-9a-fA-F]{24}$/.test(trimmed)) return '';
    return trimmed;
  }
  if (typeof val === 'object' && val.name && typeof val.name === 'string') {
    const trimmed = val.name.trim();
    if (/^[0-9a-fA-F]{24}$/.test(trimmed)) return '';
    return trimmed;
  }
  return '';
};

/**
 * Role-Based Organizational Hierarchy Breadcrumb
 * Displays academic/organizational context dynamically based on logged-in user's role:
 * - SUPER_ADMIN: nothing (empty/hidden)
 * - UNIVERSITY_ADMIN: University Name
 * - INSTITUTION_ADMIN: University Name / Institution Name
 * - DEPARTMENT_ADMIN: University Name / Institution Name / Department Name
 * - ACADEMIC_ADMINISTRATOR: University Name / Institution Name / Department Name
 * - PROFESSOR: University Name / Institution Name / Department Name
 * - STUDENT: University Name / Institution Name / Department Name
 */
export default function OrgBreadcrumb({ user: propUser, className = '' }) {
  const { user: authUser } = useAuth() || {};
  const user = propUser || authUser;

  if (!user) return null;

  const role = normalizeRole(user.role);

  // 1. Super Admin has global scope - no hierarchy breadcrumb
  if (role === ROLES.SUPER_ADMIN) {
    return null;
  }

  // Determine allowed hierarchy levels based on user role
  let allowUniversity = false;
  let allowInstitution = false;
  let allowDepartment = false;

  switch (role) {
    case ROLES.UNIVERSITY_ADMIN:
      allowUniversity = true;
      break;

    case ROLES.INSTITUTION_ADMIN:
      allowUniversity = true;
      allowInstitution = true;
      break;

    case ROLES.DEPARTMENT_ADMIN:
    case ROLES.ACADEMIC_ADMINISTRATOR:
    case ROLES.PROFESSOR:
    case ROLES.STUDENT:
      allowUniversity = true;
      allowInstitution = true;
      allowDepartment = true;
      break;

    default:
      return null;
  }

  // Extract names safely using existing database relationships / user objects
  const universityName = cleanName(
    user?.university ||
    user?.institution?.university ||
    user?.department?.institution?.university ||
    user?.universityName
  );

  const institutionName = cleanName(
    user?.institution ||
    user?.department?.institution ||
    user?.institutionName
  );

  const departmentName = cleanName(
    user?.department ||
    user?.departmentName
  );

  const items = [];
  if (allowUniversity && universityName) {
    items.push({ id: 'uni', name: universityName });
  }
  if (allowInstitution && institutionName) {
    items.push({ id: 'inst', name: institutionName });
  }
  if (allowDepartment && departmentName) {
    items.push({ id: 'dept', name: departmentName });
  }

  // If no hierarchy levels are available, gracefully return null
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={`flex flex-nowrap sm:flex-wrap items-center gap-1 sm:gap-2 text-[10.5px] sm:text-xs font-medium text-slate-500 min-w-0 overflow-hidden ${className}`}
      data-testid="org-breadcrumb"
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={item.id}>
            {index > 0 && <span className="text-slate-300 shrink-0">/</span>}
            {isLast ? (
              <span
                className="bg-blue-50 text-blue-700 font-semibold px-1.5 py-0.5 rounded border border-blue-100/60 truncate max-w-[90px] sm:max-w-[180px] md:max-w-[240px] shrink min-w-0"
                title={item.name}
              >
                {item.name}
              </span>
            ) : (
              <span
                className={`${index === 0 ? 'text-slate-400' : 'text-slate-500'} truncate max-w-[60px] sm:max-w-[150px] md:max-w-[200px] shrink min-w-0`}
                title={item.name}
              >
                {item.name}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
