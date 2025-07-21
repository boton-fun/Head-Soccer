/**
 * Gameplay Events Handler - Manages all real-time gameplay events
 * Includes player movement, ball physics, goal scoring, and game control
 */

const EventEmitter = require('events');
const GameEndEvents = require('./gameEndEvents');

class GameplayEvents extends EventEmitter {
  constructor(connectionManager, gameEventSystem, gameStateValidator, options = {}) {
    super();
    
    this.connectionManager = connectionManager;
    this.gameEventSystem = gameEventSystem;
    this.gameStateValidator = gameStateValidator;
    
    // Initialize Game End Events system
    this.gameEndEvents = new GameEndEvents(
      connectionManager, 
      gameEventSystem, 
      options.databaseClient, 
      options.gameEnd
    );
    
    // Configuration
    this.config = {
      maxLatency: options.maxLatency || 150, // Max acceptable latency in ms
      interpolationDelay: options.interpolationDelay || 100, // Interpolation buffer
      physicsTickRate: options.physicsTickRate || 60, // Physics updates per second
      goalCooldown: options.goalCooldown || 3000, // Time after goal before play resumes
      pauseTimeout: options.pauseTimeout || 30000, // Max pause duration
      disconnectGracePeriod: options.disconnectGracePeriod || 10000, // Time to reconnect
      ...options
    };
    
    // Game state tracking
    this.activeGames = new Map(); // roomId -> gameState
    this.playerStates = new Map(); // playerId -> playerState
    this.ballStates = new Map(); // roomId -> ballState
    
    // Lag compensation data
    this.playerLatencies = new Map(); // playerId -> latency
    this.stateHistory = new Map(); // roomId -> array of historical states
    this.inputBuffer = new Map(); // playerId -> array of pending inputs
    
    // Game control
    this.pausedGames = new Map(); // roomId -> { reason, timestamp, requestedBy }
    this.goalCooldowns = new Map(); // roomId -> cooldown end timestamp
    
    // Performance metrics
    this.metrics = {
      totalMovements: 0,
      totalBallUpdates: 0,
      totalGoals: 0,
      totalPauses: 0,
      averageLatency: 0,
      peakLatency: 0,
      rollbackCount: 0,
      predictionErrors: 0,
      startTime: Date.now()
    };
    
    // Initialize physics tick
    this.startPhysicsTick();
    
    console.log('🎮 Gameplay Events system initialized');
  }
  
  /**
   * Start physics tick for server-authoritative updates
   */
  startPhysicsTick() {
    this.physicsInterval = setInterval(() => {
      this.processPhysicsTick();
    }, 1000 / this.config.physicsTickRate);
  }
  
  /**
   * Process a physics tick for all active games
   */
  processPhysicsTick() {
    const now = Date.now();
    
    for (const [roomId, gameState] of this.activeGames) {
      if (this.pausedGames.has(roomId)) continue;
      if (this.goalCooldowns.has(roomId) && now < this.goalCooldowns.get(roomId)) continue;
      
      // Update game physics
      this.updateGamePhysics(roomId, gameState);
      
      // Check for goals
      this.checkGoalConditions(roomId, gameState);
      
      // Broadcast authoritative state
      this.broadcastGameState(roomId, gameState);
    }
  }
  
