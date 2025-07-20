/**
 * Socket Event Handler - Main event routing and validation system for multiplayer Head Soccer
 * Handles all WebSocket events with validation, sanitization, and rate limiting
 */

const EventEmitter = require('events');
const Player = require('../modules/Player');
const GameRoom = require('../modules/GameRoom');
const Matchmaker = require('../modules/Matchmaker');
const GameStateValidator = require('../modules/GameStateValidator');

class SocketHandler extends EventEmitter {
  constructor(connectionManager, options = {}) {
    super();
    
    this.connectionManager = connectionManager;
    this.matchmaker = new Matchmaker();
    this.gameStateValidator = new GameStateValidator();
    
    // Active games and players
    this.activePlayers = new Map(); // playerId -> Player object
    this.activeRooms = new Map(); // roomId -> GameRoom object
    
    // Rate limiting configuration
    this.rateLimits = {
      general: { maxRequests: 60, windowMs: 60000 }, // 60 requests per minute
      movement: { maxRequests: 120, windowMs: 60000 }, // 120 movement updates per minute
      chat: { maxRequests: 10, windowMs: 60000 }, // 10 chat messages per minute
      matchmaking: { maxRequests: 5, windowMs: 60000 } // 5 matchmaking requests per minute
    };
    
    // Rate limiting storage
    this.rateLimitStore = new Map(); // socketId -> { endpoint -> { count, resetTime } }
    
    // Event validation rules
    this.eventValidation = {
      'authenticate': {
        required: ['playerId', 'username'],
        optional: ['token', 'characterId'],
        maxLength: { username: 20, playerId: 50 }
      },
      'join_matchmaking': {
        required: ['gameMode'],
        optional: ['region', 'preferences'],
        enum: { gameMode: ['casual', 'ranked', 'tournament'] }
      },
      'leave_matchmaking': {
        required: [],
        optional: []
      },
      'ready_up': {
        required: [],
        optional: ['ready']
      },
      'player_movement': {
        required: ['position', 'velocity', 'timestamp'],
        optional: ['direction', 'action'],
        numeric: ['timestamp'],
        range: {
          'position.x': [0, 800],
          'position.y': [0, 400],
          'velocity.x': [-500, 500],
          'velocity.y': [-500, 500]
        }
      },
      'ball_update': {
        required: ['position', 'velocity', 'timestamp'],
        optional: ['spin'],
        numeric: ['timestamp'],
        range: {
          'position.x': [0, 800],
          'position.y': [0, 400],
          'velocity.x': [-1000, 1000],
          'velocity.y': [-1000, 1000]
        }
      },
      'goal_attempt': {
        required: ['position', 'power', 'direction', 'timestamp'],
        numeric: ['power', 'timestamp'],
        range: {
          power: [0, 100],
          'position.x': [0, 800],
          'position.y': [0, 400]
        }
      },
      'chat_message': {
        required: ['message'],
        optional: ['type', 'target'],
        maxLength: { message: 200 },
        enum: { type: ['all', 'team', 'private'] }
      },
      'pause_request': {
        required: ['reason'],
        maxLength: { reason: 100 }
      }
    };
    
    // Performance metrics
    this.metrics = {
      eventsProcessed: 0,
      eventsRejected: 0,
      validationErrors: 0,
      rateLimitViolations: 0,
      startTime: Date.now()
    };
    
    // Setup event handlers
    this.setupEventHandlers();
    
    console.log('<¯ Socket Event Handler initialized');
  }
  
  /**
   * Setup Connection Manager event handlers
   */
  setupEventHandlers() {
    this.connectionManager.on('connection', (data) => {
      this.handleNewConnection(data);
    });
    
    this.connectionManager.on('player_authenticated', (data) => {
      this.handlePlayerAuthenticated(data);
    });
    
    this.connectionManager.on('player_disconnected', (data) => {
      this.handlePlayerDisconnected(data);
    });
    
    this.connectionManager.on('player_reconnected', (data) => {
      this.handlePlayerReconnected(data);
    });
  }
  
  /**
   * Handle new connection
   * @param {Object} data - Connection data
   */
  handleNewConnection(data) {
    const { socketId, connection } = data;
    const socket = connection.socket;
    
    console.log(`<¯ Setting up event handlers for ${socketId}`);
    
    // Setup all game event handlers
    this.setupGameEventHandlers(socket);
    
    // Initialize rate limiting for this socket
    this.rateLimitStore.set(socketId, new Map());
  }
  
