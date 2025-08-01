/**
 * 240 FPS Server Physics Constants
 * Matching exact values from single-player head-soccer-js implementation
 */

module.exports = {
  // Core physics settings
  FRAME_RATE: 240,
  TICK_MS: 1000 / 240, // ~4.17ms per tick
  DT: 1 / 240, // Delta time for physics calculations

  // Field dimensions - matching CONFIG.js
  FIELD: {
    WIDTH: 1600,
    HEIGHT: 900,
    GOAL_WIDTH: 75,
    GOAL_HEIGHT: 250,
    FLOOR_Y: 880, // HEIGHT - 20 (bottom gap)
  },

  // Ball physics - exact values from js/classes/Ball.js
  BALL: {
    RADIUS: 25,
    GRAVITY: 800, // Pixels per second squared
    RESTITUTION: 0.8, // Bounce coefficient
    FRICTION: 0.95, // Ground friction
    AIR_RESISTANCE: 0.999,
    MASS: 20, // From CONFIG.js
    
    // Starting position
    START_X: 800, // FIELD.WIDTH / 2
    START_Y: 220, // From CONFIG.js
  },

  // Player physics - exact values from js/classes/Player.js
  PLAYER: {
    RADIUS: 30, // Collision radius
    WIDTH: 60,
    HEIGHT: 100,
    GRAVITY: 800, // Same as ball
    MOVE_SPEED: 300, // Horizontal movement speed
    JUMP_POWER: -600, // Negative = upward
    FRICTION: 0.85, // Ground friction
    AIR_RESISTANCE: 0.98,
    MASS: 200, // From CONFIG.js (HEAD_MASS)
    
    // Kick mechanics
    KICK_RANGE: 80, // Distance to kick ball
    KICK_POWER: 800, // Kick force
    KICK_COOLDOWN: 500, // ms between kicks
    
    // Starting positions
    PLAYER_1_START_X: 400, // FIELD.WIDTH / 4
    PLAYER_2_START_X: 1200, // FIELD.WIDTH * 3/4
    START_Y: 600, // From CONFIG.js
  },

  // Goal detection
  GOAL: {
    LEFT_X: 75, // GOAL_WIDTH
    RIGHT_X: 1525, // FIELD.WIDTH - GOAL_WIDTH
    Y_THRESHOLD: 650, // FIELD.HEIGHT - GOAL_HEIGHT
  },

  // Collision detection
  COLLISION: {
    BALL_PLAYER_THRESHOLD: 5,
    BOUNCE_MULTIPLIER: 1.1,
  },

  // Game rules
  GAME: {
    SCORE_LIMIT: 5, // Goals to win
    TIME_LIMIT: 600, // 10 minutes in seconds
  },

  // Network optimization
  NETWORK: {
    INPUT_RATE_LIMIT: 60, // Max inputs per second per player
    STATE_BROADCAST_RATE: 240, // Full rate for now
  },
};