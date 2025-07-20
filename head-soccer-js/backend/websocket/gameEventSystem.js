/**
 * Game Event System - Comprehensive real-time event management
 * Handles all game events with prioritization, lag compensation, and rate limiting
 */

const EventEmitter = require('events');

class GameEventSystem extends EventEmitter {
  constructor(connectionManager, options = {}) {
    super();
    
    this.connectionManager = connectionManager;
    this.options = {
      maxQueueSize: options.maxQueueSize || 1000,
      tickRate: options.tickRate || 60, // 60 FPS
      lagCompensationWindow: options.lagCompensationWindow || 1000, // 1 second
      eventTimeoutMs: options.eventTimeoutMs || 5000,
      ...options
    };
    
    // Event queues by priority
    this.eventQueues = {
      CRITICAL: [], // Game-breaking events (disconnections, cheating)
      HIGH: [],     // Player actions (movement, goals)
      MEDIUM: [],   // Game state updates (score, timer)
      LOW: []       // Chat, emotes, stats
    };
    
    // Event processing state
    this.processing = false;
    this.processInterval = null;
    this.tickInterval = null;
    
    // Performance metrics
    this.metrics = {
      eventsQueued: 0,
      eventsProcessed: 0,
      eventsDropped: 0,
      avgProcessingTime: 0,
      queueSizes: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
      startTime: Date.now()
    };
    
    // Rate limiting per event type
    this.rateLimits = {
      // Player movement events
      'player_movement': { maxPerSecond: 60, window: 1000 },
      'player_action': { maxPerSecond: 10, window: 1000 },
      
      // Ball physics events  
      'ball_update': { maxPerSecond: 60, window: 1000 },
      'ball_collision': { maxPerSecond: 30, window: 1000 },
      
      // Game events
      'goal_attempt': { maxPerSecond: 5, window: 1000 },
      'goal_scored': { maxPerSecond: 1, window: 2000 },
      
      // Chat and communication
      'chat_message': { maxPerSecond: 2, window: 1000 },
      'emote': { maxPerSecond: 5, window: 1000 },
      
      // Matchmaking events
      'ready_state': { maxPerSecond: 10, window: 1000 },
      'pause_request': { maxPerSecond: 1, window: 5000 },
      
      // System events
      'heartbeat': { maxPerSecond: 1, window: 1000 },
      'sync_request': { maxPerSecond: 5, window: 1000 }
    };
    
    // Rate limiting tracking
    this.rateLimitTracking = new Map(); // playerId -> { eventType -> { count, resetTime } }
    
    // Event definitions with validation schemas
    this.eventDefinitions = this.defineEventSchemas();
    
    // Lag compensation data
    this.playerLatencies = new Map(); // playerId -> { latency, lastUpdate }
    this.eventHistory = new Map(); // eventId -> { timestamp, processed, compensated }
    
    console.log('🎮 Game Event System initialized');
  }
  
