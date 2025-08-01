/**
 * Gameplay Events Handler - 240 FPS Server-Authoritative Implementation
 * Simplified version that uses ServerPhysicsEngine for all game logic
 */

const EventEmitter = require('events');
const ServerPhysicsEngine = require('../game/serverPhysics');
const GameEndEvents = require('./gameEndEvents');
const CONSTANTS = require('../utils/constants');

class GameplayEvents extends EventEmitter {
  constructor(connectionManager, gameEventSystem, gameStateValidator, options = {}) {
    super();
    
    this.connectionManager = connectionManager;
    this.gameEventSystem = gameEventSystem;
    
    // Initialize 240 FPS Physics Engine
    this.physicsEngine = new ServerPhysicsEngine();
    
    // Initialize Game End Events system (keep existing)
    this.gameEndEvents = new GameEndEvents(
      connectionManager, 
      gameEventSystem, 
      options.databaseClient, 
      options.gameEnd
    );
    
    // Configuration - simplified for 240 FPS
    this.config = {
      physicsTickRate: CONSTANTS.PHYSICS_FRAME_RATE, // 240 FPS
      goalCooldown: options.goalCooldown || 3000,
      pauseTimeout: options.pauseTimeout || 30000,
      disconnectGracePeriod: options.disconnectGracePeriod || 10000,
      ...options
    };
    
    // State broadcasting
    this.broadcastInterval = null;
    this.lastBroadcastTime = 0;
    
    // Game control (keep existing functionality)
    this.pausedGames = new Map(); // roomId -> { reason, timestamp, requestedBy }
    
    // Performance metrics
    this.metrics = {
      totalInputs: 0,
      totalGameStates: 0,
      totalGoals: 0,
      activeGames: 0,
      averageTickTime: 0,
      peakTickTime: 0,
      startTime: Date.now()
    };
    
    // Start physics engine
    this.physicsEngine.start();
    
    // Start state broadcasting
    this.startStateBroadcasting();
    
    console.log('🎮 240 FPS Gameplay Events system initialized');
  }

  /**
   * Start broadcasting game states at 240 FPS
   */
  startStateBroadcasting() {
    this.broadcastInterval = setInterval(() => {
      this.broadcastAllGameStates();
    }, CONSTANTS.PHYSICS_TICK_MS);
  }

  /**
   * Broadcast game states for all active games
   */
  broadcastAllGameStates() {
    const startTime = Date.now();
    
    for (const [roomId, gameState] of this.physicsEngine.getAllGames()) {
      // Skip if game is paused
      if (this.pausedGames.has(roomId)) continue;
      
      // Prepare state for broadcast
      const stateForBroadcast = this.prepareStateForBroadcast(gameState);
      
      // Broadcast to all players in room
      this.connectionManager.broadcastToRoom(roomId, 'gameState', stateForBroadcast);
      
      this.metrics.totalGameStates++;
    }
    
    this.metrics.activeGames = this.physicsEngine.getAllGames().size;
    
    // Performance monitoring
    const tickTime = Date.now() - startTime;
    this.metrics.averageTickTime = (this.metrics.averageTickTime + tickTime) / 2;
    if (tickTime > this.metrics.peakTickTime) {
      this.metrics.peakTickTime = tickTime;
    }
    
    if (tickTime > CONSTANTS.MAX_TICK_TIME) {
      console.warn(`🐌 Broadcast tick took ${tickTime}ms (max: ${CONSTANTS.MAX_TICK_TIME}ms)`);
    }
  }

  /**
   * Prepare game state for client broadcast
   */
  prepareStateForBroadcast(gameState) {
    return {
      players: gameState.players.map(player => ({
        id: player.id,
        x: Math.round(player.position.x * 10) / 10, // Round to 1 decimal
        y: Math.round(player.position.y * 10) / 10,
        vx: Math.round(player.velocity.x * 10) / 10,
        vy: Math.round(player.velocity.y * 10) / 10,
        facing: player.facing,
        kicking: player.kicking,
        onGround: player.onGround,
        character: player.character,
        kickCooldown: player.kickCooldown
      })),
      ball: {
        x: Math.round(gameState.ball.position.x * 10) / 10,
        y: Math.round(gameState.ball.position.y * 10) / 10,
        vx: Math.round(gameState.ball.velocity.x * 10) / 10,
        vy: Math.round(gameState.ball.velocity.y * 10) / 10,
        rotation: Math.round(gameState.ball.rotation * 100) / 100,
        trail: gameState.ball.trail
      },
      score: gameState.score,
      gameTime: Math.round(gameState.gameTime * 10) / 10,
      gameState: gameState.gameState,
      timestamp: Date.now()
    };
  }

  /**
   * Handle player input - SIMPLIFIED for 240 FPS
   */
  async handlePlayerInput(playerId, inputData) {
    try {
      const connection = this.connectionManager.getConnectionByPlayerId(playerId);
      if (!connection || !connection.roomId) {
        return { success: false, reason: 'Player not in room' };
      }
      
      const roomId = connection.roomId;
      
      // Check if game exists
      const gameState = this.physicsEngine.getGameState(roomId);
      if (!gameState) {
        return { success: false, reason: 'Game not active' };
      }
      
      // Check if game is paused
      if (this.pausedGames.has(roomId)) {
        return { success: false, reason: 'Game is paused' };
      }
      
      // Rate limiting - basic check
      const now = Date.now();
      if (!this.lastInputTime) this.lastInputTime = new Map();
      const lastInput = this.lastInputTime.get(playerId) || 0;
      
      if (now - lastInput < (1000 / CONSTANTS.MAX_INPUT_RATE)) {
        return { success: false, reason: 'Input rate limit exceeded' };
      }
      
      this.lastInputTime.set(playerId, now);
      
      // Send input to physics engine
      this.physicsEngine.updatePlayerInput(playerId, roomId, {
        left: inputData.left || false,
        right: inputData.right || false,
        up: inputData.up || false,
        kick: inputData.kick || false
      });
      
      this.metrics.totalInputs++;
      
      return { success: true };
      
    } catch (error) {
      console.error(`❌ Error handling player input for ${playerId}:`, error);
      return { success: false, reason: 'Internal server error' };
    }
  }

