/**
 * Gameplay Events Handler - Manages all real-time gameplay events
 * Includes player movement, ball physics, goal scoring, and game control
 */

const EventEmitter = require('events');
const GameEndEvents = require('./gameEndEvents');

class GameplayEvents extends EventEmitter {
  constructor(connectionManager, gameEventSystem, gameStateValidator, options = {}) {
    super();
    
    // GAMEPLAY ENABLED - Head Soccer multiplayer implementation
    this.disabled = false;
    
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
    
    // Head Soccer Physics Constants (matching single-player exactly)
    this.PHYSICS = {
      // Core
      GRAVITY: 0.5,           // Frame-based gravity
      FPS: 60,
      TICK_INTERVAL: 1000 / 60, // 16.67ms
      
      // Field
      FIELD_WIDTH: 1600,
      FIELD_HEIGHT: 900,
      BOTTOM_GAP: 20,
      GOAL_WIDTH: 75,
      GOAL_HEIGHT: 250,
      
      // Ball
      BALL_RADIUS: 25,
      BALL_BOUNCE: 0.95,      // Very high bounce coefficient
      BALL_FRICTION_AIR: 0,   // No air resistance
      
      // Player
      PLAYER_WIDTH: 50,
      PLAYER_HEIGHT: 80,
      PLAYER_SPEED: 5,        // Per frame movement
      PLAYER_JUMP: 15,        // Initial jump velocity
      PLAYER_FRICTION: 0.85,  // Ground friction
      
      // Kick
      KICK_FORCE_MIN: 18,
      KICK_FORCE_MAX: 25,
      KICK_COOLDOWN: 10,      // Frames
      
      // Starting positions (exact from single-player)
      PLAYER1_START_X: 400,   // 25% of field width
      PLAYER2_START_X: 1200,  // 75% of field width
      PLAYER_START_Y: 750,
      BALL_START_X: 800,      // Center
      BALL_START_Y: 400,
      
      // Collision
      COLLISION_THRESHOLD: 5,
      BOUNCE_MULTIPLIER: 1.1  // Ball speeds up on collision
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
    // Check if gameplay is disabled
    if (this.disabled) {
      return { success: false, reason: 'Gameplay is currently disabled - coming soon!' };
    }
    
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
  initializeGame(roomId, players, gameMode = 'casual', characterData = null) {
    console.log(`🏟️ Initializing Head Soccer game for room ${roomId}`);
    
    const gameState = {
      roomId,
      players: [
        {
          id: players[0] ? players[0].id : null,
          name: players[0] ? players[0].name || 'Player 1' : 'Player 1',
          position: { 
            x: this.PHYSICS.PLAYER1_START_X,
            y: this.PHYSICS.PLAYER_START_Y
          },
          velocity: { x: 0, y: 0 },
          score: 0,
          kickCooldown: 0,
          isGrounded: true,
          isKicking: false,
          customization: this.getPlayerCustomization(characterData, 1)
        },
        {
          id: players[1] ? players[1].id : null,
          name: players[1] ? players[1].name || 'Player 2' : 'Player 2',
          position: { 
            x: this.PHYSICS.PLAYER2_START_X,
            y: this.PHYSICS.PLAYER_START_Y
          },
          velocity: { x: 0, y: 0 },
          score: 0,
          kickCooldown: 0,
          isGrounded: true,
          isKicking: false,
          customization: this.getPlayerCustomization(characterData, 2)
        }
      ],
      ball: {
        position: { 
          x: this.PHYSICS.BALL_START_X, 
          y: this.PHYSICS.BALL_START_Y 
        },
        velocity: { x: 0, y: 0 }
      },
      time: 120, // 2 minutes
      gameStarted: true,
      gameOver: false,
      winner: -1,
      inputs: {},
      status: 'playing',
      gameMode,
      startTime: Date.now(),
      lastUpdate: Date.now()
    };
    
    this.activeGames.set(roomId, gameState);
    
    // Initialize state history
    this.stateHistory.set(roomId, []);
    
    console.log(`⚽ Head Soccer game initialized: ${gameState.players[0].name} vs ${gameState.players[1].name}`);
    
    return gameState;
  }
  
  /**
   * Get player customization data from character selection
   */
  getPlayerCustomization(characterData, playerNumber) {
    if (!characterData) {
      return {
        character: `player${playerNumber}`,
        head: playerNumber === 1 ? 'Dad' : 'Mihir',
        cleat: playerNumber.toString()
      };
    }
    
    const playerKey = `player${playerNumber}`;
    const playerData = characterData[playerKey];
    
    if (!playerData) {
      return {
        character: `player${playerNumber}`,
        head: playerNumber === 1 ? 'Dad' : 'Mihir', 
        cleat: playerNumber.toString()
      };
    }
    
    return {
      character: playerData.character || `player${playerNumber}`,
      head: playerData.head || (playerNumber === 1 ? 'Dad' : 'Mihir'),
      cleat: playerData.cleat || playerNumber.toString()
    };
  }
  
  /**
   * Handle joinGame event from client
   */
  joinGame(socket, data) {
    console.log(`🎮 joinGame event from ${socket.id}:`, data);
    
    const { roomCode, characterData, playerName } = data;
    
    // Find or create room
    let gameState = this.activeGames.get(roomCode);
    if (!gameState) {
      // Create new game with empty players
      gameState = this.initializeGame(roomCode, [], 'multiplayer', characterData);
    }
    
    // Assign player to empty slot
    const playerIndex = gameState.players.findIndex(p => !p.id);
    if (playerIndex !== -1) {
      const player = gameState.players[playerIndex];
      player.id = socket.id;
      player.name = playerName || `Player ${playerIndex + 1}`;
      
      // Apply character customization if provided
      if (characterData && characterData[`player${playerIndex + 1}`]) {
        const customization = characterData[`player${playerIndex + 1}`];
        player.customization = {
          character: customization.character || 'player1',
          head: customization.head || 'Dad',
          cleat: customization.cleat || '1'
        };
      }
      
      console.log(`⚽ Player ${playerName} joined room ${roomCode} as Player ${playerIndex + 1}`);
      
      // Emit to room that player joined
      this.connectionManager.io.to(roomCode).emit('gameState', gameState);
      this.connectionManager.io.to(roomCode).emit('playerJoined', { playerIndex, playerName });
      
      // Start game if both players connected
      if (gameState.players.every(p => p.id)) {
        console.log(`🎯 Both players connected in room ${roomCode}, starting game...`);
        this.startGame(roomCode);
      } else {
        console.log(`⏳ Waiting for more players in room ${roomCode}`);
      }
      
    } else {
      socket.emit('roomFull');
    }
  }
  
  /**
   * Start game when both players are ready
   */
  startGame(roomCode) {
    const gameState = this.activeGames.get(roomCode);
    
    console.log(`🎮 startGame called for room ${roomCode}`);
    
    if (!gameState) {
      console.error(`❌ No game found for room ${roomCode}`);
      return;
    }
    
    console.log(`✅ Head Soccer game started in room ${roomCode}`);
    
    // Emit gameStart event to hide waiting screen
    console.log(`📡 Emitting 'gameStart' to room ${roomCode}`);
    this.connectionManager.io.to(roomCode).emit('gameStart');
    
    // Game loop is already running via processPhysicsTick
    console.log(`🔄 Physics loop already running at ${this.config.physicsTickRate} FPS`);
  }
  
  /**
   * Handle player input for movement and actions
   */
  handlePlayerInput(socket, data) {
    const playerId = socket.id;
    const { left, right, up, kick, timestamp } = data;
    
    // Find which game this player is in
    let playerGameState = null;
    let playerIndex = -1;
    
    for (const [roomId, gameState] of this.activeGames) {
      const index = gameState.players.findIndex(p => p.id === playerId);
      if (index !== -1) {
        playerGameState = gameState;
        playerIndex = index;
        break;
      }
    }
    
    if (!playerGameState) {
      return; // Player not in any game
    }
    
    // Store input for next physics update
    if (!playerGameState.inputs[playerId]) {
      playerGameState.inputs[playerId] = {};
    }
    
    playerGameState.inputs[playerId] = {
      left: !!left,
      right: !!right,
      up: !!up,
      kick: !!kick,
      timestamp: timestamp || Date.now()
    };
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
    if (!gameState || !gameState.players || !gameState.ball) return;
    
    // Process player inputs first
    gameState.players.forEach((player, index) => {
      if (!player.id) return;
      
      const input = gameState.inputs[player.id];
      if (!input) return;
      
      this.updatePlayer(player, input);
    });
    
    // Update ball physics
    this.updateBall(gameState.ball);
    
    // Check ball-player collisions
    gameState.players.forEach(player => {
      if (player.id) {
        this.checkBallPlayerCollision(player, gameState.ball);
      }
    });
    
    // Decrease kick cooldowns
    gameState.players.forEach(player => {
      if (player.kickCooldown > 0) {
        player.kickCooldown--;
      }
      if (player.kickCooldown <= 0) {
        player.isKicking = false;
      }
    });
    
    gameState.lastUpdate = Date.now();
  }
  
  /**
   * Update player physics (Head Soccer implementation)
   */
  updatePlayer(player, input) {
    // Horizontal movement
    if (input.left) {
      player.velocity.x = -this.PHYSICS.PLAYER_SPEED;
    } else if (input.right) {
      player.velocity.x = this.PHYSICS.PLAYER_SPEED;
    } else {
      player.velocity.x *= this.PHYSICS.PLAYER_FRICTION;
    }
    
    // Jumping (only when grounded)
    if (input.up && player.isGrounded) {
      player.velocity.y = -this.PHYSICS.PLAYER_JUMP;
      player.isGrounded = false;
    }
    
    // Apply gravity
    player.velocity.y += this.PHYSICS.GRAVITY;
    
    // Update position
    player.position.x += player.velocity.x;
    player.position.y += player.velocity.y;
    
    // Ground collision
    const groundY = this.PHYSICS.FIELD_HEIGHT - this.PHYSICS.BOTTOM_GAP - this.PHYSICS.PLAYER_HEIGHT;
    if (player.position.y > groundY) {
      player.position.y = groundY;
      player.velocity.y = 0;
      player.isGrounded = true;
    } else {
      player.isGrounded = false;
    }
    
    // Side boundaries
    player.position.x = Math.max(0, Math.min(this.PHYSICS.FIELD_WIDTH - this.PHYSICS.PLAYER_WIDTH, player.position.x));
    
    // Kicking
    if (input.kick && player.kickCooldown <= 0) {
      player.isKicking = true;
      player.kickCooldown = this.PHYSICS.KICK_COOLDOWN;
    }
  }
  
  /**
   * Update ball physics (Head Soccer implementation)
   */
  updateBall(ball) {
    // Apply gravity to ball
    ball.velocity.y += this.PHYSICS.GRAVITY;
    
    // Update ball position
    ball.position.x += ball.velocity.x;
    ball.position.y += ball.velocity.y;
    
    // Ground collision
    const groundY = this.PHYSICS.FIELD_HEIGHT - this.PHYSICS.BOTTOM_GAP - this.PHYSICS.BALL_RADIUS;
    if (ball.position.y > groundY) {
      ball.position.y = groundY;
      ball.velocity.y *= -this.PHYSICS.BALL_BOUNCE;
    }
    
    // Wall collisions
    if (ball.position.x < this.PHYSICS.BALL_RADIUS) {
      ball.position.x = this.PHYSICS.BALL_RADIUS;
      ball.velocity.x *= -this.PHYSICS.BALL_BOUNCE;
    }
    if (ball.position.x > this.PHYSICS.FIELD_WIDTH - this.PHYSICS.BALL_RADIUS) {
      ball.position.x = this.PHYSICS.FIELD_WIDTH - this.PHYSICS.BALL_RADIUS;
      ball.velocity.x *= -this.PHYSICS.BALL_BOUNCE;
    }
  }
  
  /**
   * Check ball-player collision (Head Soccer implementation)
   */
  checkBallPlayerCollision(player, ball) {
    if (!player.id) return;
    
    const dx = player.position.x - ball.position.x;
    const dy = player.position.y - ball.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const collisionDistance = this.PHYSICS.BALL_RADIUS + this.PHYSICS.PLAYER_WIDTH / 2;
    
    if (distance < collisionDistance) {
      // Collision detected
      const angle = Math.atan2(dy, dx);
      
      // Separate ball from player
      const separation = collisionDistance - distance;
      ball.position.x -= Math.cos(angle) * separation;
      ball.position.y -= Math.sin(angle) * separation;
      
      // Apply kick force if player is kicking
      let forceMultiplier = 1;
      if (player.isKicking) {
        forceMultiplier = 2; // Extra force when kicking
      }
      
      const force = (this.PHYSICS.KICK_FORCE_MIN + Math.random() * (this.PHYSICS.KICK_FORCE_MAX - this.PHYSICS.KICK_FORCE_MIN)) * forceMultiplier;
      
      ball.velocity.x = -Math.cos(angle) * force * this.PHYSICS.BOUNCE_MULTIPLIER;
      ball.velocity.y = -Math.sin(angle) * force * this.PHYSICS.BOUNCE_MULTIPLIER;
    }
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