  /**
   * Define all game event schemas and validation rules
   */
  defineEventSchemas() {
    return {
      // === PLAYER EVENTS ===
      'player_movement': {
        priority: 'HIGH',
        schema: {
          required: ['playerId', 'position', 'velocity', 'timestamp'],
          properties: {
            playerId: { type: 'string', maxLength: 50 },
            position: { 
              type: 'object',
              properties: {
                x: { type: 'number', min: 0, max: 800 },
                y: { type: 'number', min: 0, max: 400 }
              }
            },
            velocity: {
              type: 'object', 
              properties: {
                x: { type: 'number', min: -500, max: 500 },
                y: { type: 'number', min: -500, max: 500 }
              }
            },
            direction: { type: 'string', enum: ['left', 'right', 'up', 'down', 'idle'] },
            timestamp: { type: 'number' },
            sequenceId: { type: 'number' }
          }
        },
        lagCompensation: true,
        broadcast: 'room'
      },
      
      'player_action': {
        priority: 'HIGH',
        schema: {
          required: ['playerId', 'action', 'timestamp'],
          properties: {
            playerId: { type: 'string', maxLength: 50 },
            action: { type: 'string', enum: ['kick', 'jump', 'dash', 'tackle'] },
            power: { type: 'number', min: 0, max: 100 },
            direction: { type: 'number', min: 0, max: 360 },
            timestamp: { type: 'number' },
            inputSequence: { type: 'array', items: { type: 'string' } }
          }
        },
        lagCompensation: true,
        broadcast: 'room'
      },
      
      // === BALL EVENTS ===
      'ball_update': {
        priority: 'HIGH',
        schema: {
          required: ['position', 'velocity', 'timestamp'],
          properties: {
            position: {
              type: 'object',
              properties: {
                x: { type: 'number', min: 0, max: 800 },
                y: { type: 'number', min: 0, max: 400 }
              }
            },
            velocity: {
              type: 'object',
              properties: {
                x: { type: 'number', min: -1000, max: 1000 },
                y: { type: 'number', min: -1000, max: 1000 }
              }
            },
            spin: { type: 'number', min: -10, max: 10 },
            timestamp: { type: 'number' },
            authoritative: { type: 'boolean' }
          }
        },
        lagCompensation: true,
        broadcast: 'room',
        authoritative: true
      },
      
      'ball_collision': {
        priority: 'HIGH',
        schema: {
          required: ['collisionType', 'position', 'timestamp'],
          properties: {
            collisionType: { type: 'string', enum: ['player', 'wall', 'goal', 'ground'] },
            playerId: { type: 'string', maxLength: 50 }, // Optional for player collisions
            position: { type: 'object' },
            normal: { type: 'object' }, // Collision normal vector
            force: { type: 'number', min: 0, max: 1000 },
            timestamp: { type: 'number' }
          }
        },
        lagCompensation: true,
        broadcast: 'room'
      },
      
      // === GAME EVENTS ===
      'goal_attempt': {
        priority: 'CRITICAL',
        schema: {
          required: ['playerId', 'position', 'power', 'direction', 'timestamp'],
          properties: {
            playerId: { type: 'string', maxLength: 50 },
            position: { type: 'object' },
            power: { type: 'number', min: 0, max: 100 },
            direction: { type: 'number', min: 0, max: 360 },
            timestamp: { type: 'number' },
            ballPosition: { type: 'object' },
            ballVelocity: { type: 'object' }
          }
        },
        lagCompensation: true,
        broadcast: 'room',
        authoritative: true,
        validation: 'server' // Server validates goal attempts
      },
      
      'goal_scored': {
        priority: 'CRITICAL',
        schema: {
          required: ['playerId', 'goalType', 'timestamp'],
          properties: {
            playerId: { type: 'string', maxLength: 50 },
            goalType: { type: 'string', enum: ['normal', 'header', 'volley', 'penalty'] },
            score: { 
              type: 'object',
              properties: {
                player1: { type: 'number' },
                player2: { type: 'number' }
              }
            },
            timestamp: { type: 'number' },
            replay: { type: 'array' } // Event sequence for replay
          }
        },
        broadcast: 'room',
        authoritative: true,
        persistent: true // Save to database
      },
      
      // === GAME STATE EVENTS ===
      'game_state_update': {
        priority: 'MEDIUM',
        schema: {
          required: ['gameState', 'timestamp'],
          properties: {
            gameState: { 
              type: 'string', 
              enum: ['waiting', 'ready', 'countdown', 'playing', 'paused', 'finished'] 
            },
            timeRemaining: { type: 'number' },
            score: { type: 'object' },
            timestamp: { type: 'number' }
          }
        },
        broadcast: 'room',
        authoritative: true
      },
      
      'game_timer': {
        priority: 'MEDIUM',
        schema: {
          required: ['timeRemaining', 'timestamp'],
          properties: {
            timeRemaining: { type: 'number', min: 0 },
            timerState: { type: 'string', enum: ['running', 'paused', 'stopped'] },
            timestamp: { type: 'number' }
          }
        },
        broadcast: 'room',
        authoritative: true
      },
      
      // === MATCHMAKING EVENTS ===
      'ready_state': {
        priority: 'MEDIUM',
        schema: {
          required: ['playerId', 'ready'],
          properties: {
            playerId: { type: 'string', maxLength: 50 },
            ready: { type: 'boolean' },
            timestamp: { type: 'number' }
          }
        },
        broadcast: 'room'
      },
      
      'match_found': {
        priority: 'HIGH',
        schema: {
          required: ['roomId', 'players', 'gameMode'],
          properties: {
            roomId: { type: 'string', maxLength: 50 },
            players: { type: 'array', maxItems: 2 },
            gameMode: { type: 'string', enum: ['casual', 'ranked', 'tournament'] },
            estimatedPing: { type: 'number' },
            timestamp: { type: 'number' }
          }
        },
        broadcast: 'players'
      },
      
      // === COMMUNICATION EVENTS ===
      'chat_message': {
        priority: 'LOW',
        schema: {
          required: ['playerId', 'message'],
          properties: {
            playerId: { type: 'string', maxLength: 50 },
            message: { type: 'string', maxLength: 200 },
            messageType: { type: 'string', enum: ['all', 'team', 'private'] },
            targetId: { type: 'string', maxLength: 50 }, // For private messages
            timestamp: { type: 'number' }
          }
        },
        broadcast: 'room',
        sanitization: true
      },
      
      'emote': {
        priority: 'LOW',
        schema: {
          required: ['playerId', 'emoteType'],
          properties: {
            playerId: { type: 'string', maxLength: 50 },
            emoteType: { type: 'string', enum: ['celebration', 'taunt', 'gg', 'oops'] },
            duration: { type: 'number', min: 1000, max: 5000 },
            timestamp: { type: 'number' }
          }
        },
        broadcast: 'room'
      },
      
      // === SYSTEM EVENTS ===
      'heartbeat': {
        priority: 'LOW',
        schema: {
          required: ['playerId', 'timestamp'],
          properties: {
            playerId: { type: 'string', maxLength: 50 },
            timestamp: { type: 'number' },
            latency: { type: 'number' }
          }
        },
        broadcast: 'none'
      },
      
      'sync_request': {
        priority: 'MEDIUM',
        schema: {
          required: ['playerId', 'syncType'],
          properties: {
            playerId: { type: 'string', maxLength: 50 },
            syncType: { type: 'string', enum: ['full', 'gameState', 'players', 'ball'] },
            lastEventId: { type: 'string' },
            timestamp: { type: 'number' }
          }
        },
        broadcast: 'none'
      },
      
      'lag_compensation': {
        priority: 'MEDIUM',
        schema: {
          required: ['playerId', 'clientTime', 'serverTime'],
          properties: {
            playerId: { type: 'string', maxLength: 50 },
            clientTime: { type: 'number' },
            serverTime: { type: 'number' },
            roundTripTime: { type: 'number' },
            clockDiff: { type: 'number' }
          }
        },
        broadcast: 'player'
      }
    };
  }
  
