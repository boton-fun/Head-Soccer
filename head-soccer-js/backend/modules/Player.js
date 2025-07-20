/**
 * Player Class - Represents a connected player in the multiplayer system
 * Handles player state management, room interactions, and activity tracking
 */

const { v4: uuidv4 } = require('uuid');

class Player {
  /**
   * Creates a new Player instance
   * @param {string} socketId - WebSocket connection ID
   * @param {string} userId - Database user ID (optional for guests)
   * @param {string} username - Display name for the player
   * @param {object} options - Additional player configuration
   */
  constructor(socketId, userId = null, username = 'Guest', options = {}) {
    // Basic identification
    this.id = uuidv4();                    // Unique player session ID
    this.socketId = socketId;              // WebSocket connection ID
    this.userId = userId;                  // Database user ID (null for guests)
    this.username = username;              // Display name
    
    // Player customization
    this.characterId = options.characterId || 'player1';  // Selected character sprite
    this.eloRating = options.eloRating || 1200;          // Skill rating
    
    // Game state
    this.currentRoom = null;               // Current game room ID
    this.position = null;                  // 'left' or 'right' in game
    this.isReady = false;                  // Ready for game start
    this.status = 'IDLE';                  // IDLE, IN_QUEUE, IN_ROOM, IN_GAME, DISCONNECTED
    
    // Connection tracking
    this.isConnected = true;               // Current connection status
    this.connectionQuality = 'good';       // good, moderate, poor
    this.lastPing = Date.now();           // Last ping timestamp
    this.latency = 0;                      // Network latency in ms
    
    // Activity tracking
    this.joinedAt = new Date();            // When player joined server
    this.lastActivity = new Date();        // Last activity timestamp
    this.inactivityWarnings = 0;          // Count of inactivity warnings
    
    // Game statistics (current session)
    this.sessionStats = {
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      goalsScored: 0,
      goalsConceded: 0,
      disconnections: 0,
      totalPlayTime: 0
    };
    
    // Temporary data storage
    this.tempData = {};                    // For storing temporary game data
  }

  /**
   * Room Management Methods
   */
  
  /**
   * Join a game room
   * @param {string} roomId - The room ID to join
   * @returns {boolean} Success status
   */
  async joinRoom(roomId) {
    try {
      if (this.currentRoom) {
        throw new Error(`Player already in room: ${this.currentRoom}`);
      }
      
      if (this.status !== 'IDLE' && this.status !== 'IN_QUEUE') {
        throw new Error(`Cannot join room in status: ${this.status}`);
      }
      
      this.currentRoom = roomId;
      this.status = 'IN_ROOM';
      this.isReady = false;
      this.position = null;
      this.updateActivity();
      
      return true;
    } catch (error) {
      console.error(`Player ${this.id} failed to join room:`, error.message);
      return false;
    }
  }
  
  /**
   * Leave current room
   * @returns {boolean} Success status
   */
  async leaveRoom() {
    try {
      if (!this.currentRoom) {
        return true; // Already not in a room
      }
      
      const previousRoom = this.currentRoom;
      this.currentRoom = null;
      this.position = null;
      this.isReady = false;
      this.status = 'IDLE';
      this.updateActivity();
      
      console.log(`Player ${this.username} left room ${previousRoom}`);
      return true;
    } catch (error) {
      console.error(`Player ${this.id} failed to leave room:`, error.message);
      return false;
    }
  }
  
  /**
   * Check if player can join a specific room
   * @param {object} room - Room object to check
   * @returns {object} { canJoin: boolean, reason: string }
   */
  canJoinRoom(room) {
    if (this.currentRoom) {
      return { canJoin: false, reason: 'Already in a room' };
    }
    
    if (!this.isConnected) {
      return { canJoin: false, reason: 'Player is disconnected' };
    }
    
    if (this.status === 'IN_GAME') {
      return { canJoin: false, reason: 'Currently in a game' };
    }
    
    if (!room) {
      return { canJoin: false, reason: 'Room does not exist' };
    }
    
    // Additional room-specific checks can be added here
    return { canJoin: true, reason: 'OK' };
  }
  
  /**
   * Update player position in room
   * @param {string} position - 'left' or 'right'
   */
  updateRoomPosition(position) {
    if (!['left', 'right'].includes(position)) {
      throw new Error(`Invalid position: ${position}`);
    }
    
    this.position = position;
    this.updateActivity();
  }

  /**
   * Ready State Management
   */
  
  /**
   * Set player ready state
   * @param {boolean} readyState - Ready or not ready
   * @returns {boolean} Success status
   */
  setReady(readyState) {
    if (!this.currentRoom) {
      console.error('Cannot set ready state without being in a room');
      return false;
    }
    
    if (this.status !== 'IN_ROOM') {
      console.error(`Cannot set ready in status: ${this.status}`);
      return false;
    }
    
    this.isReady = Boolean(readyState);
    this.updateActivity();
    
    console.log(`Player ${this.username} ready state: ${this.isReady}`);
    return true;
  }
  
