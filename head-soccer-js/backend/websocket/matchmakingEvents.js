/**
 * Matchmaking Events Handler - Real-time matchmaking event processing
 * Handles join/leave queue, match found notifications, room assignments, and ready-up system
 */

const EventEmitter = require('events');

class MatchmakingEvents extends EventEmitter {
  constructor(connectionManager, matchmaker, gameEventSystem, options = {}) {
    super();
    
    this.connectionManager = connectionManager;
    this.matchmaker = matchmaker;
    this.gameEventSystem = gameEventSystem;
    
    // Configuration
    this.config = {
      maxQueueTime: options.maxQueueTime || 300000, // 5 minutes
      matchFoundTimeout: options.matchFoundTimeout || 30000, // 30 seconds
      readyTimeout: options.readyTimeout || 20000, // 20 seconds
      maxRetries: options.maxRetries || 3,
      ...options
    };
    
    // Active matchmaking sessions
    this.queuedPlayers = new Map(); // playerId -> { queueTime, preferences, retries }
    this.pendingMatches = new Map(); // matchId -> { players, createdAt, readyStates }
    this.roomAssignments = new Map(); // roomId -> { players, assignedAt, confirmed }
    
    // Ready-up system
    this.readyTimers = new Map(); // matchId -> timer
    this.playerReadyStates = new Map(); // playerId -> { ready, timestamp, matchId }
    
    // Performance metrics
    this.metrics = {
      totalMatches: 0,
      successfulMatches: 0,
      timeoutMatches: 0,
      averageQueueTime: 0,
      averageMatchTime: 0,
      readySuccessRate: 0,
      startTime: Date.now()
    };
    
    // Setup event handlers
    this.setupEventHandlers();
    
    console.log('🎯 Matchmaking Events system initialized');
  }
  
  /**
   * Setup event handlers for matchmaking
   */
  setupEventHandlers() {
    // Listen to matchmaker events
    this.matchmaker.on('match_created', (matchData) => {
      this.handleMatchFound(matchData);
    });
    
    this.matchmaker.on('player_added_to_queue', (playerData) => {
      this.handlePlayerQueueJoin(playerData);
    });
    
    this.matchmaker.on('player_removed_from_queue', (playerData) => {
      this.handlePlayerQueueLeave(playerData);
    });
    
    // Listen to game event system for matchmaking events
    this.gameEventSystem.on('eventProcessed', (event) => {
      if (this.isMatchmakingEvent(event.type)) {
        this.handleProcessedMatchmakingEvent(event);
      }
    });
    
    // Setup periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 30000); // Every 30 seconds
    
    console.log('🎯 Matchmaking event handlers setup complete');
  }
  