  /**
   * Queue a game event for processing
   */
  queueEvent(eventType, eventData, metadata = {}) {
    try {
      // Validate event type
      const eventDef = this.eventDefinitions[eventType];
      if (!eventDef) {
        throw new Error(`Unknown event type: ${eventType}`);
      }
      
      // Check rate limiting
      if (!this.checkRateLimit(metadata.playerId, eventType)) {
        this.metrics.eventsDropped++;
        this.emit('rateLimitExceeded', { eventType, playerId: metadata.playerId });
        return false;
      }
      
      // Validate event data
      const validationResult = this.validateEventData(eventType, eventData);
      if (!validationResult.valid) {
        this.emit('validationError', { 
          eventType, 
          errors: validationResult.errors,
          eventData 
        });
        return false;
      }
      
      // Create event object
      const event = {
        id: this.generateEventId(),
        type: eventType,
        data: validationResult.data,
        priority: eventDef.priority,
        timestamp: Date.now(),
        metadata: {
          playerId: metadata.playerId,
          roomId: metadata.roomId,
          socketId: metadata.socketId,
          ...metadata
        },
        lagCompensation: eventDef.lagCompensation && metadata.clientTimestamp ? {
          clientTimestamp: metadata.clientTimestamp,
          serverTimestamp: Date.now(),
          estimatedLatency: metadata.latency || 0
        } : null
      };
      
      // Queue event by priority
      const queue = this.eventQueues[eventDef.priority];
      
      // Check queue size limits
      if (queue.length >= this.options.maxQueueSize / 4) {
        // Drop oldest low priority events if queue is full
        if (eventDef.priority === 'LOW') {
          this.metrics.eventsDropped++;
          return false;
        }
      }
      
      queue.push(event);
      this.metrics.eventsQueued++;
      this.updateQueueMetrics();
      
      // Start processing if not already running
      this.startProcessing();
      
      return true;
      
    } catch (error) {
      console.error(`Error queueing event ${eventType}:`, error);
      this.emit('error', { error, eventType, eventData });
      return false;
    }
  }
  
