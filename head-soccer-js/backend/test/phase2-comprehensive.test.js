/**
 * Phase 2 Comprehensive Testing Suite
 * Tests all components individually and together
 */

const Player = require('../modules/Player');
const GameRoom = require('../modules/GameRoom');
const GameStateValidator = require('../modules/GameStateValidator');
const Matchmaker = require('../modules/Matchmaker');

function runComprehensiveTests() {
  console.log('\n🧪 Phase 2 Comprehensive Testing Suite\n');
  
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  
  function runSuite(suiteName, tests) {
    console.log(`📋 ${suiteName}`);
    let suiteTests = 0;
    let suitePassed = 0;
    
    tests.forEach(test => {
      try {
        test.fn();
        console.log(`   ✅ ${test.name}`);
        suitePassed++;
      } catch (error) {
        console.log(`   ❌ ${test.name}`);
        console.log(`      Error: ${error.message}`);
        failedTests++;
      }
      suiteTests++;
      totalTests++;
    });
    
    passedTests += suitePassed;
    console.log(`   📊 ${suitePassed}/${suiteTests} passed\n`);
  }
  
  // Test Suite 1: Individual Unit Tests
  runSuite('Unit Test Verification', [
    {
      name: 'Player Class - All unit tests pass',
      fn: () => {
        const player = new Player('test1', 'user1', 'TestPlayer');
        if (player.id && player.username === 'TestPlayer' && player.status === 'IDLE') {
          return true;
        }
        throw new Error('Player creation failed');
      }
    },
    {
      name: 'GameRoom Class - Basic functionality works',
      fn: () => {
        const room = new GameRoom('test-room');
        const player1 = new Player('test1', 'user1', 'Player1');
        const result = room.addPlayer(player1);
        if (result.success && room.players.size === 1) {
          return true;
        }
        throw new Error('GameRoom functionality failed');
      }
    },
    {
      name: 'GameStateValidator - Basic validation works',
      fn: () => {
        const validator = new GameStateValidator();
        const gameState = {
          timestamp: Date.now(),
          players: {},
          ball: { x: 400, y: 200, vx: 0, vy: 0 },
          score: { left: 0, right: 0 }
        };
        const result = validator.validateGameState(gameState);
        if (result.valid) {
          return true;
        }
        throw new Error('GameStateValidator failed');
      }
    },
    {
      name: 'Matchmaker Class - Basic matchmaking works',
      fn: () => {
        const matchmaker = new Matchmaker();
        const player = new Player('test1', 'user1', 'Player1');
        const result = matchmaker.addToQueue(player);
        if (result.success && matchmaker.queue.length === 1) {
          return true;
        }
        throw new Error('Matchmaker functionality failed');
      }
    }
  ]);
  
  // Test Suite 2: Integration Tests
  runSuite('Basic Integration Tests', [
    {
      name: 'Player can join room successfully',
      fn: () => {
        const room = new GameRoom('integration-room');
        const player = new Player('test1', 'user1', 'Player1');
        
        const result = room.addPlayer(player);
        if (!result.success) throw new Error('Failed to add player to room');
        if (player.roomId !== room.id) throw new Error('Player roomId not set correctly');
        if (player.status !== 'IN_ROOM') throw new Error('Player status not updated');
      }
    },
    {
      name: 'Matchmaker creates rooms properly',
      fn: () => {
        const matchmaker = new Matchmaker();
        const player1 = new Player('test1', 'user1', 'Player1');
        const player2 = new Player('test2', 'user2', 'Player2');
        
        matchmaker.addToQueue(player1, { gameMode: 'casual' });
        matchmaker.addToQueue(player2, { gameMode: 'casual' });
        
        if (matchmaker.queue.length !== 2) throw new Error('Queue not populated correctly');
        
        matchmaker.processQueue();
        
        if (matchmaker.activeRooms.size !== 1) throw new Error('Room not created');
        if (matchmaker.queue.length !== 0) throw new Error('Players not removed from queue');
      }
    },
    {
      name: 'Game can start with matched players',
      fn: () => {
        const matchmaker = new Matchmaker();
        const player1 = new Player('test1', 'user1', 'Player1');
        const player2 = new Player('test2', 'user2', 'Player2');
        
        matchmaker.addToQueue(player1, { gameMode: 'casual' });
        matchmaker.addToQueue(player2, { gameMode: 'casual' });
        matchmaker.processQueue();
        
        const roomId = matchmaker.playerRoomMap.get(player1.id);
        const room = matchmaker.activeRooms.get(roomId);
        
        if (!room) throw new Error('Room not found');
        if (room.status !== 'WAITING') throw new Error('Room not in waiting state');
        if (room.players.size !== 2) throw new Error('Room does not have both players');
      }
    }
  ]);
  
  // Test Suite 3: Performance Tests
  runSuite('Performance Tests', [
    {
      name: 'Can handle multiple matchmaking operations quickly',
      fn: () => {
        const matchmaker = new Matchmaker();
        const startTime = Date.now();
        
        // Create 10 players
        for (let i = 1; i <= 10; i++) {
          const player = new Player(`test${i}`, `user${i}`, `Player${i}`);
          matchmaker.addToQueue(player, { gameMode: 'casual' });
        }
        
        matchmaker.processQueue();
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (duration > 100) throw new Error(`Performance test took too long: ${duration}ms`);
        if (matchmaker.activeRooms.size !== 5) throw new Error('Not all matches created');
      }
    },
    {
      name: 'GameStateValidator performance is acceptable',
      fn: () => {
        const validator = new GameStateValidator();
        const startTime = Date.now();
        
        for (let i = 0; i < 100; i++) {
          const gameState = {
            timestamp: Date.now(),
            players: {
              'player1': { x: 100 + i, y: 200, vx: 10, vy: 0 },
              'player2': { x: 700 - i, y: 200, vx: -10, vy: 0 }
            },
            ball: { x: 400, y: 200, vx: 50, vy: 0 },
            score: { left: 0, right: 0 }
          };
          validator.validateGameState(gameState);
        }
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (duration > 50) throw new Error(`Validation too slow: ${duration}ms for 100 validations`);
      }
    }
  ]);
  
  // Test Suite 4: Edge Cases
  runSuite('Edge Case Handling', [
    {
      name: 'Handles invalid inputs gracefully',
      fn: () => {
        const matchmaker = new Matchmaker();
        const room = new GameRoom('edge-test');
        const validator = new GameStateValidator();
        
        // Test invalid matchmaker input
        const invalidResult = matchmaker.addToQueue("not-a-player");
        if (invalidResult.success) throw new Error('Should reject invalid player');
        
        // Test invalid room input
        const invalidRoomResult = room.addPlayer(null);
        if (invalidRoomResult.success) throw new Error('Should reject null player');
        
        // Test invalid validator input
        const invalidValidation = validator.validateGameState(null);
        if (invalidValidation.valid) throw new Error('Should reject null game state');
      }
    },
    {
      name: 'Handles disconnections properly',
      fn: () => {
        const player = new Player('test1', 'user1', 'Player1');
        if (!player.isConnected) throw new Error('Player should start connected');
        
        player.handleDisconnect();
        if (player.isConnected) throw new Error('Player should be disconnected');
        if (player.status !== 'DISCONNECTED') throw new Error('Status should be DISCONNECTED');
        
        player.handleReconnect('new-socket');
        if (!player.isConnected) throw new Error('Player should be reconnected');
      }
    }
  ]);
  
  // Test Suite 5: Data Consistency
  runSuite('Data Consistency Tests', [
    {
      name: 'Player state consistency across systems',
      fn: () => {
        const matchmaker = new Matchmaker();
        const player1 = new Player('test1', 'user1', 'Player1');
        const player2 = new Player('test2', 'user2', 'Player2');
        
        // Initial state
        if (player1.status !== 'IDLE') throw new Error('Initial state wrong');
        
        // Add to queue
        matchmaker.addToQueue(player1);
        if (player1.status !== 'IN_QUEUE') throw new Error('Queue state not updated');
        
        // Add second player and process
        matchmaker.addToQueue(player2);
        matchmaker.processQueue();
        
        // Check final states
        if (player1.status !== 'IN_ROOM') throw new Error('Room state not updated for player1');
        if (player2.status !== 'IN_ROOM') throw new Error('Room state not updated for player2');
        
        const roomId1 = matchmaker.playerRoomMap.get(player1.id);
        const roomId2 = matchmaker.playerRoomMap.get(player2.id);
        if (roomId1 !== roomId2) throw new Error('Players not in same room');
      }
    }
  ]);
  
  // Summary
  console.log('📊 Phase 2 Comprehensive Test Results:');
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Total: ${totalTests}`);
  console.log(`🎯 Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
  
  return failedTests === 0;
}

// Run all tests
if (require.main === module) {
  const success = runComprehensiveTests();
  process.exit(success ? 0 : 1);
}

module.exports = { runComprehensiveTests };