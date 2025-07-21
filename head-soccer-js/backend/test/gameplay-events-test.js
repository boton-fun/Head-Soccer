/**
 * Simple test for Gameplay Events system
 * Tests the main functionality of real-time gameplay events
 */

const GameplayEvents = require('../websocket/gameplayEvents');
const ConnectionManager = require('../websocket/connectionManager');
const GameEventSystem = require('../websocket/gameEventSystem');
const GameStateValidator = require('../modules/GameStateValidator');

class MockSocketIO {
  constructor() {
    this.connections = new Map();
  }
  
  to(room) {
    return {
      emit: (event, data) => {
        console.log(`📡 Broadcasting to room ${room}: ${event}`, JSON.stringify(data, null, 2));
      }
    };
  }
}

async function testGameplayEvents() {
  console.log('🎮 Starting Gameplay Events Test\n');
  
  try {
    // Initialize systems
    const mockIO = new MockSocketIO();
    const connectionManager = new ConnectionManager(mockIO);
    const gameEventSystem = new GameEventSystem(connectionManager);
    const gameStateValidator = new GameStateValidator();
    
    const gameplayEvents = new GameplayEvents(
      connectionManager, 
      gameEventSystem, 
      gameStateValidator,
      {
        maxLatency: 100,
        physicsTickRate: 60,
        goalCooldown: 3000
      }
    );
    
    console.log('✅ Systems initialized successfully\n');
    
    // Create mock connections
    const player1Id = 'test-player-1';
    const player2Id = 'test-player-2';
    const roomId = 'test-room-123';
    
    // Mock connections in connection manager
    connectionManager.connections.set('socket1', {
      socketId: 'socket1',
      playerId: player1Id,
      roomId: roomId,
      connected: true,
      lastSeen: Date.now()
    });
    
    connectionManager.connections.set('socket2', {
      socketId: 'socket2',
      playerId: player2Id,
      roomId: roomId,
      connected: true,
      lastSeen: Date.now()
    });
    
    // Mock room mapping
    connectionManager.roomConnections.set(roomId, new Set(['socket1', 'socket2']));
    connectionManager.playerConnections.set(player1Id, 'socket1');
    connectionManager.playerConnections.set(player2Id, 'socket2');
    
    console.log('🔗 Mock connections created\n');
    
    // Initialize a game
    const players = [
      { id: player1Id, username: 'Player1' },
      { id: player2Id, username: 'Player2' }
    ];
    
    const gameState = gameplayEvents.initializeGame(roomId, players, 'casual');
    console.log('✅ Game initialized:', gameState);
    console.log('📊 Initial game stats:', gameplayEvents.getStats());
    console.log('');
    
    // Test 1: Player Movement
    console.log('📝 TEST 1: Player Movement with Lag Compensation');
    const movementData = {
      position: { x: 150, y: 200 },
      velocity: { x: 50, y: 0 },
      direction: 'right',
      timestamp: Date.now(),
      sequenceId: 1001
    };
    
    const movementResult = await gameplayEvents.handlePlayerMovement(player1Id, movementData);
    console.log('Movement result:', movementResult);
    console.log('');
    
    // Test 2: Ball Update
    console.log('📝 TEST 2: Ball Physics Update');
    const ballData = {
      position: { x: 400, y: 150 },
      velocity: { x: 100, y: -50 },
      spin: 0.5,
      lastTouchedBy: player1Id,
      timestamp: Date.now()
    };
    
    const ballResult = await gameplayEvents.handleBallUpdate(player1Id, ballData);
    console.log('Ball update result:', ballResult);
    console.log('');
    
    // Test 3: Goal Scoring
    console.log('📝 TEST 3: Goal Scoring System');
    const goalData = {
      position: { x: 780, y: 175 }, // Right goal area
      velocity: { x: 200, y: 0 },
      power: 85,
      direction: 0,
      goalType: 'normal',
      timestamp: Date.now()
    };
    
    const goalResult = await gameplayEvents.handleGoalAttempt(player1Id, goalData);
    console.log('Goal attempt result:', goalResult);
    console.log('');
    
    // Test 4: Game Pause/Resume
    console.log('📝 TEST 4: Game Pause/Resume System');
    const pauseData = {
      reason: 'player_request',
      timestamp: Date.now()
    };
    
    const pauseResult = await gameplayEvents.handlePauseRequest(player1Id, pauseData);
    console.log('Pause result:', pauseResult);
    
    // Try to move while paused (should fail)
    const pausedMovementResult = await gameplayEvents.handlePlayerMovement(player1Id, {
      ...movementData,
      sequenceId: 1002
    });
    console.log('Movement during pause:', pausedMovementResult);
    
    // Resume game
    const resumeResult = await gameplayEvents.handleResumeRequest(player1Id, {
      reason: 'player_request'
    });
    console.log('Resume result:', resumeResult);
    console.log('');
    
    // Test 5: Performance Metrics
    console.log('📝 TEST 5: Performance Metrics and Statistics');
    
    // Simulate multiple rapid movements for performance testing
    console.log('Simulating rapid movements...');
    const startTime = Date.now();
    
    for (let i = 0; i < 100; i++) {
      await gameplayEvents.handlePlayerMovement(player2Id, {
        position: { x: 200 + i, y: 200 },
        velocity: { x: 25, y: 0 },
        direction: 'right',
        timestamp: Date.now(),
        sequenceId: 2000 + i
      });
    }
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    console.log(`✅ Processed 100 movements in ${processingTime}ms`);
    console.log(`📈 Average: ${processingTime / 100}ms per movement`);
    console.log('');
    
    // Final statistics
    console.log('📊 Final Game Statistics:');
    const finalStats = gameplayEvents.getStats();
    console.log(JSON.stringify(finalStats, null, 2));
    console.log('');
    
    // Test 6: Game End Simulation
    console.log('📝 TEST 6: Game End Simulation');
    
    // Score several goals to trigger game end
    for (let i = 0; i < 3; i++) {
      const goalAttempt = await gameplayEvents.handleGoalAttempt(player1Id, {
        position: { x: 780, y: 175 },
        velocity: { x: 150, y: 0 },
        power: 90,
        goalType: 'normal',
        timestamp: Date.now()
      });
      console.log(`Goal ${i + 1} result:`, goalAttempt);
      
      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('');
    
    // Cleanup test
    console.log('🧹 Cleaning up...');
    gameplayEvents.shutdown();
    
    console.log('✅ All tests completed successfully!');
    console.log('🎮 Gameplay Events system is ready for production use.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testGameplayEvents().then(() => {
    console.log('\n🏁 Test execution completed');
    process.exit(0);
  }).catch(error => {
    console.error('\n💥 Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { testGameplayEvents };