  /**
   * Validate event data against schema
   */
  validateEventData(eventType, data) {
    const eventDef = this.eventDefinitions[eventType];
    if (!eventDef || !eventDef.schema) {
      return { valid: true, data };
    }
    
    const { required = [], properties = {} } = eventDef.schema;
    const errors = [];
    const validatedData = {};
    
    // Check required fields
    for (const field of required) {
      if (data[field] === undefined || data[field] === null) {
        errors.push(`Missing required field: ${field}`);
      } else {
        validatedData[field] = data[field];
      }
    }
    
    // Validate field properties
    for (const [field, value] of Object.entries(data)) {
      const fieldSchema = properties[field];
      if (fieldSchema) {
        const fieldValidation = this.validateField(field, value, fieldSchema);
        if (!fieldValidation.valid) {
          errors.push(...fieldValidation.errors);
        } else {
          validatedData[field] = fieldValidation.value;
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      data: validatedData,
      errors
    };
  }
  
  /**
   * Validate individual field
   */
  validateField(fieldName, value, schema) {
    const errors = [];
    let validValue = value;
    
    // Type validation
    if (schema.type) {
      if (schema.type === 'number' && typeof value !== 'number') {
        errors.push(`Field ${fieldName} must be a number`);
      } else if (schema.type === 'string' && typeof value !== 'string') {
        errors.push(`Field ${fieldName} must be a string`);
      } else if (schema.type === 'boolean' && typeof value !== 'boolean') {
        errors.push(`Field ${fieldName} must be a boolean`);
      } else if (schema.type === 'object' && typeof value !== 'object') {
        errors.push(`Field ${fieldName} must be an object`);
      }
    }
    
    // Range validation for numbers
    if (schema.type === 'number' && typeof value === 'number') {
      if (schema.min !== undefined && value < schema.min) {
        errors.push(`Field ${fieldName} must be >= ${schema.min}`);
      }
      if (schema.max !== undefined && value > schema.max) {
        errors.push(`Field ${fieldName} must be <= ${schema.max}`);
      }
    }
    
    // Length validation for strings
    if (schema.type === 'string' && typeof value === 'string') {
      if (schema.maxLength && value.length > schema.maxLength) {
        errors.push(`Field ${fieldName} exceeds maximum length of ${schema.maxLength}`);
      }
    }
    
    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`Field ${fieldName} must be one of: ${schema.enum.join(', ')}`);
    }
    
    return {
      valid: errors.length === 0,
      value: validValue,
      errors
    };
  }
  
