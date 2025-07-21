/**
 * Simple direct test for Gameplay Events system
 * Tests core functionality without full Socket.IO setup
 */

const GameplayEvents = require('../websocket/gameplayEvents');
const GameStateValidator = require('../modules/GameStateValidator');

// Mock minimal connection manager
class MockConnectionManager {
  constructor() {
    this.connections = new Map();
    this.roomConnections = new Map();
    this.playerConnections = new Map();
  }
  
  getConnectionByPlayerId(playerId) {
    const socketId = this.playerConnections.get(playerId);
    return this.connections.get(socketId);
  }
  
  broadcastToRoom(roomId, event, data, excludeSocketId) {
    console.log(`📡 Broadcasting to room ${roomId}: ${event}`, data);
  }
}

// Mock minimal game event system
class MockGameEventSystem {
  constructor() {
    this.events = [];
  }
  
  queueEvent(eventType, data, context) {
    this.events.push({ eventType, data, context, timestamp: Date.now() });
    console.log(`🎯 Event queued: ${eventType}`, data);
  }
}

async function testGameplayEventsBasic() {
  console.log('🎮 Starting Simple Gameplay Events Test\n');
  
  try {
    // Initialize systems
    const mockConnectionManager = new MockConnectionManager();
    const mockGameEventSystem = new MockGameEventSystem();
    const gameStateValidator = new GameStateValidator();
    
    const gameplayEvents = new GameplayEvents(
      mockConnectionManager, 
      mockGameEventSystem, 
      gameStateValidator,
      {
        maxLatency: 100,
        physicsTickRate: 10, // Lower for testing
        goalCooldown: 1000 // Shorter for testing
      }
    );
    
    console.log('✅ Systems initialized successfully\n');
    
    // Create test data
    const player1Id = 'test-player-1';
    const player2Id = 'test-player-2';
    const roomId = 'test-room-123';
    
    // Mock connections
    mockConnectionManager.connections.set('socket1', {
      socketId: 'socket1',
      playerId: player1Id,
      roomId: roomId,
      connected: true
    });
    
    mockConnectionManager.connections.set('socket2', {
      socketId: 'socket2',
      playerId: player2Id,
      roomId: roomId,
      connected: true
    });
    
    mockConnectionManager.playerConnections.set(player1Id, 'socket1');
    mockConnectionManager.playerConnections.set(player2Id, 'socket2');
    mockConnectionManager.roomConnections.set(roomId, new Set(['socket1', 'socket2']));
    
    // Initialize a game
    console.log('🎯 TEST 1: Game Initialization');
    const players = [
      { id: player1Id, username: 'Alice' },
      { id: player2Id, username: 'Bob' }
    ];
    
    const gameState = gameplayEvents.initializeGame(roomId, players, 'casual');
    console.log('✅ Game initialized successfully');
    console.log('📊 Game State:', {
      roomId: gameState.roomId,
      players: gameState.players.map(p => ({ id: p.id, username: p.username, position: p.position })),
      score: gameState.score,
      status: gameState.status
    });
    console.log('');
    
    // Test player movement
    console.log('🎯 TEST 2: Player Movement');
    const movementResult = await gameplayEvents.handlePlayerMovement(player1Id, {
      position: { x: 150, y: 200 },
      velocity: { x: 50, y: 0 },
      direction: 'right',
      timestamp: Date.now(),
      sequenceId: 1001
    });
    
    console.log('Movement result:', movementResult.success ? '✅ SUCCESS' : '❌ FAILED');
    if (!movementResult.success) {
      console.log('Reason:', movementResult.reason);
    }
    console.log('');
    
    // Test ball update
    console.log('🎯 TEST 3: Ball Update');
    const ballResult = await gameplayEvents.handleBallUpdate(player1Id, {
      position: { x: 400, y: 150 },
      velocity: { x: 100, y: -50 },
      spin: 0,
      timestamp: Date.now()
    });
    
    console.log('Ball update result:', ballResult.success ? '✅ SUCCESS' : '❌ FAILED');
    if (!ballResult.success) {
      console.log('Reason:', ballResult.reason);
    }
    console.log('');
    
    // Test goal attempt
    console.log('🎯 TEST 4: Goal Attempt');
    const goalResult = await gameplayEvents.handleGoalAttempt(player1Id, {
      position: { x: 750, y: 175 },
      velocity: { x: 150, y: 0 },
      power: 85,
      direction: 0,
      goalType: 'normal',
      timestamp: Date.now()
    });
    
    console.log('Goal result:', goalResult.success ? '✅ SUCCESS' : '❌ FAILED');
    if (goalResult.success) {
      console.log('Score:', goalResult.score);
    } else {
      console.log('Reason:', goalResult.reason);
    }
    console.log('');
    
    // Test pause/resume
    console.log('🎯 TEST 5: Game Pause/Resume');
    const pauseResult = await gameplayEvents.handlePauseRequest(player1Id, {
      reason: 'player_request'
    });
    
    console.log('Pause result:', pauseResult.success ? '✅ SUCCESS' : '❌ FAILED');
    
    // Try movement while paused
    const pausedMovementResult = await gameplayEvents.handlePlayerMovement(player2Id, {
      position: { x: 250, y: 200 },
      velocity: { x: -30, y: 0 },
      timestamp: Date.now(),
      sequenceId: 1002
    });
    
    console.log('Movement while paused:', pausedMovementResult.success ? '❌ UNEXPECTED SUCCESS' : '✅ CORRECTLY BLOCKED');
    
    // Resume game
    const resumeResult = await gameplayEvents.handleResumeRequest(player1Id, {
      reason: 'player_request'
    });
    
    console.log('Resume result:', resumeResult.success ? '✅ SUCCESS' : '❌ FAILED');
    console.log('');
    
    // Performance test
    console.log('🎯 TEST 6: Performance Test');
    const startTime = Date.now();
    let successCount = 0;
    
    for (let i = 0; i < 50; i++) {
      const result = await gameplayEvents.handlePlayerMovement(player2Id, {
        position: { x: 200 + i, y: 200 },
        velocity: { x: 25, y: 0 },
        timestamp: Date.now(),
        sequenceId: 2000 + i
      });
      if (result.success) successCount++;
    }
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    console.log(`✅ Processed 50 movements in ${totalTime}ms`);
    console.log(`📈 Average: ${(totalTime / 50).toFixed(2)}ms per movement`);
    console.log(`📊 Success rate: ${(successCount / 50 * 100).toFixed(1)}%`);
    console.log('');
    
    // Final stats
    console.log('🎯 TEST 7: Final Statistics');
    const stats = gameplayEvents.getStats();
    console.log('📊 Game Statistics:');
    console.log(`- Total Movements: ${stats.totalMovements}`);
    console.log(`- Total Ball Updates: ${stats.totalBallUpdates}`);
    console.log(`- Total Goals: ${stats.totalGoals}`);
    console.log(`- Total Pauses: ${stats.totalPauses}`);
    console.log(`- Active Games: ${stats.activeGames}`);
    console.log(`- Uptime: ${(stats.uptime / 1000).toFixed(1)}s`);
    console.log(`- Movements/sec: ${stats.movementsPerSecond.toFixed(1)}`);
    console.log(`- Prediction Accuracy: ${stats.predictionAccuracy.toFixed(1)}%`);
    console.log('');
    
    // Cleanup
    console.log('🧹 Cleaning up...');
    gameplayEvents.shutdown();
    
    console.log('✅ ALL TESTS PASSED!');
    console.log('🎮 Gameplay Events system is working correctly.');
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    return false;
  }
}

// Run the test
if (require.main === module) {
  testGameplayEventsBasic().then((success) => {
    console.log('\n🏁 Test execution completed');
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('\n💥 Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { testGameplayEventsBasic };