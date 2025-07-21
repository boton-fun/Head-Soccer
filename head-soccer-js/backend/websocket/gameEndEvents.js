/**
 * Game End Events Handler - Manages game completion, results, and cleanup
 * Handles final score calculation, result broadcasting, and post-game cleanup
 */

const EventEmitter = require('events');

class GameEndEvents extends EventEmitter {
  constructor(connectionManager, gameEventSystem, databaseClient, options = {}) {
    super();
    
    this.connectionManager = connectionManager;
    this.gameEventSystem = gameEventSystem;
    this.databaseClient = databaseClient;
    
    // Configuration
    this.config = {
      postGameDelay: options.postGameDelay || 5000, // Time before cleanup
      resultPersistenceTimeout: options.resultPersistenceTimeout || 10000, // Max time for DB save
      celebrationDuration: options.celebrationDuration || 3000, // Winner celebration time
      statsUpdateTimeout: options.statsUpdateTimeout || 5000, // Player stats update timeout
      maxRetries: options.maxRetries || 3, // Max retries for database operations
      ...options
    };
    
    // Game end tracking
    this.endingGames = new Map(); // roomId -> end process info
    this.gameResults = new Map(); // roomId -> final results
    this.pendingCleanups = new Map(); // roomId -> cleanup timeout
    
    // Statistics
    this.metrics = {
      gamesEnded: 0,
      resultsPersisted: 0,
      cleanupOperations: 0,
      databaseErrors: 0,
      averageGameDuration: 0,
      longestGame: 0,
      shortestGame: Infinity,
      startTime: Date.now()
    };
    
    console.log('🏁 Game End Events system initialized');
  }
  
  /**
   * Handle game end with comprehensive result processing
   * @param {string} roomId - Room identifier
   * @param {Object} gameState - Current game state
   * @param {string} endReason - Reason for game end ('score_limit', 'time_limit', 'forfeit', 'disconnect')
   */
  async handleGameEnd(roomId, gameState, endReason = 'score_limit') {
    try {
      console.log(`🏁 Processing game end for room ${roomId}, reason: ${endReason}`);
      
      // Prevent duplicate processing
      if (this.endingGames.has(roomId)) {
        console.log(`⚠️ Game ${roomId} already ending, skipping duplicate`);
        return { success: false, reason: 'Already processing game end' };
      }
      
      const endStartTime = Date.now();
      gameState.status = 'finishing';
      gameState.endTime = endStartTime;
      gameState.endReason = endReason;
      
      // Mark as ending
      this.endingGames.set(roomId, {
        startTime: endStartTime,
        reason: endReason,
        phase: 'calculating'
      });
      
      // Calculate comprehensive final results
      const finalResults = await this.calculateFinalResults(roomId, gameState, endReason);
      
      // Update ending status
      this.endingGames.get(roomId).phase = 'broadcasting';
      
      // Broadcast results to all players
      await this.broadcastGameEndResults(roomId, finalResults);
      
      // Queue game end event
      this.gameEventSystem.queueEvent('game_ended', {
        roomId,
        ...finalResults
      }, {
        priority: 1, // High priority
        persistent: true
      });
      
      // Store results
      this.gameResults.set(roomId, finalResults);
      
      // Update ending status
      this.endingGames.get(roomId).phase = 'persisting';
      
      // Persist to database (async, don't block)
      this.persistGameResults(roomId, finalResults).catch(error => {
        console.error(`❌ Failed to persist results for room ${roomId}:`, error);
        this.metrics.databaseErrors++;
      });
      
      // Update player statistics (async)
      this.updatePlayerStatistics(finalResults).catch(error => {
        console.error(`❌ Failed to update player statistics:`, error);
        this.metrics.databaseErrors++;
      });
      
      // Schedule cleanup
      await this.schedulePostGameCleanup(roomId, finalResults);
      
      // Update metrics
      this.updateGameMetrics(finalResults);
      this.metrics.gamesEnded++;
      
      console.log(`✅ Game end processing complete for room ${roomId}`);
      
      return {
        success: true,
        finalResults,
        endTime: Date.now() - endStartTime
      };
      
    } catch (error) {
      console.error(`❌ Error processing game end for room ${roomId}:`, error);
      
      // Cleanup failed end process
      this.endingGames.delete(roomId);
      
      return {
        success: false,
        reason: 'Internal server error',
        error: error.message
      };
    }
  }
  
