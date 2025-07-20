/**
 * GameRoom Class - Manages a multiplayer game room with two players
 * Handles game state, player management, scoring, and match lifecycle
 */

const { v4: uuidv4 } = require('uuid');
const Player = require('./Player');

class GameRoom {
  /**
   * Creates a new GameRoom instance
   * @param {string} roomId - Unique room identifier (optional)
   * @param {object} options - Room configuration options
   */
  constructor(roomId = null, options = {}) {
    // Basic room identification
    this.id = roomId || uuidv4();           // Unique room ID
    this.createdAt = new Date();            // Room creation timestamp
    this.lastActivity = new Date();         // Last activity in room
    
    // Room configuration
    this.maxPlayers = options.maxPlayers || 2;
    this.gameMode = options.gameMode || 'casual';  // casual, ranked, tournament
    this.timeLimit = options.timeLimit || 300;     // Game duration in seconds (5 min default)
    this.scoreLimit = options.scoreLimit || 5;     // First to X goals wins
    
    // Player management
    this.players = new Map();               // Map of player ID -> Player object
    this.playerPositions = {                // Position assignments
      left: null,                           // Player ID in left position
      right: null                           // Player ID in right position
    };
    
    // Game state management
    this.status = 'WAITING';                // WAITING, READY, PLAYING, PAUSED, FINISHED, ABANDONED
    this.gameStartTime = null;              // When game actually started
    this.gameEndTime = null;                // When game ended
    this.currentGameTime = 0;               // Current game time in seconds
    this.isPaused = false;                  // Pause state
    this.pauseStartTime = null;             // When current pause started
    this.totalPauseTime = 0;                // Total pause duration
    
    // Score management
    this.score = {
      left: 0,                              // Left player score
      right: 0                              // Right player score
    };
    this.goals = [];                        // Array of goal events
    this.winner = null;                     // Winner player ID
    this.winReason = null;                  // How game was won
    
    // Game events and statistics
    this.events = [];                       // Game event log
    this.metadata = {                       // Additional game data
      version: '1.0.0',
      serverRegion: 'default',
      ...options.metadata
    };
  }

  /**
   * Player Management Methods
   */
  
  /**
   * Add a player to the room
   * @param {Player} player - Player instance to add
   * @returns {object} { success: boolean, position: string, reason: string }
   */
  addPlayer(player) {
    try {
      // Validation checks
      if (!(player instanceof Player)) {
        return { success: false, position: null, reason: 'Invalid player object' };
      }
      
      if (this.players.has(player.id)) {
        return { success: false, position: null, reason: 'Player already in room' };
      }
      
      if (this.players.size >= this.maxPlayers) {
        return { success: false, position: null, reason: 'Room is full' };
      }
      
      if (this.status === 'PLAYING' || this.status === 'FINISHED') {
        return { success: false, position: null, reason: 'Game already in progress or finished' };
      }
      
      // Assign position
      let assignedPosition = null;
      if (!this.playerPositions.left) {
        assignedPosition = 'left';
        this.playerPositions.left = player.id;
      } else if (!this.playerPositions.right) {
        assignedPosition = 'right';
        this.playerPositions.right = player.id;
      }
      
      // Add player to room
      this.players.set(player.id, player);
      player.currentRoom = this.id;
      player.status = 'IN_ROOM';
      player.updateRoomPosition(assignedPosition);
      
      // Log event
      this.addEvent('PLAYER_JOINED', {
        playerId: player.id,
        username: player.username,
        position: assignedPosition,
        playerCount: this.players.size
      });
      
      this.updateActivity();
      
      console.log(`Player ${player.username} joined room ${this.id} at position ${assignedPosition}`);
      
      return { 
        success: true, 
        position: assignedPosition, 
        reason: 'Player added successfully' 
      };
      
    } catch (error) {
      console.error(`Failed to add player to room ${this.id}:`, error.message);
      return { success: false, position: null, reason: error.message };
    }
  }
  
