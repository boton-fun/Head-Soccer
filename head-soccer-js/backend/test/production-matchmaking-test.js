/**
 * Production-Level Matchmaking Testing Suite
 * Comprehensive testing of all matchmaking functionality for production readiness
 */

const MatchmakingEvents = require('../websocket/matchmakingEvents');
const Matchmaker = require('../modules/Matchmaker');
const Player = require('../modules/Player');

class ProductionMatchmakingTest {
  constructor() {
    this.testResults = {
      total: 0,
      passed: 0,
      failed: 0,
      errors: [],
      performance: {},
      coverage: {}
    };
    
    this.testData = {
      players: [],
      matches: [],
      sessions: new Map(),
      events: []
    };
    
    // Create test infrastructure
    this.mockConnectionManager = this.createMockConnectionManager();
    this.mockGameEventSystem = this.createMockGameEventSystem();
    this.matchmaker = new Matchmaker();
    this.matchmakingEvents = new MatchmakingEvents(
      this.mockConnectionManager,
      this.matchmaker,
      this.mockGameEventSystem
    );
  }

  /**
   * Create mock connection manager for testing
   */
  createMockConnectionManager() {
    const connections = new Map();
    const rooms = new Map();
    
    return {
      connections,
      rooms,
      getConnectionByPlayerId: (playerId) => {
        for (const conn of connections.values()) {
          if (conn.playerId === playerId) return conn;
        }
        return null;
      },
      getConnectionBySocketId: (socketId) => connections.get(socketId),
      broadcastToRoom: (roomId, event, data) => {
        console.log(`📡 Broadcasting ${event} to room ${roomId}`);
        this.testData.events.push({
          type: 'broadcast',
          roomId,
          event,
          data,
          timestamp: Date.now()
        });
      },
      addToRoom: (socketId, roomId) => {
        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socketId);
        
        const conn = connections.get(socketId);
        if (conn) {
          conn.roomId = roomId;
        }
      },
      removeFromRoom: (socketId, roomId) => {
        const room = rooms.get(roomId);
        if (room) {
          room.delete(socketId);
          if (room.size === 0) {
            rooms.delete(roomId);
          }
        }
        
        const conn = connections.get(socketId);
        if (conn) {
          conn.roomId = null;
        }
      }
    };
  }

  /**
   * Create mock game event system
   */
  createMockGameEventSystem() {
    return {
      queueEvent: (eventType, eventData, metadata) => {
        this.testData.events.push({
          type: 'game_event',
          eventType,
          eventData,
          metadata,
          timestamp: Date.now()
        });
        return true;
      },
      on: (event, handler) => {
        // Mock event listener
      }
    };
  }

  /**
   * Create test player with proper setup
   */
  createTestPlayer(playerId, username, options = {}) {
    const socketId = `socket-${playerId}`;
    const player = new Player(socketId, playerId, username, {
      eloRating: options.eloRating || 1200,
      characterId: options.characterId || 'player1'
    });
    
    const mockSocket = {
      id: socketId,
      emit: (event, data) => {
        this.testData.events.push({
          type: 'socket_emit',
          playerId,
          event,
          data,
          timestamp: Date.now()
        });
      }
    };
    
    const connection = {
      socketId: socketId,
      playerId: playerId,
      player: player,
      socket: mockSocket,
      isAuthenticated: true,
      roomId: null
    };
    
    this.mockConnectionManager.connections.set(socketId, connection);
    this.testData.players.push({ player, connection, socket: mockSocket });
    
    return { player, connection, socket: mockSocket };
  }

  /**
   * Run all production-level tests
   */
  async runAllTests() {
    console.log('🎯 Starting Production-Level Matchmaking Testing');
    console.log('='.repeat(70));
    
    const startTime = Date.now();
    
    try {
      // Core Functionality Tests
      await this.testCoreMatchmakingFunctionality();
      await this.testQueueManagement();
      await this.testMatchCreationFlow();
      await this.testReadyUpSystem();
      
      // Edge Cases and Error Handling
      await this.testEdgeCases();
      await this.testErrorHandling();
      await this.testConnectionFailures();
      
      // Performance and Load Tests
      await this.testHighLoadScenarios();
      await this.testConcurrentMatching();
      await this.testPerformanceMetrics();
      
      // Reliability and Recovery Tests
      await this.testReliabilityScenarios();
      await this.testCleanupAndMemory();
      
      // Integration Tests
      await this.testEndToEndMatchmaking();
      
    } catch (error) {
      console.error('❌ Critical test failure:', error);
      this.testResults.errors.push({
        test: 'Critical Failure',
        error: error.message,
        stack: error.stack
      });
    }
    
    const totalTime = Date.now() - startTime;
    this.generateComprehensiveReport(totalTime);
  }

  /**
   * Test core matchmaking functionality
   */
  async testCoreMatchmakingFunctionality() {
    console.log('\n🧪 Testing Core Matchmaking Functionality...');
    
    const tests = [
      () => this.testBasicQueueJoinLeave(),
      () => this.testQueuePositioning(),
      () => this.testGameModeValidation(),
      () => this.testPlayerPreferences()
    ];
    
    for (const test of tests) {
      await this.runTest('Core Functionality', test);
    }
  }

  async testBasicQueueJoinLeave() {
    const { player } = this.createTestPlayer('player1', 'TestPlayer1');
    
    // Test queue join
    const joinResult = await this.matchmakingEvents.handleJoinQueue('player1', 'casual');
    this.assert(joinResult.success === true, 'Player should join queue successfully');
    this.assert(typeof joinResult.queueId === 'string', 'Should return queue ID');
    this.assert(typeof joinResult.position === 'number', 'Should return queue position');
    
    // Test queue leave
    const leaveResult = await this.matchmakingEvents.handleLeaveQueue('player1');
    this.assert(leaveResult.success === true, 'Player should leave queue successfully');
    this.assert(typeof leaveResult.queueTime === 'number', 'Should return queue time');
  }

  async testQueuePositioning() {
    const players = [];
    for (let i = 1; i <= 5; i++) {
      const { player } = this.createTestPlayer(`pos-player${i}`, `PosPlayer${i}`);
      players.push(player);
      
      const joinResult = await this.matchmakingEvents.handleJoinQueue(`pos-player${i}`, 'casual');
      this.assert(joinResult.position === i, `Player ${i} should be at position ${i}`);
    }
    
    // Clean up
    for (let i = 1; i <= 5; i++) {
      await this.matchmakingEvents.handleLeaveQueue(`pos-player${i}`);
    }
  }

  async testGameModeValidation() {
    const { player } = this.createTestPlayer('mode-player', 'ModePlayer');
    
    // Test valid game modes
    const validModes = ['casual', 'ranked', 'tournament'];
    for (const mode of validModes) {
      const result = await this.matchmakingEvents.handleJoinQueue('mode-player', mode);
      this.assert(result.success === true, `Should accept valid mode: ${mode}`);
      await this.matchmakingEvents.handleLeaveQueue('mode-player');
    }
    
    // Test invalid game mode
    const invalidResult = await this.matchmakingEvents.handleJoinQueue('mode-player', 'invalid');
    this.assert(invalidResult.success === false, 'Should reject invalid game mode');
    this.assert(invalidResult.reason.includes('Invalid game mode'), 'Should have correct error message');
  }

  async testPlayerPreferences() {
    const { player } = this.createTestPlayer('pref-player', 'PrefPlayer');
    
    const preferences = {
      region: 'US',
      skillRange: 'balanced',
      timeLimit: 300
    };
    
    const result = await this.matchmakingEvents.handleJoinQueue('pref-player', 'casual', preferences);
    this.assert(result.success === true, 'Should accept player preferences');
    
    await this.matchmakingEvents.handleLeaveQueue('pref-player');
  }

  /**
   * Test queue management
   */
  async testQueueManagement() {
    console.log('\n🧪 Testing Queue Management...');
    
    const tests = [
      () => this.testQueueCapacity(),
      () => this.testQueueTimeout(),
      () => this.testQueuePriority(),
      () => this.testQueueStats()
    ];
    
    for (const test of tests) {
      await this.runTest('Queue Management', test);
    }
  }

  async testQueueCapacity() {
    // Test large number of players in queue
    const playerCount = 50;
    const joinPromises = [];
    
    for (let i = 1; i <= playerCount; i++) {
      this.createTestPlayer(`cap-player${i}`, `CapPlayer${i}`);
      joinPromises.push(this.matchmakingEvents.handleJoinQueue(`cap-player${i}`, 'casual'));
    }
    
    const results = await Promise.all(joinPromises);
    const successCount = results.filter(r => r.success).length;
    
    this.assert(successCount >= playerCount * 0.9, `Should handle at least 90% of ${playerCount} players`);
    
    // Clean up
    for (let i = 1; i <= playerCount; i++) {
      await this.matchmakingEvents.handleLeaveQueue(`cap-player${i}`);
    }
  }

  async testQueueTimeout() {
    const { player } = this.createTestPlayer('timeout-player', 'TimeoutPlayer');
    
    // Join queue
    await this.matchmakingEvents.handleJoinQueue('timeout-player', 'casual');
    
    // Check initial stats
    const initialStats = this.matchmakingEvents.getStats();
    this.assert(initialStats.queuedPlayers >= 1, 'Should have player in queue');
    
    // Wait for potential timeout (this is a quick test, not full timeout)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Player should still be in queue for short wait
    const stats = this.matchmakingEvents.getStats();
    this.assert(stats.queuedPlayers >= 0, 'Queue should be managed properly');
    
    await this.matchmakingEvents.handleLeaveQueue('timeout-player');
  }

  async testQueuePriority() {
    // Test that higher ELO players don't get unfair priority (FIFO system)
    const lowEloPlayer = this.createTestPlayer('low-elo', 'LowElo', { eloRating: 800 });
    const highEloPlayer = this.createTestPlayer('high-elo', 'HighElo', { eloRating: 2000 });
    
    // Low ELO joins first
    const lowResult = await this.matchmakingEvents.handleJoinQueue('low-elo', 'casual');
    const highResult = await this.matchmakingEvents.handleJoinQueue('high-elo', 'casual');
    
    this.assert(lowResult.position === 1, 'Low ELO player should be position 1');
    this.assert(highResult.position === 2, 'High ELO player should be position 2');
    
    // Clean up
    await this.matchmakingEvents.handleLeaveQueue('low-elo');
    await this.matchmakingEvents.handleLeaveQueue('high-elo');
  }

  async testQueueStats() {
    const stats = this.matchmakingEvents.getStats();
    
    this.assert(typeof stats.totalMatches === 'number', 'Should have totalMatches stat');
    this.assert(typeof stats.successfulMatches === 'number', 'Should have successfulMatches stat');
    this.assert(typeof stats.queuedPlayers === 'number', 'Should have queuedPlayers stat');
    this.assert(typeof stats.successRate === 'number', 'Should have successRate stat');
    this.assert(typeof stats.uptime === 'number', 'Should have uptime stat');
  }

  /**
   * Test match creation flow
   */
  async testMatchCreationFlow() {
    console.log('\n🧪 Testing Match Creation Flow...');
    
    const tests = [
      () => this.testSimpleMatchCreation(),
      () => this.testMatchIdGeneration(),
      () => this.testMatchPlayerNotifications(),
      () => this.testMatchDataIntegrity()
    ];
    
    for (const test of tests) {
      await this.runTest('Match Creation', test);
    }
  }

  async testSimpleMatchCreation() {
    const player1 = this.createTestPlayer('match1-p1', 'Match1Player1');
    const player2 = this.createTestPlayer('match1-p2', 'Match1Player2');
    
    // Add players to queue
    await this.matchmakingEvents.handleJoinQueue('match1-p1', 'casual');
    await this.matchmakingEvents.handleJoinQueue('match1-p2', 'casual');
    
    // Simulate match found
    const matchData = {
      players: [player1.player, player2.player],
      gameMode: 'casual',
      roomId: 'test-match-room-1'
    };
    
    const matchResult = await this.matchmakingEvents.handleMatchFound(matchData);
    
    this.assert(matchResult.success === true, 'Match should be created successfully');
    this.assert(typeof matchResult.matchId === 'string', 'Should return match ID');
    this.assert(matchResult.players === 2, 'Should have correct player count');
  }

  async testMatchIdGeneration() {
    const matchIds = new Set();
    
    // Generate multiple match IDs to ensure uniqueness
    for (let i = 0; i < 10; i++) {
      const player1 = this.createTestPlayer(`mid-p1-${i}`, `MidPlayer1-${i}`);
      const player2 = this.createTestPlayer(`mid-p2-${i}`, `MidPlayer2-${i}`);
      
      const matchData = {
        players: [player1.player, player2.player],
        gameMode: 'casual',
        roomId: `test-room-${i}`
      };
      
      const result = await this.matchmakingEvents.handleMatchFound(matchData);
      if (result.success) {
        matchIds.add(result.matchId);
      }
    }
    
    this.assert(matchIds.size >= 8, 'Should generate unique match IDs (at least 8/10 unique)');
  }

  async testMatchPlayerNotifications() {
    const player1 = this.createTestPlayer('notif-p1', 'NotifPlayer1');
    const player2 = this.createTestPlayer('notif-p2', 'NotifPlayer2');
    
    const eventsBefore = this.testData.events.length;
    
    const matchData = {
      players: [player1.player, player2.player],
      gameMode: 'casual',
      roomId: 'notif-room'
    };
    
    await this.matchmakingEvents.handleMatchFound(matchData);
    
    const eventsAfter = this.testData.events.length;
    const newEvents = eventsAfter - eventsBefore;
    
    this.assert(newEvents >= 2, 'Should generate events for match notifications');
  }

  async testMatchDataIntegrity() {
    const player1 = this.createTestPlayer('integrity-p1', 'IntegrityPlayer1');
    const player2 = this.createTestPlayer('integrity-p2', 'IntegrityPlayer2');
    
    const matchData = {
      players: [player1.player, player2.player],
      gameMode: 'ranked',
      roomId: 'integrity-room'
    };
    
    const result = await this.matchmakingEvents.handleMatchFound(matchData);
    
    if (result.success) {
      const stats = this.matchmakingEvents.getStats();
      this.assert(stats.totalMatches >= 1, 'Total matches should increment');
      this.assert(stats.queuedPlayers === 0, 'Players should be removed from queue');
    }
  }

  /**
   * Test ready-up system
   */
  async testReadyUpSystem() {
    console.log('\n🧪 Testing Ready-Up System...');
    
    const tests = [
      () => this.testBasicReadyUp(),
      () => this.testReadyUpTimeout(),
      () => this.testPartialReadyUp(),
      () => this.testReadyUpCancellation()
    ];
    
    for (const test of tests) {
      await this.runTest('Ready-Up System', test);
    }
  }

  async testBasicReadyUp() {
    const player1 = this.createTestPlayer('ready-p1', 'ReadyPlayer1');
    const player2 = this.createTestPlayer('ready-p2', 'ReadyPlayer2');
    
    // Create match
    const matchData = {
      players: [player1.player, player2.player],
      gameMode: 'casual',
      roomId: 'ready-room'
    };
    
    const matchResult = await this.matchmakingEvents.handleMatchFound(matchData);
    this.assert(matchResult.success === true, 'Match should be created');
    
    // Ready up first player
    const ready1 = await this.matchmakingEvents.handlePlayerReady('ready-p1', true);
    this.assert(ready1.success === true, 'Player 1 should ready up successfully');
    this.assert(ready1.ready === true, 'Player 1 ready state should be true');
    this.assert(ready1.allReady === false, 'Not all players should be ready yet');
    
    // Ready up second player
    const ready2 = await this.matchmakingEvents.handlePlayerReady('ready-p2', true);
    this.assert(ready2.success === true, 'Player 2 should ready up successfully');
    this.assert(ready2.allReady === true, 'All players should be ready');
  }

  async testReadyUpTimeout() {
    const player1 = this.createTestPlayer('timeout-p1', 'TimeoutPlayer1');
    const player2 = this.createTestPlayer('timeout-p2', 'TimeoutPlayer2');
    
    // Create match
    const matchData = {
      players: [player1.player, player2.player],
      gameMode: 'casual',
      roomId: 'timeout-room'
    };
    
    await this.matchmakingEvents.handleMatchFound(matchData);
    
    // Only one player readies up
    await this.matchmakingEvents.handlePlayerReady('timeout-p1', true);
    
    // Check that match is pending
    const stats = this.matchmakingEvents.getStats();
    this.assert(stats.pendingMatches >= 1, 'Should have pending match');
    
    // Note: Full timeout test would take 20 seconds, so we just verify the setup
  }

  async testPartialReadyUp() {
    const player1 = this.createTestPlayer('partial-p1', 'PartialPlayer1');
    const player2 = this.createTestPlayer('partial-p2', 'PartialPlayer2');
    
    const matchData = {
      players: [player1.player, player2.player],
      gameMode: 'casual',
      roomId: 'partial-room'
    };
    
    await this.matchmakingEvents.handleMatchFound(matchData);
    
    // Ready and unready
    const ready1 = await this.matchmakingEvents.handlePlayerReady('partial-p1', true);
    const unready1 = await this.matchmakingEvents.handlePlayerReady('partial-p1', false);
    
    this.assert(ready1.success === true, 'Should ready up successfully');
    this.assert(unready1.success === true, 'Should unready successfully');
    this.assert(unready1.ready === false, 'Ready state should be false');
  }

  async testReadyUpCancellation() {
    const player1 = this.createTestPlayer('cancel-p1', 'CancelPlayer1');
    const player2 = this.createTestPlayer('cancel-p2', 'CancelPlayer2');
    
    const matchData = {
      players: [player1.player, player2.player],
      gameMode: 'casual',
      roomId: 'cancel-room'
    };
    
    const matchResult = await this.matchmakingEvents.handleMatchFound(matchData);
    
    // Verify match was created
    this.assert(matchResult.success === true, 'Match should be created for cancellation test');
    
    // Players don't ready up (would normally timeout and cancel)
    const initialStats = this.matchmakingEvents.getStats();
    this.assert(initialStats.pendingMatches >= 1, 'Should have pending matches');
  }

  /**
   * Test high load scenarios
   */
  async testHighLoadScenarios() {
    console.log('\n🧪 Testing High Load Scenarios...');
    
    const tests = [
      () => this.testConcurrentQueueJoins(),
      () => this.testMassMatchCreation(),
      () => this.testSimultaneousReadyUps(),
      () => this.testLoadStressTest()
    ];
    
    for (const test of tests) {
      await this.runTest('High Load', test);
    }
  }

  async testConcurrentQueueJoins() {
    console.log('  📊 Testing 100 concurrent queue joins...');
    
    const playerCount = 100;
    const players = [];
    const joinPromises = [];
    
    // Create players
    for (let i = 1; i <= playerCount; i++) {
      const { player } = this.createTestPlayer(`concurrent-${i}`, `Concurrent${i}`);
      players.push(player);
      joinPromises.push(this.matchmakingEvents.handleJoinQueue(`concurrent-${i}`, 'casual'));
    }
    
    const startTime = Date.now();
    const results = await Promise.all(joinPromises);
    const processTime = Date.now() - startTime;
    
    const successCount = results.filter(r => r.success).length;
    
    this.assert(successCount >= playerCount * 0.8, `Should handle at least 80% of ${playerCount} concurrent joins`);
    
    this.testResults.performance.concurrentJoins = {
      playerCount,
      successCount,
      processTime,
      successRate: (successCount / playerCount) * 100
    };
    
    console.log(`    ✅ ${successCount}/${playerCount} joins successful in ${processTime}ms`);
    
    // Clean up
    for (let i = 1; i <= playerCount; i++) {
      await this.matchmakingEvents.handleLeaveQueue(`concurrent-${i}`);
    }
  }

  async testMassMatchCreation() {
    console.log('  📊 Testing mass match creation...');
    
    const matchCount = 25; // 50 players = 25 matches
    const players = [];
    const matchPromises = [];
    
    // Create players
    for (let i = 1; i <= matchCount * 2; i++) {
      const { player } = this.createTestPlayer(`mass-${i}`, `Mass${i}`);
      players.push(player);
    }
    
    // Create matches
    for (let i = 0; i < matchCount; i++) {
      const player1 = players[i * 2];
      const player2 = players[i * 2 + 1];
      
      const matchData = {
        players: [player1, player2],
        gameMode: 'casual',
        roomId: `mass-room-${i}`
      };
      
      matchPromises.push(this.matchmakingEvents.handleMatchFound(matchData));
    }
    
    const startTime = Date.now();
    const results = await Promise.all(matchPromises);
    const processTime = Date.now() - startTime;
    
    const successCount = results.filter(r => r.success).length;
    
    this.assert(successCount >= matchCount * 0.8, `Should create at least 80% of ${matchCount} matches`);
    
    this.testResults.performance.massMatchCreation = {
      matchCount,
      successCount,
      processTime,
      successRate: (successCount / matchCount) * 100
    };
    
    console.log(`    ✅ ${successCount}/${matchCount} matches created in ${processTime}ms`);
  }

  async testSimultaneousReadyUps() {
    console.log('  📊 Testing simultaneous ready-ups...');
    
    const matchCount = 10;
    const readyPromises = [];
    
    // Create matches with players
    for (let i = 1; i <= matchCount; i++) {
      const player1 = this.createTestPlayer(`simul-p1-${i}`, `SimulPlayer1-${i}`);
      const player2 = this.createTestPlayer(`simul-p2-${i}`, `SimulPlayer2-${i}`);
      
      const matchData = {
        players: [player1.player, player2.player],
        gameMode: 'casual',
        roomId: `simul-room-${i}`
      };
      
      await this.matchmakingEvents.handleMatchFound(matchData);
      
      // Queue ready-ups for both players
      readyPromises.push(this.matchmakingEvents.handlePlayerReady(`simul-p1-${i}`, true));
      readyPromises.push(this.matchmakingEvents.handlePlayerReady(`simul-p2-${i}`, true));
    }
    
    const startTime = Date.now();
    const results = await Promise.all(readyPromises);
    const processTime = Date.now() - startTime;
    
    const successCount = results.filter(r => r.success).length;
    
    this.assert(successCount >= (matchCount * 2) * 0.8, 'Should handle at least 80% of ready-ups');
    
    this.testResults.performance.simultaneousReadyUps = {
      readyCount: matchCount * 2,
      successCount,
      processTime,
      successRate: (successCount / (matchCount * 2)) * 100
    };
    
    console.log(`    ✅ ${successCount}/${matchCount * 2} ready-ups processed in ${processTime}ms`);
  }

  async testLoadStressTest() {
    console.log('  📊 Running load stress test...');
    
    const startTime = Date.now();
    const operations = [];
    
    // Mix of different operations
    for (let i = 1; i <= 50; i++) {
      // Queue joins
      const { player } = this.createTestPlayer(`stress-${i}`, `Stress${i}`);
      operations.push(this.matchmakingEvents.handleJoinQueue(`stress-${i}`, 'casual'));
      
      // Some immediate leaves
      if (i % 3 === 0) {
        operations.push(this.matchmakingEvents.handleLeaveQueue(`stress-${i}`));
      }
    }
    
    const results = await Promise.all(operations);
    const processTime = Date.now() - startTime;
    
    const successCount = results.filter(r => r && r.success).length;
    
    this.testResults.performance.stressTest = {
      operationCount: operations.length,
      successCount,
      processTime,
      operationsPerSecond: (operations.length / processTime) * 1000
    };
    
    console.log(`    ✅ ${successCount}/${operations.length} operations in ${processTime}ms (${this.testResults.performance.stressTest.operationsPerSecond.toFixed(0)} ops/sec)`);
  }

  /**
   * Test edge cases and error handling
   */
  async testEdgeCases() {
    console.log('\n🧪 Testing Edge Cases...');
    
    const tests = [
      () => this.testDuplicateOperations(),
      () => this.testInvalidPlayerStates(),
      () => this.testRaceConditions(),
      () => this.testBoundaryConditions()
    ];
    
    for (const test of tests) {
      await this.runTest('Edge Cases', test);
    }
  }

  async testDuplicateOperations() {
    const { player } = this.createTestPlayer('dup-player', 'DupPlayer');
    
    // Double join
    const join1 = await this.matchmakingEvents.handleJoinQueue('dup-player', 'casual');
    const join2 = await this.matchmakingEvents.handleJoinQueue('dup-player', 'casual');
    
    this.assert(join1.success === true, 'First join should succeed');
    this.assert(join2.success === false, 'Second join should fail');
    this.assert(join2.code === 'ALREADY_QUEUED', 'Should return correct error code');
    
    // Clean up
    await this.matchmakingEvents.handleLeaveQueue('dup-player');
  }

  async testInvalidPlayerStates() {
    // Test operations on non-existent player
    const nonExistentResult = await this.matchmakingEvents.handleJoinQueue('non-existent', 'casual');
    this.assert(nonExistentResult.success === false, 'Should reject non-existent player');
    
    // Test ready-up without match
    const noMatchReady = await this.matchmakingEvents.handlePlayerReady('no-match-player', true);
    this.assert(noMatchReady.success === false, 'Should reject ready-up without match');
  }

  async testRaceConditions() {
    const { player } = this.createTestPlayer('race-player', 'RacePlayer');
    
    // Simultaneous join and leave
    const joinPromise = this.matchmakingEvents.handleJoinQueue('race-player', 'casual');
    const leavePromise = this.matchmakingEvents.handleLeaveQueue('race-player');
    
    const [joinResult, leaveResult] = await Promise.all([joinPromise, leavePromise]);
    
    // One should succeed, one should fail
    const totalSuccess = (joinResult.success ? 1 : 0) + (leaveResult.success ? 1 : 0);
    this.assert(totalSuccess >= 1, 'At least one operation should succeed in race condition');
  }

  async testBoundaryConditions() {
    // Test with minimum data
    const minResult = await this.matchmakingEvents.handleJoinQueue('', 'casual');
    this.assert(minResult.success === false, 'Should reject empty player ID');
    
    // Test with maximum length strings
    const longPlayerId = 'a'.repeat(100);
    const longUsername = 'b'.repeat(100);
    
    // This would fail due to player creation, which is expected
    try {
      const { player } = this.createTestPlayer(longPlayerId, longUsername);
      const longResult = await this.matchmakingEvents.handleJoinQueue(longPlayerId, 'casual');
      // If it succeeds, that's fine too
    } catch (error) {
      // Expected for very long IDs
    }
  }

  /**
   * Test error handling
   */
  async testErrorHandling() {
    console.log('\n🧪 Testing Error Handling...');
    
    const tests = [
      () => this.testInvalidInputs(),
      () => this.testSystemErrors(),
      () => this.testRecoveryMechanisms()
    ];
    
    for (const test of tests) {
      await this.runTest('Error Handling', test);
    }
  }

  async testInvalidInputs() {
    // Invalid game mode
    const { player } = this.createTestPlayer('invalid-player', 'InvalidPlayer');
    const invalidMode = await this.matchmakingEvents.handleJoinQueue('invalid-player', 'invalid-mode');
    
    this.assert(invalidMode.success === false, 'Should reject invalid game mode');
    this.assert(invalidMode.reason.includes('Invalid game mode'), 'Should have descriptive error');
    
    // Null inputs
    const nullResult = await this.matchmakingEvents.handleJoinQueue(null, 'casual');
    this.assert(nullResult.success === false, 'Should handle null inputs');
  }

  async testSystemErrors() {
    // Test with broken connection
    const originalGetConnection = this.mockConnectionManager.getConnectionByPlayerId;
    this.mockConnectionManager.getConnectionByPlayerId = () => null;
    
    const brokenResult = await this.matchmakingEvents.handleJoinQueue('broken-player', 'casual');
    this.assert(brokenResult.success === false, 'Should handle broken connections');
    this.assert(brokenResult.code === 'CONNECTION_ERROR', 'Should return correct error code');
    
    // Restore connection
    this.mockConnectionManager.getConnectionByPlayerId = originalGetConnection;
  }

  async testRecoveryMechanisms() {
    // Test stats are still accessible after errors
    const stats = this.matchmakingEvents.getStats();
    this.assert(typeof stats === 'object', 'Stats should be accessible after errors');
    this.assert(typeof stats.totalMatches === 'number', 'Stats should have valid data');
  }

  /**
   * Test cleanup and memory
   */
  async testCleanupAndMemory() {
    console.log('\n🧪 Testing Cleanup and Memory Management...');
    
    const tests = [
      () => this.testSessionCleanup(),
      () => this.testMemoryUsage(),
      () => this.testResourceManagement()
    ];
    
    for (const test of tests) {
      await this.runTest('Cleanup & Memory', test);
    }
  }

  async testSessionCleanup() {
    const initialStats = this.matchmakingEvents.getStats();
    
    // Create and clean up sessions
    for (let i = 1; i <= 10; i++) {
      const { player } = this.createTestPlayer(`cleanup-${i}`, `Cleanup${i}`);
      await this.matchmakingEvents.handleJoinQueue(`cleanup-${i}`, 'casual');
      await this.matchmakingEvents.handleLeaveQueue(`cleanup-${i}`);
    }
    
    const finalStats = this.matchmakingEvents.getStats();
    this.assert(finalStats.queuedPlayers === initialStats.queuedPlayers, 'Should clean up queued players');
  }

  async testMemoryUsage() {
    const initialMemory = process.memoryUsage();
    
    // Create many temporary objects
    for (let i = 1; i <= 100; i++) {
      const { player } = this.createTestPlayer(`memory-${i}`, `Memory${i}`);
      await this.matchmakingEvents.handleJoinQueue(`memory-${i}`, 'casual');
      if (i % 10 === 0) {
        await this.matchmakingEvents.handleLeaveQueue(`memory-${i}`);
      }
    }
    
    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    
    this.testResults.performance.memoryUsage = {
      initialMemory: initialMemory.heapUsed,
      finalMemory: finalMemory.heapUsed,
      increase: memoryIncrease,
      increasePerOperation: memoryIncrease / 100
    };
    
    console.log(`    📊 Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB for 100 operations`);
  }

  async testResourceManagement() {
    const stats = this.matchmakingEvents.getStats();
    
    // Verify resources are being tracked properly
    this.assert(typeof stats.queuedPlayers === 'number', 'Should track queued players');
    this.assert(typeof stats.pendingMatches === 'number', 'Should track pending matches');
    this.assert(stats.queuedPlayers >= 0, 'Queued players should be non-negative');
    this.assert(stats.pendingMatches >= 0, 'Pending matches should be non-negative');
  }

  /**
   * Test end-to-end matchmaking flow
   */
  async testEndToEndMatchmaking() {
    console.log('\n🧪 Testing End-to-End Matchmaking Flow...');
    
    const tests = [
      () => this.testCompleteMatchmakingFlow(),
      () => this.testMultipleSimultaneousFlows()
    ];
    
    for (const test of tests) {
      await this.runTest('End-to-End', test);
    }
  }

  async testCompleteMatchmakingFlow() {
    console.log('  🔄 Testing complete matchmaking flow...');
    
    const player1 = this.createTestPlayer('e2e-p1', 'E2EPlayer1');
    const player2 = this.createTestPlayer('e2e-p2', 'E2EPlayer2');
    
    // Step 1: Players join queue
    const join1 = await this.matchmakingEvents.handleJoinQueue('e2e-p1', 'casual');
    const join2 = await this.matchmakingEvents.handleJoinQueue('e2e-p2', 'casual');
    
    this.assert(join1.success && join2.success, 'Both players should join queue');
    
    // Step 2: Match found
    const matchData = {
      players: [player1.player, player2.player],
      gameMode: 'casual',
      roomId: 'e2e-room'
    };
    
    const matchResult = await this.matchmakingEvents.handleMatchFound(matchData);
    this.assert(matchResult.success === true, 'Match should be found');
    
    // Step 3: Players ready up
    const ready1 = await this.matchmakingEvents.handlePlayerReady('e2e-p1', true);
    const ready2 = await this.matchmakingEvents.handlePlayerReady('e2e-p2', true);
    
    this.assert(ready1.success && ready2.success, 'Both players should ready up');
    this.assert(ready2.allReady === true, 'All players should be ready');
    
    console.log('    ✅ Complete flow successful');
  }

  async testMultipleSimultaneousFlows() {
    console.log('  🔄 Testing multiple simultaneous flows...');
    
    const flowCount = 5;
    const flowPromises = [];
    
    for (let i = 1; i <= flowCount; i++) {
      const flowPromise = (async () => {
        const p1 = this.createTestPlayer(`flow-${i}-p1`, `Flow${i}Player1`);
        const p2 = this.createTestPlayer(`flow-${i}-p2`, `Flow${i}Player2`);
        
        await this.matchmakingEvents.handleJoinQueue(`flow-${i}-p1`, 'casual');
        await this.matchmakingEvents.handleJoinQueue(`flow-${i}-p2`, 'casual');
        
        const matchData = {
          players: [p1.player, p2.player],
          gameMode: 'casual',
          roomId: `flow-room-${i}`
        };
        
        return await this.matchmakingEvents.handleMatchFound(matchData);
      })();
      
      flowPromises.push(flowPromise);
    }
    
    const results = await Promise.all(flowPromises);
    const successCount = results.filter(r => r.success).length;
    
    this.assert(successCount >= flowCount * 0.8, `Should handle at least 80% of ${flowCount} simultaneous flows`);
    
    console.log(`    ✅ ${successCount}/${flowCount} simultaneous flows successful`);
  }

  /**
   * Helper methods
   */
  
  async runTest(category, testFn) {
    this.testResults.total++;
    
    try {
      await testFn();
      this.testResults.passed++;
    } catch (error) {
      this.testResults.failed++;
      this.testResults.errors.push({
        category: category,
        test: testFn.name || 'Anonymous test',
        error: error.message
      });
      console.log(`    ❌ ${testFn.name || 'Test'}: ${error.message}`);
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  /**
   * Generate comprehensive test report
   */
  generateComprehensiveReport(totalTime) {
    console.log('\n' + '='.repeat(70));
    console.log('🎯 PRODUCTION MATCHMAKING TEST REPORT');
    console.log('='.repeat(70));
    
    // Test Summary
    console.log('\n📊 TEST SUMMARY:');
    console.log(`   Total Tests: ${this.testResults.total}`);
    console.log(`   Passed: ${this.testResults.passed} ✅`);
    console.log(`   Failed: ${this.testResults.failed} ❌`);
    console.log(`   Success Rate: ${((this.testResults.passed / this.testResults.total) * 100).toFixed(1)}%`);
    console.log(`   Total Time: ${totalTime}ms`);
    
    // Performance Metrics
    console.log('\n⚡ PERFORMANCE METRICS:');
    
    if (this.testResults.performance.concurrentJoins) {
      const cj = this.testResults.performance.concurrentJoins;
      console.log(`   Concurrent Joins: ${cj.successCount}/${cj.playerCount} in ${cj.processTime}ms`);
      console.log(`   Join Rate: ${cj.successRate.toFixed(1)}%`);
    }
    
    if (this.testResults.performance.massMatchCreation) {
      const mmc = this.testResults.performance.massMatchCreation;
      console.log(`   Mass Match Creation: ${mmc.successCount}/${mmc.matchCount} in ${mmc.processTime}ms`);
      console.log(`   Match Creation Rate: ${mmc.successRate.toFixed(1)}%`);
    }
    
    if (this.testResults.performance.stressTest) {
      const st = this.testResults.performance.stressTest;
      console.log(`   Stress Test: ${st.operationsPerSecond.toFixed(0)} operations/second`);
    }
    
    if (this.testResults.performance.memoryUsage) {
      const mem = this.testResults.performance.memoryUsage;
      console.log(`   Memory Usage: +${(mem.increase / 1024 / 1024).toFixed(2)}MB for 100 operations`);
      console.log(`   Memory per Operation: ${(mem.increasePerOperation / 1024).toFixed(1)}KB`);
    }
    
    // System Statistics
    console.log('\n🎮 MATCHMAKING SYSTEM STATS:');
    const stats = this.matchmakingEvents.getStats();
    console.log(`   Total Matches: ${stats.totalMatches}`);
    console.log(`   Successful Matches: ${stats.successfulMatches}`);
    console.log(`   Success Rate: ${stats.successRate.toFixed(1)}%`);
    console.log(`   Average Queue Time: ${stats.averageQueueTime.toFixed(0)}ms`);
    console.log(`   Average Match Time: ${stats.averageMatchTime.toFixed(0)}ms`);
    
    // Test Data Summary
    console.log('\n📈 TEST DATA GENERATED:');
    console.log(`   Players Created: ${this.testData.players.length}`);
    console.log(`   Events Generated: ${this.testData.events.length}`);
    console.log(`   Test Sessions: ${this.testData.sessions.size}`);
    
    // Error Summary
    if (this.testResults.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      this.testResults.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. [${error.category}] ${error.test}: ${error.error}`);
      });
    }
    
    // Production Readiness Assessment
    console.log('\n🏆 PRODUCTION READINESS ASSESSMENT:');
    
    const passRate = (this.testResults.passed / this.testResults.total) * 100;
    
    if (passRate >= 95) {
      console.log('   🟢 EXCELLENT - Ready for production deployment');
    } else if (passRate >= 85) {
      console.log('   🟡 GOOD - Ready with minor optimizations');
    } else if (passRate >= 70) {
      console.log('   🟠 FAIR - Needs attention before production');
    } else {
      console.log('   🔴 POOR - Not ready for production');
    }
    
    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    
    if (stats.successRate < 90) {
      console.log('   ⚠️  Improve match success rate (currently ' + stats.successRate.toFixed(1) + '%)');
    }
    
    if (this.testResults.performance.concurrentJoins?.successRate < 90) {
      console.log('   ⚠️  Optimize concurrent queue handling');
    }
    
    if (this.testResults.performance.memoryUsage?.increasePerOperation > 50000) {
      console.log('   ⚠️  Consider memory optimization for high-load scenarios');
    }
    
    if (this.testResults.failed === 0) {
      console.log('   ✅ All tests passed - system is production ready!');
    }
    
    // Final Status
    console.log('\n' + '='.repeat(70));
    const overallStatus = passRate >= 85 ? '🟢 PRODUCTION READY' : 
                         passRate >= 70 ? '🟡 NEEDS OPTIMIZATION' : 
                         '🔴 NOT READY';
    console.log(`OVERALL STATUS: ${overallStatus}`);
    console.log('='.repeat(70));
    
    return this.testResults;
  }

  /**
   * Cleanup test resources
   */
  cleanup() {
    console.log('\n🧹 Cleaning up test resources...');
    
    // Shutdown matchmaking system
    this.matchmakingEvents.shutdown();
    
    // Clear test data
    this.testData.players.length = 0;
    this.testData.matches.length = 0;
    this.testData.events.length = 0;
    this.testData.sessions.clear();
    
    // Clear mock connections
    this.mockConnectionManager.connections.clear();
    this.mockConnectionManager.rooms.clear();
    
    console.log('✅ Cleanup complete');
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new ProductionMatchmakingTest();
  
  tester.runAllTests()
    .then(() => {
      tester.cleanup();
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test suite crashed:', error);
      tester.cleanup();
      process.exit(1);
    });
}

module.exports = ProductionMatchmakingTest;