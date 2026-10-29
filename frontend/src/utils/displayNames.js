/**
 * Display Name Override Mapping
 * Maps email addresses to custom display names that override database names
 * This allows frontend to show customized names without modifying the database
 */

const DISPLAY_NAME_OVERRIDES = {
  'titiksha@superadmin.com': {
    name: 'Titiksha Raval',
    email: 'titiksha@superadmin.com'
  },
  'hiten@iitb.ac.in': {
    name: 'Hiten Sadani',
    email: 'hiten@iitb.ac.in'
  },
  'vraj@iitb.ac.in': {
    name: 'Vraj Patel',
    email: 'vraj@iitb.ac.in'
  }
};

/**
 * Get display name for a user
 * @param {Object} user - User object with email and name
 * @returns {Object} User object with potentially overridden name
 */
export const getDisplayUser = (user) => {
  if (!user || !user.email) return user;
  
  const override = DISPLAY_NAME_OVERRIDES[user.email.toLowerCase()];
  if (override) {
    return {
      ...user,
      name: override.name,
      email: override.email
    };
  }
  return user;
};

/**
 * Get display name for a user email
 * @param {string} email - User email
 * @param {string} defaultName - Default name if no override exists
 * @returns {string} Display name
 */
export const getDisplayName = (email, defaultName = '') => {
  const override = DISPLAY_NAME_OVERRIDES[email?.toLowerCase()];
  return override?.name || defaultName;
};

export default {
  getDisplayUser,
  getDisplayName
};
