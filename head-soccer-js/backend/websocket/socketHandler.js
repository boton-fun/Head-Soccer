/**
 * Socket Event Handler - Main event routing and validation system for multiplayer Head Soccer
 * Handles all WebSocket events with validation, sanitization, and rate limiting
 */

const EventEmitter = require('events');
const Player = require('../modules/Player');
const GameRoom = require('../modules/GameRoom');
const Matchmaker = require('../modules/Matchmaker');
const GameStateValidator = require('../modules/GameStateValidator');
const GameEventSystem = require('./gameEventSystem');
const MatchmakingEvents = require('./matchmakingEvents');
const GameplayEvents = require('./gameplayEvents');

class SocketHandler extends EventEmitter {
  constructor(connectionManager, options = {}) {
    super();
    
    this.connectionManager = connectionManager;
    this.matchmaker = new Matchmaker();
    this.gameStateValidator = new GameStateValidator();
    this.gameEventSystem = new GameEventSystem(connectionManager, options.gameEvents);
    this.matchmakingEvents = new MatchmakingEvents(connectionManager, this.matchmaker, this.gameEventSystem, options.matchmaking);
    this.gameplayEvents = new GameplayEvents(connectionManager, this.gameEventSystem, this.gameStateValidator, options.gameplay);
    
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
    
    // Sequence tracking for each player
    this.playerSequences = new Map(); // playerId -> lastSequence
    
    // Message priority levels
    this.MESSAGE_PRIORITY = {
      CRITICAL: 0,  // Goal events, game state changes
      HIGH: 1,      // Ball updates, collision events
      MEDIUM: 2,    // Player movement updates
      LOW: 3        // Non-gameplay data
    };
    
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
      },
      'forfeit_game': {
        required: [],
        optional: ['reason'],
        maxLength: { reason: 200 }
      },
      'request_game_end': {
        required: ['reason'],
        optional: ['force'],
        maxLength: { reason: 200 },
        enum: { reason: ['time_up', 'mutual_agreement', 'admin_request'] }
      },
      'join_character_selection': {
        required: ['matchId', 'playerId', 'username'],
        optional: [],
        maxLength: { matchId: 50, playerId: 50, username: 20 }
      },
      'character_select': {
        required: ['matchId', 'playerId', 'characterType', 'characterIndex'],
        optional: ['characterData'],
        maxLength: { matchId: 50, playerId: 50, characterType: 20 },
        numeric: ['characterIndex'],
        range: { characterIndex: [0, 20] }
      },
      'player_ready': {
        required: ['matchId', 'playerId', 'ready'],
        optional: ['selectedHead', 'selectedCleat'],
        maxLength: { matchId: 50, playerId: 50 },
        numeric: ['selectedHead', 'selectedCleat']
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
    
    // Setup Game Event System handlers
    this.setupGameEventHandlers();
    
    console.log('🎮 Socket Event Handler initialized');
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
    
    this.connectionManager.on('refresh_player_list', () => {
      this.handleRefreshPlayerList();
    });
  }
  
  /**
   * Handle new connection
   * @param {Object} data - Connection data
   */
  handleNewConnection(data) {
    console.log('🔍 handleNewConnection called with data:', {
      hasSocketId: !!data.socketId,
      hasSocket: !!data.socket,
      hasConnection: !!data.connection,
      socketType: typeof data.socket,
      dataKeys: Object.keys(data)
    });
    
    const { socketId, socket, connection } = data;
    
    if (!socket) {
      console.error(`❌ No socket provided for connection ${socketId}`);
      console.error('❌ Full data object:', data);
      return;
    }
    
    if (!socketId) {
      console.error('❌ No socketId provided');
      return;
    }
    
    console.log(`<� Setting up event handlers for ${socketId}`);
    
    // Setup all game event handlers
    console.log('🔍 DEBUG: About to call setupSocketGameEventHandlers with socket:', {
      hasSocket: !!socket,
      socketId: socket?.id,
      socketType: typeof socket,
      hasOnMethod: typeof socket?.on === 'function'
    });
    this.setupSocketGameEventHandlers(socket);
    
    // Initialize rate limiting for this socket
    this.rateLimitStore.set(socketId, new Map());
    
    // Broadcast updated player count and list to all clients
    this.broadcastPlayerCount();
    this.broadcastPlayerList();
  }
  
