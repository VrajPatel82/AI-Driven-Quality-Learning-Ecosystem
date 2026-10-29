const { recordCriticalEvent } = require('../services/auditService');

const roleCheck = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Normalize aliases (academic_admin <=> academic_administrator)
    const normalizedAllowed = new Set(allowedRoles);
    if (normalizedAllowed.has('academic_administrator') || normalizedAllowed.has('academic_admin')) {
      normalizedAllowed.add('academic_administrator');
      normalizedAllowed.add('academic_admin');
    }

    if (!normalizedAllowed.has(req.user.role)) {
      // Log unauthorized access attempts on privileged super_admin endpoints
      if (normalizedAllowed.has('super_admin')) {
        recordCriticalEvent({
          actor: req.user,
          eventFamily: 'SECURITY',
          severity: 'CRITICAL',
          action: 'unauthorized_access',
          resource: 'security',
          description: `Unauthorized privilege access attempt on endpoint "${req.originalUrl || req.url}" by user ${req.user.email} (Role: ${req.user.role}).`,
          changes: {
            attemptedEndpoint: req.originalUrl || req.url,
            attemptedRoleRequired: allowedRoles,
            actualUserRole: req.user.role,
            userEmail: req.user.email
          },
          ipAddress: req.ip || '',
          userAgent: req.headers ? (req.headers['user-agent'] || '') : '',
          university: req.user.university,
          eventScope: 'PLATFORM'
        }).catch(() => {});
      }

      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    next();
  };
};

module.exports = roleCheck;