  /**
   * Check rate limiting for player and event type
   */
  checkRateLimit(playerId, eventType) {
    if (!playerId || !this.rateLimits[eventType]) {
      return true; // No rate limiting configured
    }
    
    const now = Date.now();
    const limit = this.rateLimits[eventType];
    
    if (!this.rateLimitTracking.has(playerId)) {
      this.rateLimitTracking.set(playerId, new Map());
    }
    
    const playerLimits = this.rateLimitTracking.get(playerId);
    
    if (!playerLimits.has(eventType)) {
      playerLimits.set(eventType, { count: 0, resetTime: now + limit.window });
    }
    
    const eventLimit = playerLimits.get(eventType);
    
    // Reset if window has passed
    if (now >= eventLimit.resetTime) {
      eventLimit.count = 0;
      eventLimit.resetTime = now + limit.window;
    }
    
    // Check limit
    if (eventLimit.count >= limit.maxPerSecond) {
      return false;
    }
    
    eventLimit.count++;
    return true;
  }
  
  /**
   * Start event processing
   */
  startProcessing() {
    if (this.processing) return;
    
    this.processing = true;
    
    // Process events at high frequency
    this.processInterval = setInterval(() => {
      this.processEventQueue();
    }, 1000 / this.options.tickRate); // 60 FPS
    
    console.log(`🎮 Event processing started at ${this.options.tickRate} FPS`);
  }
  
  /**
   * Process queued events by priority
   */
  processEventQueue() {
    const startTime = Date.now();
    let eventsProcessed = 0;
    
    // Process events in priority order
    const priorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    
    for (const priority of priorities) {
      const queue = this.eventQueues[priority];
      
      // Process up to N events per priority per tick
      const maxEventsPerTick = priority === 'CRITICAL' ? 10 : 
                              priority === 'HIGH' ? 5 : 3;
      
      for (let i = 0; i < Math.min(queue.length, maxEventsPerTick); i++) {
        const event = queue.shift();
        if (event) {
          this.processEvent(event);
          eventsProcessed++;
        }
      }
    }
    
    // Update metrics
    if (eventsProcessed > 0) {
      const processingTime = Date.now() - startTime;
      this.metrics.eventsProcessed += eventsProcessed;
      this.metrics.avgProcessingTime = 
        (this.metrics.avgProcessingTime + processingTime) / 2;
      
      this.updateQueueMetrics();
    }
    
    // Stop processing if all queues are empty
    if (this.getTotalQueueSize() === 0) {
      this.stopProcessing();
    }
  }
  
  /**
   * Process individual event
   */
  processEvent(event) {
    try {
      const eventDef = this.eventDefinitions[event.type];
      
      // Apply lag compensation if needed
      if (event.lagCompensation) {
        this.applyLagCompensation(event);
      }
      
      // Emit to appropriate recipients
      this.broadcastEvent(event, eventDef);
      
      // Store in history for replay/debugging
      this.eventHistory.set(event.id, {
        timestamp: event.timestamp,
        processed: Date.now(),
        compensated: !!event.lagCompensation
      });
      
      // Clean old history
      this.cleanEventHistory();
      
      // Emit processed event
      this.emit('eventProcessed', event);
      
    } catch (error) {
      console.error(`Error processing event ${event.type}:`, error);
      this.emit('processingError', { event, error });
    }
  }
  
  /**
   * Apply lag compensation to event
   */
  applyLagCompensation(event) {
    if (!event.lagCompensation || !event.metadata.playerId) return;
    
    const playerId = event.metadata.playerId;
    const latency = this.getPlayerLatency(playerId);
    
    if (latency > 0) {
      // Compensate timestamp
      const compensationMs = Math.min(latency / 2, this.options.lagCompensationWindow);
      event.lagCompensation.compensatedTimestamp = 
        event.lagCompensation.clientTimestamp + compensationMs;
      
      // Store compensation info
      event.lagCompensation.appliedCompensation = compensationMs;
      event.lagCompensation.playerLatency = latency;
    }
  }
  
