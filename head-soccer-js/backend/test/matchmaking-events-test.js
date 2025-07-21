/**
 * Matchmaking Events Test - Test all matchmaking functionality
 */

const MatchmakingEvents = require('../websocket/matchmakingEvents');
const Matchmaker = require('../modules/Matchmaker');
const GameEventSystem = require('../websocket/gameEventSystem');
const Player = require('../modules/Player');

class MatchmakingEventsTest {
  constructor() {
    this.testResults = {
      total: 0,
      passed: 0,
      failed: 0,
      errors: []
    };
    
    // Create mock connection manager
    this.mockConnectionManager = this.createMockConnectionManager();
    
    // Create test instances
    this.matchmaker = new Matchmaker();
    this.gameEventSystem = new GameEventSystem(this.mockConnectionManager);
    this.matchmakingEvents = new MatchmakingEvents(
      this.mockConnectionManager, 
      this.matchmaker, 
      this.gameEventSystem
    );
  }
  
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
        }
        
        const conn = connections.get(socketId);
        if (conn) {
          conn.roomId = null;
        }
      }
    };
  }
  
  createMockPlayer(playerId, username) {
    const mockSocket = {
      id: `socket-${playerId}`,
      emit: (event, data) => {
        console.log(`🔌 Socket ${playerId} emitting ${event}:`, data);
      }
    };
    
    const mockPlayer = new Player(`socket-${playerId}`, playerId, username, {
      eloRating: 1200
    });
    
    const connection = {
      socketId: `socket-${playerId}`,
      playerId: playerId,
      socket: mockSocket,
      player: mockPlayer,
      isAuthenticated: true,
      roomId: null
    };
    
    this.mockConnectionManager.connections.set(`socket-${playerId}`, connection);
    
    return { player: mockPlayer, connection: connection, socket: mockSocket };
  }
  
  async runAllTests() {
    console.log('🎯 Starting Matchmaking Events Testing');
    console.log('=' .repeat(50));
    
    try {
      await this.testQueueJoinLeave();
      await this.testMatchFound();
      await this.testReadyUpSystem();
      await this.testRoomAssignment();
      await this.testErrorHandling();
      await this.testCleanup();
      
    } catch (error) {
      console.error('❌ Critical test failure:', error);
      this.testResults.errors.push({
        test: 'Critical Failure',
        error: error.message
      });
    }
    
    this.generateReport();
  }
  
  async testQueueJoinLeave() {
    console.log('\\n🧪 Testing Queue Join/Leave...');
    
    const { player } = this.createMockPlayer('player1', 'TestPlayer1');
    
    // Test queue join
    const joinResult = await this.matchmakingEvents.handleJoinQueue(
      'player1', 
      'casual', 
      { region: 'US' }
    );
    
    console.log('Join result:', joinResult);
    this.assert(joinResult.success === true, 'Player should join queue successfully');
    this.assert(typeof joinResult.queueId === 'string', 'Should return queue ID');
    this.testResults.passed++;
    console.log('  ✅ Queue join successful');
    
    // Test duplicate join
    const duplicateResult = await this.matchmakingEvents.handleJoinQueue(
      'player1', 
      'casual'
    );
    
    this.assert(duplicateResult.success === false, 'Duplicate join should fail');
    this.assert(duplicateResult.code === 'ALREADY_QUEUED', 'Should return correct error code');
    this.testResults.passed++;
    console.log('  ✅ Duplicate join correctly rejected');
    
    // Test queue leave
    const leaveResult = await this.matchmakingEvents.handleLeaveQueue(
      'player1', 
      'player_request'
    );
    
    this.assert(leaveResult.success === true, 'Player should leave queue successfully');
    this.assert(typeof leaveResult.queueTime === 'number', 'Should return queue time');
    this.testResults.passed++;
    console.log('  ✅ Queue leave successful');
  }
  
  async testMatchFound() {
    console.log('\\n🧪 Testing Match Found System...');
    
    const { player: player1 } = this.createMockPlayer('player1', 'TestPlayer1');
    const { player: player2 } = this.createMockPlayer('player2', 'TestPlayer2');
    
    // Add both players to queue
    await this.matchmakingEvents.handleJoinQueue('player1', 'casual');
    await this.matchmakingEvents.handleJoinQueue('player2', 'casual');
    
    // Simulate match found
    const matchData = {
      players: [player1, player2],
      gameMode: 'casual',
      roomId: 'test-room-1'
    };
    
    const matchResult = await this.matchmakingEvents.handleMatchFound(matchData);
    
    this.assert(matchResult.success === true, 'Match should be created successfully');
    this.assert(matchResult.players === 2, 'Should have 2 players');
    this.testResults.passed++;
    console.log('  ✅ Match found system working');
    
    // Check that players are no longer in queue
    const stats = this.matchmakingEvents.getStats();
    this.assert(stats.queuedPlayers === 0, 'Players should be removed from queue');
    this.assert(stats.pendingMatches === 1, 'Should have 1 pending match');
    this.testResults.passed++;
    console.log('  ✅ Players correctly moved from queue to match');
  }
  
  async testReadyUpSystem() {
    console.log('\\n🧪 Testing Ready-Up System...');
    
    // Create a match first
    const { player: player1 } = this.createMockPlayer('player3', 'TestPlayer3');
    const { player: player2 } = this.createMockPlayer('player4', 'TestPlayer4');
    
    const matchData = {
      players: [player1, player2],
      gameMode: 'casual',
      roomId: 'test-room-2'
    };
    
    const matchResult = await this.matchmakingEvents.handleMatchFound(matchData);
    this.assert(matchResult.success === true, 'Match should be created');
    
    // Test first player ready up
    const ready1Result = await this.matchmakingEvents.handlePlayerReady('player3', true);
    
    this.assert(ready1Result.success === true, 'Player 3 should ready up successfully');
    this.assert(ready1Result.ready === true, 'Ready state should be true');
    this.assert(ready1Result.allReady === false, 'Not all players should be ready yet');
    this.testResults.passed++;
    console.log('  ✅ First player ready-up working');
    
    // Test second player ready up
    const ready2Result = await this.matchmakingEvents.handlePlayerReady('player4', true);
    
    this.assert(ready2Result.success === true, 'Player 4 should ready up successfully');
    this.assert(ready2Result.allReady === true, 'All players should now be ready');
    this.testResults.passed++;
    console.log('  ✅ All players ready - match should start');
    
    // Give some time for match to start
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const stats = this.matchmakingEvents.getStats();
    this.assert(stats.successfulMatches >= 1, 'Should have at least 1 successful match');
    this.testResults.passed++;
    console.log('  ✅ Match started successfully');
  }
  
  async testRoomAssignment() {
    console.log('\\n🧪 Testing Room Assignment...');
    
    const { player } = this.createMockPlayer('player5', 'TestPlayer5');
    
    // Test room assignment
    const assignResult = await this.matchmakingEvents.assignPlayerToRoom(
      'player5', 
      'test-room-3', 
      'test-match-1'
    );
    
    this.assert(assignResult.success === true, 'Room assignment should succeed');
    this.assert(assignResult.roomId === 'test-room-3', 'Should return correct room ID');
    this.testResults.passed++;
    console.log('  ✅ Room assignment successful');
    
    // Check that player is in room
    const connection = this.mockConnectionManager.getConnectionByPlayerId('player5');
    this.assert(connection.roomId === 'test-room-3', 'Player should be in assigned room');
    this.testResults.passed++;
    console.log('  ✅ Player correctly added to room');
    
    // Test room leave
    const leaveResult = await this.matchmakingEvents.handleLeaveRoom(
      'player5', 
      'test-room-3', 
      'test_leave'
    );
    
    this.assert(leaveResult.success === true, 'Room leave should succeed');
    this.assert(connection.roomId === null, 'Player should be removed from room');
    this.testResults.passed++;
    console.log('  ✅ Room leave successful');
  }
  
  async testErrorHandling() {
    console.log('\\n🧪 Testing Error Handling...');
    
    // Test join queue with invalid game mode
    const invalidModeResult = await this.matchmakingEvents.handleJoinQueue(
      'player6', 
      'invalid_mode'
    );
    
    this.assert(invalidModeResult.success === false, 'Invalid game mode should be rejected');
    this.assert(invalidModeResult.reason.includes('Invalid game mode'), 'Should have correct error message');
    this.testResults.passed++;
    console.log('  ✅ Invalid game mode correctly rejected');
    
    // Test ready up without match
    const noMatchResult = await this.matchmakingEvents.handlePlayerReady('nonexistent_player', true);
    
    this.assert(noMatchResult.success === false, 'Ready up without match should fail');
    this.assert(noMatchResult.code === 'NO_MATCH', 'Should return correct error code');
    this.testResults.passed++;
    console.log('  ✅ Ready up without match correctly rejected');
    
    // Test leave queue when not in queue
    const notQueuedResult = await this.matchmakingEvents.handleLeaveQueue('not_queued_player');
    
    this.assert(notQueuedResult.success === false, 'Leave queue when not queued should fail');
    this.assert(notQueuedResult.code === 'NOT_QUEUED', 'Should return correct error code');
    this.testResults.passed++;
    console.log('  ✅ Leave queue when not queued correctly rejected');
  }
  
  async testCleanup() {
    console.log('\\n🧪 Testing Cleanup and Stats...');
    
    // Test stats retrieval
    const stats = this.matchmakingEvents.getStats();
    
    this.assert(typeof stats.totalMatches === 'number', 'Should return total matches');
    this.assert(typeof stats.successfulMatches === 'number', 'Should return successful matches');
    this.assert(typeof stats.uptime === 'number', 'Should return uptime');
    this.assert(typeof stats.successRate === 'number', 'Should return success rate');
    this.testResults.passed++;
    console.log('  ✅ Stats retrieval working');
    
    console.log('📊 Current Stats:', {
      totalMatches: stats.totalMatches,
      successfulMatches: stats.successfulMatches,
      queuedPlayers: stats.queuedPlayers,
      pendingMatches: stats.pendingMatches,
      successRate: stats.successRate.toFixed(1) + '%'
    });
    
    // Test shutdown
    this.matchmakingEvents.shutdown();
    this.gameEventSystem.shutdown();
    
    this.testResults.passed++;
    console.log('  ✅ Shutdown completed successfully');
  }
  
  assert(condition, message) {
    this.testResults.total++;
    
    if (!condition) {
      this.testResults.failed++;
      this.testResults.errors.push({
        test: message,
        error: 'Assertion failed'
      });
      throw new Error(message);
    }
  }
  
  generateReport() {
    console.log('\\n' + '='.repeat(50));
    console.log('🎯 MATCHMAKING EVENTS TEST REPORT');
    console.log('='.repeat(50));
    
    console.log(`\\n📊 TEST SUMMARY:`);
    console.log(`   Total Tests: ${this.testResults.total}`);
    console.log(`   Passed: ${this.testResults.passed} ✅`);
    console.log(`   Failed: ${this.testResults.failed} ❌`);
    console.log(`   Success Rate: ${((this.testResults.passed / this.testResults.total) * 100).toFixed(1)}%`);
    
    if (this.testResults.errors.length > 0) {
      console.log(`\\n❌ ERRORS:`);
      this.testResults.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.test}: ${error.error}`);
      });
    }
    
    const status = this.testResults.failed === 0 ? '🟢 ALL TESTS PASSED' : '🔴 SOME TESTS FAILED';
    console.log(`\\n${status}`);
    console.log('='.repeat(50));
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new MatchmakingEventsTest();
  
  tester.runAllTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test suite crashed:', error);
      process.exit(1);
    });
}

module.exports = MatchmakingEventsTest;