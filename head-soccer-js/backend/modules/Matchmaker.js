/**
 * Matchmaker Class - Handles player matchmaking, queue management, and room assignment
 * Implements FIFO queue with skill-based considerations and automatic cleanup
 */

const { v4: uuidv4 } = require('uuid');
const GameRoom = require('./GameRoom');
const Player = require('./Player');

class Matchmaker {
  constructor(options = {}) {
    // Matchmaking configuration
    this.maxQueueSize = options.maxQueueSize || 1000;
    this.maxWaitTime = options.maxWaitTime || 120000;        // 2 minutes max wait
    this.skillTolerance = options.skillTolerance || 200;     // ELO tolerance for matching
    this.skillToleranceIncrease = options.skillToleranceIncrease || 50; // ELO tolerance increase per 30s
    this.queueUpdateInterval = options.queueUpdateInterval || 5000;     // 5 seconds
    
    // Game room configuration
    this.maxConcurrentRooms = options.maxConcurrentRooms || 100;
    this.roomIdleTimeout = options.roomIdleTimeout || 600000; // 10 minutes
    this.roomCleanupInterval = options.roomCleanupInterval || 60000; // 1 minute
    
    // Queue management
    this.queue = [];                    // Array of queued players
    this.playerQueues = new Map();      // playerId -> queue entry
    this.activeRooms = new Map();       // roomId -> GameRoom
    this.playerRoomMap = new Map();     // playerId -> roomId
    
    // Statistics
    this.stats = {
      totalMatches: 0,
      averageWaitTime: 0,
      currentQueueSize: 0,
      activeRoomsCount: 0,
      successfulMatches: 0,
      timeoutMatches: 0
    };
    
    // Intervals
    this.queueInterval = null;
    this.cleanupInterval = null;
    
    // Event handlers
    this.eventHandlers = new Map();
  }

  /**
   * Lifecycle Management
   */