  /**
   * Handle join matchmaking queue event
   */
  async handleJoinQueue(playerId, gameMode, preferences = {}) {
    try {
      console.log(`🎯 Player ${playerId} joining ${gameMode} queue`);
      
      // Validate player can join queue
      const validation = await this.validateQueueJoin(playerId, gameMode, preferences);
      if (!validation.valid) {
        return {
          success: false,
          reason: validation.reason,
          code: 'VALIDATION_FAILED'
        };
      }
      
      // Check if player is already in queue
      if (this.queuedPlayers.has(playerId)) {
        return {
          success: false,
          reason: 'Already in matchmaking queue',
          code: 'ALREADY_QUEUED'
        };
      }
      
      // Add to internal tracking
      this.queuedPlayers.set(playerId, {
        queueTime: Date.now(),
        gameMode: gameMode,
        preferences: preferences,
        retries: 0
      });
      
      // Add to matchmaker
      const connection = this.connectionManager.getConnectionByPlayerId(playerId);
      if (!connection) {
        this.queuedPlayers.delete(playerId);
        return {
          success: false,
          reason: 'Player connection not found',
          code: 'CONNECTION_ERROR'
        };
      }
      
      if (!connection.player) {
        this.queuedPlayers.delete(playerId);
        return {
          success: false,
          reason: 'Player object not found',
          code: 'PLAYER_ERROR'
        };
      }
      
      console.log('🔍 Debug - Adding player to queue:', {
        playerId: playerId,
        hasConnection: !!connection,
        hasPlayer: !!connection.player,
        playerType: typeof connection.player,
        playerKeys: connection.player ? Object.keys(connection.player) : null
      });
      
      const result = this.matchmaker.addToQueue(connection.player, { gameMode, ...preferences });
      
      if (result.success) {
        // Skip game event for queue join (not supported by GameEventSystem)
        
        // Notify player
        this.notifyPlayer(playerId, 'queue_joined', {
          position: result.position,
          estimatedWait: result.estimatedWait,
          gameMode: gameMode,
          queueId: this.generateQueueId(playerId)
        });
        
        console.log(`✅ Player ${playerId} joined queue at position ${result.position}`);
        
        return {
          success: true,
          position: result.position,
          estimatedWait: result.estimatedWait,
          queueId: this.generateQueueId(playerId)
        };
      } else {
        this.queuedPlayers.delete(playerId);
        return {
          success: false,
          reason: result.reason,
          code: 'MATCHMAKER_ERROR'
        };
      }
      
    } catch (error) {
      console.error(`❌ Error handling queue join for ${playerId}:`, error);
      this.queuedPlayers.delete(playerId);
      
      return {
        success: false,
        reason: 'Internal server error',
        code: 'SERVER_ERROR'
      };
    }
  }
  
  /**
   * Handle leave matchmaking queue event
   */
  async handleLeaveQueue(playerId, reason = 'player_request') {
    try {
      console.log(`🎯 Player ${playerId} leaving queue: ${reason}`);
      
      // Check if player is in queue
      const queueData = this.queuedPlayers.get(playerId);
      if (!queueData) {
        return {
          success: false,
          reason: 'Player not in queue',
          code: 'NOT_QUEUED'
        };
      }
      
      // Remove from matchmaker
      const result = this.matchmaker.removeFromQueue(playerId);
      
      // Remove from tracking
      this.queuedPlayers.delete(playerId);
      
      // Skip game event for queue leave (not supported by GameEventSystem)
      
      // Notify player
      this.notifyPlayer(playerId, 'queue_left', {
        reason: reason,
        queueTime: Date.now() - queueData.queueTime
      });
      
      console.log(`✅ Player ${playerId} left queue after ${Date.now() - queueData.queueTime}ms`);
      
      return {
        success: true,
        queueTime: Date.now() - queueData.queueTime
      };
      
    } catch (error) {
      console.error(`❌ Error handling queue leave for ${playerId}:`, error);
      
      return {
        success: false,
        reason: 'Internal server error',
        code: 'SERVER_ERROR'
      };
    }
  }
  
