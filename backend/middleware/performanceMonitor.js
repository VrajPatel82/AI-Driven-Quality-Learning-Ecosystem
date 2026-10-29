/**
 * Performance monitoring middleware
 * Tracks response times, error rates, and slow requests
 */
const metrics = {
  requests: [],
  errors: 0,
  totalRequests: 0,
  startTime: Date.now(),

  record(method, path, duration, statusCode) {
    this.totalRequests++;
    if (statusCode >= 400) this.errors++;

    // Keep only last 1000 entries for memory efficiency
    if (this.requests.length >= 1000) {
      this.requests = this.requests.slice(-500);
    }

    this.requests.push({
      method,
      path,
      duration,
      statusCode,
      timestamp: Date.now()
    });
  },

  getStats() {
    const now = Date.now();
    const last5min = this.requests.filter(r => now - r.timestamp < 300000);
    const durations = last5min.map(r => r.duration).sort((a, b) => a - b);

    const uptimeMs = now - this.startTime;
    const uptimeHrs = (uptimeMs / 3600000).toFixed(1);

    return {
      uptime: `${uptimeHrs} hours`,
      totalRequests: this.totalRequests,
      errorRate: this.totalRequests > 0
        ? parseFloat(((this.errors / this.totalRequests) * 100).toFixed(2))
        : 0,
      last5Minutes: {
        requests: last5min.length,
        avgResponseTime: durations.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0,
        p95ResponseTime: durations.length
          ? durations[Math.floor(durations.length * 0.95)] || 0
          : 0,
        slowestEndpoints: this._getSlowest(last5min),
        errors: last5min.filter(r => r.statusCode >= 400).length
      }
    };
  },

  _getSlowest(requests) {
    const byPath = {};
    requests.forEach(r => {
      // Normalize paths with IDs
      const normalized = r.path.replace(/\/[a-f0-9]{24}/g, '/:id');
      if (!byPath[normalized]) byPath[normalized] = [];
      byPath[normalized].push(r.duration);
    });

    return Object.entries(byPath)
      .map(([path, durations]) => ({
        path,
        avgMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
        count: durations.length
      }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 5);
  }
};

const performanceMonitor = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const path = req.route ? req.route.path : req.path;
    metrics.record(req.method, path, duration, res.statusCode);

    // Warn on slow requests (>2 seconds)
    if (duration > 2000) {
      console.warn(`Slow request: ${req.method} ${req.originalUrl} - ${duration}ms`);
    }
  });

  next();
};

const getMetrics = (req, res) => {
  res.json({ metrics: metrics.getStats() });
};

module.exports = { performanceMonitor, getMetrics };
