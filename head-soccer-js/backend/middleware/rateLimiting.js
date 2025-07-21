/**
 * Enhanced Rate Limiting Middleware
 * Provides flexible rate limiting for different endpoint types
 */

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { supabase } = require('../database/supabase');

/**
 * Create Redis store if available, fallback to memory
 */
const createStore = (prefix) => {
  try {
    const redisClient = require('../database/redis').client;
    if (redisClient && redisClient.status === 'ready') {
      return new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: `rl:${prefix}:`
      });
    }
  } catch (error) {
    console.warn('Redis not available for rate limiting, using memory store');
  }
  return undefined; // Use default memory store
};

/**
 * Custom key generator that combines IP and user ID
 */
const keyGenerator = (req) => {
  const userId = req.user?.userId || 'anonymous';
  const ip = req.ip || req.connection.remoteAddress;
  return `${ip}:${userId}`;
};

/**
 * Rate limiters for different endpoint types
 */
const rateLimiters = {
  // Strict limiter for authentication endpoints
  auth: rateLimit({
    windowMs: process.env.NODE_ENV === 'production' ? 15 * 60 * 1000 : 60 * 1000, // 15 min prod, 1 min dev
    max: process.env.NODE_ENV === 'production' ? 5 : 50,
    message: {
      success: false,
      error: 'Too many authentication attempts, please try again later',
      retryAfter: process.env.NODE_ENV === 'production' ? 900 : 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore('auth'),
    keyGenerator,
    handler: (req, res) => {
      // Log security event
      const { securityLogger } = require('./logging');
      securityLogger.logRateLimitExceeded(req.ip, req.originalUrl);
      
      res.status(429).json({
        success: false,
        error: 'Too many authentication attempts, please try again later',
        retryAfter: process.env.NODE_ENV === 'production' ? 900 : 60
      });
    }
  }),

  // Moderate limiter for game endpoints
  game: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 1 request per second average
    message: {
      success: false,
      error: 'Too many game requests, please slow down',
      retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore('game'),
    keyGenerator
  }),

  // Lenient limiter for read-only endpoints
  read: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 120, // 2 requests per second average
    message: {
      success: false,
      error: 'Too many requests, please slow down',
      retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore('read'),
    keyGenerator,
    skip: (req) => {
      // Skip rate limiting for authenticated premium users (future feature)
      return req.user?.isPremium === true;
    }
  }),

  // Very strict limiter for expensive operations
  expensive: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: {
      success: false,
      error: 'Too many expensive operations, please wait before trying again',
      retryAfter: 3600
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore('expensive'),
    keyGenerator
  }),

  // WebSocket connection limiter
  websocket: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // Max 5 new connections per minute
    message: {
      success: false,
      error: 'Too many connection attempts',
      retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore('websocket'),
    keyGenerator: (req) => req.ip // Only by IP for WebSocket
  })
};

/**
 * Dynamic rate limiter based on user reputation
 * Adjusts limits based on user behavior
 */
const dynamicRateLimiter = (baseConfig) => {
  return async (req, res, next) => {
    if (!req.user?.userId) {
      // Use base config for anonymous users
      return rateLimit(baseConfig)(req, res, next);
    }

    try {
      // Get user reputation from database
      const { data: user } = await supabase
        .from('users')
        .select('elo_rating, created_at')
        .eq('id', req.user.userId)
        .single();

      if (!user) {
        return rateLimit(baseConfig)(req, res, next);
      }

      // Calculate reputation score
      const accountAge = Date.now() - new Date(user.created_at).getTime();
      const daysSinceCreation = accountAge / (1000 * 60 * 60 * 24);
      const reputationMultiplier = Math.min(2, 1 + (daysSinceCreation / 30) + (user.elo_rating - 1200) / 1000);

      // Adjust rate limit based on reputation
      const adjustedConfig = {
        ...baseConfig,
        max: Math.floor(baseConfig.max * reputationMultiplier)
      };

      return rateLimit(adjustedConfig)(req, res, next);
    } catch (error) {
      // Fallback to base config on error
      return rateLimit(baseConfig)(req, res, next);
    }
  };
};

/**
 * Sliding window rate limiter for more accurate limiting
 */
const slidingWindowLimiter = (options) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const key = options.keyGenerator ? options.keyGenerator(req) : req.ip;
    const now = Date.now();
    const windowStart = now - options.windowMs;
    
    // Get or create request log for this key
    if (!requests.has(key)) {
      requests.set(key, []);
    }
    
    const requestLog = requests.get(key);
    
    // Remove old requests outside the window
    const validRequests = requestLog.filter(timestamp => timestamp > windowStart);
    
    if (validRequests.length >= options.max) {
      const oldestRequest = Math.min(...validRequests);
      const resetTime = oldestRequest + options.windowMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);
      
      res.setHeader('X-RateLimit-Limit', options.max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());
      res.setHeader('Retry-After', retryAfter);
      
      return res.status(429).json({
        success: false,
        error: options.message || 'Too many requests',
        retryAfter
      });
    }
    
    // Add current request
    validRequests.push(now);
    requests.set(key, validRequests);
    
    // Set headers
    res.setHeader('X-RateLimit-Limit', options.max);
    res.setHeader('X-RateLimit-Remaining', options.max - validRequests.length);
    
    // Cleanup old entries periodically
    if (Math.random() < 0.01) { // 1% chance
      for (const [k, v] of requests.entries()) {
        if (v.every(timestamp => timestamp < windowStart)) {
          requests.delete(k);
        }
      }
    }
    
    next();
  };
};

/**
 * Apply rate limiting to all routes
 */
const applyRateLimiting = (app) => {
  // Skip global rate limiting - let individual routes handle it
  // This prevents double application of rate limiters which causes the "next is not a function" error
  
  // Authentication routes are handled in individual route files
  // Game routes are handled in individual route files  
  // Read routes are handled in individual route files
  // Expensive operations are handled in individual route files
  
  console.log('Rate limiting configured - handled by individual routes');
};

module.exports = {
  rateLimiters,
  dynamicRateLimiter,
  slidingWindowLimiter,
  applyRateLimiting,
  keyGenerator
};