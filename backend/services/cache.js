/**
 * Redis Cache Service
 * Provides caching layer for frequently accessed data
 * Falls back gracefully if Redis is unavailable
 */
let redis = null;
let isConnected = false;
let hasLoggedUnavailable = false;

const markRedisUnavailable = (message) => {
  isConnected = false;
  if (!hasLoggedUnavailable) {
    console.warn('Redis not available, running without cache:', message);
    hasLoggedUnavailable = true;
  }
};

const initRedis = async () => {
  if (!process.env.REDIS_URL) {
    markRedisUnavailable('REDIS_URL is not configured');
    return;
  }

  try {
    const Redis = require('ioredis');
    const client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 1) return null;
        return 300;
      },
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: 3000
    });

    client.on('error', (err) => {
      isConnected = false;

      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        markRedisUnavailable(err.message);
        return;
      }

      console.warn('Redis error:', err.message);
    });

    client.on('reconnecting', () => {
      console.log('Redis reconnecting...');
    });

    client.on('connect', () => {
      isConnected = true;
      hasLoggedUnavailable = false;
      console.log('Redis connected');
    });

    client.on('end', () => {
      isConnected = false;
    });

    await client.connect();
    redis = client;
  } catch (err) {
    markRedisUnavailable(err.message);

    if (redis) {
      try {
        redis.disconnect();
      } catch {
        // Ignore disconnect failures on startup
      }
    }

    redis = null;
  }
};

const cacheGet = async (key) => {
  if (!isConnected || !redis) return null;
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

const cacheSet = async (key, value, ttlSeconds = 300) => {
  if (!isConnected || !redis) return;
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Silently fail
  }
};

const cacheDel = async (pattern) => {
  if (!isConnected || !redis) return;
  try {
    if (pattern.includes('*')) {
      const keys = await redis.keys(pattern);
      if (keys.length) await redis.del(...keys);
    } else {
      await redis.del(pattern);
    }
  } catch {
    // Silently fail
  }
};

const cacheFlush = async () => {
  if (!isConnected || !redis) return;
  try {
    await redis.flushdb();
  } catch {
    // Silently fail
  }
};

/**
 * Cache middleware - caches GET request responses
 * @param {number} ttl - Time to live in seconds
 * @param {Function} keyGenerator - Optional function to generate cache key
 */
const cacheMiddleware = (ttl = 300, keyGenerator = null) => {
  return async (req, res, next) => {
    if (req.method !== 'GET' || !isConnected) return next();

    const key = keyGenerator
      ? keyGenerator(req)
      : `cache:${req.originalUrl}:${req.user?._id || 'anon'}`;

    try {
      const cached = await cacheGet(key);
      if (cached) {
        return res.json(cached);
      }
    } catch {
      return next();
    }

    // Override res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      cacheSet(key, data, ttl).catch(() => {});
      return originalJson(data);
    };
    next();
  };
};

module.exports = {
  initRedis,
  cacheGet,
  cacheSet,
  cacheDel,
  cacheFlush,
  cacheMiddleware
};