  /**
   * Handle match found event from matchmaker
   */
  async handleMatchFound(matchData) {
    try {
      const { players, gameMode, roomId } = matchData;
      const matchId = this.generateMatchId();
      
      console.log(`🎯 Match found: ${matchId} for players:`, players.map(p => p.id));
      
      // Create pending match
      const pendingMatch = {
        id: matchId,
        players: players,
        gameMode: gameMode,
        roomId: roomId,
        createdAt: Date.now(),
        readyStates: new Map(),
        status: 'pending'
      };
      
      this.pendingMatches.set(matchId, pendingMatch);
      
      // Remove players from queue tracking
      for (const player of players) {
        const queueData = this.queuedPlayers.get(player.id);
        if (queueData) {
          // Update metrics
          const queueTime = Date.now() - queueData.queueTime;
          this.updateAverageQueueTime(queueTime);
          
          this.queuedPlayers.delete(player.id);
        }
        
        // Initialize ready state
        pendingMatch.readyStates.set(player.id, {
          ready: false,
          timestamp: null
        });
      }
      
      // Use the correct event type for match found
      this.gameEventSystem.queueEvent('match_found', {
        roomId: roomId,
        players: players.map(p => ({ id: p.id, username: p.username })),
        gameMode: gameMode,
        timestamp: Date.now()
      }, {
        playerId: players[0].id, // Use first player's ID for metadata
        priority: 2
      });
      
      // Notify all players
      for (const player of players) {
        this.notifyPlayer(player.id, 'match_found', {
          matchId: matchId,
          opponent: players.find(p => p.id !== player.id),
          gameMode: gameMode,
          roomId: roomId,
          readyTimeout: this.config.readyTimeout
        });
      }
      
      // Start ready timeout
      this.startReadyTimeout(matchId);
      
      this.metrics.totalMatches++;
      
      console.log(`✅ Match ${matchId} created, waiting for ready-up`);
      
      return {
        success: true,
        matchId: matchId,
        players: players.length
      };
      
    } catch (error) {
      console.error(`❌ Error handling match found:`, error);
      
      return {
        success: false,
        reason: 'Failed to create match',
        code: 'MATCH_CREATION_ERROR'
      };
    }
  }
  
  /**
   * Handle player ready-up
   */
  async handlePlayerReady(playerId, ready = true, matchId = null) {
    try {
      console.log(`🎯 Player ${playerId} ready state: ${ready}`);
      
      // Find match if not provided
      if (!matchId) {
        matchId = this.findPlayerMatch(playerId);
      }
      
      if (!matchId) {
        return {
          success: false,
          reason: 'No active match found for player',
          code: 'NO_MATCH'
        };
      }
      
      const match = this.pendingMatches.get(matchId);
      if (!match) {
        return {
          success: false,
          reason: 'Match not found',
          code: 'MATCH_NOT_FOUND'
        };
      }
      
      // Update ready state
      match.readyStates.set(playerId, {
        ready: ready,
        timestamp: Date.now()
      });
      
      // Update player ready state tracking
      this.playerReadyStates.set(playerId, {
        ready: ready,
        timestamp: Date.now(),
        matchId: matchId
      });
      
      // Use the correct event type for ready state
      this.gameEventSystem.queueEvent('ready_state', {
        playerId: playerId,
        ready: ready,
        timestamp: Date.now()
      }, {
        playerId: playerId,
        priority: 2
      });
      
      // Notify all players in match
      const readyStates = this.getMatchReadyStates(matchId);
      for (const player of match.players) {
        this.notifyPlayer(player.id, 'player_ready_update', {
          playerId: playerId,
          ready: ready,
          readyStates: readyStates,
          allReady: this.areAllPlayersReady(matchId)
        });
      }
      
      // Check if all players are ready
      if (this.areAllPlayersReady(matchId)) {
        await this.startMatch(matchId);
      }
      
      console.log(`✅ Player ${playerId} ready state updated: ${ready}`);
      
      return {
        success: true,
        ready: ready,
        allReady: this.areAllPlayersReady(matchId),
        readyStates: readyStates
      };
      
    } catch (error) {
      console.error(`❌ Error handling player ready for ${playerId}:`, error);
      
      return {
        success: false,
        reason: 'Internal server error',
        code: 'SERVER_ERROR'
      };
    }
  }
  