  /**
   * Handle player movement with lag compensation
   */
  async handlePlayerMovement(playerId, movementData) {
    try {
      const connection = this.connectionManager.getConnectionByPlayerId(playerId);
      if (!connection || !connection.roomId) {
        return { success: false, reason: 'Player not in room' };
      }
      
      const roomId = connection.roomId;
      const gameState = this.activeGames.get(roomId);
      
      if (!gameState) {
        return { success: false, reason: 'Game not active' };
      }
      
      // Check if game is paused
      if (this.pausedGames.has(roomId)) {
        return { success: false, reason: 'Game is paused' };
      }
      
      // Validate movement
      const validationResult = this.gameStateValidator.validatePlayerMovement({
        playerId,
        ...movementData
      });
      
      if (!validationResult.valid) {
        this.metrics.predictionErrors++;
        return {
          success: false,
          reason: validationResult.reason,
          correctedState: validationResult.correctedData
        };
      }
      
      // Apply lag compensation
      const compensatedData = this.applyLagCompensation(playerId, movementData);
      
      // Update player state
      const playerState = this.playerStates.get(playerId) || {};
      Object.assign(playerState, {
        position: compensatedData.position,
        velocity: compensatedData.velocity,
        direction: compensatedData.direction,
        lastUpdate: Date.now(),
        sequenceId: movementData.sequenceId
      });
      this.playerStates.set(playerId, playerState);
      
      // Add to state history for rollback
      this.addToStateHistory(roomId, {
        type: 'player_movement',
        playerId,
        data: compensatedData,
        timestamp: Date.now()
      });
      
      // Queue event for processing
      this.gameEventSystem.queueEvent('player_movement', {
        playerId,
        ...compensatedData
      }, {
        playerId,
        priority: 2
      });
      
      // Broadcast to other players in room (excluding sender)
      this.connectionManager.broadcastToRoom(roomId, 'player_moved', {
        playerId,
        position: compensatedData.position,
        velocity: compensatedData.velocity,
        direction: compensatedData.direction,
        timestamp: Date.now()
      }, connection.socketId);
      
      this.metrics.totalMovements++;
      
      return {
        success: true,
        sequenceId: movementData.sequenceId,
        serverPosition: compensatedData.position
      };
      
    } catch (error) {
      console.error(`❌ Error handling player movement for ${playerId}:`, error);
      return {
        success: false,
        reason: 'Internal server error'
      };
    }
  }
  
  /**
   * Handle ball update with physics validation
   */
  async handleBallUpdate(playerId, ballData) {
    try {
      const connection = this.connectionManager.getConnectionByPlayerId(playerId);
      if (!connection || !connection.roomId) {
        return { success: false, reason: 'Player not in room' };
      }
      
      const roomId = connection.roomId;
      const gameState = this.activeGames.get(roomId);
      
      if (!gameState) {
        return { success: false, reason: 'Game not active' };
      }
      
      // Only the authoritative player can update ball
      if (!this.isAuthoritativeForBall(playerId, roomId)) {
        return { success: false, reason: 'Not authoritative for ball' };
      }
      
      // Validate ball physics
      const validationResult = this.gameStateValidator.validateBallPhysics(ballData);
      
      if (!validationResult.valid) {
        return {
          success: false,
          reason: validationResult.reason,
          correctedState: validationResult.correctedData
        };
      }
      
      // Update ball state
      const ballState = {
        position: ballData.position,
        velocity: ballData.velocity,
        spin: ballData.spin || 0,
        lastUpdate: Date.now(),
        lastTouchedBy: ballData.lastTouchedBy || playerId
      };
      this.ballStates.set(roomId, ballState);
      
      // Add to state history
      this.addToStateHistory(roomId, {
        type: 'ball_update',
        data: ballState,
        timestamp: Date.now()
      });
      
      // Queue event
      this.gameEventSystem.queueEvent('ball_update', {
        ...ballState,
        authoritative: true
      }, {
        playerId,
        priority: 2
      });
      
      // Broadcast to all players in room
      this.connectionManager.broadcastToRoom(roomId, 'ball_updated', {
        position: ballState.position,
        velocity: ballState.velocity,
        spin: ballState.spin,
        lastTouchedBy: ballState.lastTouchedBy,
        timestamp: Date.now(),
        authoritative: true
      });
      
      this.metrics.totalBallUpdates++;
      
      return {
        success: true,
        serverState: ballState
      };
      
    } catch (error) {
      console.error(`❌ Error handling ball update from ${playerId}:`, error);
      return {
        success: false,
        reason: 'Internal server error'
      };
    }
  }
  