  /**
   * Setup game-specific event handlers for a socket
   * @param {Socket} socket - Socket.IO socket
   */
  setupSocketGameEventHandlers(socket) {
    console.log('🔍 DEBUG: setupSocketGameEventHandlers called with:', typeof socket, socket?.id);
    
    if (!socket) {
      console.error('❌ setupSocketGameEventHandlers: socket is undefined or null');
      return;
    }
    
    if (typeof socket.on !== 'function') {
      console.error('❌ setupSocketGameEventHandlers: socket.on is not a function', typeof socket.on);
      console.error('Socket object:', socket);
      return;
    }
    
    console.log(`🔧 Setting up event handlers for socket ${socket.id}`);
    
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
    
    // Character selection events
    socket.on('join_character_selection', (data) => {
      this.handleEvent(socket, 'join_character_selection', data, this.handleJoinCharacterSelection.bind(this));
    });
    
    socket.on('character_select', (data) => {
      this.handleEvent(socket, 'character_select', data, this.handleCharacterSelect.bind(this));
    });
    
    socket.on('player_ready', (data) => {
      this.handleEvent(socket, 'player_ready', data, this.handlePlayerReady.bind(this));
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
    
    // MISSING GAMEPLAY SYNC EVENTS - Adding score and timer sync handlers
    socket.on('score_update', (data, callback) => {
      console.log('📊 Server received score update:', data);
      const connection = this.connectionManager.getConnectionBySocketId(socket.id);
      if (connection && connection.roomId && data.matchId) {
        // Relay score update to other players in the room
        this.connectionManager.broadcastToRoom(`match_${data.matchId}`, 'score_update', data, socket.id);
        
        // Send acknowledgment back to sender
        if (callback) {
          callback({ success: true, timestamp: Date.now() });
        }
      } else {
        if (callback) {
          callback({ success: false, reason: 'Not in valid room or missing matchId' });
        }
      }
    });

    socket.on('goal_scored', (data, callback) => {
      console.log('🎯 Server received goal scored event:', data);
      const connection = this.connectionManager.getConnectionBySocketId(socket.id);
      if (connection && connection.roomId && data.matchId) {
        // Relay goal scored event to other players in the room
        this.connectionManager.broadcastToRoom(`match_${data.matchId}`, 'goal_scored', data, socket.id);
        
        // Send acknowledgment back to sender
        if (callback) {
          callback({ success: true, timestamp: Date.now() });
        }
      } else {
        if (callback) {
          callback({ success: false, reason: 'Not in valid room or missing matchId' });
        }
      }
    });

    socket.on('timer_update', (data) => {
      console.log('⏱️ Server received timer update:', data);
      const connection = this.connectionManager.getConnectionBySocketId(socket.id);
      if (connection && connection.roomId && data.matchId) {
        // Relay timer update to other players in the room
        this.connectionManager.broadcastToRoom(`match_${data.matchId}`, 'timer_sync', data, socket.id);
      }
    });

    socket.on('join_gameplay', (data) => {
      console.log('🎮 Player joining gameplay room:', data);
      const connection = this.connectionManager.getConnectionBySocketId(socket.id);
      if (connection && data.matchId) {
        // Join the gameplay room
        const gameplayRoomId = `match_${data.matchId}`;
        socket.join(gameplayRoomId);
        connection.roomId = gameplayRoomId;
        
        // Track room connections properly
        if (!this.connectionManager.roomConnections.has(gameplayRoomId)) {
          this.connectionManager.roomConnections.set(gameplayRoomId, new Set());
        }
        this.connectionManager.roomConnections.get(gameplayRoomId).add(socket.id);
        
        console.log(`✅ Player ${connection.playerId} joined gameplay room: ${gameplayRoomId}`);
      }
    });

    socket.on('game_state_sync', (data) => {
      console.log('🔄 Server received game state sync:', data);
      const connection = this.connectionManager.getConnectionBySocketId(socket.id);
      if (connection && connection.roomId && data.matchId) {
        // Relay full game state to other players in the room
        this.connectionManager.broadcastToRoom(`match_${data.matchId}`, 'game_state_sync', data, socket.id);
      }
    });

    socket.on('movement_update', (data) => {
      console.log('🔄 SERVER MOVEMENT DEBUG: Received movement_update:', {
        socketId: socket.id,
        sequence: data.sequence,
        hasConnection: !!this.connectionManager.getConnectionBySocketId(socket.id)
      });
      
      const connection = this.connectionManager.getConnectionBySocketId(socket.id);
      if (connection && data.matchId) {
        const playerId = data.playerId;
        
        // Validate sequence number if provided
        if (data.sequence !== undefined) {
          const lastSequence = this.playerSequences.get(playerId) || -1;
          if (data.sequence <= lastSequence) {
            console.log('⚠️ Out of order movement update, ignoring:', {
              playerId,
              receivedSeq: data.sequence,
              lastSeq: lastSequence
            });
            return;
          }
          this.playerSequences.set(playerId, data.sequence);
        }
        
        // Add server timestamp
        const enhancedData = {
          ...data,
          serverTimestamp: Date.now(),
          priority: this.MESSAGE_PRIORITY.MEDIUM
        };
        
        const roomId = `match_${data.matchId}`;
        console.log('📡 SERVER MOVEMENT DEBUG: Broadcasting enhanced data to room:', {
          roomId: roomId,
          sequence: data.sequence,
          serverTimestamp: enhancedData.serverTimestamp
        });
        
        // Relay enhanced movement update to other players
        this.connectionManager.broadcastToRoom(roomId, 'movement_update', enhancedData, socket.id);
        
        console.log('✅ SERVER MOVEMENT DEBUG: Enhanced movement broadcasted');
      } else {
        console.log('❌ SERVER MOVEMENT DEBUG: Failed to broadcast:', {
          hasConnection: !!connection,
          hasMatchId: !!data.matchId
        });
      }
    });

    socket.on('ball_update', (data) => {
      console.log('⚽ SERVER BALL DEBUG: Received ball_update:', {
        socketId: socket.id,
        sequence: data.sequence,
        hasConnection: !!this.connectionManager.getConnectionBySocketId(socket.id)
      });
      
      const connection = this.connectionManager.getConnectionBySocketId(socket.id);
      if (connection && data.matchId) {
        // Add server timestamp and priority
        const enhancedData = {
          ...data,
          serverTimestamp: Date.now(),
          priority: this.MESSAGE_PRIORITY.HIGH // Ball updates are high priority
        };
        
        const roomId = `match_${data.matchId}`;
        console.log('📡 SERVER BALL DEBUG: Broadcasting enhanced ball data:', {
          roomId: roomId,
          sequence: data.sequence,
          serverTimestamp: enhancedData.serverTimestamp
        });
        
        // Relay enhanced ball update to other players
        this.connectionManager.broadcastToRoom(roomId, 'ball_update', enhancedData, socket.id);
        
        console.log('✅ SERVER BALL DEBUG: Enhanced ball update broadcasted');
      } else {
        console.log('❌ SERVER BALL DEBUG: Failed to broadcast');
      }
    });

    // Game control events
    socket.on('pause_request', (data) => {
      this.handleEvent(socket, 'pause_request', data, this.handlePauseRequest.bind(this));
    });
    
    socket.on('resume_request', (data) => {
      this.handleEvent(socket, 'resume_request', data, this.handleResumeRequest.bind(this));
    });

    socket.on('leave_game_request', (data) => {
      console.log('🚪 Received leave game request:', data);
      const connection = this.connectionManager.getConnectionBySocketId(socket.id);
      if (connection && data.matchId) {
        const roomId = `match_${data.matchId}`;
        
        // Broadcast to all players in the match that someone is leaving
        this.connectionManager.broadcastToRoom(roomId, 'player_left_game', {
          playerId: data.playerId,
          username: data.username,
          matchId: data.matchId,
          reason: data.reason || 'player_left',
          timestamp: Date.now()
        });
        
        console.log(`🚪 Player ${data.username} left match ${data.matchId}`);
      }
    });
    
    // Game end events
    socket.on('forfeit_game', (data) => {
      this.handleEvent(socket, 'forfeit_game', data, this.handleForfeitGame.bind(this));
    });
    
    socket.on('request_game_end', (data) => {
      this.handleEvent(socket, 'request_game_end', data, this.handleRequestGameEnd.bind(this));
    });
    
    // Room management events
    socket.on('leave_room', (data) => {
      this.handleEvent(socket, 'leave_room', data, this.handleLeaveRoom.bind(this));
    });
    
    socket.on('join_room', (data) => {
      this.handleEvent(socket, 'join_room', data, this.handleJoinRoom.bind(this));
    });
    
    // Debugging and monitoring
    socket.on('get_game_state', (data) => {
      this.handleEvent(socket, 'get_game_state', data, this.handleGetGameState.bind(this));
    });
    
    socket.on('ping_latency', (data) => {
      this.handleEvent(socket, 'ping_latency', data, this.handlePingLatency.bind(this));
    });
    
    socket.on('get_matchmaking_stats', (data) => {
      this.handleEvent(socket, 'get_matchmaking_stats', data, this.handleGetMatchmakingStats.bind(this));
    });
    
    // Player count request
    socket.on('getPlayerCount', () => {
      this.handleGetPlayerCount(socket);
    });

    socket.on('getPlayerList', () => {
      this.handleGetPlayerList(socket);
    });

    // Challenge system events
    console.log('🎯 Registering challenge event handlers for socket:', socket.id);
    
    socket.on('challenge_player', (data) => {
      console.log('🔍 DEBUG: challenge_player event received on socket:', socket.id, 'data:', data);
      this.handleEvent(socket, 'challenge_player', data, this.handleChallengePlayer.bind(this));
    });

    socket.on('challenge_response', (data) => {
      console.log('🔍 DEBUG: challenge_response event received on socket:', socket.id, 'data:', data);
      this.handleEvent(socket, 'challenge_response', data, this.handleChallengeResponse.bind(this));
    });
    
    // Head Soccer Multiplayer Gameplay Events
    socket.on('joinGame', (data) => {
      console.log('🔍 DEBUG: joinGame event received on socket:', socket.id, 'data:', data);
      if (this.gameplayEvents.disabled) {
        socket.emit('gameplayDisabled', { message: 'Gameplay is currently disabled' });
        return;
      }
      this.handleEvent(socket, 'joinGame', data, (socket, data) => {
        this.gameplayEvents.joinGame(socket, data);
      });
    });
    
    socket.on('input', (data) => {
      if (this.gameplayEvents.disabled) return;
      this.handleEvent(socket, 'input', data, (socket, data) => {
        this.gameplayEvents.handlePlayerInput(socket, data);
      });
    });
    
    console.log('✅ Challenge event handlers registered for socket:', socket.id);
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
        console.warn(`� Slow event processing: ${eventName} took ${processingTime}ms`);
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
    
    console.log(`<� Game authentication for ${username} (${playerId})`);
    
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
   * Handle refresh player list after authentication
   */
  handleRefreshPlayerList() {
    console.log('🔄 Refreshing player list after authentication');
    this.broadcastPlayerList();
  }
  
  /**
   * Handle join matchmaking
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Matchmaking data
   */
  async handleJoinMatchmaking(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
    if (!connection || !connection.isAuthenticated) {
      socket.emit('matchmaking_error', { reason: 'Not authenticated' });
      return;
    }
    
    const player = this.activePlayers.get(connection.playerId);
    if (!player) {
      socket.emit('matchmaking_error', { reason: 'Player not found' });
      return;
    }
    
    // Use new matchmaking events system
    const result = await this.matchmakingEvents.handleJoinQueue(
      connection.playerId, 
      data.gameMode, 
      data.preferences || {}
    );
    
    if (result.success) {
      socket.emit('matchmaking_joined', {
        position: result.position,
        estimatedWait: result.estimatedWait,
        gameMode: data.gameMode,
        queueId: result.queueId
      });
      
      console.log(`🎯 Player ${player.username} joined matchmaking: ${data.gameMode}`);
    } else {
      socket.emit('matchmaking_error', { 
        reason: result.reason,
        code: result.code 
      });
    }
  }
  
  /**
   * Handle leave matchmaking
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Data
   */
  async handleLeaveMatchmaking(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
    if (!connection || !connection.playerId) return;
    
    // Use new matchmaking events system
    const result = await this.matchmakingEvents.handleLeaveQueue(
      connection.playerId, 
      data.reason || 'player_request'
    );
    
    if (result.success) {
      socket.emit('matchmaking_left', { 
        reason: data.reason || 'player_request',
        queueTime: result.queueTime
      });
      console.log(`🎯 Player ${connection.playerId} left matchmaking`);
    } else {
      socket.emit('matchmaking_error', { 
        reason: result.reason,
        code: result.code 
      });
    }
  }
  
  /**
   * Handle ready up
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Ready data
   */
  async handleReadyUp(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
    if (!connection || !connection.playerId) return;
    
    const player = this.activePlayers.get(connection.playerId);
    if (!player) return;
    
    const ready = data.ready !== undefined ? data.ready : true;
    
    try {
      // Update player ready state
      player.setReady(ready);
      
      // Use matchmaking events for match ready-up
      const result = await this.matchmakingEvents.handlePlayerReady(
        connection.playerId, 
        ready, 
        data.matchId
      );
      
      if (result.success) {
        socket.emit('ready_state_changed', { 
          ready: ready,
          allReady: result.allReady,
          readyStates: result.readyStates
        });
        
        // Also notify room if player is in one
        if (connection.roomId) {
          this.connectionManager.broadcastToRoom(connection.roomId, 'player_ready_changed', {
            playerId: connection.playerId,
            username: player.username,
            ready: ready,
            allReady: result.allReady
          });
        }
        
        console.log(`🎯 Player ${player.username} ready state: ${ready}`);
      } else {
        socket.emit('ready_error', { 
          reason: result.reason,
          code: result.code 
        });
      }
      
    } catch (error) {
      socket.emit('ready_error', { reason: error.message });
    }
  }
  
  /**
   * Handle player movement
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Movement data
   */
  async handlePlayerMovement(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
    if (!connection || !connection.playerId) return;
    
    // Add sequence ID for lag compensation
    const movementData = {
      ...data,
      sequenceId: data.sequenceId || Date.now()
    };
    
    try {
      const result = await this.gameplayEvents.handlePlayerMovement(connection.playerId, movementData);
      
      if (!result.success) {
        socket.emit('movement_rejected', {
          reason: result.reason,
          correctedState: result.correctedState
        });
      } else {
        // Send acknowledgment to player
        socket.emit('movement_ack', {
          sequenceId: result.sequenceId,
          serverPosition: result.serverPosition
        });
      }
    } catch (error) {
      console.error(`Error handling player movement:`, error);
      socket.emit('movement_rejected', {
        reason: 'Internal server error'
      });
    }
  }
  
  /**
   * Handle ball update
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Ball data
   */
  async handleBallUpdate(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
    if (!connection || !connection.playerId || !connection.roomId) return;
    
    try {
      const result = await this.gameplayEvents.handleBallUpdate(connection.playerId, data);
      
      if (!result.success) {
        socket.emit('ball_update_rejected', {
          reason: result.reason,
          correctedState: result.correctedState
        });
      } else {
        // Send acknowledgment to authoritative player
        socket.emit('ball_update_ack', {
          serverState: result.serverState
        });
      }
    } catch (error) {
      console.error(`Error handling ball update:`, error);
      socket.emit('ball_update_rejected', {
        reason: 'Internal server error'
      });
    }
  }
  
  /**
   * Handle goal attempt
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Goal data
   */
  async handleGoalAttempt(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
    if (!connection || !connection.playerId || !connection.roomId) return;
    
    try {
      const result = await this.gameplayEvents.handleGoalAttempt(connection.playerId, data);
      
      if (!result.success) {
        socket.emit('goal_rejected', {
          reason: result.reason
        });
      } else {
        // Send goal confirmation to scorer
        socket.emit('goal_confirmed', {
          score: result.score,
          gameEnded: result.gameEnded
        });
        
        console.log(`⚽ Goal scored by ${connection.playerId}! Score: ${result.score.player1}-${result.score.player2}`);
      }
    } catch (error) {
      console.error(`Error handling goal attempt:`, error);
      socket.emit('goal_rejected', {
        reason: 'Internal server error'
      });
    }
  }
  
  /**
   * Handle chat message
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Chat data
   */
  handleChatMessage(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
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
    
    console.log(`=� Chat from ${player.username}: ${data.message}`);
  }
  
  /**
   * Handle player disconnected
   * @param {Object} data - Disconnection data
   */
  async handlePlayerDisconnected(data) {
    const { playerId, socketId } = data;
    
    if (playerId) {
      console.log(`🔌 Player ${playerId} disconnected, processing...`);
      
      // Get connection info to find room
      const connection = this.connectionManager.getPlayerConnection(playerId);
      const roomId = connection?.roomId;
      
      // Handle disconnection in active game
      if (roomId && this.gameplayEvents) {
        try {
          const result = await this.gameplayEvents.handlePlayerDisconnection(playerId, roomId);
          console.log(`🎮 Game disconnection handled: ${result.success ? 'success' : result.reason}`);
        } catch (error) {
          console.error(`❌ Error handling game disconnection:`, error);
        }
      }
      
      // Remove from matchmaking if queued
      this.matchmaker.removeFromQueue(playerId);
      
      // Clean up player data
      this.activePlayers.delete(playerId);
      
      console.log(`🧹 Player ${playerId} cleaned up from all game systems`);
    }
    
    // Clean up rate limiting data
    this.rateLimitStore.delete(socketId);
    
    // Broadcast updated player count and list to all clients
    this.broadcastPlayerCount();
    this.broadcastPlayerList();
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
      console.log(`<� Player ${playerId} reconnected, restoring data...`);
    }
    
    // Send current game state if in room
    if (roomId) {
      const connection = this.connectionManager.connections.get(newSocketId);
      if (connection && connection.socket) {
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
    console.log(`<� Start game request from ${socket.id}`);
  }
  
  async handlePauseRequest(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
    if (!connection || !connection.playerId) return;
    
    try {
      console.log(`⏸️ Pause request from ${connection.playerId} (${connection.username})`);
      
      // For multiplayer, broadcast pause to all players in the match
      if (data.matchId) {
        const roomId = `match_${data.matchId}`;
        
        // Broadcast pause to all players in the match
        this.connectionManager.broadcastToRoom(roomId, 'game_paused', {
          pausedBy: connection.username || connection.playerId,
          playerId: connection.playerId,
          matchId: data.matchId,
          reason: data.reason || 'player_request',
          timestamp: Date.now()
        });
        
        console.log(`⏸️ Game paused in match ${data.matchId} by ${connection.username}`);
        
        socket.emit('pause_confirmed', {
          success: true,
          timestamp: Date.now()
        });
      } else {
        // Fallback to original GameplayEvents system for non-match games
        const result = await this.gameplayEvents.handlePauseRequest(connection.playerId, data);
        
        if (!result.success) {
          socket.emit('pause_rejected', {
            reason: result.reason
          });
        } else {
          socket.emit('pause_confirmed', {
            timeout: result.timeout
          });
        }
      }
    } catch (error) {
      console.error(`Error handling pause request:`, error);
      socket.emit('pause_rejected', {
        reason: 'Internal server error'
      });
    }
  }
  
  async handleResumeRequest(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
    if (!connection || !connection.playerId) return;
    
    try {
      console.log(`▶️ Resume request from ${connection.playerId} (${connection.username})`);
      
      // For multiplayer, broadcast resume to all players in the match
      if (data.matchId) {
        const roomId = `match_${data.matchId}`;
        
        // Broadcast resume to all players in the match
        this.connectionManager.broadcastToRoom(roomId, 'game_resumed', {
          resumedBy: connection.username || connection.playerId,
          playerId: connection.playerId,
          matchId: data.matchId,
          reason: data.reason || 'player_request',
          timestamp: Date.now()
        });
        
        console.log(`▶️ Game resumed in match ${data.matchId} by ${connection.username}`);
        
        socket.emit('resume_confirmed', {
          success: true,
          timestamp: Date.now()
        });
      } else {
        // Fallback to original GameplayEvents system for non-match games
        const result = await this.gameplayEvents.handleResumeRequest(connection.playerId, data);
        
        if (!result.success) {
          socket.emit('resume_rejected', {
            reason: result.reason
          });
        } else {
          socket.emit('resume_confirmed', {});
        }
      }
    } catch (error) {
      console.error(`Error handling resume request:`, error);
      socket.emit('resume_rejected', {
        reason: 'Internal server error'
      });
    }
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
   * Handle get player count request
   * @param {Socket} socket - Socket.IO socket
   */
  handleGetPlayerCount(socket) {
    try {
      // Get the count of all connected clients
      const connectedSockets = this.connectionManager.io.sockets.sockets.size;
      
      // Emit the count back to the requesting client
      socket.emit('playerCount', connectedSockets);
      
      // Also broadcast to all clients for real-time updates
      this.connectionManager.io.emit('playerCount', connectedSockets);
      
      console.log(`👥 Player count requested: ${connectedSockets} players online`);
    } catch (error) {
      console.error('Error getting player count:', error);
      socket.emit('playerCount', 0);
    }
  }

  /**
   * Handle get player list request
   */
  handleGetPlayerList(socket) {
    try {
      // Get the list of all connected players
      const playerList = this.getConnectedPlayersList();
      
      // Emit the list back to the requesting client
      socket.emit('playerList', playerList);
      
      console.log(`📋 Player list requested: ${playerList.length} players online`);
    } catch (error) {
      console.error('Error getting player list:', error);
      socket.emit('playerList', []);
    }
  }

  /**
   * Handle challenge player request
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Challenge data
   */
  handleChallengePlayer(socket, data) {
    try {
      console.log('🔍 DEBUG: Challenge request received:', data);
      
      const challengerConnection = this.connectionManager.getConnectionBySocketId(socket.id);
      console.log('🔍 DEBUG: Challenger connection:', {
        hasConnection: !!challengerConnection,
        isAuthenticated: challengerConnection?.isAuthenticated,
        username: challengerConnection?.username,
        playerId: challengerConnection?.playerId
      });
      
      if (!challengerConnection || !challengerConnection.isAuthenticated) {
        console.log('❌ Challenge failed: Not authenticated');
        socket.emit('challenge_error', { reason: 'Not authenticated' });
        return;
      }

      const { targetPlayerId, targetUsername, targetSocketId } = data;
      console.log('🔍 DEBUG: Target data:', { targetPlayerId, targetUsername, targetSocketId });

      // Validate challenge data
      if (!targetPlayerId || !targetUsername || !targetSocketId) {
        socket.emit('challenge_error', { reason: 'Invalid challenge data' });
        return;
      }

      // Get target player connection
      const targetConnection = this.connectionManager.getConnectionBySocketId(targetSocketId);
      console.log('🔍 DEBUG: Target connection:', {
        hasConnection: !!targetConnection,
        isAuthenticated: targetConnection?.isAuthenticated,
        username: targetConnection?.username,
        playerId: targetConnection?.playerId
      });
      
      if (!targetConnection || !targetConnection.isAuthenticated) {
        console.log('❌ Challenge failed: Target player not found or not authenticated');
        socket.emit('challenge_error', { reason: 'Target player not found or not authenticated' });
        return;
      }

      // Check if target player is available (not busy)
      if (targetConnection.status === 'playing' || targetConnection.status === 'in-game' || targetConnection.status === 'matchmaking') {
        socket.emit('challenge_error', { reason: 'Target player is busy' });
        return;
      }

      // Prevent self-challenge
      if (challengerConnection.playerId === targetPlayerId) {
        socket.emit('challenge_error', { reason: 'Cannot challenge yourself' });
        return;
      }

      // Create challenge object
      const challengeId = `challenge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const challengeData = {
        challengeId: challengeId,
        challengerPlayerId: challengerConnection.playerId,
        challengerUsername: challengerConnection.username,
        challengerSocketId: socket.id,
        targetPlayerId: targetPlayerId,
        targetUsername: targetUsername,
        targetSocketId: targetSocketId,
        timestamp: Date.now(),
        expiresAt: Date.now() + 30000 // 30 seconds timeout
      };

      console.log(`⚔️ Challenge request: ${challengerConnection.username} → ${targetUsername}`);

      // Send challenge request to target player
      targetConnection.socket.emit('challenge_received', {
        challengeId: challengeId,
        challengerUsername: challengerConnection.username,
        challengerPlayerId: challengerConnection.playerId,
        expiresAt: challengeData.expiresAt
      });

      // Send confirmation to challenger
      socket.emit('challenge_sent', {
        challengeId: challengeId,
        targetUsername: targetUsername,
        expiresAt: challengeData.expiresAt
      });

      // Store challenge (you might want to store this in Redis or memory)
      // For now, we'll set a timeout to auto-expire the challenge
      setTimeout(() => {
        // Auto-decline after 30 seconds
        targetConnection.socket.emit('challenge_expired', { challengeId: challengeId });
        socket.emit('challenge_expired', { challengeId: challengeId });
        console.log(`⏰ Challenge expired: ${challengeId}`);
      }, 30000);

    } catch (error) {
      console.error('Error handling challenge request:', error);
      socket.emit('challenge_error', { reason: 'Challenge request failed' });
    }
  }

  /**
   * Handle challenge response (accept/decline)
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Response data
   */
  handleChallengeResponse(socket, data) {
    try {
      const responderConnection = this.connectionManager.getConnectionBySocketId(socket.id);
      if (!responderConnection || !responderConnection.isAuthenticated) {
        socket.emit('challenge_error', { reason: 'Not authenticated' });
        return;
      }

      const { challengeId, response, challengerPlayerId, challengerUsername } = data;

      // Validate response data
      if (!challengeId || !response || !challengerPlayerId) {
        socket.emit('challenge_error', { reason: 'Invalid response data' });
        return;
      }

      if (response !== 'accept' && response !== 'decline') {
        socket.emit('challenge_error', { reason: 'Invalid response type' });
        return;
      }

      // Find challenger connection
      const challengerConnection = this.connectionManager.getPlayerConnection(challengerPlayerId);
      if (!challengerConnection || !challengerConnection.socket) {
        socket.emit('challenge_error', { reason: 'Challenger no longer available' });
        return;
      }

      console.log(`📋 Challenge response: ${responderConnection.username} ${response}ed ${challengerUsername}'s challenge`);

      if (response === 'accept') {
        // Challenge accepted - proceed to match setup
        const matchId = `match-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Send complete match data to both players
        challengerConnection.socket.emit('challenge_accepted', {
          challengeId: challengeId,
          matchId: matchId,
          challengerId: challengerConnection.playerId,
          challengerUsername: challengerConnection.username,
          opponentId: responderConnection.playerId,
          opponentUsername: responderConnection.username,
          isChallenger: true
        });

        socket.emit('challenge_accepted', {
          challengeId: challengeId,
          matchId: matchId,
          challengerId: challengerConnection.playerId,
          challengerUsername: challengerConnection.username,
          opponentId: responderConnection.playerId,
          opponentUsername: responderConnection.username,
          isChallenger: false
        });

        console.log(`✅ Challenge accepted: ${challengerConnection.username} vs ${responderConnection.username}`);
        
        // TODO: Phase 3.2 - Create game room and redirect both players
        
      } else {
        // Challenge declined
        challengerConnection.socket.emit('challenge_declined', {
          challengeId: challengeId,
          opponentUsername: responderConnection.username
        });

        socket.emit('challenge_declined', {
          challengeId: challengeId,
          challengerUsername: challengerConnection.username
        });

        console.log(`❌ Challenge declined: ${responderConnection.username} declined ${challengerConnection.username}'s challenge`);
      }

    } catch (error) {
      console.error('Error handling challenge response:', error);
      socket.emit('challenge_error', { reason: 'Challenge response failed' });
    }
  }
  
  /**
   * Handle forfeit game request
   */
  async handleForfeitGame(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
    if (!connection || !connection.playerId || !connection.roomId) {
      socket.emit('forfeit_rejected', {
        reason: 'Not in an active game'
      });
      return;
    }
    
    try {
      console.log(`🏳️ Player ${connection.playerId} requesting to forfeit game in room ${connection.roomId}`);
      
      // Use GameplayEvents to handle forfeit (which will call GameEndEvents)
      const result = await this.gameplayEvents.handleForcedEnd(
        connection.roomId, 
        'forfeit', 
        connection.playerId
      );
      
      if (result.success) {
        socket.emit('forfeit_accepted', {
          roomId: connection.roomId,
          reason: 'forfeit'
        });
        
        console.log(`✅ Game forfeit processed successfully for room ${connection.roomId}`);
      } else {
        socket.emit('forfeit_rejected', {
          reason: result.reason || 'Failed to process forfeit'
        });
        
        console.log(`❌ Game forfeit failed for room ${connection.roomId}: ${result.reason}`);
      }
      
    } catch (error) {
      console.error(`💥 Error processing game forfeit:`, error);
      socket.emit('forfeit_rejected', {
        reason: 'Internal server error'
      });
    }
  }
  
  /**
   * Handle request game end (admin or special conditions)
   */
  async handleRequestGameEnd(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
    if (!connection || !connection.playerId || !connection.roomId) {
      socket.emit('game_end_rejected', {
        reason: 'Not in an active game'
      });
      return;
    }
    
    try {
      const endReason = data.reason || 'player_request';
      
      console.log(`🏁 Player ${connection.playerId} requesting game end: ${endReason}`);
      
      // Validate the request based on reason
      let isValidRequest = false;
      
      switch (endReason) {
        case 'time_limit':
          // Check if time limit actually reached
          isValidRequest = true; // GameplayEvents will validate
          break;
        case 'mutual_agreement':
          // Would need both players to agree (simplified for now)
          isValidRequest = data.confirmed === true;
          break;
        case 'technical_issue':
          // Allow technical issues to end games
          isValidRequest = true;
          break;
        case 'admin_intervention':
          // Would need admin privileges (simplified for now)
          isValidRequest = data.adminCode === 'ADMIN_END_GAME';
          break;
        default:
          isValidRequest = false;
      }
      
      if (!isValidRequest) {
        socket.emit('game_end_rejected', {
          reason: `Invalid or unauthorized game end request: ${endReason}`
        });
        return;
      }
      
      // Use GameplayEvents to handle the game end
      const result = await this.gameplayEvents.handleForcedEnd(
        connection.roomId,
        endReason,
        connection.playerId
      );
      
      if (result.success) {
        socket.emit('game_end_accepted', {
          roomId: connection.roomId,
          reason: endReason,
          endTime: Date.now()
        });
        
        console.log(`✅ Game end request processed successfully for room ${connection.roomId}`);
      } else {
        socket.emit('game_end_rejected', {
          reason: result.reason || 'Failed to end game'
        });
        
        console.log(`❌ Game end request failed for room ${connection.roomId}: ${result.reason}`);
      }
      
    } catch (error) {
      console.error(`💥 Error processing game end request:`, error);
      socket.emit('game_end_rejected', {
        reason: 'Internal server error'
      });
    }
  }
  
  /**
   * Handle join room request
   */
  async handleJoinRoom(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
    if (!connection || !connection.playerId) {
      socket.emit('room_error', { reason: 'Not authenticated' });
      return;
    }
    
    const result = await this.matchmakingEvents.assignPlayerToRoom(
      connection.playerId, 
      data.roomId, 
      data.matchId
    );
    
    if (result.success) {
      socket.emit('room_joined', {
        roomId: result.roomId,
        playerId: result.playerId
      });
    } else {
      socket.emit('room_error', { 
        reason: result.reason,
        code: result.code 
      });
    }
  }
  
  /**
   * Handle leave room request
   */
  async handleLeaveRoom(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
    if (!connection || !connection.playerId) return;
    
    const result = await this.matchmakingEvents.handleLeaveRoom(
      connection.playerId, 
      data.roomId || connection.roomId, 
      data.reason || 'player_request'
    );
    
    if (result.success) {
      socket.emit('room_left', {
        roomId: result.roomId,
        playerId: result.playerId
      });
    } else {
      socket.emit('room_error', { 
        reason: result.reason,
        code: result.code 
      });
    }
  }
  
  /**
   * Handle get matchmaking stats
   */
  handleGetMatchmakingStats(socket, data) {
    const stats = this.matchmakingEvents.getStats();
    
    socket.emit('matchmaking_stats', {
      ...stats,
      timestamp: Date.now()
    });
  }
  
  /**
   * Setup Game Event System handlers
   */
  setupGameEventHandlers() {
    // Handle game event processing errors
    this.gameEventSystem.on('error', (errorData) => {
      console.error('🎮 Game Event System error:', errorData.error.message);
      this.emit('gameEventError', errorData);
    });
    
    // Handle validation errors
    this.gameEventSystem.on('validationError', (errorData) => {
      console.warn('🎮 Game event validation error:', errorData.eventType, errorData.errors);
      this.emit('gameEventValidationError', errorData);
    });
    
    // Handle rate limiting
    this.gameEventSystem.on('rateLimitExceeded', (data) => {
      console.warn(`🎮 Rate limit exceeded for ${data.playerId}: ${data.eventType}`);
      this.emit('gameEventRateLimit', data);
    });
    
    // Track processed events
    this.gameEventSystem.on('eventProcessed', (event) => {
      this.metrics.eventsProcessed++;
      this.emit('gameEventProcessed', event);
    });
  }
  
  /**
   * Queue a game event through the Game Event System
   */
  queueGameEvent(eventType, eventData, metadata) {
    return this.gameEventSystem.queueEvent(eventType, eventData, metadata);
  }
  
  /**
   * Update player latency for lag compensation
   */
  updatePlayerLatency(playerId, latency) {
    this.gameEventSystem.updatePlayerLatency(playerId, latency);
  }
  
  /**
   * Get Game Event System statistics
   */
  getGameEventStats() {
    return this.gameEventSystem.getStats();
  }
  
  /**
   * Broadcast current player count to all connected clients
   */
  broadcastPlayerCount() {
    try {
      const connectedSockets = this.connectionManager.io.sockets.sockets.size;
      this.connectionManager.io.emit('playerCount', connectedSockets);
      console.log(`📢 Broadcasting player count: ${connectedSockets} players online`);
    } catch (error) {
      console.error('Error broadcasting player count:', error);
    }
  }

  /**
   * Broadcast current player list to all connected clients
   */
  broadcastPlayerList() {
    try {
      const playerList = this.getConnectedPlayersList();
      
      // Debug log to check player data before sending
      console.log('🔍 DEBUG: Player list before emit:', JSON.stringify(playerList, null, 2));
      
      this.connectionManager.io.emit('playerList', playerList);
      console.log(`📋 Broadcasting player list: ${playerList.length} players`);
    } catch (error) {
      console.error('Error broadcasting player list:', error);
    }
  }

  /**
   * Get list of all connected players
   * @returns {Array} Array of player objects
   */
  getConnectedPlayersList() {
    const playerList = [];
    
    try {
      console.log('🔍 DEBUG: Getting connected players list...');
      // Iterate through all connections
      for (const [socketId, connection] of this.connectionManager.connections.entries()) {
        // Only include connected sockets
        if (connection.socket && connection.socket.connected) {
          console.log(`🔍 DEBUG: Connection ${socketId}:`, {
            username: connection.username,
            playerId: connection.playerId,
            isAuthenticated: connection.isAuthenticated
          });
          
          const player = {
            socketId: socketId,
            playerId: connection.playerId,
            username: connection.username || connection.playerId || 'Guest',
            status: this.getPlayerStatus(connection),
            connectedAt: connection.connectedAt,
            roomId: connection.roomId
          };
          
          playerList.push(player);
        }
      }
      
      // Sort by connection time (newest first)
      playerList.sort((a, b) => b.connectedAt - a.connectedAt);
      
    } catch (error) {
      console.error('Error getting connected players list:', error);
    }
    
    return playerList;
  }

  /**
   * Get player status based on connection state
   * @param {Object} connection - Connection object
   * @returns {string} Player status
   */
  getPlayerStatus(connection) {
    if (!connection.isAuthenticated) {
      return 'guest';
    } else if (connection.roomId) {
      return 'playing';
    } else {
      return 'online';
    }
  }
  
  /**
   * Handle player joining character selection
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Character selection join data
   */
  async handleJoinCharacterSelection(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
    if (!connection || !connection.playerId) {
      socket.emit('character_selection_error', { 
        reason: 'Not authenticated' 
      });
      return;
    }

    const { matchId, playerId, username } = data;

    try {
      console.log(`🎭 Player ${username} (${playerId}) joining character selection for match ${matchId}`);
      
      // Join the character selection room
      const roomId = `character_selection_${matchId}`;
      socket.join(roomId); // IMPORTANT: Actually join the Socket.IO room
      connection.roomId = roomId;
      
      // Track room connections properly
      if (!this.connectionManager.roomConnections.has(roomId)) {
        this.connectionManager.roomConnections.set(roomId, new Set());
      }
      this.connectionManager.roomConnections.get(roomId).add(socket.id);
      
      // Update connection state
      connection.gameState = 'character_selection';
      connection.matchId = matchId;

      // Broadcast to other players in the room
      this.connectionManager.broadcastToRoom(roomId, 'opponent_joined', {
        playerId: playerId,
        username: username,
        timestamp: Date.now()
      }, socket.id);

      // Send confirmation to joining player
      socket.emit('character_selection_joined', {
        matchId: matchId,
        roomId: roomId,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error(`Error joining character selection:`, error);
      socket.emit('character_selection_error', {
        reason: 'Failed to join character selection'
      });
    }
  }

  /**
   * Handle character selection
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Character selection data
   */
  async handleCharacterSelect(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
    if (!connection || !connection.playerId) {
      socket.emit('character_selection_error', { 
        reason: 'Not authenticated' 
      });
      return;
    }

    const { matchId, playerId, characterType, characterIndex, characterData } = data;

    try {
      console.log(`🎭 Player ${playerId} selected character ${characterIndex} (${characterType}) in match ${matchId}`);
      
      const roomId = `character_selection_${matchId}`;
      
      // Broadcast character selection to other players in the room
      this.connectionManager.broadcastToRoom(roomId, 'character_select', {
        playerId: playerId,
        characterType: characterType,
        characterIndex: characterIndex,
        characterData: characterData,
        timestamp: Date.now()
      }, socket.id);

      // Send confirmation to selecting player
      socket.emit('character_select_confirmed', {
        characterType: characterType,
        characterIndex: characterIndex,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error(`Error handling character selection:`, error);
      socket.emit('character_selection_error', {
        reason: 'Failed to select character'
      });
    }
  }

  /**
   * Handle player ready status for character selection
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} data - Player ready data
   */
  async handlePlayerReady(socket, data) {
    const connection = this.connectionManager.getConnectionBySocketId(socket.id);
    if (!connection || !connection.playerId) {
      socket.emit('character_selection_error', { 
        reason: 'Not authenticated' 
      });
      return;
    }

    const { matchId, playerId, ready, selectedHead, selectedCleat } = data;

    try {
      console.log(`🎭 Player ${playerId} ready status: ${ready} in match ${matchId}`);
      
      const roomId = `character_selection_${matchId}`;
      
      // Broadcast ready status to other players in the room
      this.connectionManager.broadcastToRoom(roomId, 'player_ready', {
        playerId: playerId,
        ready: ready,
        selectedHead: selectedHead,
        selectedCleat: selectedCleat,
        timestamp: Date.now()
      }, socket.id);

      // Send confirmation to ready player
      socket.emit('player_ready_confirmed', {
        ready: ready,
        timestamp: Date.now()
      });

      // Check if all players in the match are ready
      const roomConnectionIds = this.connectionManager.getRoomConnections(roomId);
      const roomConnections = roomConnectionIds ? Array.from(roomConnectionIds).map(id => this.connectionManager.getConnectionBySocketId(id)).filter(conn => conn) : [];
      const readyPlayers = [];
      
      // Count ready players (this is simplified - in production you'd track ready state per connection)
      if (ready) {
        readyPlayers.push(playerId);
        
        // If this is the second player ready, start the match
        if (roomConnections.length >= 2) {
          console.log(`🚀 Both players ready in match ${matchId}, starting selection complete`);
          
          // Broadcast that selection is complete
          this.connectionManager.broadcastToRoom(roomId, 'selection_complete', {
            matchId: matchId,
            players: roomConnections.map(conn => ({
              playerId: conn.playerId,
              username: conn.username
            })),
            timestamp: Date.now()
          });
        }
      }

    } catch (error) {
      console.error(`Error handling player ready:`, error);
      socket.emit('character_selection_error', {
        reason: 'Failed to update ready status'
      });
    }
  }

  /**
   * Get handler statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const uptime = Date.now() - this.metrics.startTime;
    
    const baseStats = {
      ...this.metrics,
      uptime: uptime,
      activePlayers: this.activePlayers.size,
      activeRooms: this.activeRooms.size,
      eventsPerSecond: this.metrics.eventsProcessed / (uptime / 1000),
      errorRate: this.metrics.eventsRejected / Math.max(1, this.metrics.eventsProcessed),
      rateLimitViolationRate: this.metrics.rateLimitViolations / Math.max(1, this.metrics.eventsProcessed)
    };
    
    // Include Game Event System stats if available
    if (this.gameEventSystem) {
      baseStats.gameEventSystem = this.gameEventSystem.getStats();
    }
    
    return baseStats;
  }
  
  /**
   * Cleanup resources
   */
  shutdown() {
    console.log('🎮 Socket Event Handler shutting down...');
    
    // Shutdown Game Event System
    if (this.gameEventSystem) {
      this.gameEventSystem.shutdown();
    }
    
    // Shutdown Matchmaking Events
    if (this.matchmakingEvents) {
      this.matchmakingEvents.shutdown();
    }
    
    // Clear all data
    this.activePlayers.clear();
    this.activeRooms.clear();
    this.rateLimitStore.clear();
    
    console.log(' Socket Event Handler shutdown complete');
  }
}

module.exports = SocketHandler;