  /**
   * Start the matchmaker service
   */
  start() {
    console.log('<� Matchmaker service starting...');
    
    // Start queue processing
    this.queueInterval = setInterval(() => {
      this.processQueue();
    }, this.queueUpdateInterval);
    
    // Start room cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupRooms();
      this.cleanupDisconnectedPlayers();
    }, this.roomCleanupInterval);
    
    console.log(' Matchmaker service started');
    this.emit('service_started', { timestamp: new Date() });
  }

  /**
   * Stop the matchmaker service
   */
  stop() {
    console.log('=� Matchmaker service stopping...');
    
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Clear all queues and rooms
    this.queue = [];
    this.playerQueues.clear();
    this.activeRooms.clear();
    this.playerRoomMap.clear();
    
    console.log(' Matchmaker service stopped');
    this.emit('service_stopped', { timestamp: new Date() });
  }

  /**
   * Queue Management
   */

  /**
   * Add a player to the matchmaking queue
   * @param {Player} player - Player to add to queue
   * @param {object} preferences - Matchmaking preferences
   * @returns {object} { success: boolean, position: number, estimatedWait: number, reason: string }
   */
  addToQueue(player, preferences = {}) {
    try {
      // Validation checks
      if (!(player instanceof Player)) {
        return { success: false, position: -1, estimatedWait: 0, reason: 'Invalid player object' };
      }
      
      if (this.playerQueues.has(player.id)) {
        return { success: false, position: -1, estimatedWait: 0, reason: 'Player already in queue' };
      }
      
      if (this.playerRoomMap.has(player.id)) {
        return { success: false, position: -1, estimatedWait: 0, reason: 'Player already in a room' };
      }
      
      if (this.queue.length >= this.maxQueueSize) {
        return { success: false, position: -1, estimatedWait: 0, reason: 'Queue is full' };
      }
      
      // Create queue entry
      const queueEntry = {
        id: uuidv4(),
        player: player,
        joinedAt: Date.now(),
        eloRating: player.eloRating || 1200,
        gameMode: preferences.gameMode || 'casual',
        region: preferences.region || 'default',
        currentSkillTolerance: this.skillTolerance,
        retryCount: 0
      };
      
      // Add to queue
      this.queue.push(queueEntry);
      this.playerQueues.set(player.id, queueEntry);
      
      // Update player status
      player.setStatus('IN_QUEUE');
      
      // Calculate estimated wait time
      const estimatedWait = this.calculateEstimatedWaitTime(queueEntry);
      
      // Update statistics
      this.stats.currentQueueSize = this.queue.length;
      
      console.log(`Player ${player.username} joined queue (position: ${this.queue.length}, ELO: ${queueEntry.eloRating})`);
      
      this.emit('player_queued', {
        playerId: player.id,
        username: player.username,
        position: this.queue.length,
        estimatedWait: estimatedWait,
        eloRating: queueEntry.eloRating
      });
      
      return {
        success: true,
        position: this.queue.length,
        estimatedWait: estimatedWait,
        reason: 'Added to queue successfully'
      };
      
    } catch (error) {
      console.error('Error adding player to queue:', error);
      return { success: false, position: -1, estimatedWait: 0, reason: error.message };
    }
  }

  /**
   * Remove a player from the queue
   * @param {string} playerId - Player ID to remove
   * @returns {object} { success: boolean, reason: string }
   */
  removeFromQueue(playerId) {
    try {
      const queueEntry = this.playerQueues.get(playerId);
      if (!queueEntry) {
        return { success: false, reason: 'Player not in queue' };
      }
      
      // Remove from queue array
      const queueIndex = this.queue.findIndex(entry => entry.id === queueEntry.id);
      if (queueIndex !== -1) {
        this.queue.splice(queueIndex, 1);
      }
      
      // Remove from player queue map
      this.playerQueues.delete(playerId);
      
      // Update player status
      queueEntry.player.setStatus('IDLE');
      
      // Update statistics
      this.stats.currentQueueSize = this.queue.length;
      
      console.log(`Player ${queueEntry.player.username} removed from queue`);
      
      this.emit('player_dequeued', {
        playerId: playerId,
        username: queueEntry.player.username,
        waitTime: Date.now() - queueEntry.joinedAt
      });
      
      return { success: true, reason: 'Removed from queue successfully' };
      
    } catch (error) {
      console.error('Error removing player from queue:', error);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Get player's queue position
   * @param {string} playerId - Player ID
   * @returns {object} { position: number, estimatedWait: number, inQueue: boolean }
   */
  getQueuePosition(playerId) {
    const queueEntry = this.playerQueues.get(playerId);
    if (!queueEntry) {
      return { position: -1, estimatedWait: 0, inQueue: false };
    }
    
    const position = this.queue.findIndex(entry => entry.id === queueEntry.id) + 1;
    const estimatedWait = this.calculateEstimatedWaitTime(queueEntry);
    
    return { position, estimatedWait, inQueue: true };
  }

  /**
   * Queue Processing
   */

  /**
   * Process the matchmaking queue
   */
  processQueue() {
    if (this.queue.length < 2) {
      return; // Need at least 2 players
    }
    
    console.log(`= Processing queue (${this.queue.length} players)`);
    
    // Update skill tolerances for waiting players
    this.updateSkillTolerances();
    
    // Find matches
    const matches = this.findMatches();
    
    // Create rooms for matches
    matches.forEach(match => {
      this.createMatchRoom(match);
    });
    
    // Clean up expired queue entries
    this.cleanupExpiredQueueEntries();
  }

  /**
   * Update skill tolerances for players who have been waiting
   */
  updateSkillTolerances() {
    const now = Date.now();
    
    this.queue.forEach(entry => {
      const waitTime = now - entry.joinedAt;
      const toleranceIncrements = Math.floor(waitTime / 30000); // Every 30 seconds
      entry.currentSkillTolerance = this.skillTolerance + (toleranceIncrements * this.skillToleranceIncrease);
    });
  }

  /**
   * Find potential matches in the queue
   * @returns {Array} Array of match pairs
   */
  findMatches() {
    const matches = [];
    const used = new Set();
    
    // Sort queue by wait time (oldest first) for fair matching
    const sortedQueue = [...this.queue].sort((a, b) => a.joinedAt - b.joinedAt);
    
    for (let i = 0; i < sortedQueue.length - 1; i++) {
      if (used.has(sortedQueue[i].id)) continue;
      
      const player1 = sortedQueue[i];
      
      for (let j = i + 1; j < sortedQueue.length; j++) {
        if (used.has(sortedQueue[j].id)) continue;
        
        const player2 = sortedQueue[j];
        
        // Check if players can be matched
        if (this.canMatch(player1, player2)) {
          matches.push({ player1, player2 });
          used.add(player1.id);
          used.add(player2.id);
          break;
        }
      }
    }
    
    return matches;
  }

  /**
   * Check if two players can be matched
   * @param {object} entry1 - First player queue entry
   * @param {object} entry2 - Second player queue entry
   * @returns {boolean} Can be matched
   */
  canMatch(entry1, entry2) {
    // Check game mode compatibility
    if (entry1.gameMode !== entry2.gameMode) {
      return false;
    }
    
    // Check region compatibility
    if (entry1.region !== entry2.region) {
      return false;
    }
    
    // Check skill compatibility (both players' tolerances must allow the match)
    const eloDiff = Math.abs(entry1.eloRating - entry2.eloRating);
    const maxTolerance = Math.max(entry1.currentSkillTolerance, entry2.currentSkillTolerance);
    
    if (eloDiff > maxTolerance) {
      return false;
    }
    
    // Check if players are connected
    if (!entry1.player.isConnected || !entry2.player.isConnected) {
      return false;
    }
    
    return true;
  }

  /**
   * Room Management
   */

  /**
   * Create a room for a matched pair of players
   * @param {object} match - Match object with player1 and player2
   * @returns {string} Room ID
   */
  createMatchRoom(match) {
    try {
      const { player1, player2 } = match;
      
      // Create room
      const roomId = `room_${uuidv4()}`;
      const room = new GameRoom(roomId, {
        gameMode: player1.gameMode,
        timeLimit: this.getTimeLimitForMode(player1.gameMode),
        scoreLimit: this.getScoreLimitForMode(player1.gameMode),
        metadata: {
          matchmaker: true,
          averageElo: Math.round((player1.eloRating + player2.eloRating) / 2),
          eloDifference: Math.abs(player1.eloRating - player2.eloRating),
          waitTime1: Date.now() - player1.joinedAt,
          waitTime2: Date.now() - player2.joinedAt
        }
      });
      
      // Add players to room
      const addResult1 = room.addPlayer(player1.player);
      const addResult2 = room.addPlayer(player2.player);
      
      if (!addResult1.success || !addResult2.success) {
        console.error('Failed to add players to room:', addResult1.reason, addResult2.reason);
        return null;
      }
      
      // Remove players from queue
      this.removeFromQueue(player1.player.id);
      this.removeFromQueue(player2.player.id);
      
      // Track room and players
      this.activeRooms.set(roomId, room);
      this.playerRoomMap.set(player1.player.id, roomId);
      this.playerRoomMap.set(player2.player.id, roomId);
      
      // Update statistics
      this.stats.totalMatches++;
      this.stats.successfulMatches++;
      this.stats.activeRoomsCount = this.activeRooms.size;
      
      const avgWaitTime = ((Date.now() - player1.joinedAt) + (Date.now() - player2.joinedAt)) / 2;
      this.updateAverageWaitTime(avgWaitTime);
      
      console.log(`<� Match created: ${player1.player.username} vs ${player2.player.username} (Room: ${roomId})`);
      console.log(`   ELO: ${player1.eloRating} vs ${player2.eloRating} (diff: ${Math.abs(player1.eloRating - player2.eloRating)})`);
      console.log(`   Wait times: ${Math.round((Date.now() - player1.joinedAt)/1000)}s vs ${Math.round((Date.now() - player2.joinedAt)/1000)}s`);
      
      this.emit('match_created', {
        roomId: roomId,
        players: [
          { id: player1.player.id, username: player1.player.username, elo: player1.eloRating },
          { id: player2.player.id, username: player2.player.username, elo: player2.eloRating }
        ],
        gameMode: player1.gameMode,
        averageWaitTime: avgWaitTime
      });
      
      return roomId;
      
    } catch (error) {
      console.error('Error creating match room:', error);
      return null;
    }
  }

  /**
   * Remove a room from active rooms
   * @param {string} roomId - Room ID to remove
   * @returns {boolean} Success status
   */
  removeRoom(roomId) {
    try {
      const room = this.activeRooms.get(roomId);
      if (!room) {
        return false;
      }
      
      // Remove player mappings
      for (const [playerId, mappedRoomId] of this.playerRoomMap.entries()) {
        if (mappedRoomId === roomId) {
          this.playerRoomMap.delete(playerId);
        }
      }
      
      // Remove room
      this.activeRooms.delete(roomId);
      this.stats.activeRoomsCount = this.activeRooms.size;
      
      console.log(`=� Room ${roomId} removed from active rooms`);
      
      this.emit('room_removed', { roomId: roomId, timestamp: new Date() });
      
      return true;
      
    } catch (error) {
      console.error('Error removing room:', error);
      return false;
    }
  }

  /**
   * Get room for a player
   * @param {string} playerId - Player ID
   * @returns {GameRoom|null} Room object or null
   */
  getPlayerRoom(playerId) {
    const roomId = this.playerRoomMap.get(playerId);
    return roomId ? this.activeRooms.get(roomId) : null;
  }

  /**
   * Cleanup and Maintenance
   */

  /**
   * Clean up inactive rooms
   */
  cleanupRooms() {
    const now = Date.now();
    const roomsToRemove = [];
    
    for (const [roomId, room] of this.activeRooms.entries()) {
      // Check if room is inactive
      if (room.isInactive(this.roomIdleTimeout)) {
        roomsToRemove.push(roomId);
        continue;
      }
      
      // Check if room is finished or abandoned
      if (room.status === 'FINISHED' || room.status === 'ABANDONED') {
        roomsToRemove.push(roomId);
        continue;
      }
      
      // Check if room has no players
      if (room.players.size === 0) {
        roomsToRemove.push(roomId);
        continue;
      }
    }
    
    // Remove inactive rooms
    roomsToRemove.forEach(roomId => {
      this.removeRoom(roomId);
    });
    
    if (roomsToRemove.length > 0) {
      console.log(`>� Cleaned up ${roomsToRemove.length} inactive rooms`);
    }
  }

  /**
   * Clean up disconnected players from queue
   */
  cleanupDisconnectedPlayers() {
    const playersToRemove = [];
    
    for (const [playerId, queueEntry] of this.playerQueues.entries()) {
      if (!queueEntry.player.isConnected) {
        playersToRemove.push(playerId);
      }
    }
    
    playersToRemove.forEach(playerId => {
      this.removeFromQueue(playerId);
    });
    
    if (playersToRemove.length > 0) {
      console.log(`>� Removed ${playersToRemove.length} disconnected players from queue`);
    }
  }

  /**
   * Clean up expired queue entries
   */
  cleanupExpiredQueueEntries() {
    const now = Date.now();
    const expiredEntries = [];
    
    this.queue.forEach(entry => {
      if (now - entry.joinedAt > this.maxWaitTime) {
        expiredEntries.push(entry);
      }
    });
    
    expiredEntries.forEach(entry => {
      this.removeFromQueue(entry.player.id);
      this.stats.timeoutMatches++;
      
      this.emit('queue_timeout', {
        playerId: entry.player.id,
        username: entry.player.username,
        waitTime: now - entry.joinedAt
      });
    });
    
    if (expiredEntries.length > 0) {
      console.log(`� Removed ${expiredEntries.length} expired queue entries`);
    }
  }

  /**
   * Utility Methods
   */

  /**
   * Calculate estimated wait time for a queue entry
   * @param {object} queueEntry - Queue entry
   * @returns {number} Estimated wait time in milliseconds
   */
  calculateEstimatedWaitTime(queueEntry) {
    // Base estimate on queue position and average match creation rate
    const position = this.queue.findIndex(entry => entry.id === queueEntry.id) + 1;
    const averageMatchTime = this.stats.averageWaitTime || 30000; // Default 30 seconds
    
    // Account for skill matching difficulty
    const skillFactor = this.calculateSkillFactor(queueEntry.eloRating);
    
    return Math.max(5000, (position / 2) * averageMatchTime * skillFactor);
  }

  /**
   * Calculate skill factor for wait time estimation
   * @param {number} eloRating - Player's ELO rating
   * @returns {number} Skill factor multiplier
   */
  calculateSkillFactor(eloRating) {
    // Players with very high or very low ELO may wait longer
    const avgElo = 1200;
    const eloDiff = Math.abs(eloRating - avgElo);
    
    if (eloDiff > 400) return 1.5;  // Much longer wait
    if (eloDiff > 200) return 1.2;  // Slightly longer wait
    return 1.0;  // Normal wait
  }

  /**
   * Get time limit for game mode
   * @param {string} gameMode - Game mode
   * @returns {number} Time limit in seconds
   */
  getTimeLimitForMode(gameMode) {
    const timeLimits = {
      'casual': 300,      // 5 minutes
      'ranked': 600,      // 10 minutes
      'tournament': 900   // 15 minutes
    };
    return timeLimits[gameMode] || 300;
  }

  /**
   * Get score limit for game mode
   * @param {string} gameMode - Game mode
   * @returns {number} Score limit
   */
  getScoreLimitForMode(gameMode) {
    const scoreLimits = {
      'casual': 3,        // First to 3
      'ranked': 5,        // First to 5
      'tournament': 0     // No score limit, time only
    };
    return scoreLimits.hasOwnProperty(gameMode) ? scoreLimits[gameMode] : 3;
  }

  /**
   * Update average wait time statistic
   * @param {number} waitTime - Wait time to include in average
   */
  updateAverageWaitTime(waitTime) {
    if (this.stats.successfulMatches === 1) {
      this.stats.averageWaitTime = waitTime;
    } else {
      // Running average
      this.stats.averageWaitTime = (
        (this.stats.averageWaitTime * (this.stats.successfulMatches - 1)) + waitTime
      ) / this.stats.successfulMatches;
    }
  }

  /**
   * Event system
   */

  /**
   * Register event handler
   * @param {string} event - Event name
   * @param {function} handler - Event handler
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * Emit event
   * @param {string} event - Event name
   * @param {object} data - Event data
   */
  emit(event, data) {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Statistics and Monitoring
   */

  /**
   * Get current matchmaker statistics
   * @returns {object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      currentQueueSize: this.queue.length,
      activeRoomsCount: this.activeRooms.size,
      queueDetails: this.queue.map(entry => ({
        playerId: entry.player.id,
        username: entry.player.username,
        eloRating: entry.eloRating,
        waitTime: Date.now() - entry.joinedAt,
        gameMode: entry.gameMode
      }))
    };
  }

  /**
   * Get detailed system status
   * @returns {object} Detailed status
   */
  getStatus() {
    return {
      isRunning: this.queueInterval !== null,
      queue: {
        size: this.queue.length,
        maxSize: this.maxQueueSize,
        averageWaitTime: this.stats.averageWaitTime
      },
      rooms: {
        active: this.activeRooms.size,
        maxConcurrent: this.maxConcurrentRooms
      },
      configuration: {
        skillTolerance: this.skillTolerance,
        maxWaitTime: this.maxWaitTime,
        queueUpdateInterval: this.queueUpdateInterval
      },
      uptime: this.queueInterval ? Date.now() - this.stats.startTime : 0
    };
  }

  /**
   * Reset all statistics
   */
  resetStats() {
    this.stats = {
      totalMatches: 0,
      averageWaitTime: 0,
      currentQueueSize: this.queue.length,
      activeRoomsCount: this.activeRooms.size,
      successfulMatches: 0,
      timeoutMatches: 0,
      startTime: Date.now()
    };
  }
}

module.exports = Matchmaker;