  /**
   * Handle goal attempt with server validation
   */
  async handleGoalAttempt(playerId, goalData) {
    try {
      const connection = this.connectionManager.getConnectionByPlayerId(playerId);
      if (!connection || !connection.roomId) {
        return { success: false, reason: 'Player not in room' };
      }
      
      const roomId = connection.roomId;
      const gameState = this.activeGames.get(roomId);
      
      if (!gameState) {
        return { success: false, reason: 'Game not active' };
      }
      
      // Check if in goal cooldown
      if (this.goalCooldowns.has(roomId)) {
        return { success: false, reason: 'Goal cooldown active' };
      }
      
      // Validate goal attempt
      const validationResult = this.gameStateValidator.validateGoal({
        playerId,
        ...goalData,
        gameState
      });
      
      if (!validationResult.valid) {
        return {
          success: false,
          reason: validationResult.reason
        };
      }
      
      // Goal is valid! Update score
      const scoringPlayer = gameState.players.find(p => p.id === playerId);
      const scoringSide = scoringPlayer?.position || 'left';
      
      if (scoringSide === 'left') {
        gameState.score.player1++;
      } else {
        gameState.score.player2++;
      }
      
      // Set goal cooldown
      this.goalCooldowns.set(roomId, Date.now() + this.config.goalCooldown);
      
      // Queue goal event
      this.gameEventSystem.queueEvent('goal_scored', {
        playerId,
        goalType: goalData.goalType || 'normal',
        score: gameState.score,
        timestamp: Date.now()
      }, {
        playerId,
        priority: 1 // High priority
      });
      
      // Broadcast goal to all players
      this.connectionManager.broadcastToRoom(roomId, 'goal_scored', {
        playerId,
        scorerName: scoringPlayer?.username || 'Unknown',
        goalType: goalData.goalType || 'normal',
        score: gameState.score,
        position: goalData.position,
        velocity: goalData.velocity,
        timestamp: Date.now()
      });
      
      // Reset ball position after cooldown
      setTimeout(() => {
        this.resetBallPosition(roomId);
        this.goalCooldowns.delete(roomId);
        
        // Notify players game is resuming
        this.connectionManager.broadcastToRoom(roomId, 'game_resuming', {
          score: gameState.score,
          timestamp: Date.now()
        });
      }, this.config.goalCooldown);
      
      this.metrics.totalGoals++;
      
      // Check for game end
      if (this.checkGameEnd(gameState)) {
        await this.endGame(roomId, gameState);
      }
      
      return {
        success: true,
        score: gameState.score,
        gameEnded: gameState.status === 'finished'
      };
      
    } catch (error) {
      console.error(`❌ Error handling goal attempt from ${playerId}:`, error);
      return {
        success: false,
        reason: 'Internal server error'
      };
    }
  }
  
  /**
   * Handle game pause request
   */
  async handlePauseRequest(playerId, pauseData) {
    try {
      const connection = this.connectionManager.getConnectionByPlayerId(playerId);
      if (!connection || !connection.roomId) {
        return { success: false, reason: 'Player not in room' };
      }
      
      const roomId = connection.roomId;
      const gameState = this.activeGames.get(roomId);
      
      if (!gameState) {
        return { success: false, reason: 'Game not active' };
      }
      
      // Check if already paused
      if (this.pausedGames.has(roomId)) {
        return { success: false, reason: 'Game already paused' };
      }
      
      // Pause the game
      const pauseInfo = {
        reason: pauseData.reason || 'player_request',
        timestamp: Date.now(),
        requestedBy: playerId,
        timeout: Date.now() + this.config.pauseTimeout
      };
      
      this.pausedGames.set(roomId, pauseInfo);
      gameState.status = 'paused';
      
      // Broadcast pause to all players
      this.connectionManager.broadcastToRoom(roomId, 'game_paused', {
        reason: pauseInfo.reason,
        pausedBy: playerId,
        timeout: this.config.pauseTimeout,
        timestamp: Date.now()
      });
      
      // Set auto-resume timeout
      setTimeout(() => {
        if (this.pausedGames.has(roomId)) {
          this.handleResumeRequest(playerId, { reason: 'timeout' });
        }
      }, this.config.pauseTimeout);
      
      this.metrics.totalPauses++;
      
      return {
        success: true,
        timeout: this.config.pauseTimeout
      };
      
    } catch (error) {
      console.error(`❌ Error handling pause request from ${playerId}:`, error);
      return {
        success: false,
        reason: 'Internal server error'
      };
    }
  }
  