  /**
   * Remove a player from the room
   * @param {string} playerId - ID of player to remove
   * @returns {object} { success: boolean, reason: string }
   */
  removePlayer(playerId) {
    try {
      if (!this.players.has(playerId)) {
        return { success: false, reason: 'Player not in room' };
      }
      
      const player = this.players.get(playerId);
      const position = player.position;
      
      // Remove from position assignment
      if (this.playerPositions.left === playerId) {
        this.playerPositions.left = null;
      } else if (this.playerPositions.right === playerId) {
        this.playerPositions.right = null;
      }
      
      // Remove from players map
      this.players.delete(playerId);
      
      // Log event
      this.addEvent('PLAYER_LEFT', {
        playerId: playerId,
        username: player.username,
        position: position,
        playerCount: this.players.size
      });
      
      // Handle game state changes
      if (this.status === 'PLAYING') {
        this.pauseGame();
        this.addEvent('GAME_PAUSED', {
          reason: 'player_left',
          playerId: playerId
        });
      }
      
      // If room becomes empty, mark as abandoned
      if (this.players.size === 0) {
        this.status = 'ABANDONED';
        this.gameEndTime = new Date();
      }
      
      this.updateActivity();
      
      console.log(`Player ${player.username} left room ${this.id}`);
      
      return { success: true, reason: 'Player removed successfully' };
      
    } catch (error) {
      console.error(`Failed to remove player from room ${this.id}:`, error.message);
      return { success: false, reason: error.message };
    }
  }
  
  /**
   * Get player by position
   * @param {string} position - 'left' or 'right'
   * @returns {Player|null} Player object or null
   */
  getPlayerByPosition(position) {
    const playerId = this.playerPositions[position];
    return playerId ? this.players.get(playerId) : null;
  }
  
  /**
   * Get opponent of a player
   * @param {string} playerId - Player ID
   * @returns {Player|null} Opponent player or null
   */
  getOpponent(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;
    
    const opponentPosition = player.position === 'left' ? 'right' : 'left';
    return this.getPlayerByPosition(opponentPosition);
  }

  /**
   * Game State Management Methods
   */
  
  /**
   * Check if room is ready to start game
   * @returns {object} { ready: boolean, reason: string }
   */
  checkReadyToStart() {
    if (this.players.size < this.maxPlayers) {
      return { ready: false, reason: 'Not enough players' };
    }
    
    if (this.status !== 'WAITING' && this.status !== 'READY') {
      return { ready: false, reason: `Invalid room status: ${this.status}` };
    }
    
    // Check if all players are ready
    for (const player of this.players.values()) {
      if (!player.isPlayerReady()) {
        return { ready: false, reason: `Player ${player.username} not ready` };
      }
    }
    
    return { ready: true, reason: 'All players ready' };
  }
  
  /**
   * Start the game
   * @returns {object} { success: boolean, reason: string }
   */
  startGame() {
    try {
      const readyCheck = this.checkReadyToStart();
      if (!readyCheck.ready) {
        return { success: false, reason: readyCheck.reason };
      }
      
      // Initialize game state
      this.status = 'PLAYING';
      this.gameStartTime = new Date();
      this.currentGameTime = 0;
      this.totalPauseTime = 0;
      this.isPaused = false;
      
      // Update player statuses
      for (const player of this.players.values()) {
        player.setStatus('IN_GAME');
        player.resetForNewGame();
      }
      
      // Log game start event
      this.addEvent('GAME_STARTED', {
        playerCount: this.players.size,
        gameMode: this.gameMode,
        timeLimit: this.timeLimit,
        scoreLimit: this.scoreLimit
      });
      
      this.updateActivity();
      
      console.log(`Game started in room ${this.id}`);
      
      return { success: true, reason: 'Game started successfully' };
      
    } catch (error) {
      console.error(`Failed to start game in room ${this.id}:`, error.message);
      return { success: false, reason: error.message };
    }
  }
  
  /**
   * Pause the game
   * @param {string} reason - Reason for pause
   * @returns {boolean} Success status
   */
  pauseGame(reason = 'manual') {
    if (this.status !== 'PLAYING' || this.isPaused) {
      return false;
    }
    
    this.isPaused = true;
    this.pauseStartTime = new Date();
    this.status = 'PAUSED';
    
    this.addEvent('GAME_PAUSED', {
      reason: reason,
      gameTime: this.currentGameTime
    });
    
    console.log(`Game paused in room ${this.id}: ${reason}`);
    return true;
  }
  