  /**
   * Start match when all players are ready
   */
  async startMatch(matchId) {
    try {
      const match = this.pendingMatches.get(matchId);
      if (!match) {
        throw new Error('Match not found');
      }
      
      console.log(`🎯 Starting match ${matchId}`);
      
      // Clear ready timeout
      this.clearReadyTimeout(matchId);
      
      // Create room assignment
      const roomAssignment = {
        matchId: matchId,
        roomId: match.roomId,
        players: match.players,
        assignedAt: Date.now(),
        confirmed: new Map()
      };
      
      this.roomAssignments.set(match.roomId, roomAssignment);
      
      // Skip game event for match starting (not supported by GameEventSystem)
      
      // Assign players to room
      for (const player of match.players) {
        await this.assignPlayerToRoom(player.id, match.roomId, matchId);
      }
      
      // Update match status
      match.status = 'started';
      
      // Update metrics
      const matchTime = Date.now() - match.createdAt;
      this.updateAverageMatchTime(matchTime);
      this.metrics.successfulMatches++;
      
      // Clean up ready states
      for (const player of match.players) {
        this.playerReadyStates.delete(player.id);
      }
      
      // Move to completed matches (keep for a while for debugging)
      setTimeout(() => {
        this.pendingMatches.delete(matchId);
      }, 60000); // Clean up after 1 minute
      
      console.log(`✅ Match ${matchId} started successfully`);
      
      return {
        success: true,
        matchId: matchId,
        roomId: match.roomId,
        players: match.players.length
      };
      
    } catch (error) {
      console.error(`❌ Error starting match ${matchId}:`, error);
      
      return {
        success: false,
        reason: 'Failed to start match',
        code: 'MATCH_START_ERROR'
      };
    }
  }
  
  /**
   * Assign player to room
   */
  async assignPlayerToRoom(playerId, roomId, matchId) {
    try {
      console.log(`🎯 Assigning player ${playerId} to room ${roomId}`);
      
      const connection = this.connectionManager.getConnectionByPlayerId(playerId);
      if (!connection) {
        throw new Error('Player connection not found');
      }
      
      // Add to room in connection manager
      this.connectionManager.addToRoom(connection.socketId, roomId);
      
      // Update player state
      if (connection.player) {
        connection.player.setStatus('IN_ROOM');
        connection.player.currentRoom = roomId;
      }
      
      // Skip game event for room joined (not supported by GameEventSystem)
      
      // Notify player
      this.notifyPlayer(playerId, 'room_assigned', {
        roomId: roomId,
        matchId: matchId,
        status: 'assigned'
      });
      
      // Mark as confirmed in room assignment
      const assignment = this.roomAssignments.get(roomId);
      if (assignment) {
        assignment.confirmed.set(playerId, Date.now());
      }
      
      console.log(`✅ Player ${playerId} assigned to room ${roomId}`);
      
      return {
        success: true,
        roomId: roomId,
        playerId: playerId
      };
      
    } catch (error) {
      console.error(`❌ Error assigning player ${playerId} to room ${roomId}:`, error);
      
      return {
        success: false,
        reason: 'Failed to assign to room',
        code: 'ROOM_ASSIGNMENT_ERROR'
      };
    }
  }
  
  /**
   * Handle player leaving room
   */
  async handleLeaveRoom(playerId, roomId, reason = 'player_request') {
    try {
      console.log(`🎯 Player ${playerId} leaving room ${roomId}: ${reason}`);
      
      const connection = this.connectionManager.getConnectionByPlayerId(playerId);
      if (connection) {
        // Remove from room
        this.connectionManager.removeFromRoom(connection.socketId, roomId);
        
        // Update player state
        if (connection.player) {
          connection.player.setStatus('IDLE');
          connection.player.currentRoom = null;
        }
      }
      
      // Skip game event for room left (not supported by GameEventSystem)
      
      // Notify remaining players in room
      this.connectionManager.broadcastToRoom(roomId, 'player_left_room', {
        playerId: playerId,
        reason: reason,
        timestamp: Date.now()
      });
      
      // Update room assignment
      const assignment = this.roomAssignments.get(roomId);
      if (assignment) {
        assignment.confirmed.delete(playerId);
        
        // If room is now empty, clean it up
        if (assignment.confirmed.size === 0) {
          this.roomAssignments.delete(roomId);
        }
      }
      
      console.log(`✅ Player ${playerId} left room ${roomId}`);
      
      return {
        success: true,
        roomId: roomId,
        playerId: playerId
      };
      
    } catch (error) {
      console.error(`❌ Error handling room leave for ${playerId}:`, error);
      
      return {
        success: false,
        reason: 'Internal server error',
        code: 'SERVER_ERROR'
      };
    }
  }
  