  /**
   * Create a new game (called from room management)
   */
  async createGame(roomId, players) {
    try {
      console.log(`🎮 Creating new game for room ${roomId} with players:`, players.map(p => p.id));
      
      // Create game in physics engine
      const gameState = this.physicsEngine.createGame(roomId, players);
      
      // Initialize metrics for this game
      this.metrics.activeGames++;
      
      // Notify players that game is starting
      this.connectionManager.broadcastToRoom(roomId, 'gameStarted', {
        roomId,
        players: gameState.players.map(p => ({
          id: p.id,
          character: p.character,
          playerNumber: p.playerNumber,
          startPosition: p.position
        })),
        gameState: 'PLAYING'
      });
      
      console.log(`✅ Game created successfully for room ${roomId}`);
      return { success: true, gameState };
      
    } catch (error) {
      console.error(`❌ Error creating game for room ${roomId}:`, error);
      return { success: false, reason: 'Failed to create game' };
    }
  }

  /**
   * End a game (called from room management or game end conditions)
   */
  async endGame(roomId, reason = 'game_completed') {
    try {
      const gameState = this.physicsEngine.getGameState(roomId);
      if (!gameState) {
        return { success: false, reason: 'Game not found' };
      }
      
      console.log(`🏁 Ending game for room ${roomId}, reason: ${reason}`);
      
      // Determine winner
      let winner = 'draw';
      if (gameState.score.left > gameState.score.right) {
        winner = 'left';
      } else if (gameState.score.right > gameState.score.left) {
        winner = 'right';
      }
      
      // Use existing game end events system
      const gameEndResult = await this.gameEndEvents.handleGameEnd(roomId, {
        winner,
        score: gameState.score,
        gameTime: gameState.gameTime,
        reason,
        players: gameState.players
      });
      
      // Clean up physics engine
      this.physicsEngine.destroyGame(roomId);
      
      // Remove from paused games if present
      this.pausedGames.delete(roomId);
      
      this.metrics.activeGames--;
      
      console.log(`✅ Game ended successfully for room ${roomId}`);
      return { success: true, winner, gameEndResult };
      
    } catch (error) {
      console.error(`❌ Error ending game for room ${roomId}:`, error);
      return { success: false, reason: 'Failed to end game' };
    }
  }

  /**
   * Handle game pause (keep existing functionality)
   */
  async handleGamePause(playerId, pauseData) {
    try {
      const connection = this.connectionManager.getConnectionByPlayerId(playerId);
      if (!connection || !connection.roomId) {
        return { success: false, reason: 'Player not in room' };
      }
      
      const roomId = connection.roomId;
      const gameState = this.physicsEngine.getGameState(roomId);
      
      if (!gameState) {
        return { success: false, reason: 'Game not active' };
      }
      
      // Add to paused games
      this.pausedGames.set(roomId, {
        reason: pauseData.reason || 'player_request',
        timestamp: Date.now(),
        requestedBy: playerId
      });
      
      // Broadcast pause to all players
      this.connectionManager.broadcastToRoom(roomId, 'gamePaused', {
        reason: pauseData.reason,
        requestedBy: playerId,
        timestamp: Date.now()
      });
      
      // Auto-resume after timeout
      setTimeout(() => {
        if (this.pausedGames.has(roomId)) {
          this.handleGameResume(playerId, { reason: 'timeout' });
        }
      }, this.config.pauseTimeout);
      
      return { success: true };
      
    } catch (error) {
      console.error(`❌ Error pausing game:`, error);
      return { success: false, reason: 'Failed to pause game' };
    }
  }

  /**
   * Handle game resume (keep existing functionality)
   */
  async handleGameResume(playerId, resumeData) {
    try {
      const connection = this.connectionManager.getConnectionByPlayerId(playerId);
      if (!connection || !connection.roomId) {
        return { success: false, reason: 'Player not in room' };
      }
      
      const roomId = connection.roomId;
      
      if (!this.pausedGames.has(roomId)) {
        return { success: false, reason: 'Game is not paused' };
      }
      
      // Remove from paused games
      this.pausedGames.delete(roomId);
      
      // Broadcast resume to all players
      this.connectionManager.broadcastToRoom(roomId, 'gameResumed', {
        reason: resumeData.reason,
        resumedBy: playerId,
        timestamp: Date.now()
      });
      
      return { success: true };
      
    } catch (error) {
      console.error(`❌ Error resuming game:`, error);
      return { success: false, reason: 'Failed to resume game' };
    }
  }

  /**
   * Get game state for a room
   */
  getGameState(roomId) {
    return this.physicsEngine.getGameState(roomId);
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      physicsEngineStats: this.physicsEngine.getStats(),
      uptime: Date.now() - this.metrics.startTime
    };
  }

  /**
   * Cleanup when shutting down
   */
  destroy() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
    }
    
    if (this.physicsEngine) {
      this.physicsEngine.stop();
    }
    
    console.log('🎮 Gameplay Events system destroyed');
  }
}

module.exports = GameplayEvents;