  /**
   * Calculate comprehensive final results
   */
  async calculateFinalResults(roomId, gameState, endReason) {
    const duration = gameState.endTime - gameState.startTime;
    const players = gameState.players;
    
    // Determine winner and result type
    let winner = null;
    let resultType = 'draw';
    
    if (endReason === 'forfeit' || endReason === 'disconnect') {
      // Handle forfeit/disconnect - remaining player wins
      const activePlayers = players.filter(p => p.connected !== false);
      winner = activePlayers.length > 0 ? activePlayers[0] : null;
      resultType = winner ? 'forfeit_win' : 'double_forfeit';
    } else if (gameState.score.player1 !== gameState.score.player2) {
      // Normal win/loss
      winner = gameState.score.player1 > gameState.score.player2 ? 
        players[0] : players[1];
      resultType = endReason === 'time_limit' ? 'time_win' : 'score_win';
    } else {
      // Draw
      resultType = 'draw';
    }
    
    const loser = winner ? players.find(p => p.id !== winner.id) : null;
    
    // Calculate detailed statistics
    const player1Stats = {
      playerId: players[0].id,
      username: players[0].username,
      position: players[0].position,
      score: gameState.score.player1,
      result: winner?.id === players[0].id ? 'win' : (resultType === 'draw' ? 'draw' : 'loss'),
      connected: players[0].connected !== false
    };
    
    const player2Stats = {
      playerId: players[1].id,
      username: players[1].username,
      position: players[1].position,
      score: gameState.score.player2,
      result: winner?.id === players[1].id ? 'win' : (resultType === 'draw' ? 'draw' : 'loss'),
      connected: players[1].connected !== false
    };
    
    return {
      roomId,
      gameMode: gameState.gameMode,
      startTime: gameState.startTime,
      endTime: gameState.endTime,
      duration,
      endReason,
      resultType,
      finalScore: { ...gameState.score },
      winner: winner ? {
        id: winner.id,
        username: winner.username,
        position: winner.position,
        finalScore: winner.position === 'left' ? gameState.score.player1 : gameState.score.player2
      } : null,
      loser: loser ? {
        id: loser.id,
        username: loser.username,
        position: loser.position,
        finalScore: loser.position === 'left' ? gameState.score.player1 : gameState.score.player2
      } : null,
      players: [player1Stats, player2Stats],
      gameStats: {
        totalGoals: gameState.score.player1 + gameState.score.player2,
        goalDifference: Math.abs(gameState.score.player1 - gameState.score.player2),
        durationMinutes: Math.round(duration / 60000 * 10) / 10
      },
      metadata: {
        processedAt: Date.now(),
        serverVersion: '1.0.0'
      }
    };
  }
  
  /**
   * Broadcast game end results to all players
   */
  async broadcastGameEndResults(roomId, finalResults) {
    // Main game end broadcast
    this.connectionManager.broadcastToRoom(roomId, 'game_ended', {
      winner: finalResults.winner,
      finalScore: finalResults.finalScore,
      duration: finalResults.duration,
      resultType: finalResults.resultType,
      endReason: finalResults.endReason,
      gameStats: finalResults.gameStats,
      timestamp: Date.now()
    });
    
    // Celebration phase for winner
    if (finalResults.winner) {
      setTimeout(() => {
        this.connectionManager.broadcastToRoom(roomId, 'winner_celebration', {
          winner: finalResults.winner,
          celebrationDuration: this.config.celebrationDuration,
          timestamp: Date.now()
        });
      }, 500);
    }
    
    // Detailed results after celebration
    setTimeout(() => {
      this.connectionManager.broadcastToRoom(roomId, 'detailed_results', {
        players: finalResults.players,
        gameStats: finalResults.gameStats,
        gameMode: finalResults.gameMode,
        durationMinutes: finalResults.gameStats.durationMinutes,
        timestamp: Date.now()
      });
    }, this.config.celebrationDuration);
    
    console.log(`📡 Game end results broadcasted for room ${roomId}`);
  }
  