  /**
   * Resume the game
   * @returns {boolean} Success status
   */
  resumeGame() {
    if (this.status !== 'PAUSED' || !this.isPaused) {
      return false;
    }
    
    // Calculate pause duration
    if (this.pauseStartTime) {
      const pauseDuration = Date.now() - this.pauseStartTime.getTime();
      this.totalPauseTime += pauseDuration;
      this.pauseStartTime = null;
    }
    
    this.isPaused = false;
    this.status = 'PLAYING';
    
    this.addEvent('GAME_RESUMED', {
      gameTime: this.currentGameTime,
      totalPauseTime: this.totalPauseTime
    });
    
    console.log(`Game resumed in room ${this.id}`);
    return true;
  }
  
  /**
   * Update current game time
   * @param {number} currentTime - Current game time in seconds
   */
  updateGameTime(currentTime) {
    if (this.status === 'PLAYING' && !this.isPaused) {
      this.currentGameTime = currentTime;
      this.updateActivity();
      
      // Check for time limit
      if (this.timeLimit > 0 && this.currentGameTime >= this.timeLimit) {
        this.endGame('time_limit');
      }
    }
  }

  /**
   * Scoring and Goal Management
   */
  
  /**
   * Add a goal to the game
   * @param {string} scoringPlayerId - ID of player who scored
   * @param {object} goalData - Additional goal information
   * @returns {object} { success: boolean, reason: string, gameEnded: boolean }
   */
  addGoal(scoringPlayerId, goalData = {}) {
    try {
      if (this.status !== 'PLAYING') {
        return { success: false, reason: 'Game not in progress', gameEnded: false };
      }
      
      const scoringPlayer = this.players.get(scoringPlayerId);
      if (!scoringPlayer) {
        return { success: false, reason: 'Invalid player', gameEnded: false };
      }
      
      const position = scoringPlayer.position;
      if (!position) {
        return { success: false, reason: 'Player has no position', gameEnded: false };
      }
      
      // Update score
      this.score[position]++;
      
      // Create goal object
      const goal = {
        id: uuidv4(),
        playerId: scoringPlayerId,
        playerName: scoringPlayer.username,
        position: position,
        gameTime: this.currentGameTime,
        timestamp: new Date(),
        ...goalData
      };
      
      this.goals.push(goal);
      
      // Update player stats
      scoringPlayer.updateSessionStats({ goalsScored: 1 });
      
      const opponent = this.getOpponent(scoringPlayerId);
      if (opponent) {
        opponent.updateSessionStats({ goalsConceded: 1 });
      }
      
      // Log goal event
      this.addEvent('GOAL_SCORED', {
        goalId: goal.id,
        playerId: scoringPlayerId,
        playerName: scoringPlayer.username,
        position: position,
        newScore: { ...this.score },
        gameTime: this.currentGameTime
      });
      
      console.log(`GOAL! ${scoringPlayer.username} scored in room ${this.id}. Score: ${this.score.left}-${this.score.right}`);
      
      // Check win condition
      const winCheck = this.checkWinCondition();
      if (winCheck.hasWinner) {
        this.endGame('score_limit', winCheck.winner);
        return { success: true, reason: 'Goal scored, game ended', gameEnded: true };
      }
      
      this.updateActivity();
      
      return { success: true, reason: 'Goal scored successfully', gameEnded: false };
      
    } catch (error) {
      console.error(`Failed to add goal in room ${this.id}:`, error.message);
      return { success: false, reason: error.message, gameEnded: false };
    }
  }
  
  /**
   * Check win condition
   * @returns {object} { hasWinner: boolean, winner: string|null, reason: string }
   */
  checkWinCondition() {
    // Score limit win
    if (this.scoreLimit > 0) {
      if (this.score.left >= this.scoreLimit) {
        return { 
          hasWinner: true, 
          winner: this.playerPositions.left, 
          reason: 'score_limit' 
        };
      }
      if (this.score.right >= this.scoreLimit) {
        return { 
          hasWinner: true, 
          winner: this.playerPositions.right, 
          reason: 'score_limit' 
        };
      }
    }
    
    // Time limit win (higher score wins)
    if (this.timeLimit > 0 && this.currentGameTime >= this.timeLimit) {
      if (this.score.left > this.score.right) {
        return { 
          hasWinner: true, 
          winner: this.playerPositions.left, 
          reason: 'time_limit' 
        };
      } else if (this.score.right > this.score.left) {
        return { 
          hasWinner: true, 
          winner: this.playerPositions.right, 
          reason: 'time_limit' 
        };
      } else {
        return { 
          hasWinner: true, 
          winner: null, 
          reason: 'draw' 
        };
      }
    }
    
    return { hasWinner: false, winner: null, reason: 'ongoing' };
  }
  