  /**
   * Utility Methods
   */
  
  validateQueueJoin(playerId, gameMode, preferences) {
    const validGameModes = ['casual', 'ranked', 'tournament'];
    
    if (!validGameModes.includes(gameMode)) {
      return { valid: false, reason: 'Invalid game mode' };
    }
    
    const connection = this.connectionManager.getConnectionByPlayerId(playerId);
    if (!connection) {
      return { valid: false, reason: 'Player connection not found' };
    }
    
    if (!connection.isAuthenticated) {
      return { valid: false, reason: 'Player not authenticated' };
    }
    
    if (connection.player && connection.player.status === 'IN_GAME') {
      return { valid: false, reason: 'Player already in game' };
    }
    
    return { valid: true };
  }
  
  generateQueueId(playerId) {
    return `queue_${playerId}_${Date.now()}`;
  }
  
  generateMatchId() {
    return `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  findPlayerMatch(playerId) {
    for (const [matchId, match] of this.pendingMatches.entries()) {
      if (match.players.some(p => p.id === playerId)) {
        return matchId;
      }
    }
    return null;
  }
  
  areAllPlayersReady(matchId) {
    const match = this.pendingMatches.get(matchId);
    if (!match) return false;
    
    for (const [playerId, readyState] of match.readyStates.entries()) {
      if (!readyState.ready) {
        return false;
      }
    }
    return true;
  }
  
  getMatchReadyStates(matchId) {
    const match = this.pendingMatches.get(matchId);
    if (!match) return {};
    
    const states = {};
    for (const [playerId, readyState] of match.readyStates.entries()) {
      states[playerId] = {
        ready: readyState.ready,
        timestamp: readyState.timestamp
      };
    }
    return states;
  }
  
  startReadyTimeout(matchId) {
    const timer = setTimeout(() => {
      this.handleReadyTimeout(matchId);
    }, this.config.readyTimeout);
    
    this.readyTimers.set(matchId, timer);
  }
  
  clearReadyTimeout(matchId) {
    const timer = this.readyTimers.get(matchId);
    if (timer) {
      clearTimeout(timer);
      this.readyTimers.delete(matchId);
    }
  }
  
  async handleReadyTimeout(matchId) {
    console.log(`⏰ Ready timeout for match ${matchId}`);
    
    const match = this.pendingMatches.get(matchId);
    if (!match) return;
    
    // Find players who are not ready
    const notReadyPlayers = [];
    for (const [playerId, readyState] of match.readyStates.entries()) {
      if (!readyState.ready) {
        notReadyPlayers.push(playerId);
      }
    }
    
    // Cancel match
    await this.cancelMatch(matchId, 'ready_timeout', notReadyPlayers);
    
    this.metrics.timeoutMatches++;
  }
  
  async cancelMatch(matchId, reason, affectedPlayers = []) {
    console.log(`❌ Cancelling match ${matchId}: ${reason}`);
    
    const match = this.pendingMatches.get(matchId);
    if (!match) return;
    
    // Clear timeout
    this.clearReadyTimeout(matchId);
    
    // Notify all players
    for (const player of match.players) {
      this.notifyPlayer(player.id, 'match_cancelled', {
        matchId: matchId,
        reason: reason,
        affectedPlayers: affectedPlayers
      });
      
      // Re-queue players who were ready (optional)
      const readyState = match.readyStates.get(player.id);
      if (readyState && readyState.ready && !affectedPlayers.includes(player.id)) {
        // Could auto re-queue ready players here
        console.log(`🔄 Player ${player.id} could be re-queued automatically`);
      }
      
      // Clean up ready state
      this.playerReadyStates.delete(player.id);
    }
    
    // Skip game event for match cancelled (not supported by GameEventSystem)
    
    // Clean up
    this.pendingMatches.delete(matchId);
  }
  
  notifyPlayer(playerId, eventType, data) {
    const connection = this.connectionManager.getConnectionByPlayerId(playerId);
    if (connection && connection.socket) {
      connection.socket.emit(eventType, {
        ...data,
        timestamp: Date.now()
      });
    }
  }
  
  isMatchmakingEvent(eventType) {
    const matchmakingEvents = [
      'match_found', 'ready_state'
    ];
    return matchmakingEvents.includes(eventType);
  }
  
  handleProcessedMatchmakingEvent(event) {
    // Handle any post-processing for matchmaking events
    console.log(`📊 Processed matchmaking event: ${event.type}`);
  }
  
  handlePlayerQueueJoin(playerData) {
    console.log(`📊 Player joined queue tracking: ${playerData.playerId}`);
  }
  
  handlePlayerQueueLeave(playerData) {
    console.log(`📊 Player left queue tracking: ${playerData.playerId}`);
  }
  
  cleanupExpiredSessions() {
    const now = Date.now();
    
    // Clean up old queue sessions
    for (const [playerId, queueData] of this.queuedPlayers.entries()) {
      if (now - queueData.queueTime > this.config.maxQueueTime) {
        console.log(`🧹 Cleaning up expired queue session for ${playerId}`);
        this.handleLeaveQueue(playerId, 'timeout');
      }
    }
    
    // Clean up old pending matches
    for (const [matchId, match] of this.pendingMatches.entries()) {
      if (now - match.createdAt > this.config.matchFoundTimeout * 2) {
        console.log(`🧹 Cleaning up expired match ${matchId}`);
        this.cancelMatch(matchId, 'expired');
      }
    }
    
    // Clean up old room assignments
    for (const [roomId, assignment] of this.roomAssignments.entries()) {
      if (now - assignment.assignedAt > 300000) { // 5 minutes
        console.log(`🧹 Cleaning up expired room assignment ${roomId}`);
        this.roomAssignments.delete(roomId);
      }
    }
  }
  
  updateAverageQueueTime(queueTime) {
    if (this.metrics.totalMatches === 0) {
      this.metrics.averageQueueTime = queueTime;
    } else {
      this.metrics.averageQueueTime = 
        (this.metrics.averageQueueTime + queueTime) / 2;
    }
  }
  
  updateAverageMatchTime(matchTime) {
    if (this.metrics.successfulMatches === 0) {
      this.metrics.averageMatchTime = matchTime;
    } else {
      this.metrics.averageMatchTime = 
        (this.metrics.averageMatchTime + matchTime) / 2;
    }
  }
  
  /**
   * Get system statistics
   */
  getStats() {
    const uptime = Date.now() - this.metrics.startTime;
    
    return {
      ...this.metrics,
      uptime,
      queuedPlayers: this.queuedPlayers.size,
      pendingMatches: this.pendingMatches.size,
      activeRooms: this.roomAssignments.size,
      successRate: this.metrics.totalMatches > 0 ? 
        (this.metrics.successfulMatches / this.metrics.totalMatches) * 100 : 0,
      timeoutRate: this.metrics.totalMatches > 0 ? 
        (this.metrics.timeoutMatches / this.metrics.totalMatches) * 100 : 0
    };
  }
  
  /**
   * Shutdown and cleanup
   */
  shutdown() {
    console.log('🎯 Matchmaking Events shutting down...');
    
    // Clear all timers
    for (const timer of this.readyTimers.values()) {
      clearTimeout(timer);
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Clear all data
    this.queuedPlayers.clear();
    this.pendingMatches.clear();
    this.roomAssignments.clear();
    this.readyTimers.clear();
    this.playerReadyStates.clear();
    
    console.log('✅ Matchmaking Events shutdown complete');
  }
}

module.exports = MatchmakingEvents;