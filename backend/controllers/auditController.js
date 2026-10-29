const AuditLog = require('../models/AuditLog');
const { paginate } = require('../utils/pagination');
const { addSseClient, removeSseClient } = require('../services/auditService');

const APPROVED_FAMILIES = ['PRIVILEGE', 'UNIVERSITY', 'SECURITY', 'BULK', 'CONFIGURATION', 'DESTRUCTIVE'];

// Audit logger middleware (preserved for backward compatibility with existing non-critical event writers)
const auditLogger = (action, resource) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = (data) => {
      // Log after successful operation (non-error response)
      if (res.statusCode < 400) {
        AuditLog.create({
          userId: req.user?._id,
          action,
          resource,
          resourceId: req.params.id || data?.id || data?._id,
          description: `${action} ${resource}`,
          changes: action === 'delete' ? {} : (req.body || {}),
          ipAddress: req.ip || req.connection?.remoteAddress || ''
        }).catch(err => console.error('Audit log error:', err.message));
      }

      return originalJson(data);
    };

    next();
  };
};

// @desc    Get critical audit logs (with tenant isolation & scope enforcement)
// @route   GET /api/audit-logs
const getAuditLogs = async (req, res, next) => {
  try {
    const { userId, action, resource, eventFamily, severity, status, university, scope, from, to, search, page, limit } = req.query;
    const filter = {};

    const userRole = req.user?.role;
    const userUniversity = req.user?.university?._id || req.user?.university;

    // Scope & Tenant Isolation
    if (userRole === 'super_admin') {
      // Super Admin can filter by specific university if requested
      if (university) {
        filter.university = university;
      }
    } else if (userRole === 'university_admin') {
      // University Admin MUST ONLY see events for their university, and NEVER platform-wide events
      if (!userUniversity) {
        return res.status(403).json({ message: 'University Admin must be associated with a university.' });
      }
      filter.university = userUniversity;
      filter.eventScope = 'UNIVERSITY';
    } else if (userRole === 'inst_admin' || userRole === 'dept_admin') {
      if (userUniversity) {
        filter.university = userUniversity;
      }
      filter.eventScope = 'UNIVERSITY';
    } else {
      return res.status(403).json({ message: 'Not authorized to view audit logs.' });
    }

    // Critical Event Family Filtering: Surface approved critical event families by default or requested
    if (eventFamily) {
      if (APPROVED_FAMILIES.includes(eventFamily.toUpperCase())) {
        filter.eventFamily = eventFamily.toUpperCase();
      }
    } else {
      // Excludes un-categorized legacy routine audit logs
      filter.eventFamily = { $in: APPROVED_FAMILIES };
    }

    if (severity) filter.severity = severity.toUpperCase();
    if (status) filter.status = status.toUpperCase();
    if (scope && userRole === 'super_admin') filter.eventScope = scope.toUpperCase();
    if (userId) filter.userId = userId;
    if (action) filter.action = action;
    if (resource) filter.resource = resource;

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }
    if (search) {
      filter.description = { $regex: search, $options: 'i' };
    }

    const result = await paginate(AuditLog, filter, { page, limit, sort: { createdAt: -1 } }, [
      { path: 'userId', select: 'name email role' },
      { path: 'university', select: 'name code' },
      { path: 'acknowledgedBy', select: 'name email role' }
    ]);

    res.json({ logs: result.data, ...result.pagination });
  } catch (error) {
    next(error);
  }
};

// @desc    Stream critical audit logs via Server-Sent Events (SSE)
// @route   GET /api/audit-logs/stream
const streamAuditLogs = async (req, res) => {
  const userRole = req.user?.role;
  if (userRole !== 'super_admin' && userRole !== 'university_admin') {
    return res.status(403).json({ message: 'Not authorized to stream audit logs.' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const clientId = `${req.user._id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Register client for live SSE broadcast
  addSseClient(clientId, res, req.user);

  // Send connection confirmation
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', clientId, userRole })}\n\n`);

  // Periodic keep-alive ping
  const keepAliveInterval = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (e) {
      clearInterval(keepAliveInterval);
    }
  }, 30000);

  // Connection close cleanup
  req.on('close', () => {
    clearInterval(keepAliveInterval);
    removeSseClient(clientId);
    res.end();
  });
};

// @desc    Acknowledge a critical audit log event
// @route   PATCH /api/audit-logs/:id/acknowledge
const acknowledgeAuditLog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const auditLog = await AuditLog.findById(id);

    if (!auditLog) {
      return res.status(404).json({ message: 'Audit log event not found.' });
    }

    const userRole = req.user?.role;
    const userUniversity = req.user?.university?._id || req.user?.university;

    // Scope check: University admin can only acknowledge events belonging to their university
    if (userRole === 'university_admin') {
      const logUni = auditLog.university?.toString();
      if (!userUniversity || logUni !== userUniversity.toString() || auditLog.eventScope !== 'UNIVERSITY') {
        return res.status(403).json({ message: 'Not authorized to acknowledge this event.' });
      }
    } else if (userRole !== 'super_admin') {
      return res.status(403).json({ message: 'Not authorized to acknowledge audit events.' });
    }

    auditLog.status = 'ACKNOWLEDGED';
    auditLog.acknowledgedBy = req.user._id;
    auditLog.acknowledgedAt = new Date();

    await auditLog.save();

    await auditLog.populate([
      { path: 'userId', select: 'name email role' },
      { path: 'university', select: 'name code' },
      { path: 'acknowledgedBy', select: 'name email role' }
    ]);

    res.json({ message: 'Event acknowledged successfully.', log: auditLog });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  auditLogger,
  getAuditLogs,
  streamAuditLogs,
  acknowledgeAuditLog
};