  /**
   * Handle game resume request
   */
  async handleResumeRequest(playerId, resumeData) {
    try {
      const connection = this.connectionManager.getConnectionByPlayerId(playerId);
      if (!connection || !connection.roomId) {
        return { success: false, reason: 'Player not in room' };
      }
      
      const roomId = connection.roomId;
      const gameState = this.activeGames.get(roomId);
      
      if (!gameState) {
        return { success: false, reason: 'Game not active' };
      }
      
      // Check if paused
      if (!this.pausedGames.has(roomId)) {
        return { success: false, reason: 'Game not paused' };
      }
      
      const pauseInfo = this.pausedGames.get(roomId);
      
      // Only the player who paused or after timeout can resume
      if (pauseInfo.requestedBy !== playerId && resumeData.reason !== 'timeout') {
        return { success: false, reason: 'Only pausing player can resume' };
      }
      
      // Resume the game
      this.pausedGames.delete(roomId);
      gameState.status = 'playing';
      
      // Broadcast resume to all players
      this.connectionManager.broadcastToRoom(roomId, 'game_resumed', {
        resumedBy: playerId,
        reason: resumeData.reason || 'player_request',
        timestamp: Date.now()
      });
      
      return {
        success: true
      };
      
    } catch (error) {
      console.error(`❌ Error handling resume request from ${playerId}:`, error);
      return {
        success: false,
        reason: 'Internal server error'
      };
    }
  }
  
  /**
   * Initialize a new game
   */
  initializeGame(roomId, players, gameMode = 'casual') {
    const gameState = {
      roomId,
      players: players.map((p, index) => ({
        id: p.id,
        username: p.username,
        position: index === 0 ? 'left' : 'right',
        score: 0,
        connected: true
      })),
      score: { player1: 0, player2: 0 },
      status: 'playing',
      gameMode,
      startTime: Date.now(),
      lastUpdate: Date.now()
    };
    
    this.activeGames.set(roomId, gameState);
    
    // Initialize ball at center
    this.ballStates.set(roomId, {
      position: { x: 400, y: 200 }, // Center of field
      velocity: { x: 0, y: 0 },
      spin: 0,
      lastUpdate: Date.now()
    });
    
    // Initialize player states
    players.forEach((player, index) => {
      this.playerStates.set(player.id, {
        position: { 
          x: index === 0 ? 100 : 700, // Starting positions
          y: 200 
        },
        velocity: { x: 0, y: 0 },
        direction: 'idle',
        lastUpdate: Date.now()
      });
    });
    
    // Initialize state history
    this.stateHistory.set(roomId, []);
    
    console.log(`🎮 Game initialized for room ${roomId}`);
    
    return gameState;
  }
  
  /**
   * End a game using comprehensive game end system
   */
  async endGame(roomId, gameState, endReason = 'score_limit') {
    try {
      console.log(`🏁 Ending game in room ${roomId}, reason: ${endReason}`);
      
      // Use the comprehensive game end system
      const result = await this.gameEndEvents.handleGameEnd(roomId, gameState, endReason);
      
      if (result.success) {
        // Schedule cleanup using the game end system
        // The GameEndEvents system handles its own cleanup, but we still need to clean our game state
        setTimeout(() => {
          this.cleanupGame(roomId);
        }, 6000); // Slightly after GameEndEvents cleanup
        
        console.log(`✅ Game ${roomId} ended successfully`);
        return result;
      } else {
        console.error(`❌ Failed to end game ${roomId}:`, result.reason);
        
        // Fallback to basic cleanup
        this.cleanupGame(roomId);
        return result;
      }
      
    } catch (error) {
      console.error(`💥 Error ending game ${roomId}:`, error);
      
      // Emergency cleanup
      this.cleanupGame(roomId);
      
      return {
        success: false,
        reason: 'Internal server error',
        error: error.message
      };
    }
  }
  