  /**
   * Setup game-specific event handlers for a socket
   * @param {Socket} socket - Socket.IO socket
   */
  setupGameEventHandlers(socket) {
    // Authentication events
    socket.on('authenticate', (data) => {
      this.handleEvent(socket, 'authenticate', data, this.handleAuthenticate.bind(this));
    });
    
    // Matchmaking events
    socket.on('join_matchmaking', (data) => {
      this.handleEvent(socket, 'join_matchmaking', data, this.handleJoinMatchmaking.bind(this));
    });
    
    socket.on('leave_matchmaking', (data) => {
      this.handleEvent(socket, 'leave_matchmaking', data, this.handleLeaveMatchmaking.bind(this));
    });
    
    // Game room events
    socket.on('ready_up', (data) => {
      this.handleEvent(socket, 'ready_up', data, this.handleReadyUp.bind(this));
    });
    
    socket.on('start_game', (data) => {
      this.handleEvent(socket, 'start_game', data, this.handleStartGame.bind(this));
    });
    
    // Gameplay events
    socket.on('player_movement', (data) => {
      this.handleEvent(socket, 'player_movement', data, this.handlePlayerMovement.bind(this), 'movement');
    });
    
    socket.on('ball_update', (data) => {
      this.handleEvent(socket, 'ball_update', data, this.handleBallUpdate.bind(this), 'movement');
    });
    
    socket.on('goal_attempt', (data) => {
      this.handleEvent(socket, 'goal_attempt', data, this.handleGoalAttempt.bind(this));
    });
    
    // Communication events
    socket.on('chat_message', (data) => {
      this.handleEvent(socket, 'chat_message', data, this.handleChatMessage.bind(this), 'chat');
    });
    
    // Game control events
    socket.on('pause_request', (data) => {
      this.handleEvent(socket, 'pause_request', data, this.handlePauseRequest.bind(this));
    });
    
    socket.on('resume_request', (data) => {
      this.handleEvent(socket, 'resume_request', data, this.handleResumeRequest.bind(this));
    });
    
    // Debugging and monitoring
    socket.on('get_game_state', (data) => {
      this.handleEvent(socket, 'get_game_state', data, this.handleGetGameState.bind(this));
    });
    
    socket.on('ping_latency', (data) => {
      this.handleEvent(socket, 'ping_latency', data, this.handlePingLatency.bind(this));
    });
  }
  
  /**
   * Generic event handler with validation and rate limiting
   * @param {Socket} socket - Socket.IO socket
   * @param {string} eventName - Event name
   * @param {Object} data - Event data
   * @param {Function} handler - Event handler function
   * @param {string} rateLimitType - Rate limit type (optional)
   */
  handleEvent(socket, eventName, data, handler, rateLimitType = 'general') {
    const startTime = Date.now();
    
    try {
      // Rate limiting check
      if (!this.checkRateLimit(socket.id, eventName, rateLimitType)) {
        this.metrics.rateLimitViolations++;
        socket.emit('rate_limit_exceeded', {
          event: eventName,
          limit: this.rateLimits[rateLimitType],
          retryAfter: this.getRateLimitRetryAfter(socket.id, eventName)
        });
        return;
      }
      
      // Input validation
      const validationResult = this.validateEventData(eventName, data);
      if (!validationResult.valid) {
        this.metrics.validationErrors++;
        socket.emit('validation_error', {
          event: eventName,
          errors: validationResult.errors,
          received: data
        });
        return;
      }
      
      // Sanitize data
      const sanitizedData = this.sanitizeEventData(eventName, validationResult.data);
      
      // Call event handler
      handler(socket, sanitizedData);
      
      this.metrics.eventsProcessed++;
      
      // Log event processing time for performance monitoring
      const processingTime = Date.now() - startTime;
      if (processingTime > 100) { // Log slow events
        console.warn(`  Slow event processing: ${eventName} took ${processingTime}ms`);
      }
      
    } catch (error) {
      this.metrics.eventsRejected++;
      console.error(`Error handling event ${eventName}:`, error);
      
      socket.emit('event_error', {
        event: eventName,
        message: 'Internal server error',
        timestamp: Date.now()
      });
      
      this.emit('event_error', {
        socketId: socket.id,
        event: eventName,
        error: error.message,
        data: data
      });
    }
  }
  
