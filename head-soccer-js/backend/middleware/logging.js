/**
 * Request Logging Middleware
 * Provides comprehensive logging for all API requests
 */

const fs = require('fs');
const path = require('path');
const morgan = require('morgan');

/**
 * Custom token for user ID from JWT
 */
morgan.token('user-id', (req) => {
  return req.user?.userId || 'anonymous';
});

/**
 * Custom token for response time in milliseconds
 */
morgan.token('response-time-ms', (req, res) => {
  if (!req._startTime) return '0';
  const diff = process.hrtime(req._startTime);
  const ms = diff[0] * 1000 + diff[1] / 1000000;
  return ms.toFixed(3);
});

/**
 * Custom token for request body (sanitized)
 */
morgan.token('body', (req) => {
  if (req.body && Object.keys(req.body).length > 0) {
    // Remove sensitive fields
    const sanitized = { ...req.body };
    if (sanitized.password) sanitized.password = '[REDACTED]';
    if (sanitized.token) sanitized.token = '[REDACTED]';
    return JSON.stringify(sanitized);
  }
  return '-';
});

/**
 * Development logging format
 * Colorful and easy to read in console
 */
const devFormat = ':method :url :status :response-time-ms ms - :res[content-length] bytes';

/**
 * Production logging format
 * Detailed JSON format for log aggregation
 */
const prodFormat = JSON.stringify({
  timestamp: ':date[iso]',
  method: ':method',
  url: ':url',
  status: ':status',
  responseTime: ':response-time-ms',
  contentLength: ':res[content-length]',
  userAgent: ':user-agent',
  ip: ':remote-addr',
  userId: ':user-id',
  referrer: ':referrer',
  body: ':body'
});

/**
 * Create log directory if it doesn't exist
 */
const logDirectory = path.join(__dirname, '../logs');
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

/**
 * Create write streams for different log types
 */
const accessLogStream = fs.createWriteStream(
  path.join(logDirectory, 'access.log'),
  { flags: 'a' }
);

const errorLogStream = fs.createWriteStream(
  path.join(logDirectory, 'error.log'),
  { flags: 'a' }
);

/**
 * Request logging middleware for development
 */
const devLogger = morgan(devFormat, {
  skip: (req) => req.url === '/health' || req.url === '/favicon.ico'
});

/**
 * Request logging middleware for production
 */
const prodLogger = morgan(prodFormat, {
  stream: accessLogStream,
  skip: (req) => req.url === '/health' || req.url === '/favicon.ico'
});

/**
 * Error logging middleware
 */
const errorLogger = (err, req, res, next) => {
  const errorData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    status: res.statusCode,
    error: {
      message: err.message,
      stack: err.stack,
      code: err.code || 'INTERNAL_ERROR'
    },
    userId: req.user?.userId || 'anonymous',
    ip: req.ip,
    userAgent: req.get('user-agent')
  };

  // Log to file
  errorLogStream.write(JSON.stringify(errorData) + '\n');

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('\n🔴 ERROR:', err.message);
    console.error('Stack:', err.stack);
  }

  next(err);
};

/**
 * Performance monitoring middleware
 * Tracks slow requests
 */
const performanceLogger = (threshold = 1000) => {
  return (req, res, next) => {
    const startTime = process.hrtime();
    req._startTime = startTime;

    res.on('finish', () => {
      const diff = process.hrtime(startTime);
      const responseTime = diff[0] * 1000 + diff[1] / 1000000;

      if (responseTime > threshold) {
        const slowRequestData = {
          timestamp: new Date().toISOString(),
          method: req.method,
          url: req.url,
          responseTime: responseTime.toFixed(3),
          threshold,
          userId: req.user?.userId || 'anonymous'
        };

        console.warn(`⚠️ Slow request detected: ${req.method} ${req.url} took ${responseTime.toFixed(0)}ms`);
        
        // Log to file in production
        if (process.env.NODE_ENV === 'production') {
          fs.appendFileSync(
            path.join(logDirectory, 'slow-requests.log'),
            JSON.stringify(slowRequestData) + '\n'
          );
        }
      }
    });

    next();
  };
};

/**
 * Security event logger
 * Logs suspicious activities
 */
const securityLogger = {
  logFailedLogin: (username, ip) => {
    const event = {
      timestamp: new Date().toISOString(),
      event: 'FAILED_LOGIN',
      username,
      ip,
      userAgent: 'N/A'
    };
    
    fs.appendFileSync(
      path.join(logDirectory, 'security.log'),
      JSON.stringify(event) + '\n'
    );
  },

  logRateLimitExceeded: (ip, endpoint) => {
    const event = {
      timestamp: new Date().toISOString(),
      event: 'RATE_LIMIT_EXCEEDED',
      ip,
      endpoint
    };
    
    fs.appendFileSync(
      path.join(logDirectory, 'security.log'),
      JSON.stringify(event) + '\n'
    );
  },

  logSuspiciousActivity: (userId, activity, details) => {
    const event = {
      timestamp: new Date().toISOString(),
      event: 'SUSPICIOUS_ACTIVITY',
      userId,
      activity,
      details
    };
    
    fs.appendFileSync(
      path.join(logDirectory, 'security.log'),
      JSON.stringify(event) + '\n'
    );
  }
};

/**
 * Analytics logger
 * Tracks user behavior for insights
 */
const analyticsLogger = {
  logGameCompleted: (gameData) => {
    const event = {
      timestamp: new Date().toISOString(),
      event: 'GAME_COMPLETED',
      ...gameData
    };
    
    fs.appendFileSync(
      path.join(logDirectory, 'analytics.log'),
      JSON.stringify(event) + '\n'
    );
  },

  logUserRegistration: (userId, source) => {
    const event = {
      timestamp: new Date().toISOString(),
      event: 'USER_REGISTRATION',
      userId,
      source
    };
    
    fs.appendFileSync(
      path.join(logDirectory, 'analytics.log'),
      JSON.stringify(event) + '\n'
    );
  }
};

/**
 * Create appropriate logger based on environment
 */
const createLogger = () => {
  if (process.env.NODE_ENV === 'production') {
    return prodLogger;
  }
  return devLogger;
};

module.exports = {
  requestLogger: createLogger(),
  errorLogger,
  performanceLogger,
  securityLogger,
  analyticsLogger,
  // Expose streams for testing
  accessLogStream,
  errorLogStream
};