  /**
   * Handle player disconnection during game
   */
  async handlePlayerDisconnection(playerId, roomId) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) {
      return { success: false, reason: 'Game not found' };
    }
    
    console.log(`🔌 Player ${playerId} disconnected from room ${roomId}`);
    
    // Use GameEndEvents to handle disconnection
    return await this.gameEndEvents.handlePlayerDisconnect(playerId, roomId, gameState);
  }
  
  /**
   * Handle forced game end (admin or timeout)
   */
  async handleForcedEnd(roomId, reason = 'forced', adminId = null) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) {
      return { success: false, reason: 'Game not found' };
    }
    
    console.log(`⚠️ Forcing end of game ${roomId}, reason: ${reason}`);
    
    // Use GameEndEvents to handle forced end
    return await this.gameEndEvents.handleForcedGameEnd(roomId, gameState, reason, adminId);
  }
  
  /**
   * Handle time limit reached
   */
  async handleTimeLimit(roomId) {
    const gameState = this.activeGames.get(roomId);
    if (!gameState) {
      return { success: false, reason: 'Game not found' };
    }
    
    console.log(`⏰ Time limit reached for game ${roomId}`);
    
    return await this.endGame(roomId, gameState, 'time_limit');
  }
  
  /**
   * Clean up game data
   */
  cleanupGame(roomId) {
    this.activeGames.delete(roomId);
    this.ballStates.delete(roomId);
    this.stateHistory.delete(roomId);
    this.pausedGames.delete(roomId);
    this.goalCooldowns.delete(roomId);
    
    console.log(`🧹 Gameplay data cleaned up for room ${roomId}`);
  }
  
  /**
   * Utility Methods
   */
  
  /**
   * Apply lag compensation to movement data
   */
  applyLagCompensation(playerId, movementData) {
    const latency = this.playerLatencies.get(playerId) || 0;
    const compensationTime = Math.min(latency, this.config.maxLatency);
    
    // Extrapolate position based on velocity and latency
    const compensatedPosition = {
      x: movementData.position.x + (movementData.velocity.x * compensationTime / 1000),
      y: movementData.position.y + (movementData.velocity.y * compensationTime / 1000)
    };
    
    return {
      ...movementData,
      position: compensatedPosition,
      compensationApplied: compensationTime
    };
  }
  
  /**
   * Check if player is authoritative for ball updates
   */
  isAuthoritativeForBall(playerId, roomId) {
    const ballState = this.ballStates.get(roomId);
    if (!ballState) return false;
    
    // The last player to touch the ball is authoritative
    return ballState.lastTouchedBy === playerId;
  }
  
  /**
   * Add state to history for rollback
   */
  addToStateHistory(roomId, state) {
    const history = this.stateHistory.get(roomId) || [];
    history.push(state);
    
    // Keep only last 60 frames (1 second at 60fps)
    if (history.length > 60) {
      history.shift();
    }
    
    this.stateHistory.set(roomId, history);
  }
  
  /**
   * Update game physics
   */
  updateGamePhysics(roomId, gameState) {
    const ballState = this.ballStates.get(roomId);
    if (!ballState) return;
    
    const deltaTime = 1 / this.config.physicsTickRate;
    
    // Apply gravity to ball
    ballState.velocity.y += 500 * deltaTime; // Gravity
    
    // Update ball position
    ballState.position.x += ballState.velocity.x * deltaTime;
    ballState.position.y += ballState.velocity.y * deltaTime;
    
    // Apply friction
    ballState.velocity.x *= 0.99;
    
    // Ball boundaries
    if (ballState.position.y >= 380) { // Ground
      ballState.position.y = 380;
      ballState.velocity.y *= -0.7; // Bounce with damping
    }
    
    if (ballState.position.x <= 20 || ballState.position.x >= 780) { // Walls
      ballState.velocity.x *= -0.8;
      ballState.position.x = Math.max(20, Math.min(780, ballState.position.x));
    }
    
    ballState.lastUpdate = Date.now();
  }
  
  /**
   * Check for goal conditions
   */
  checkGoalConditions(roomId, gameState) {
    const ballState = this.ballStates.get(roomId);
    if (!ballState) return;
    
    // Goal areas (simplified)
    const leftGoal = { x: 0, y: 150, width: 50, height: 100 };
    const rightGoal = { x: 750, y: 150, width: 50, height: 100 };
    
    // Check left goal
    if (ballState.position.x <= leftGoal.x + leftGoal.width &&
        ballState.position.y >= leftGoal.y &&
        ballState.position.y <= leftGoal.y + leftGoal.height) {
      // Goal for right player
      this.handleGoalAttempt(gameState.players[1].id, {
        position: ballState.position,
        velocity: ballState.velocity,
        goalType: 'normal'
      });
    }
    
    // Check right goal
    if (ballState.position.x >= rightGoal.x &&
        ballState.position.y >= rightGoal.y &&
        ballState.position.y <= rightGoal.y + rightGoal.height) {
      // Goal for left player
      this.handleGoalAttempt(gameState.players[0].id, {
        position: ballState.position,
        velocity: ballState.velocity,
        goalType: 'normal'
      });
    }
  }
  
  /**
   * Broadcast authoritative game state
   */
  broadcastGameState(roomId, gameState) {
    const ballState = this.ballStates.get(roomId);
    const playerStates = {};
    
    gameState.players.forEach(player => {
      const state = this.playerStates.get(player.id);
      if (state) {
        playerStates[player.id] = state;
      }
    });
    
    // Only broadcast if there's been significant change
    const stateUpdate = {
      gameState: {
        score: gameState.score,
        status: gameState.status,
        time: Date.now() - gameState.startTime
      },
      ball: ballState,
      players: playerStates,
      timestamp: Date.now()
    };
    
    // Broadcast at lower frequency (e.g., 20Hz instead of 60Hz)
    if (Date.now() % 3 === 0) {
      this.connectionManager.broadcastToRoom(roomId, 'state_update', stateUpdate);
    }
  }
  
  /**
   * Reset ball position after goal
   */
  resetBallPosition(roomId) {
    this.ballStates.set(roomId, {
      position: { x: 400, y: 200 },
      velocity: { x: 0, y: 0 },
      spin: 0,
      lastUpdate: Date.now()
    });
  }
  
  /**
   * Check if game should end
   */
  checkGameEnd(gameState) {
    // Score limit
    const scoreLimit = gameState.gameMode === 'ranked' ? 5 : 3;
    if (gameState.score.player1 >= scoreLimit || gameState.score.player2 >= scoreLimit) {
      return true;
    }
    
    // Time limit (10 minutes)
    const timeLimit = 600000; // 10 minutes
    if (Date.now() - gameState.startTime >= timeLimit) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Update player latency
   */
  updatePlayerLatency(playerId, latency) {
    this.playerLatencies.set(playerId, latency);
    
    // Update average latency
    const latencies = Array.from(this.playerLatencies.values());
    this.metrics.averageLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    this.metrics.peakLatency = Math.max(...latencies);
  }
  
  /**
   * Get gameplay statistics
   */
  getStats() {
    const uptime = Date.now() - this.metrics.startTime;
    
    return {
      ...this.metrics,
      uptime,
      activeGames: this.activeGames.size,
      pausedGames: this.pausedGames.size,
      movementsPerSecond: this.metrics.totalMovements / (uptime / 1000),
      goalsPerGame: this.metrics.totalGoals / Math.max(1, this.activeGames.size),
      predictionAccuracy: 100 - (this.metrics.predictionErrors / Math.max(1, this.metrics.totalMovements) * 100)
    };
  }
  
  /**
   * Shutdown and cleanup
   */
  shutdown() {
    console.log('🎮 Gameplay Events shutting down...');
    
    // Stop physics tick
    if (this.physicsInterval) {
      clearInterval(this.physicsInterval);
    }
    
    // Shutdown GameEndEvents
    if (this.gameEndEvents) {
      this.gameEndEvents.shutdown();
    }
    
    // Clear all game data
    this.activeGames.clear();
    this.playerStates.clear();
    this.ballStates.clear();
    this.stateHistory.clear();
    this.pausedGames.clear();
    this.goalCooldowns.clear();
    this.playerLatencies.clear();
    this.inputBuffer.clear();
    
    console.log('✅ Gameplay Events shutdown complete');
  }
}

module.exports = GameplayEvents;