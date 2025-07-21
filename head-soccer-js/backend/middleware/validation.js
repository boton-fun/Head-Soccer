/**
 * Centralized Input Validation Middleware
 * Provides comprehensive validation and sanitization for all API endpoints
 */

const { body, param, query, validationResult } = require('express-validator');
const xss = require('xss');

/**
 * Common validation rules
 */
const validationRules = {
  // Username validation
  username: () => 
    body('username')
      .trim()
      .isLength({ min: 3, max: 20 })
      .withMessage('Username must be between 3 and 20 characters')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
      .toLowerCase()
      .customSanitizer(value => xss(value)),

  // Password validation
  password: () =>
    body('password')
      .isLength({ min: 6, max: 128 })
      .withMessage('Password must be between 6 and 128 characters')
      .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
      .withMessage('Password must contain at least one letter and one number'),

  // Display name validation
  displayName: () =>
    body('display_name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Display name must be between 1 and 50 characters')
      .customSanitizer(value => xss(value)),

  // Character ID validation
  characterId: () =>
    body('character_id')
      .optional()
      .isIn(['player1', 'player2', 'player3', 'player4', 'player5'])
      .withMessage('Invalid character selection'),

  // Avatar URL validation
  avatarUrl: () =>
    body('avatar_url')
      .optional()
      .isURL({ protocols: ['http', 'https'], require_protocol: true })
      .withMessage('Avatar URL must be a valid URL')
      .customSanitizer(value => xss(value)),

  // Game ID validation
  gameId: () =>
    param('gameId')
      .isUUID()
      .withMessage('Invalid game ID format'),

  // User ID validation
  userId: () =>
    param('userId')
      .isUUID()
      .withMessage('Invalid user ID format'),

  // Score validation
  score: () =>
    body('score')
      .isInt({ min: 0, max: 99 })
      .withMessage('Score must be between 0 and 99'),

  // Pagination validation
  pagination: () => [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt()
  ],

  // Date range validation
  dateRange: () => [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be a valid ISO 8601 date')
      .toDate(),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be a valid ISO 8601 date')
      .toDate()
  ],

  // Game mode validation
  gameMode: () =>
    body('game_mode')
      .optional()
      .isIn(['ranked', 'casual', 'tournament'])
      .withMessage('Invalid game mode'),

  // Search query validation
  searchQuery: () =>
    query('q')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Search query must be between 1 and 50 characters')
      .customSanitizer(value => xss(value)),

  // Room code validation
  roomCode: () =>
    body('room_code')
      .optional()
      .isLength({ min: 4, max: 8 })
      .withMessage('Room code must be between 4 and 8 characters')
      .matches(/^[A-Z0-9]+$/)
      .withMessage('Room code must contain only uppercase letters and numbers'),

  // Game result validation
  gameResult: () =>
    body('result')
      .isIn(['win', 'loss', 'draw', 'abandoned'])
      .withMessage('Invalid game result'),

  // Duration validation
  duration: () =>
    body('duration_seconds')
      .isInt({ min: 0, max: 7200 })
      .withMessage('Duration must be between 0 and 7200 seconds (2 hours)')
};

/**
 * Validation middleware factory
 * Creates validation chains for specific endpoints
 */
const validate = {
  // Auth validations
  register: [
    validationRules.username(),
    validationRules.password(),
    validationRules.displayName()
  ],

  login: [
    body('username')
      .notEmpty()
      .withMessage('Username is required')
      .toLowerCase()
      .trim()
      .customSanitizer(value => xss(value)),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],

  updateProfile: [
    validationRules.displayName(),
    validationRules.characterId(),
    validationRules.avatarUrl()
  ],

  checkUsername: [
    body('username')
      .trim()
      .isLength({ min: 3, max: 20 })
      .withMessage('Username must be between 3 and 20 characters')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
      .toLowerCase()
      .customSanitizer(value => xss(value))
  ],

  // Game validations
  submitGameResult: [
    validationRules.gameId(),
    body('winner_id').isUUID().withMessage('Invalid winner ID'),
    body('player1_score').isInt({ min: 0, max: 99 }).withMessage('Invalid player 1 score'),
    body('player2_score').isInt({ min: 0, max: 99 }).withMessage('Invalid player 2 score'),
    body('duration_seconds').isInt({ min: 0, max: 3600 }).withMessage('Invalid game duration')
  ],

  // Stats validations
  getPlayerStats: [
    validationRules.userId(),
    ...validationRules.dateRange()
  ],

  getGameHistory: [
    validationRules.userId(),
    ...validationRules.pagination(),
    ...validationRules.dateRange(),
    query('game_mode')
      .optional()
      .isIn(['ranked', 'casual', 'tournament'])
      .withMessage('Invalid game mode filter')
  ],

  // Leaderboard validations
  getLeaderboard: [
    ...validationRules.pagination(),
    query('period')
      .optional()
      .isIn(['all', 'daily', 'weekly', 'monthly'])
      .withMessage('Invalid period filter'),
    query('sortBy')
      .optional()
      .isIn(['elo_rating', 'games_won', 'win_rate', 'goals_scored'])
      .withMessage('Invalid sort field')
  ],

  // Search validations
  searchPlayers: [
    validationRules.searchQuery(),
    ...validationRules.pagination()
  ],

  // Game management validations
  createRoom: [
    validationRules.roomCode(),
    validationRules.gameMode(),
    body('max_players').optional().isInt({ min: 2, max: 8 }).withMessage('Max players must be between 2 and 8'),
    body('time_limit').optional().isInt({ min: 60, max: 1800 }).withMessage('Time limit must be between 60 and 1800 seconds')
  ],

  joinRoom: [
    validationRules.roomCode()
  ],

  updateGameResult: [
    validationRules.gameId(),
    validationRules.gameResult(),
    validationRules.duration(),
    body('final_scores').isObject().withMessage('Final scores must be an object')
  ]
};

/**
 * Error handling middleware
 * Processes validation errors and returns standardized responses
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

/**
 * Sanitize all string inputs in request
 * Prevents XSS attacks by cleaning HTML/script tags
 */
const sanitizeInputs = (req, res, next) => {
  // Sanitize body
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = xss(req.body[key], {
          whiteList: {}, // No HTML tags allowed
          stripIgnoreTag: true,
          stripIgnoreTagBody: ['script']
        });
      }
    });
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = xss(req.query[key], {
          whiteList: {},
          stripIgnoreTag: true,
          stripIgnoreTagBody: ['script']
        });
      }
    });
  }

  // Sanitize URL parameters
  if (req.params && typeof req.params === 'object') {
    Object.keys(req.params).forEach(key => {
      if (typeof req.params[key] === 'string') {
        req.params[key] = xss(req.params[key], {
          whiteList: {},
          stripIgnoreTag: true,
          stripIgnoreTagBody: ['script']
        });
      }
    });
  }

  next();
};

/**
 * Request size limiting
 * Prevents large payload attacks
 */
const limitRequestSize = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = req.headers['content-length'];
    const maxBytes = parseSize(maxSize);
    
    if (contentLength && parseInt(contentLength) > maxBytes) {
      return res.status(413).json({
        success: false,
        error: 'Request entity too large'
      });
    }
    next();
  };
};

/**
 * Helper function to parse size strings
 */
function parseSize(size) {
  const units = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
  const match = size.toLowerCase().match(/^(\d+)(b|kb|mb|gb)$/);
  if (!match) return 10 * 1024 * 1024; // Default 10MB
  return parseInt(match[1]) * units[match[2]];
}

module.exports = {
  validate,
  handleValidationErrors,
  sanitizeInputs,
  limitRequestSize,
  validationRules
};