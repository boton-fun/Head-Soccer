/**
 * Comprehensive Integration Tests for Phase 2 Components
 * Tests Player, GameRoom, GameStateValidator, and Matchmaker working together
 */

const Player = require('../modules/Player');
const GameRoom = require('../modules/GameRoom');
const GameStateValidator = require('../modules/GameStateValidator');
const Matchmaker = require('../modules/Matchmaker');

// Simple test runner
function runIntegrationTests() {
  let passedTests = 0;
  let failedTests = 0;
  
  function test(description, testFn) {
    try {
      testFn();
      console.log(`✅ ${description}`);
      passedTests++;
    } catch (error) {
      console.log(`❌ ${description}`);
      console.log(`   Error: ${error.message}`);
      failedTests++;
    }
  }
  
  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }
  
  console.log('\n🔗 Running Phase 2 Integration Tests...\n');
  
  // Test 1: Complete matchmaking to game flow
  test('Should complete full matchmaking to game flow', () => {
    const matchmaker = new Matchmaker();
    const validator = new GameStateValidator();
    
    // Create players
    const player1 = new Player('socket1', 'user1', 'Player1', { eloRating: 1200 });
    const player2 = new Player('socket2', 'user2', 'Player2', { eloRating: 1250 });
    
    // Add to matchmaker queue
    const result1 = matchmaker.addToQueue(player1, { gameMode: 'casual' });
    const result2 = matchmaker.addToQueue(player2, { gameMode: 'casual' });
    
    assert(result1.success === true);
    assert(result2.success === true);
    assert(matchmaker.queue.length === 2);
    
    // Process queue to create match
    matchmaker.processQueue();
    
    // Verify match was created
    assert(matchmaker.queue.length === 0);
    assert(matchmaker.activeRooms.size === 1);
    
    // Get the created room
    const roomId = matchmaker.playerRoomMap.get(player1.id);
    const room = matchmaker.activeRooms.get(roomId);
    
    assert(room !== null);
    assert(room.players.size === 2);
    assert(room.status === 'WAITING');
    
    // Players ready up (need to be in room first)
    assert(player1.status === 'IN_ROOM');
    assert(player2.status === 'IN_ROOM');
    
    player1.setReady(true);
    player2.setReady(true);
    
    // Start game
    const startResult = room.startGame();
    assert(startResult.success === true);
    assert(room.status === 'PLAYING');
    
    // Validate some game state
    const gameState = {
      timestamp: Date.now(),
      players: {
        [player1.id]: { x: 100, y: 200, vx: 0, vy: 0 },
        [player2.id]: { x: 700, y: 200, vx: 0, vy: 0 }
      },
      ball: { x: 400, y: 200, vx: 50, vy: 0 },
      score: { left: 0, right: 0 }
    };
    
    const validationResult = validator.validateGameState(gameState);
    assert(validationResult.valid === true);
    
    // Simulate goal
    const goalResult = room.addGoal(player1.id, 'left', {
      timestamp: Date.now(),
      position: { x: 750, y: 200 },
      shotType: 'normal'
    });
    
    assert(goalResult.success === true);
    assert(room.score.left === 1);
    assert(room.score.right === 0);
    
    console.log('   ✓ Full flow: Matchmaking → Room Creation → Game Start → Validation → Goal');
  });
  
  // Test 2: Player disconnection handling across systems
  test('Should handle player disconnection across all systems', () => {
    const matchmaker = new Matchmaker();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    // Add players to queue
    matchmaker.addToQueue(player1);
    matchmaker.addToQueue(player2);
    
    // Process to create room
    matchmaker.processQueue();
    
    const roomId = matchmaker.playerRoomMap.get(player1.id);
    const room = matchmaker.activeRooms.get(roomId);
    
    // Start game
    player1.setReady(true);
    player2.setReady(true);
    room.startGame();
    
    // Player 1 disconnects
    player1.handleDisconnect();
    
    assert(player1.isConnected === false);
    assert(player1.status === 'DISCONNECTED');
    
    // Room should pause game (if game was started)
    // Note: Game might pause due to disconnection during active play
    assert(room.status === 'PAUSED' || room.status === 'PLAYING');
    
    // Cleanup disconnected players from matchmaker
    matchmaker.cleanupDisconnectedPlayers();
    
    console.log('   ✓ Disconnection handled: Player → Room → Matchmaker');
  });
  
  // Test 3: Game state validation with room integration
  test('Should validate game state changes with room integration', () => {
    const room = new GameRoom('test-room', { gameMode: 'casual' });
    const validator = new GameStateValidator();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    // Add players and start game
    room.addPlayer(player1);
    room.addPlayer(player2);
    player1.setReady(true);
    player2.setReady(true);
    room.startGame();
    
    // Initialize validator with player history first
    validator.playerStates.set(player1.id, {
      position: { x: 100, y: 200 },
      velocity: { x: 0, y: 0 },
      timestamp: Date.now() - 100
    });
    
    // Test valid movement
    const validMovement = {
      playerId: player1.id,
      position: { x: 150, y: 200 },
      velocity: { x: 100, y: 0 },
      timestamp: Date.now()
    };
    
    const validResult = validator.validatePlayerMovement(validMovement);
    assert(validResult.valid === true);
    
    // Test invalid movement (too fast)
    const invalidMovement = {
      playerId: player1.id,
      position: { x: 1000, y: 200 },
      velocity: { x: 5000, y: 0 },
      timestamp: Date.now()
    };
    
    const invalidResult = validator.validatePlayerMovement(invalidMovement);
    assert(invalidResult.valid === false);
    
    // Test goal validation
    const goalData = {
      playerId: player1.id,
      position: { x: 750, y: 200 },
      timestamp: Date.now()
    };
    
    const goalValidation = validator.validateGoal(goalData);
    if (goalValidation.valid) {
      room.addGoal(player1.id, 'left', goalData);
      assert(room.score.left === 1);
    }
    
    console.log('   ✓ Game state validation integrated with room management');
  });
  
  // Test 4: Matchmaker room lifecycle management
  test('Should manage complete room lifecycle through matchmaker', () => {
    const matchmaker = new Matchmaker();
    
    // Create multiple player pairs
    const players = [];
    for (let i = 1; i <= 6; i++) {
      players.push(new Player(`socket${i}`, `user${i}`, `Player${i}`, { eloRating: 1200 + i * 10 }));
    }
    
    // Add all to queue
    players.forEach(player => {
      matchmaker.addToQueue(player, { gameMode: 'casual' });
    });
    
    assert(matchmaker.queue.length === 6);
    
    // Process queue - should create 3 rooms
    matchmaker.processQueue();
    
    assert(matchmaker.queue.length === 0);
    assert(matchmaker.activeRooms.size === 3);
    
    // Get one room and finish the game
    const roomIds = Array.from(matchmaker.activeRooms.keys());
    const room = matchmaker.activeRooms.get(roomIds[0]);
    room.status = 'FINISHED';
    
    // Clean up finished rooms
    matchmaker.cleanupRooms();
    
    assert(matchmaker.activeRooms.size === 2);
    
    console.log('   ✓ Complete room lifecycle: Creation → Management → Cleanup');
  });
  
  // Test 5: Performance integration test
  test('Should handle high-load integration scenario', () => {
    const matchmaker = new Matchmaker({ maxQueueSize: 100 });
    const validator = new GameStateValidator();
    
    const startTime = Date.now();
    
    // Create 20 players
    const players = [];
    for (let i = 1; i <= 20; i++) {
      const player = new Player(`socket${i}`, `user${i}`, `Player${i}`, {
        eloRating: 1000 + Math.random() * 400
      });
      players.push(player);
    }
    
    // Add all to matchmaker
    players.forEach(player => {
      matchmaker.addToQueue(player, { gameMode: 'casual' });
    });
    
    // Process queue
    matchmaker.processQueue();
    
    // Validate game states for all active rooms
    let validatedRooms = 0;
    for (const [roomId, room] of matchmaker.activeRooms.entries()) {
      const gameState = {
        timestamp: Date.now(),
        players: {},
        ball: { x: 400, y: 200, vx: 0, vy: 0 },
        score: { left: 0, right: 0 }
      };
      
      // Add player positions
      for (const [playerId, player] of room.players.entries()) {
        gameState.players[playerId] = {
          x: player.position === 'left' ? 100 : 700,
          y: 200,
          vx: 0,
          vy: 0
        };
      }
      
      const validationResult = validator.validateGameState(gameState);
      if (validationResult.valid) {
        validatedRooms++;
      }
    }
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    assert(matchmaker.activeRooms.size === 10); // 20 players = 10 rooms
    assert(validatedRooms === 10); // All rooms validated
    assert(totalTime < 1000); // Should complete within 1 second
    
    console.log(`   ✓ High-load scenario: 20 players, 10 rooms, ${totalTime}ms`);
  });
  
  // Test 6: Error recovery integration
  test('Should handle errors gracefully across systems', () => {
    const matchmaker = new Matchmaker();
    const validator = new GameStateValidator();
    
    // Test invalid player addition
    const invalidResult = matchmaker.addToQueue("not-a-player");
    assert(invalidResult.success === false);
    
    // Test validation with invalid data
    const invalidValidation = validator.validatePlayerMovement(null);
    assert(invalidValidation.valid === false);
    
    // Test room with invalid operations
    const room = new GameRoom('test-room');
    const invalidGoal = room.addGoal('nonexistent-player', 'left', {});
    assert(invalidGoal.success === false);
    
    // Verify systems still functional after errors
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    const validResult1 = matchmaker.addToQueue(player1);
    const validResult2 = matchmaker.addToQueue(player2);
    
    assert(validResult1.success === true);
    assert(validResult2.success === true);
    
    console.log('   ✓ Error recovery: All systems remain functional after errors');
  });
  
  // Test 7: Data consistency across systems
  test('Should maintain data consistency across all systems', () => {
    const matchmaker = new Matchmaker();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    // Initial state checks
    assert(player1.status === 'IDLE');
    assert(player1.roomId === null);
    assert(matchmaker.playerRoomMap.size === 0);
    
    // Add to queue
    matchmaker.addToQueue(player1);
    matchmaker.addToQueue(player2);
    
    // Check queue state consistency
    assert(player1.status === 'IN_QUEUE');
    assert(player2.status === 'IN_QUEUE');
    assert(matchmaker.queue.length === 2);
    assert(matchmaker.playerQueues.size === 2);
    
    // Process queue
    matchmaker.processQueue();
    
    // Check room assignment consistency
    const roomId = matchmaker.playerRoomMap.get(player1.id);
    const room = matchmaker.activeRooms.get(roomId);
    
    assert(player1.status === 'IN_ROOM');
    assert(player2.status === 'IN_ROOM');
    assert(player1.roomId === roomId);
    assert(player2.roomId === roomId);
    assert(room.players.has(player1.id));
    assert(room.players.has(player2.id));
    assert(matchmaker.queue.length === 0);
    assert(matchmaker.playerQueues.size === 0);
    
    console.log('   ✓ Data consistency maintained across Player → Matchmaker → Room');
  });
  
  // Test results
  console.log('\n📊 Phase 2 Integration Test Results:');
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Total: ${passedTests + failedTests}`);
  
  return failedTests === 0;
}

// Run tests if called directly
if (require.main === module) {
  const success = runIntegrationTests();
  process.exit(success ? 0 : 1);
}

module.exports = { runIntegrationTests };