  /**
   * Persist game results to database
   */
  async persistGameResults(roomId, finalResults) {
    if (!this.databaseClient) {
      console.log('⚠️ No database client configured, skipping persistence');
      return { success: false, reason: 'No database client' };
    }
    
    let retries = 0;
    const maxRetries = this.config.maxRetries;
    
    while (retries < maxRetries) {
      try {
        console.log(`💾 Persisting game results for room ${roomId} (attempt ${retries + 1})`);
        
        // Save to games table
        const gameRecord = {
          room_id: roomId,
          player1_id: finalResults.players[0].playerId,
          player2_id: finalResults.players[1].playerId,
          player1_score: finalResults.finalScore.player1,
          player2_score: finalResults.finalScore.player2,
          winner_id: finalResults.winner?.id || null,
          game_mode: finalResults.gameMode,
          duration: finalResults.duration,
          start_time: new Date(finalResults.startTime).toISOString(),
          end_time: new Date(finalResults.endTime).toISOString(),
          end_reason: finalResults.endReason,
          result_type: finalResults.resultType,
          status: 'completed',
          metadata: finalResults.metadata
        };
        
        // Insert game record (assuming Supabase client)
        const { data, error } = await this.databaseClient
          .from('games')
          .insert([gameRecord])
          .select();
        
        if (error) {
          throw new Error(`Database insert error: ${error.message}`);
        }
        
        console.log(`✅ Game results persisted successfully for room ${roomId}`);
        this.metrics.resultsPersisted++;
        
        return { success: true, gameId: data[0]?.id };
        
      } catch (error) {
        retries++;
        console.error(`❌ Database persistence attempt ${retries} failed for room ${roomId}:`, error);
        
        if (retries >= maxRetries) {
          console.error(`💥 All ${maxRetries} persistence attempts failed for room ${roomId}`);
          this.metrics.databaseErrors++;
          throw error;
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
      }
    }
  }
  
  /**
   * Update player statistics
   */
  async updatePlayerStatistics(finalResults) {
    if (!this.databaseClient) return;
    
    try {
      for (const playerStats of finalResults.players) {
        const updates = {
          games_played: 1, // Increment
          games_won: playerStats.result === 'win' ? 1 : 0,
          games_lost: playerStats.result === 'loss' ? 1 : 0,
          games_drawn: playerStats.result === 'draw' ? 1 : 0,
          goals_scored: playerStats.score,
          total_playtime: finalResults.duration,
          last_played: new Date().toISOString()
        };
        
        // Update or create player stats (upsert)
        const { error } = await this.databaseClient
          .from('player_stats')
          .upsert([{
            player_id: playerStats.playerId,
            ...updates
          }], {
            onConflict: 'player_id',
            // Add to existing values for cumulative stats
            ignoreDuplicates: false
          });
        
        if (error) {
          console.error(`❌ Failed to update stats for player ${playerStats.playerId}:`, error);
        } else {
          console.log(`📊 Updated statistics for player ${playerStats.username}`);
        }
      }
    } catch (error) {
      console.error(`❌ Error updating player statistics:`, error);
      throw error;
    }
  }
  
  /**
   * Schedule post-game cleanup
   */
  async schedulePostGameCleanup(roomId, finalResults) {
    console.log(`🧹 Scheduling cleanup for room ${roomId} in ${this.config.postGameDelay}ms`);
    
    // Cancel any existing cleanup
    if (this.pendingCleanups.has(roomId)) {
      clearTimeout(this.pendingCleanups.get(roomId));
    }
    
    const cleanupTimeout = setTimeout(async () => {
      try {
        await this.performPostGameCleanup(roomId, finalResults);
      } catch (error) {
        console.error(`❌ Error during post-game cleanup for room ${roomId}:`, error);
      }
    }, this.config.postGameDelay);
    
    this.pendingCleanups.set(roomId, cleanupTimeout);
  }
  
  /**
   * Perform comprehensive post-game cleanup
   */
  async performPostGameCleanup(roomId, finalResults) {
    console.log(`🧹 Starting post-game cleanup for room ${roomId}`);
    
    try {
      // Update ending status
      if (this.endingGames.has(roomId)) {
        this.endingGames.get(roomId).phase = 'cleaning';
      }
      
      // Final notification to players
      this.connectionManager.broadcastToRoom(roomId, 'game_cleanup_starting', {
        roomId,
        cleanupDelay: 2000,
        timestamp: Date.now()
      });
      
      // Wait a moment for final messages
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Emit cleanup event
      this.gameEventSystem.queueEvent('game_cleanup', {
        roomId,
        finalResults,
        cleanupTime: Date.now()
      }, {
        priority: 3, // Lower priority
        persistent: false
      });
      
      // Remove from tracking maps
      this.endingGames.delete(roomId);
      this.gameResults.delete(roomId);
      this.pendingCleanups.delete(roomId);
      
      // Update metrics
      this.metrics.cleanupOperations++;
      
      console.log(`✅ Post-game cleanup completed for room ${roomId}`);
      
      // Emit cleanup complete event
      this.emit('cleanup_complete', {
        roomId,
        finalResults,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error(`❌ Error during cleanup for room ${roomId}:`, error);
      throw error;
    }
  }
  
  /**
   * Handle player disconnection during game
   */
  async handlePlayerDisconnect(playerId, roomId, gameState) {
    if (!gameState || gameState.status === 'finished') {
      return { success: false, reason: 'Game not active' };
    }
    
    console.log(`🔌 Handling player disconnect: ${playerId} from room ${roomId}`);
    
    // Find the player
    const player = gameState.players.find(p => p.id === playerId);
    if (player) {
      player.connected = false;
      player.disconnectTime = Date.now();
    }
    
    // Check if we should end the game due to disconnect
    const connectedPlayers = gameState.players.filter(p => p.connected !== false);
    
    if (connectedPlayers.length < 2) {
      // End game due to disconnection
      console.log(`🏁 Ending game ${roomId} due to player disconnection`);
      
      return await this.handleGameEnd(roomId, gameState, 'disconnect');
    }
    
    // Game continues - just mark player as disconnected
    this.connectionManager.broadcastToRoom(roomId, 'player_disconnected', {
      playerId,
      playerName: player?.username || 'Unknown',
      remainingPlayers: connectedPlayers.length,
      timestamp: Date.now()
    });
    
    return { success: true, reason: 'Game continues with remaining players' };
  }
  
  /**
   * Handle forced game end (admin or system)
   */
  async handleForcedGameEnd(roomId, gameState, reason = 'forced', adminId = null) {
    console.log(`⚠️ Forced game end for room ${roomId}, reason: ${reason}`);
    
    // Add forced end info to game state
    gameState.forcedEnd = {
      reason,
      adminId,
      timestamp: Date.now()
    };
    
    return await this.handleGameEnd(roomId, gameState, reason);
  }
  
  /**
   * Update game metrics
   */
  updateGameMetrics(finalResults) {
    const duration = finalResults.duration;
    
    // Update averages
    const totalGames = this.metrics.gamesEnded + 1;
    this.metrics.averageGameDuration = 
      ((this.metrics.averageGameDuration * this.metrics.gamesEnded) + duration) / totalGames;
    
    // Update extremes
    this.metrics.longestGame = Math.max(this.metrics.longestGame, duration);
    this.metrics.shortestGame = Math.min(this.metrics.shortestGame, duration);
  }
  
  /**
   * Get game end statistics
   */
  getStats() {
    const uptime = Date.now() - this.metrics.startTime;
    
    return {
      ...this.metrics,
      uptime,
      endingGames: this.endingGames.size,
      pendingCleanups: this.pendingCleanups.size,
      averageGameDurationMinutes: Math.round(this.metrics.averageGameDuration / 60000 * 10) / 10,
      longestGameMinutes: Math.round(this.metrics.longestGame / 60000 * 10) / 10,
      shortestGameMinutes: Math.round(this.metrics.shortestGame / 60000 * 10) / 10,
      persistenceSuccessRate: this.metrics.gamesEnded > 0 ? 
        ((this.metrics.resultsPersisted / this.metrics.gamesEnded) * 100).toFixed(1) + '%' : '0%',
      gamesPerHour: uptime > 0 ? 
        Math.round((this.metrics.gamesEnded / (uptime / 3600000)) * 10) / 10 : 0
    };
  }
  
  /**
   * Get active game end processes
   */
  getActiveEndProcesses() {
    const processes = [];
    for (const [roomId, info] of this.endingGames) {
      processes.push({
        roomId,
        phase: info.phase,
        reason: info.reason,
        elapsed: Date.now() - info.startTime
      });
    }
    return processes;
  }
  
  /**
   * Shutdown and cleanup
   */
  shutdown() {
    console.log('🏁 Game End Events shutting down...');
    
    // Clear all pending timeouts
    for (const timeout of this.pendingCleanups.values()) {
      clearTimeout(timeout);
    }
    
    // Clear tracking data
    this.endingGames.clear();
    this.gameResults.clear();
    this.pendingCleanups.clear();
    
    console.log('✅ Game End Events shutdown complete');
  }
}

module.exports = GameEndEvents;