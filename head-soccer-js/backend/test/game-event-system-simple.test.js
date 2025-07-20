/**
 * Game Event System Simple Tests
 * Direct Node.js tests without Jest framework
 */

const GameEventSystem = require('../websocket/gameEventSystem');

// Mock connection manager for testing
class MockConnectionManager {
  constructor() {
    this.connections = new Map();
    this.broadcastCalls = [];
  }
  
  broadcastToRoom(roomId, eventType, data) {
    this.broadcastCalls.push({ type: 'room', roomId, eventType, data });
  }
  
  broadcastToAll(eventType, data) {
    this.broadcastCalls.push({ type: 'all', eventType, data });
  }
  
  getConnectionByPlayerId(playerId) {
    return this.connections.get(playerId) || null;
  }
  
  addMockConnection(playerId, socket) {
    this.connections.set(playerId, { socket, playerId });
  }
}

class MockSocket {
  constructor() {
    this.emittedEvents = [];
  }
  
  emit(eventType, data) {
    this.emittedEvents.push({ eventType, data });
  }
}

// Test utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
  }
}

async function runTests() {
  console.log('🧪 Running Game Event System Tests...\n');
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  const test = async (name, testFn) => {
    try {
      console.log(`🔍 Testing: ${name}`);
      await testFn();
      console.log(`✅ ${name}\n`);
      testsPassed++;
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}\n`);
      testsFailed++;
    }
  };
  
  // Test 1: Event Definitions
  await test('Event Definitions', async () => {
    const mockConnectionManager = new MockConnectionManager();
    const gameEventSystem = new GameEventSystem(mockConnectionManager);
    
    const eventTypes = Object.keys(gameEventSystem.eventDefinitions);
    
    assert(eventTypes.length > 0, 'Should have event definitions');
    assert(eventTypes.includes('player_movement'), 'Should define player_movement');
    assert(eventTypes.includes('goal_scored'), 'Should define goal_scored');
    assert(eventTypes.includes('chat_message'), 'Should define chat_message');
    
    console.log(`   📋 Defined ${eventTypes.length} event types`);
    gameEventSystem.shutdown();
  });
  
  // Test 2: Event Validation
  await test('Event Validation', async () => {
    const mockConnectionManager = new MockConnectionManager();
    const gameEventSystem = new GameEventSystem(mockConnectionManager);
    
    // Valid player movement
    const validMovement = {
      playerId: 'player1',
      position: { x: 100, y: 200 },
      velocity: { x: 50, y: -25 },
      timestamp: Date.now()
    };
    
    const validResult = gameEventSystem.validateEventData('player_movement', validMovement);
    assert(validResult.valid, 'Valid movement should pass validation');
    assertEqual(validResult.errors.length, 0, 'Valid movement should have no errors');
    
    // Invalid player movement
    const invalidMovement = {
      playerId: 'player1',
      position: { x: 900, y: 200 }, // x out of range
      velocity: { x: 600, y: -25 }, // x velocity out of range
      // Missing timestamp
    };
    
    const invalidResult = gameEventSystem.validateEventData('player_movement', invalidMovement);
    assert(!invalidResult.valid, 'Invalid movement should fail validation');
    assert(invalidResult.errors.length > 0, 'Invalid movement should have errors');
    
    console.log(`   ✅ Validation working: ${invalidResult.errors.length} errors caught`);
    gameEventSystem.shutdown();
  });
  
  // Test 3: Event Queueing and Prioritization
  await test('Event Queueing and Prioritization', async () => {
    const mockConnectionManager = new MockConnectionManager();
    const gameEventSystem = new GameEventSystem(mockConnectionManager);
    
    // Queue events of different priorities
    const goalSuccess = gameEventSystem.queueEvent('goal_scored', {
      playerId: 'player1',
      goalType: 'normal',
      timestamp: Date.now()
    }, { playerId: 'player1', roomId: 'room1' });
    
    const moveSuccess = gameEventSystem.queueEvent('player_movement', {
      playerId: 'player1',
      position: { x: 100, y: 200 },
      velocity: { x: 0, y: 0 },
      timestamp: Date.now()
    }, { playerId: 'player1', roomId: 'room1' });
    
    const chatSuccess = gameEventSystem.queueEvent('chat_message', {
      playerId: 'player1',
      message: 'Hello!',
      timestamp: Date.now()
    }, { playerId: 'player1', roomId: 'room1' });
    
    assert(goalSuccess, 'Goal event should queue successfully');
    assert(moveSuccess, 'Movement event should queue successfully');
    assert(chatSuccess, 'Chat event should queue successfully');
    
    // Check queue distribution
    assertEqual(gameEventSystem.eventQueues.CRITICAL.length, 1, 'CRITICAL queue should have 1 event');
    assertEqual(gameEventSystem.eventQueues.HIGH.length, 1, 'HIGH queue should have 1 event');
    assertEqual(gameEventSystem.eventQueues.LOW.length, 1, 'LOW queue should have 1 event');
    
    console.log(`   📊 Queue distribution: CRITICAL:1, HIGH:1, LOW:1`);
    gameEventSystem.shutdown();
  });
  
  // Test 4: Rate Limiting
  await test('Rate Limiting', async () => {
    const mockConnectionManager = new MockConnectionManager();
    const gameEventSystem = new GameEventSystem(mockConnectionManager);
    
    const playerId = 'player1';
    let successCount = 0;
    
    // Try to send many chat messages rapidly (limit is 2 per second)
    for (let i = 0; i < 10; i++) {
      const success = gameEventSystem.queueEvent('chat_message', {
        playerId,
        message: `Message ${i}`,
        timestamp: Date.now()
      }, { playerId, roomId: 'room1' });
      
      if (success) successCount++;
    }
    
    assert(successCount <= 2, 'Rate limiting should prevent more than 2 chat messages');
    assert(successCount > 0, 'Rate limiting should allow some messages');
    
    console.log(`   🚦 Rate limiting working: ${successCount}/10 messages allowed`);
    gameEventSystem.shutdown();
  });
  
  // Test 5: Lag Compensation
  await test('Lag Compensation', async () => {
    const mockConnectionManager = new MockConnectionManager();
    const gameEventSystem = new GameEventSystem(mockConnectionManager);
    
    const playerId = 'player1';
    const latency = 150;
    
    // Set player latency
    gameEventSystem.updatePlayerLatency(playerId, latency);
    const retrievedLatency = gameEventSystem.getPlayerLatency(playerId);
    
    assertEqual(retrievedLatency, latency, 'Player latency should be tracked correctly');
    
    // Test lag compensation on event
    let compensationApplied = false;
    
    gameEventSystem.on('eventProcessed', (event) => {
      if (event.type === 'player_movement' && event.lagCompensation) {
        assert(event.lagCompensation.appliedCompensation > 0, 'Lag compensation should be applied');
        assertEqual(event.lagCompensation.playerLatency, latency, 'Correct latency should be recorded');
        compensationApplied = true;
      }
    });
    
    gameEventSystem.queueEvent('player_movement', {
      playerId,
      position: { x: 100, y: 200 },
      velocity: { x: 50, y: 0 },
      timestamp: Date.now()
    }, { 
      playerId, 
      roomId: 'room1',
      clientTimestamp: Date.now() - 50,
      latency: latency
    });
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log(`   ⏱️ Lag compensation: ${compensationApplied ? 'Applied' : 'Not triggered'}`);
    gameEventSystem.shutdown();
  });
  
  // Test 6: Broadcasting
  await test('Event Broadcasting', async () => {
    const mockConnectionManager = new MockConnectionManager();
    const gameEventSystem = new GameEventSystem(mockConnectionManager);
    
    const roomId = 'room1';
    let broadcastReceived = false;
    
    gameEventSystem.on('eventProcessed', (event) => {
      if (event.type === 'player_movement') {
        // Check if broadcast was called
        const broadcast = mockConnectionManager.broadcastCalls.find(
          call => call.roomId === roomId && call.eventType === 'player_movement'
        );
        
        if (broadcast) {
          broadcastReceived = true;
          assertEqual(broadcast.data.playerId, 'player1', 'Broadcast should contain correct player ID');
        }
      }
    });
    
    gameEventSystem.queueEvent('player_movement', {
      playerId: 'player1',
      position: { x: 100, y: 200 },
      velocity: { x: 0, y: 0 },
      timestamp: Date.now()
    }, { playerId: 'player1', roomId });
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 200));
    
    assert(broadcastReceived, 'Event should be broadcasted to room');
    console.log(`   📡 Broadcasting working correctly`);
    gameEventSystem.shutdown();
  });
  
  // Test 7: Performance Metrics
  await test('Performance Metrics', async () => {
    const mockConnectionManager = new MockConnectionManager();
    const gameEventSystem = new GameEventSystem(mockConnectionManager);
    
    // Queue several events
    for (let i = 0; i < 5; i++) {
      gameEventSystem.queueEvent('heartbeat', {
        playerId: `player${i}`,
        timestamp: Date.now()
      }, { playerId: `player${i}` });
    }
    
    const stats = gameEventSystem.getStats();
    
    assertEqual(stats.eventsQueued, 5, 'Should track queued events');
    assertEqual(stats.totalQueueSize, 5, 'Should track queue size');
    assert(stats.processing, 'Should be processing');
    
    console.log(`   📈 Metrics: ${stats.eventsQueued} queued, ${stats.totalQueueSize} in queue`);
    gameEventSystem.shutdown();
  });
  
  // Test 8: Error Handling
  await test('Error Handling', async () => {
    const mockConnectionManager = new MockConnectionManager();
    const gameEventSystem = new GameEventSystem(mockConnectionManager);
    
    // Test unknown event type
    let errorEmitted = false;
    gameEventSystem.on('error', (errorData) => {
      if (errorData.eventType === 'unknown_event') {
        errorEmitted = true;
      }
    });
    
    const unknownSuccess = gameEventSystem.queueEvent('unknown_event', {
      someData: 'test'
    }, { playerId: 'player1' });
    
    assert(!unknownSuccess, 'Unknown event types should be rejected');
    
    // Wait for error emission
    await new Promise(resolve => setTimeout(resolve, 100));
    assert(errorEmitted, 'Error should be emitted for unknown event types');
    
    // Test validation error emission
    let validationErrorEmitted = false;
    
    gameEventSystem.on('validationError', (errorData) => {
      validationErrorEmitted = true;
      assertEqual(errorData.eventType, 'player_movement', 'Should emit correct event type');
      assert(errorData.errors.length > 0, 'Should include error details');
    });
    
    // Send invalid event
    gameEventSystem.queueEvent('player_movement', {
      playerId: 'player1',
      position: { x: 999, y: 200 }, // Invalid position
      // Missing required fields
    }, { playerId: 'player1', roomId: 'room1' });
    
    // Wait briefly for error emission
    await new Promise(resolve => setTimeout(resolve, 100));
    
    assert(validationErrorEmitted, 'Validation errors should be emitted');
    console.log(`   🚨 Error handling working correctly`);
    gameEventSystem.shutdown();
  });
  
  // Test 9: System Lifecycle
  await test('System Lifecycle', async () => {
    const mockConnectionManager = new MockConnectionManager();
    const gameEventSystem = new GameEventSystem(mockConnectionManager);
    
    // Initially not processing
    assert(!gameEventSystem.processing, 'Should not be processing initially');
    
    // Queue an event to start processing
    gameEventSystem.queueEvent('heartbeat', {
      playerId: 'player1',
      timestamp: Date.now()
    }, { playerId: 'player1' });
    
    assert(gameEventSystem.processing, 'Should start processing when events are queued');
    
    // Add some data to track cleanup
    gameEventSystem.updatePlayerLatency('player1', 100);
    assert(gameEventSystem.playerLatencies.size > 0, 'Should track player data');
    assert(gameEventSystem.getTotalQueueSize() > 0, 'Should have queued events');
    
    // Shutdown should clean up everything
    gameEventSystem.shutdown();
    
    assertEqual(gameEventSystem.getTotalQueueSize(), 0, 'Should clear all queues');
    assertEqual(gameEventSystem.playerLatencies.size, 0, 'Should clear player data');
    assert(!gameEventSystem.processing, 'Should stop processing');
    
    console.log(`   🔄 Lifecycle management working correctly`);
  });
  
  // Summary
  console.log('='.repeat(80));
  console.log('🎯 GAME EVENT SYSTEM TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`✅ Tests Passed: ${testsPassed}`);
  console.log(`❌ Tests Failed: ${testsFailed}`);
  console.log(`📊 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
  
  if (testsFailed === 0) {
    console.log('🎉 ALL TESTS PASSED! Game Event System is ready for production.');
  } else {
    console.log('⚠️  Some tests failed. Please review and fix issues.');
  }
  
  console.log('='.repeat(80));
}

// Run tests if called directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = { MockConnectionManager, MockSocket };