  /**
   * Check if player is ready
   * @returns {boolean} Ready state
   */
  isPlayerReady() {
    return this.isReady && this.currentRoom && this.status === 'IN_ROOM';
  }
  
  /**
   * Validate ready state is appropriate
   * @returns {object} { valid: boolean, reason: string }
   */
  validateReadyState() {
    if (!this.currentRoom) {
      return { valid: false, reason: 'Not in a room' };
    }
    
    if (!this.position) {
      return { valid: false, reason: 'No position assigned' };
    }
    
    if (!this.isConnected) {
      return { valid: false, reason: 'Player disconnected' };
    }
    
    if (this.status !== 'IN_ROOM') {
      return { valid: false, reason: `Invalid status: ${this.status}` };
    }
    
    return { valid: true, reason: 'OK' };
  }
  
  /**
   * Reset player state for new game
   */
  resetForNewGame() {
    this.isReady = false;
    this.tempData = {};
    this.updateActivity();
  }

  /**
   * Activity Tracking and Connection Monitoring
   */
  
  /**
   * Update last activity timestamp
   */
  updateActivity() {
    this.lastActivity = new Date();
    this.inactivityWarnings = 0;
  }
  
  /**
   * Check if player is active (within timeout threshold)
   * @param {number} timeoutMs - Timeout in milliseconds (default: 30 seconds)
   * @returns {boolean} Active status
   */
  isActive(timeoutMs = 30000) {
    const timeSinceActivity = Date.now() - this.lastActivity.getTime();
    return timeSinceActivity < timeoutMs;
  }
  
  /**
   * Get detailed connection status
   * @returns {object} Connection information
   */
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      socketId: this.socketId,
      latency: this.latency,
      quality: this.connectionQuality,
      lastPing: this.lastPing,
      lastActivity: this.lastActivity,
      isActive: this.isActive()
    };
  }
  
  /**
   * Handle player disconnection
   */
  handleDisconnect() {
    this.isConnected = false;
    this.status = 'DISCONNECTED';
    this.sessionStats.disconnections++;
    
    console.log(`Player ${this.username} disconnected`);
  }
  
  /**
   * Handle player reconnection
   * @param {string} newSocketId - New WebSocket connection ID
   * @returns {boolean} Success status
   */
  handleReconnect(newSocketId) {
    if (!newSocketId) {
      return false;
    }
    
    this.socketId = newSocketId;
    this.isConnected = true;
    
    // Restore previous status if was in room/game
    if (this.currentRoom && this.status === 'DISCONNECTED') {
      this.status = 'IN_ROOM';
    }
    
    this.updateActivity();
    console.log(`Player ${this.username} reconnected`);
    
    return true;
  }
  
  /**
   * Update network latency
   * @param {number} latencyMs - Latency in milliseconds
   */
  updateLatency(latencyMs) {
    this.latency = latencyMs;
    this.lastPing = Date.now();
    
    // Update connection quality based on latency
    if (latencyMs < 50) {
      this.connectionQuality = 'good';
    } else if (latencyMs < 150) {
      this.connectionQuality = 'moderate';
    } else {
      this.connectionQuality = 'poor';
    }
  }

  /**
   * Game State Methods
   */
  
  /**
   * Set player status
   * @param {string} status - New status
   */
  setStatus(status) {
    const validStatuses = ['IDLE', 'IN_QUEUE', 'IN_ROOM', 'IN_GAME', 'DISCONNECTED'];
    
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    
    this.status = status;
    this.updateActivity();
  }
  
  /**
   * Update session statistics
   * @param {object} stats - Statistics to update
   */
  updateSessionStats(stats) {
    Object.keys(stats).forEach(key => {
      if (key in this.sessionStats) {
        this.sessionStats[key] += stats[key];
      }
    });
  }
  
  /**
   * Get player summary for external use
   * @returns {object} Player summary
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      username: this.username,
      characterId: this.characterId,
      eloRating: this.eloRating,
      currentRoom: this.currentRoom,
      position: this.position,
      isReady: this.isReady,
      status: this.status,
      isConnected: this.isConnected,
      connectionQuality: this.connectionQuality,
      latency: this.latency,
      sessionStats: this.sessionStats
    };
  }
  
  /**
   * Get minimal player info for broadcasting
   * @returns {object} Public player info
   */
  getPublicInfo() {
    return {
      id: this.id,
      username: this.username,
      characterId: this.characterId,
      position: this.position,
      isReady: this.isReady,
      connectionQuality: this.connectionQuality
    };
  }
}

module.exports = Player;