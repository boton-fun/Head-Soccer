/**
 * Authentication and User Management Routes
 * Handles user registration, login, and profile management
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { users, stats } = require('../database/supabase');
const config = require('../utils/config');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
    retryAfter: 15 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false
});

// More restrictive limiter for registration (lenient for development)
const registerLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes for development
  max: 10, // limit each IP to 10 registration attempts per 5 minutes for development
  message: {
    success: false,
    error: 'Too many registration attempts, please try again later',
    retryAfter: 5 * 60
  }
});

// Username validation middleware
const validateUsername = [
  body('username')
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
    .toLowerCase() // Normalize to lowercase
    .trim(),
  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be between 6 and 128 characters'),
  body('display_name')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Display name cannot exceed 50 characters')
    .trim()
];

/**
 * POST /api/auth/register
 * Register a new user account
 */
router.post('/register', registerLimiter, validateUsername, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array().map(err => ({
          field: err.path,
          message: err.msg,
          value: err.value
        }))
      });
    }

    const { username, password, display_name } = req.body;

    // Check if username is available
    const availabilityCheck = await users.isUsernameAvailable(username);
    if (!availabilityCheck.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to check username availability',
        details: availabilityCheck.error
      });
    }

    if (!availabilityCheck.available) {
      return res.status(409).json({
        success: false,
        error: 'Username already exists',
        suggestion: `Try ${username}${Math.floor(Math.random() * 1000)}`
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate unique user ID
    const crypto = require('crypto');
    const userId = crypto.randomUUID();

    // Create user data
    const userData = {
      id: userId,
      username: username.toLowerCase(),
      display_name: display_name || username,
      password_hash: hashedPassword,
      character_id: 'player1', // Default character
      elo_rating: 1200, // Starting ELO rating
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Create user in database
    const userResult = await users.create(userData);
    if (!userResult.success) {
      // Handle duplicate username error at database level
      if (userResult.error.includes('duplicate key') || userResult.error.includes('unique')) {
        return res.status(409).json({
          success: false,
          error: 'Username already exists',
          suggestion: `Try ${username}${Math.floor(Math.random() * 1000)}`
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to create user account',
        details: userResult.error
      });
    }

    // Initialize player statistics
    const statsData = {
      user_id: userId,
      games_played: 0,
      games_won: 0,
      games_lost: 0,
      games_drawn: 0,
      goals_scored: 0,
      goals_conceded: 0,
      win_streak: 0,
      best_win_streak: 0,
      total_play_time_seconds: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Create initial stats (continue even if this fails)
    const statsResult = await createInitialStats(statsData);
    if (!statsResult.success) {
      console.warn('Failed to create initial stats for user:', userId, statsResult.error);
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: userResult.data.id, 
        username: userResult.data.username,
        iat: Math.floor(Date.now() / 1000)
      },
      config.jwt.secret,
      { 
        expiresIn: config.jwt.expiresIn || '7d',
        issuer: 'head-soccer-api'
      }
    );

    // Return success response (don't include sensitive data)
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: userResult.data.id,
          username: userResult.data.username,
          display_name: userResult.data.display_name,
          character_id: userResult.data.character_id,
          elo_rating: userResult.data.elo_rating,
          created_at: userResult.data.created_at
        },
        token,
        expiresIn: config.jwt.expiresIn || '7d'
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during registration',
      message: 'Please try again later'
    });
  }
});

/**
 * POST /api/auth/check-username
 * Check if a username is available
 */
router.post('/check-username', authLimiter, [
  body('username')
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
    .toLowerCase()
    .trim()
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid username format',
        details: errors.array()[0].msg
      });
    }

    const { username } = req.body;

    // Check availability
    const result = await users.isUsernameAvailable(username);
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to check username availability'
      });
    }

    res.json({
      success: true,
      available: result.available,
      username: username,
      suggestions: result.available ? [] : generateUsernameSuggestions(username)
    });

  } catch (error) {
    console.error('Username check error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Helper function to create initial player statistics
 */
async function createInitialStats(statsData) {
  try {
    const { data, error } = await require('../database/supabase').supabase
      .from('player_stats')
      .insert(statsData)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error creating initial stats:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Helper function to generate username suggestions
 */
function generateUsernameSuggestions(username) {
  const suggestions = [];
  const base = username.toLowerCase();
  
  // Add numbers
  for (let i = 1; i <= 3; i++) {
    suggestions.push(`${base}${Math.floor(Math.random() * 1000)}`);
  }
  
  // Add suffixes
  const suffixes = ['_player', '_gamer', '_pro', '2024', '_hs'];
  suffixes.forEach(suffix => {
    if (suggestions.length < 5) {
      suggestions.push(`${base}${suffix}`);
    }
  });
  
  return suggestions.slice(0, 5);
}

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'auth',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

module.exports = router;