  /**
   * End the game
   * @param {string} reason - Reason for game end
   * @param {string} winnerId - Winner player ID (optional)
   */
  endGame(reason = 'manual', winnerId = null) {
    if (this.status === 'FINISHED') {
      return;
    }
    
    this.status = 'FINISHED';
    this.gameEndTime = new Date();
    this.winner = winnerId;
    this.winReason = reason;
    
    // Update player stats
    for (const player of this.players.values()) {
      player.setStatus('IDLE');
      player.updateSessionStats({ gamesPlayed: 1 });
      
      if (winnerId === player.id) {
        player.updateSessionStats({ gamesWon: 1 });
      } else if (winnerId && winnerId !== player.id) {
        player.updateSessionStats({ gamesLost: 1 });
      }
      
      // Calculate play time
      const playTime = this.getGameDuration();
      player.updateSessionStats({ totalPlayTime: Math.floor(playTime / 1000) });
    }
    
    // Log game end event
    this.addEvent('GAME_ENDED', {
      reason: reason,
      winner: winnerId,
      finalScore: { ...this.score },
      gameDuration: this.getGameDuration(),
      totalGoals: this.goals.length
    });
    
    const winnerPlayer = winnerId ? this.players.get(winnerId) : null;
    const winnerName = winnerPlayer ? winnerPlayer.username : 'None';
    
    console.log(`Game ended in room ${this.id}. Winner: ${winnerName}, Reason: ${reason}, Score: ${this.score.left}-${this.score.right}`);
  }

  /**
   * Utility Methods
   */
  
  /**
   * Add an event to the game log
   * @param {string} eventType - Type of event
   * @param {object} eventData - Event data
   */
  addEvent(eventType, eventData = {}) {
    const event = {
      id: uuidv4(),
      type: eventType,
      timestamp: new Date(),
      gameTime: this.currentGameTime,
      data: eventData
    };
    
    this.events.push(event);
  }
  
  /**
   * Update last activity timestamp
   */
  updateActivity() {
    this.lastActivity = new Date();
  }
  
  /**
   * Get game duration in milliseconds
   * @returns {number} Duration in milliseconds
   */
  getGameDuration() {
    if (!this.gameStartTime) return 0;
    
    const endTime = this.gameEndTime || new Date();
    return endTime.getTime() - this.gameStartTime.getTime() - this.totalPauseTime;
  }
  
  /**
   * Check if room is inactive
   * @param {number} timeoutMs - Timeout in milliseconds (default: 10 minutes)
   * @returns {boolean} Inactive status
   */
  isInactive(timeoutMs = 600000) {
    const timeSinceActivity = Date.now() - this.lastActivity.getTime();
    return timeSinceActivity > timeoutMs;
  }
  
  /**
   * Get room summary for external use
   * @returns {object} Room summary
   */
  toJSON() {
    return {
      id: this.id,
      status: this.status,
      gameMode: this.gameMode,
      maxPlayers: this.maxPlayers,
      currentPlayers: this.players.size,
      playerPositions: this.playerPositions,
      score: this.score,
      currentGameTime: this.currentGameTime,
      timeLimit: this.timeLimit,
      scoreLimit: this.scoreLimit,
      winner: this.winner,
      winReason: this.winReason,
      createdAt: this.createdAt,
      gameStartTime: this.gameStartTime,
      gameEndTime: this.gameEndTime,
      totalGoals: this.goals.length,
      isPaused: this.isPaused,
      metadata: this.metadata
    };
  }
  
  /**
   * Get minimal room info for broadcasting
   * @returns {object} Public room info
   */
  getPublicInfo() {
    const players = Array.from(this.players.values()).map(p => p.getPublicInfo());
    
    return {
      id: this.id,
      status: this.status,
      gameMode: this.gameMode,
      players: players,
      score: this.score,
      currentGameTime: this.currentGameTime,
      timeLimit: this.timeLimit,
      scoreLimit: this.scoreLimit,
      isPaused: this.isPaused
    };
  }
}

module.exports = GameRoom;