  /**
   * Broadcast event to appropriate recipients
   */
  broadcastEvent(event, eventDef) {
    const broadcastType = eventDef.broadcast || 'none';
    
    switch (broadcastType) {
      case 'room':
        if (event.metadata.roomId) {
          this.connectionManager.broadcastToRoom(
            event.metadata.roomId, 
            event.type, 
            event.data
          );
        }
        break;
        
      case 'player':
        if (event.metadata.playerId) {
          const connection = this.connectionManager.getConnectionByPlayerId(
            event.metadata.playerId
          );
          if (connection && connection.socket) {
            connection.socket.emit(event.type, event.data);
          }
        }
        break;
        
      case 'players':
        if (event.data.players) {
          event.data.players.forEach(playerId => {
            const connection = this.connectionManager.getConnectionByPlayerId(playerId);
            if (connection && connection.socket) {
              connection.socket.emit(event.type, event.data);
            }
          });
        }
        break;
        
      case 'all':
        this.connectionManager.broadcastToAll(event.type, event.data);
        break;
        
      case 'none':
      default:
        // Don't broadcast, just process internally
        break;
    }
  }
  
  /**
   * Update player latency information
   */
  updatePlayerLatency(playerId, latency) {
    this.playerLatencies.set(playerId, {
      latency: latency,
      lastUpdate: Date.now()
    });
  }
  
  /**
   * Get player latency
   */
  getPlayerLatency(playerId) {
    const data = this.playerLatencies.get(playerId);
    if (!data) return 0;
    
    // Consider latency stale after 10 seconds
    if (Date.now() - data.lastUpdate > 10000) {
      return 0;
    }
    
    return data.latency;
  }
  
  /**
   * Generate unique event ID
   */
  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get total queue size across all priorities
   */
  getTotalQueueSize() {
    return Object.values(this.eventQueues).reduce((total, queue) => total + queue.length, 0);
  }
  
  /**
   * Update queue size metrics
   */
  updateQueueMetrics() {
    for (const [priority, queue] of Object.entries(this.eventQueues)) {
      this.metrics.queueSizes[priority] = queue.length;
    }
  }
  
  /**
   * Clean old event history
   */
  cleanEventHistory() {
    const cutoffTime = Date.now() - (this.options.lagCompensationWindow * 2);
    
    for (const [eventId, eventData] of this.eventHistory.entries()) {
      if (eventData.timestamp < cutoffTime) {
        this.eventHistory.delete(eventId);
      }
    }
  }
  
  /**
   * Stop event processing
   */
  stopProcessing() {
    if (!this.processing) return;
    
    this.processing = false;
    
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    
    console.log('🎮 Event processing stopped');
  }
  
  /**
   * Get system statistics
   */
  getStats() {
    const uptime = Date.now() - this.metrics.startTime;
    
    return {
      ...this.metrics,
      uptime,
      eventsPerSecond: this.metrics.eventsProcessed / (uptime / 1000),
      dropRate: this.metrics.eventsDropped / Math.max(1, this.metrics.eventsQueued),
      totalQueueSize: this.getTotalQueueSize(),
      processing: this.processing,
      playerLatencies: this.playerLatencies.size,
      rateLimitViolations: this.metrics.eventsDropped
    };
  }
  
  /**
   * Cleanup resources
   */
  shutdown() {
    this.stopProcessing();
    
    // Clear all queues
    for (const queue of Object.values(this.eventQueues)) {
      queue.length = 0;
    }
    
    // Clear tracking data
    this.rateLimitTracking.clear();
    this.playerLatencies.clear();
    this.eventHistory.clear();
    
    console.log('🎮 Game Event System shutdown complete');
  }
}

module.exports = GameEventSystem;