  /**
   * Check rate limiting for an event
   * @param {string} socketId - Socket ID
   * @param {string} eventName - Event name
   * @param {string} rateLimitType - Rate limit type
   * @returns {boolean} Whether request is allowed
   */
  checkRateLimit(socketId, eventName, rateLimitType) {
    const now = Date.now();
    const socketLimits = this.rateLimitStore.get(socketId) || new Map();
    const eventKey = `${rateLimitType}:${eventName}`;
    
    let limitData = socketLimits.get(eventKey);
    
    if (!limitData) {
      limitData = { count: 0, resetTime: now + this.rateLimits[rateLimitType].windowMs };
      socketLimits.set(eventKey, limitData);
      this.rateLimitStore.set(socketId, socketLimits);
    }
    
    // Reset if window has passed
    if (now >= limitData.resetTime) {
      limitData.count = 0;
      limitData.resetTime = now + this.rateLimits[rateLimitType].windowMs;
    }
    
    // Check limit
    if (limitData.count >= this.rateLimits[rateLimitType].maxRequests) {
      return false;
    }
    
    limitData.count++;
    return true;
  }
  
  /**
   * Get retry-after time for rate limited request
   * @param {string} socketId - Socket ID
   * @param {string} eventName - Event name
   * @returns {number} Milliseconds until retry allowed
   */
  getRateLimitRetryAfter(socketId, eventName) {
    const socketLimits = this.rateLimitStore.get(socketId);
    if (!socketLimits) return 0;
    
    const limitData = socketLimits.get(eventName);
    if (!limitData) return 0;
    
    return Math.max(0, limitData.resetTime - Date.now());
  }
  
