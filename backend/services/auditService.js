const AuditLog = require('../models/AuditLog');

// Set of active SSE client connections
// Client structure: { id, res, user }
const sseClients = new Set();

const APPROVED_FAMILIES = ['PRIVILEGE', 'UNIVERSITY', 'SECURITY', 'BULK', 'CONFIGURATION', 'DESTRUCTIVE'];
const APPROVED_SEVERITIES = ['CRITICAL', 'HIGH'];
const APPROVED_SCOPES = ['PLATFORM', 'UNIVERSITY'];

/**
 * Standardized function to record a critical security/audit event.
 * Ensures persistence to MongoDB BEFORE emitting via live SSE.
 */
async function recordCriticalEvent({
  actor,
  eventFamily,
  severity = 'HIGH',
  action = 'update',
  resource = 'system',
  resourceId = null,
  description = '',
  changes = {},
  ipAddress = '',
  userAgent = '',
  university = null,
  eventScope = 'PLATFORM'
}) {
  try {
    // 1. Validate inputs
    if (!APPROVED_FAMILIES.includes(eventFamily)) {
      throw new Error(`Invalid eventFamily: ${eventFamily}. Must be one of ${APPROVED_FAMILIES.join(', ')}`);
    }

    const normSeverity = APPROVED_SEVERITIES.includes(severity) ? severity : 'HIGH';
    const normScope = APPROVED_SCOPES.includes(eventScope) ? eventScope : 'PLATFORM';
    const actorId = actor?._id || actor;

    if (!actorId) {
      throw new Error('Actor (userId) is required to record a critical event.');
    }

    const resolvedUniversity = university?._id || university || (eventScope === 'UNIVERSITY' && actor?.university ? (actor.university._id || actor.university) : null);

    // 2. Persist to MongoDB FIRST
    const auditLog = await AuditLog.create({
      userId: actorId,
      action,
      resource,
      resourceId,
      description,
      changes,
      ipAddress: ipAddress || '',
      userAgent: userAgent || '',
      eventFamily,
      severity: normSeverity,
      university: resolvedUniversity,
      eventScope: normScope,
      status: 'OPEN'
    });

    // Populate user and university for rich live notifications
    await auditLog.populate([
      { path: 'userId', select: 'name email role' },
      { path: 'university', select: 'name code' }
    ]);

    // 3. Broadcast live event to authenticated SSE clients AFTER successful persistence
    broadcastCriticalEvent(auditLog);

    return auditLog;
  } catch (error) {
    console.error('Failed to record critical audit log event:', error.message);
    // Return null or rethrow based on caller needs, but ensure app stability
    return null;
  }
}

/**
 * Broadcasts a newly persisted audit event to connected SSE clients according to scope rules.
 */
function broadcastCriticalEvent(event) {
  if (!sseClients.size) return;

  const eventPayload = `id: ${event._id}\nevent: critical_event\ndata: ${JSON.stringify(event)}\n\n`;

  for (const client of sseClients) {
    try {
      const userRole = client.user?.role;

      // Super Admin receives all platform and university critical events
      if (userRole === 'super_admin') {
        client.res.write(eventPayload);
        continue;
      }

      // University Admin only receives events matching their exact university scope (never platform-wide)
      if (userRole === 'university_admin' && event.eventScope === 'UNIVERSITY' && event.university) {
        const userUni = (client.user.university?._id || client.user.university)?.toString();
        const eventUni = (event.university?._id || event.university)?.toString();

        if (userUni && eventUni && userUni === eventUni) {
          client.res.write(eventPayload);
        }
      }
    } catch (err) {
      console.error('Error writing SSE event to client:', err.message);
      sseClients.delete(client);
    }
  }
}

/**
 * Add a connected SSE client response stream.
 */
function addSseClient(clientId, res, user) {
  const client = { id: clientId, res, user };
  sseClients.add(client);
}

/**
 * Remove an SSE client on disconnect.
 */
function removeSseClient(clientId) {
  for (const client of sseClients) {
    if (client.id === clientId) {
      sseClients.delete(client);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Security Incident Aggregator (Lightweight Sliding Window)
// ---------------------------------------------------------------------------

const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes bounded window
const FAILED_LOGIN_THRESHOLD = 5; // 5 failed attempts across accounts/IPs in window

// In-memory ring buffer of failed attempts: { email, ip, timestamp }
let failedAttempts = [];

/**
 * Tracks failed login attempts and triggers ONE aggregated SECURITY critical event
 * when suspicious multi-account authentication activity crosses threshold.
 */
async function trackFailedLogin(email, ip = '', userAgent = '', fallbackSystemActorId = null) {
  const now = Date.now();
  
  // Clean up entries older than 15 minutes
  failedAttempts = failedAttempts.filter(a => now - a.timestamp < FAILED_LOGIN_WINDOW_MS);
  
  // Record current attempt
  failedAttempts.push({ email: (email || 'unknown').toLowerCase().trim(), ip, timestamp: now });

  const uniqueEmails = new Set(failedAttempts.map(a => a.email));
  const uniqueIPs = new Set(failedAttempts.map(a => a.ip).filter(Boolean));

  // Check if threshold is crossed for multi-account activity
  if (failedAttempts.length >= FAILED_LOGIN_THRESHOLD && uniqueEmails.size >= 2) {
    const affectedCount = uniqueEmails.size;
    const attemptCount = failedAttempts.length;
    const ipCount = uniqueIPs.size;

    // Reset buffer after triggering alert to avoid duplicate flood
    failedAttempts = [];

    // Trigger ONE aggregated SECURITY critical event
    await recordCriticalEvent({
      actor: fallbackSystemActorId,
      eventFamily: 'SECURITY',
      severity: 'CRITICAL',
      action: 'security_incident',
      resource: 'security',
      description: `Suspicious authentication activity detected: ${attemptCount} failed login attempts across ${affectedCount} account(s) from ${ipCount} IP(s) within 15m.`,
      changes: {
        incidentType: 'SUSPICIOUS_AUTH_ACTIVITY',
        failedAttemptCount: attemptCount,
        affectedAccountCount: affectedCount,
        sourceIPCount: ipCount,
        timeWindow: '15m'
      },
      ipAddress: Array.from(uniqueIPs).join(', '),
      userAgent: userAgent || '',
      eventScope: 'PLATFORM'
    });
  }
}

module.exports = {
  recordCriticalEvent,
  addSseClient,
  removeSseClient,
  trackFailedLogin
};
