/**
 * Middleware Index
 * Central export point for all middleware
 */

const { 
  validate, 
  handleValidationErrors, 
  sanitizeInputs,
  limitRequestSize 
} = require('./validation');

const {
  requestLogger,
  errorLogger,
  performanceLogger,
  securityLogger,
  analyticsLogger
} = require('./logging');

const {
  rateLimiters,
  dynamicRateLimiter,
  slidingWindowLimiter,
  applyRateLimiting
} = require('./rateLimiting');

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
  // Prevent XSS attacks
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' wss: https:"
    );
  }
  
  next();
};

/**
 * Request ID middleware
 * Adds unique ID to each request for tracking
 */
const requestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || 
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  next();
};

/**
 * Compression middleware
 */
const compression = require('compression');
const compress = compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6 // Balanced compression level
});

/**
 * API versioning middleware
 */
const apiVersion = (version = 'v1') => {
  return (req, res, next) => {
    res.setHeader('X-API-Version', version);
    req.apiVersion = version;
    next();
  };
};

/**
 * Maintenance mode middleware
 */
const maintenanceMode = (req, res, next) => {
  if (process.env.MAINTENANCE_MODE === 'true') {
    return res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable',
      message: 'The service is currently under maintenance. Please try again later.',
      maintenance: true
    });
  }
  next();
};

/**
 * Apply all middleware to Express app
 */
const setupMiddleware = (app) => {
  // Security
  app.use(securityHeaders);
  app.use(sanitizeInputs);
  
  // Request processing
  app.use(requestId);
  app.use(compress);
  app.use(limitRequestSize('10mb'));
  
  // API features
  app.use(apiVersion('v1'));
  app.use(maintenanceMode);
  
  // Logging (before routes)
  app.use(requestLogger);
  app.use(performanceLogger(1000)); // Log requests over 1 second
  
  // Rate limiting (applied per route in rateLimiting.js)
  applyRateLimiting(app);
};

module.exports = {
  // Validation
  validate,
  handleValidationErrors,
  sanitizeInputs,
  limitRequestSize,
  
  // Logging
  requestLogger,
  errorLogger,
  performanceLogger,
  securityLogger,
  analyticsLogger,
  
  // Rate limiting
  rateLimiters,
  dynamicRateLimiter,
  slidingWindowLimiter,
  applyRateLimiting,
  
  // Other middleware
  securityHeaders,
  requestId,
  compress,
  apiVersion,
  maintenanceMode,
  
  // Setup function
  setupMiddleware
};