  /**
   * Validate event data against rules
   * @param {string} eventName - Event name
   * @param {Object} data - Event data
   * @returns {Object} Validation result
   */
  validateEventData(eventName, data) {
    const rules = this.eventValidation[eventName];
    if (!rules) {
      return { valid: true, data: data, errors: [] };
    }
    
    const errors = [];
    const validatedData = {};
    
    // Check required fields
    if (rules.required) {
      for (const field of rules.required) {
        if (data[field] === undefined || data[field] === null) {
          errors.push(`Missing required field: ${field}`);
        } else {
          validatedData[field] = data[field];
        }
      }
    }
    
    // Check optional fields
    if (rules.optional) {
      for (const field of rules.optional) {
        if (data[field] !== undefined) {
          validatedData[field] = data[field];
        }
      }
    }
    
    // Check string length limits
    if (rules.maxLength) {
      for (const [field, maxLen] of Object.entries(rules.maxLength)) {
        if (validatedData[field] && typeof validatedData[field] === 'string') {
          if (validatedData[field].length > maxLen) {
            errors.push(`Field ${field} exceeds maximum length of ${maxLen}`);
          }
        }
      }
    }
    
    // Check enumeration values
    if (rules.enum) {
      for (const [field, allowedValues] of Object.entries(rules.enum)) {
        if (validatedData[field] && !allowedValues.includes(validatedData[field])) {
          errors.push(`Field ${field} must be one of: ${allowedValues.join(', ')}`);
        }
      }
    }
    
    // Check numeric fields
    if (rules.numeric) {
      for (const field of rules.numeric) {
        if (validatedData[field] !== undefined && typeof validatedData[field] !== 'number') {
          errors.push(`Field ${field} must be a number`);
        }
      }
    }
    
    // Check range limits
    if (rules.range) {
      for (const [fieldPath, [min, max]] of Object.entries(rules.range)) {
        const value = this.getNestedValue(validatedData, fieldPath);
        if (value !== undefined && typeof value === 'number') {
          if (value < min || value > max) {
            errors.push(`Field ${fieldPath} must be between ${min} and ${max}`);
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      data: validatedData,
      errors: errors
    };
  }
  
  /**
   * Get nested object value by path
   * @param {Object} obj - Object to search
   * @param {string} path - Dot-separated path
   * @returns {*} Value or undefined
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
  
  /**
   * Sanitize event data
   * @param {string} eventName - Event name
   * @param {Object} data - Event data
   * @returns {Object} Sanitized data
   */
  sanitizeEventData(eventName, data) {
    const sanitized = JSON.parse(JSON.stringify(data)); // Deep clone
    
    // Sanitize strings (remove dangerous characters, trim whitespace)
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'string') {
        sanitized[key] = value
          .trim()
          .replace(/[<>\"'&]/g, '') // Remove potentially dangerous characters
          .substring(0, 1000); // Limit string length
      }
    }
    
    // Add timestamp if not present
    if (!sanitized.timestamp) {
      sanitized.timestamp = Date.now();
    }
    
    return sanitized;
  }
  
  /**
   * Event Handlers
   */
  
  /**
   * Handle player authentication
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Authentication data
   */
  handleAuthenticate(socket, data) {
    // This is handled by ConnectionManager, but we can add game-specific logic here
    const { playerId, username } = data;
    
    console.log(`<¯ Game authentication for ${username} (${playerId})`);
    
    // Additional game-specific authentication logic can go here
    this.emit('player_game_authenticated', {
      socketId: socket.id,
      playerId: playerId,
      username: username
    });
  }
  
  /**
   * Handle player authenticated event from ConnectionManager
   * @param {Object} data - Player data
   */
  handlePlayerAuthenticated(data) {
    const { playerId, username, socketId } = data;
    
    // Create Player object
    const player = new Player(socketId, playerId, username);
    this.activePlayers.set(playerId, player);
    
    console.log(` Player ${username} authenticated and ready for gameplay`);
  }
  
  /**
   * Handle join matchmaking
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Matchmaking data
   */
  handleJoinMatchmaking(socket, data) {
    const connection = this.connectionManager.getPlayerConnection(socket.id);
    if (!connection || !connection.isAuthenticated) {
      socket.emit('matchmaking_error', { reason: 'Not authenticated' });
      return;
    }
    
    const player = this.activePlayers.get(connection.playerId);
    if (!player) {
      socket.emit('matchmaking_error', { reason: 'Player not found' });
      return;
    }
    
    const result = this.matchmaker.addToQueue(player, data);
    
    if (result.success) {
      socket.emit('matchmaking_joined', {
        position: result.position,
        estimatedWait: result.estimatedWait,
        gameMode: data.gameMode
      });
      
      console.log(`<¯ Player ${player.username} joined matchmaking: ${data.gameMode}`);
    } else {
      socket.emit('matchmaking_error', { reason: result.reason });
    }
  }
  
  /**
   * Handle leave matchmaking
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Data
   */
  handleLeaveMatchmaking(socket, data) {
    const connection = this.connectionManager.getPlayerConnection(socket.id);
    if (!connection || !connection.playerId) return;
    
    const result = this.matchmaker.removeFromQueue(connection.playerId);
    
    if (result.success) {
      socket.emit('matchmaking_left', { reason: 'Player request' });
      console.log(`<¯ Player ${connection.playerId} left matchmaking`);
    }
  }
  
  /**
   * Handle ready up
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Ready data
   */
  handleReadyUp(socket, data) {
    const connection = this.connectionManager.getPlayerConnection(socket.id);
    if (!connection || !connection.playerId) return;
    
    const player = this.activePlayers.get(connection.playerId);
    if (!player) return;
    
    const ready = data.ready !== undefined ? data.ready : true;
    
    try {
      player.setReady(ready);
      
      // Notify room if player is in one
      if (connection.roomId) {
        this.connectionManager.broadcastToRoom(connection.roomId, 'player_ready_changed', {
          playerId: connection.playerId,
          username: player.username,
          ready: ready
        });
      }
      
      socket.emit('ready_state_changed', { ready: ready });
      console.log(`<¯ Player ${player.username} ready state: ${ready}`);
      
    } catch (error) {
      socket.emit('ready_error', { reason: error.message });
    }
  }
  
  /**
   * Handle player movement
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Movement data
   */
  handlePlayerMovement(socket, data) {
    const connection = this.connectionManager.getPlayerConnection(socket.id);
    if (!connection || !connection.playerId) return;
    
    // Validate movement with game state validator
    const validationResult = this.gameStateValidator.validatePlayerMovement({
      playerId: connection.playerId,
      ...data
    });
    
    if (!validationResult.valid) {
      socket.emit('movement_rejected', {
        reason: validationResult.reason,
        correctedData: validationResult.correctedData
      });
      return;
    }
    
    // Broadcast to room if in game
    if (connection.roomId) {
      this.connectionManager.broadcastToRoom(connection.roomId, 'player_moved', {
        playerId: connection.playerId,
        position: data.position,
        velocity: data.velocity,
        timestamp: data.timestamp
      });
    }
  }
  
  /**
   * Handle ball update
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Ball data
   */
  handleBallUpdate(socket, data) {
    const connection = this.connectionManager.getPlayerConnection(socket.id);
    if (!connection || !connection.roomId) return;
    
    // Validate ball physics
    const validationResult = this.gameStateValidator.validateBallPhysics(data);
    
    if (!validationResult.valid) {
      socket.emit('ball_update_rejected', {
        reason: validationResult.reason,
        correctedData: validationResult.correctedData
      });
      return;
    }
    
    // Broadcast to room
    this.connectionManager.broadcastToRoom(connection.roomId, 'ball_updated', {
      position: data.position,
      velocity: data.velocity,
      timestamp: data.timestamp,
      authoritative: true
    });
  }
  
  /**
   * Handle goal attempt
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Goal data
   */
  handleGoalAttempt(socket, data) {
    const connection = this.connectionManager.getPlayerConnection(socket.id);
    if (!connection || !connection.playerId || !connection.roomId) return;
    
    // Validate goal
    const validationResult = this.gameStateValidator.validateGoal({
      playerId: connection.playerId,
      ...data
    });
    
    if (!validationResult.valid) {
      socket.emit('goal_rejected', { reason: validationResult.reason });
      return;
    }
    
    // Process goal (this would integrate with GameRoom)
    this.connectionManager.broadcastToRoom(connection.roomId, 'goal_scored', {
      playerId: connection.playerId,
      position: data.position,
      power: data.power,
      timestamp: data.timestamp
    });
    
    console.log(`½ Goal attempt by ${connection.playerId} in room ${connection.roomId}`);
  }
  
  /**
   * Handle chat message
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Chat data
   */
  handleChatMessage(socket, data) {
    const connection = this.connectionManager.getPlayerConnection(socket.id);
    if (!connection || !connection.playerId) return;
    
    const player = this.activePlayers.get(connection.playerId);
    if (!player) return;
    
    const chatData = {
      playerId: connection.playerId,
      username: player.username,
      message: data.message,
      type: data.type || 'all',
      timestamp: Date.now()
    };
    
    // Broadcast based on type
    if (data.type === 'all' && connection.roomId) {
      this.connectionManager.broadcastToRoom(connection.roomId, 'chat_message', chatData);
    } else {
      // Handle private messages, team chat, etc.
      socket.emit('chat_sent', chatData);
    }
    
    console.log(`=¬ Chat from ${player.username}: ${data.message}`);
  }
  
  /**
   * Handle player disconnected
   * @param {Object} data - Disconnection data
   */
  handlePlayerDisconnected(data) {
    const { playerId, socketId } = data;
    
    if (playerId) {
      // Remove from matchmaking if queued
      this.matchmaker.removeFromQueue(playerId);
      
      // Clean up player data
      this.activePlayers.delete(playerId);
      
      console.log(`<¯ Player ${playerId} cleaned up from game systems`);
    }
    
    // Clean up rate limiting data
    this.rateLimitStore.delete(socketId);
  }
  
  /**
   * Handle player reconnected
   * @param {Object} data - Reconnection data
   */
  handlePlayerReconnected(data) {
    const { playerId, newSocketId, roomId } = data;
    
    // Restore player if needed
    if (!this.activePlayers.has(playerId)) {
      // Player data might need to be restored from database
      console.log(`<¯ Player ${playerId} reconnected, restoring data...`);
    }
    
    // Send current game state if in room
    if (roomId) {
      const connection = this.connectionManager.connections.get(newSocketId);
      if (connection) {
        connection.socket.emit('game_state_sync', {
          roomId: roomId,
          // Game state data would go here
        });
      }
    }
  }
  
  /**
   * Utility methods for additional handlers
   */
  
  handleStartGame(socket, data) {
    // Game start logic
    console.log(`<¯ Start game request from ${socket.id}`);
  }
  
  handlePauseRequest(socket, data) {
    console.log(`ø Pause request: ${data.reason}`);
  }
  
  handleResumeRequest(socket, data) {
    console.log(`¶ Resume request from ${socket.id}`);
  }
  
  handleGetGameState(socket, data) {
    // Return current game state for debugging
    socket.emit('game_state_debug', {
      timestamp: Date.now(),
      // Game state data
    });
  }
  
  handlePingLatency(socket, data) {
    socket.emit('pong_latency', {
      clientTime: data.clientTime,
      serverTime: Date.now()
    });
  }
  
  /**
   * Get handler statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const uptime = Date.now() - this.metrics.startTime;
    
    return {
      ...this.metrics,
      uptime: uptime,
      activePlayers: this.activePlayers.size,
      activeRooms: this.activeRooms.size,
      eventsPerSecond: this.metrics.eventsProcessed / (uptime / 1000),
      errorRate: this.metrics.eventsRejected / Math.max(1, this.metrics.eventsProcessed),
      rateLimitViolationRate: this.metrics.rateLimitViolations / Math.max(1, this.metrics.eventsProcessed)
    };
  }
  
  /**
   * Cleanup resources
   */
  shutdown() {
    console.log('<¯ Socket Event Handler shutting down...');
    
    // Clear all data
    this.activePlayers.clear();
    this.activeRooms.clear();
    this.rateLimitStore.clear();
    
    console.log(' Socket Event Handler shutdown complete');
  }
}

module.exports = SocketHandler;