/**
 * Backend Constants
 * Updated for 240 FPS physics implementation
 */

module.exports = {
  // Original constants
  MAX_ROOMS: 1000,
  MAX_PLAYERS_PER_ROOM: 2,
  PLAYER_TIMEOUT: 30000, // 30 seconds
  HEARTBEAT_INTERVAL: 5000, // 5 seconds
  
  // Physics constants - NEW for 240 FPS implementation
  PHYSICS_FRAME_RATE: 240,
  PHYSICS_TICK_MS: 1000 / 240, // ~4.17ms
  USE_240FPS_PHYSICS: true, // Feature flag for rollback
  
  // Network constants
  MAX_INPUT_RATE: 60, // Max inputs per second per player
  STATE_BROADCAST_RATE: 240, // Broadcast rate (can be throttled if needed)
  
  // Game constants
  MATCH_TIMEOUT: 600000, // 10 minutes
  GOAL_COOLDOWN: 3000, // 3 seconds between goals
  
  // Event priorities (for future use)
  EVENT_PRIORITY: {
    CRITICAL: 1, // Goals, game end
    HIGH: 2,     // Ball updates, collisions
    MEDIUM: 3,   // Player movement
    LOW: 4       // Chat, UI updates
  },
  
  // Validation limits
  MAX_POSITION_CHANGE: 1000, // Max pixels per frame
  MAX_VELOCITY: 2000, // Max velocity magnitude
  
  // Performance monitoring
  PERFORMANCE_LOG_INTERVAL: 10000, // Log performance every 10s
  MAX_TICK_TIME: 10, // Warn if physics tick takes longer than 10ms
};