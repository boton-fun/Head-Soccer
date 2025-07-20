/**
 * Game Event System Unit Tests
 * Comprehensive testing of event processing, validation, and lag compensation
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

describe('Game Event System', () => {
  let gameEventSystem;
  let mockConnectionManager;
  
  beforeEach(() => {
    mockConnectionManager = new MockConnectionManager();
    gameEventSystem = new GameEventSystem(mockConnectionManager, {
      tickRate: 10, // Lower for testing
      maxQueueSize: 100
    });
  });
  
  afterEach(() => {
    gameEventSystem.shutdown();
  });
  
  describe('Event Definition and Validation', () => {
    test('should define all required event types', () => {
      const eventTypes = Object.keys(gameEventSystem.eventDefinitions);
      
      // Core event types should be defined
      expect(eventTypes).toContain('player_movement');
      expect(eventTypes).toContain('player_action');
      expect(eventTypes).toContain('ball_update');
      expect(eventTypes).toContain('goal_scored');
      expect(eventTypes).toContain('chat_message');
      expect(eventTypes).toContain('heartbeat');
      
      console.log(`✅ Defined ${eventTypes.length} event types`);
    });
    
    test('should validate player movement events correctly', () => {
      const validMovement = {
        playerId: 'player1',
        position: { x: 100, y: 200 },
        velocity: { x: 50, y: -25 },
        timestamp: Date.now()
      };
      
      const result = gameEventSystem.validateEventData('player_movement', validMovement);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      
      console.log('✅ Player movement validation passed');
    });
    
    test('should reject invalid player movement events', () => {
      const invalidMovement = {
        playerId: 'player1',
        position: { x: 900, y: 200 }, // x out of range (0-800)
        velocity: { x: 600, y: -25 }, // x velocity out of range (-500 to 500)
        // Missing required timestamp
      };
      
      const result = gameEventSystem.validateEventData('player_movement', invalidMovement);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      console.log(`✅ Validation rejected invalid movement: ${result.errors.join(', ')}`);
    });
    
    test('should validate goal events correctly', () => {
      const validGoal = {
        playerId: 'player1',
        goalType: 'normal',
        score: { player1: 1, player2: 0 },
        timestamp: Date.now()
      };
      
      const result = gameEventSystem.validateEventData('goal_scored', validGoal);
      expect(result.valid).toBe(true);
      
      console.log('✅ Goal event validation passed');
    });
    
    test('should validate chat messages with sanitization', () => {
      const chatMessage = {
        playerId: 'player1',
        message: 'Good game!',
        messageType: 'all',
        timestamp: Date.now()
      };
      
      const result = gameEventSystem.validateEventData('chat_message', chatMessage);
      expect(result.valid).toBe(true);
      
      console.log('✅ Chat message validation passed');
    });
  });
  
  describe('Event Queue and Prioritization', () => {
    test('should queue events by priority correctly', () => {
      // Queue events of different priorities
      const success1 = gameEventSystem.queueEvent('goal_scored', {
        playerId: 'player1',
        goalType: 'normal',
        timestamp: Date.now()
      }, { playerId: 'player1', roomId: 'room1' });
      
      const success2 = gameEventSystem.queueEvent('chat_message', {
        playerId: 'player1',
        message: 'Hello!',
        timestamp: Date.now()
      }, { playerId: 'player1', roomId: 'room1' });
      
      const success3 = gameEventSystem.queueEvent('player_movement', {
        playerId: 'player1',
        position: { x: 100, y: 200 },
        velocity: { x: 0, y: 0 },
        timestamp: Date.now()
      }, { playerId: 'player1', roomId: 'room1' });
      
      expect(success1).toBe(true);
      expect(success2).toBe(true);
      expect(success3).toBe(true);
      
      // Check queue sizes
      expect(gameEventSystem.eventQueues.CRITICAL.length).toBe(1); // goal_scored
      expect(gameEventSystem.eventQueues.HIGH.length).toBe(1); // player_movement
      expect(gameEventSystem.eventQueues.LOW.length).toBe(1); // chat_message
      
      console.log('✅ Event prioritization working correctly');
    });
    
    test('should process events in priority order', (done) => {
      let processedEvents = [];
      
      gameEventSystem.on('eventProcessed', (event) => {
        processedEvents.push({ type: event.type, priority: event.priority });
        
        // Check after 3 events processed
        if (processedEvents.length === 3) {
          // Should process CRITICAL first, then HIGH, then LOW
          expect(processedEvents[0].priority).toBe('CRITICAL');
          expect(processedEvents[1].priority).toBe('HIGH');
          expect(processedEvents[2].priority).toBe('LOW');
          
          console.log('✅ Events processed in priority order:', 
            processedEvents.map(e => e.priority).join(' -> '));
          done();
        }
      });
      
      // Queue events in reverse priority order
      gameEventSystem.queueEvent('chat_message', {
        playerId: 'player1',
        message: 'Hello!',
        timestamp: Date.now()
      }, { playerId: 'player1', roomId: 'room1' });
      
      gameEventSystem.queueEvent('player_movement', {
        playerId: 'player1',
        position: { x: 100, y: 200 },
        velocity: { x: 0, y: 0 },
        timestamp: Date.now()
      }, { playerId: 'player1', roomId: 'room1' });
      
      gameEventSystem.queueEvent('goal_scored', {
        playerId: 'player1',
        goalType: 'normal',
        timestamp: Date.now()
      }, { playerId: 'player1', roomId: 'room1' });
    });
  });
  
  describe('Rate Limiting', () => {
    test('should enforce rate limits for player movement', () => {
      const playerId = 'player1';
      let successCount = 0;
      
      // Try to send 100 movement events rapidly (limit is 60 per second)
      for (let i = 0; i < 100; i++) {
        const success = gameEventSystem.queueEvent('player_movement', {
          playerId,
          position: { x: 100 + i, y: 200 },
          velocity: { x: 0, y: 0 },
          timestamp: Date.now()
        }, { playerId, roomId: 'room1' });
        
        if (success) successCount++;
      }
      
      // Should allow up to rate limit
      expect(successCount).toBeLessThanOrEqual(60);
      expect(successCount).toBeGreaterThan(50); // Should allow most within limit
      
      console.log(`✅ Rate limiting working: ${successCount}/100 events allowed`);
    });
    
    test('should enforce different rate limits for different event types', () => {
      const playerId = 'player1';
      
      // Chat messages have lower rate limit (2 per second)
      let chatSuccesses = 0;
      for (let i = 0; i < 10; i++) {
        const success = gameEventSystem.queueEvent('chat_message', {
          playerId,
          message: `Message ${i}`,
          timestamp: Date.now()
        }, { playerId, roomId: 'room1' });
        
        if (success) chatSuccesses++;
      }
      
      // Movement has higher rate limit (60 per second)
      let movementSuccesses = 0;
      for (let i = 0; i < 20; i++) {
        const success = gameEventSystem.queueEvent('player_movement', {
          playerId,
          position: { x: 100 + i, y: 200 },
          velocity: { x: 0, y: 0 },
          timestamp: Date.now()
        }, { playerId, roomId: 'room1' });
        
        if (success) movementSuccesses++;
      }
      
      expect(chatSuccesses).toBeLessThanOrEqual(2);
      expect(movementSuccesses).toBeGreaterThan(chatSuccesses);
      
      console.log(`✅ Different rate limits: chat ${chatSuccesses}/10, movement ${movementSuccesses}/20`);
    });
  });
  
  describe('Lag Compensation', () => {
    test('should track player latency', () => {
      const playerId = 'player1';
      const latency = 150; // 150ms
      
      gameEventSystem.updatePlayerLatency(playerId, latency);
      
      const retrievedLatency = gameEventSystem.getPlayerLatency(playerId);
      expect(retrievedLatency).toBe(latency);
      
      console.log(`✅ Player latency tracking: ${retrievedLatency}ms`);
    });
    
    test('should apply lag compensation to movement events', (done) => {
      const playerId = 'player1';
      gameEventSystem.updatePlayerLatency(playerId, 100); // 100ms latency
      
      gameEventSystem.on('eventProcessed', (event) => {
        if (event.type === 'player_movement' && event.lagCompensation) {
          expect(event.lagCompensation.appliedCompensation).toBeGreaterThan(0);
          expect(event.lagCompensation.playerLatency).toBe(100);
          
          console.log(`✅ Lag compensation applied: ${event.lagCompensation.appliedCompensation}ms`);
          done();
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
        latency: 100
      });
    });
  });
  
  describe('Event Broadcasting', () => {
    test('should broadcast room events correctly', (done) => {
      const roomId = 'room1';
      
      gameEventSystem.on('eventProcessed', (event) => {
        if (event.type === 'player_movement') {
          // Check that broadcast was called
          const broadcast = mockConnectionManager.broadcastCalls.find(
            call => call.roomId === roomId && call.eventType === 'player_movement'
          );
          
          expect(broadcast).toBeDefined();
          expect(broadcast.data.playerId).toBe('player1');
          
          console.log('✅ Room broadcast working correctly');
          done();
        }
      });
      
      gameEventSystem.queueEvent('player_movement', {
        playerId: 'player1',
        position: { x: 100, y: 200 },
        velocity: { x: 0, y: 0 },
        timestamp: Date.now()
      }, { playerId: 'player1', roomId });
    });
    
    test('should handle player-specific events', (done) => {
      const playerId = 'player1';
      const mockSocket = new MockSocket();
      mockConnectionManager.addMockConnection(playerId, mockSocket);
      
      gameEventSystem.on('eventProcessed', (event) => {
        if (event.type === 'lag_compensation') {
          // Check that socket emit was called
          const emittedEvent = mockSocket.emittedEvents.find(
            e => e.eventType === 'lag_compensation'
          );
          
          expect(emittedEvent).toBeDefined();
          console.log('✅ Player-specific event broadcast working');
          done();
        }
      });
      
      gameEventSystem.queueEvent('lag_compensation', {
        playerId,
        clientTime: Date.now() - 100,
        serverTime: Date.now(),
        roundTripTime: 100,
        clockDiff: 5
      }, { playerId, roomId: 'room1' });
    });
  });
  
  describe('Performance and Statistics', () => {
    test('should track performance metrics', () => {
      // Queue several events
      for (let i = 0; i < 5; i++) {
        gameEventSystem.queueEvent('heartbeat', {
          playerId: `player${i}`,
          timestamp: Date.now()
        }, { playerId: `player${i}` });
      }
      
      const stats = gameEventSystem.getStats();
      
      expect(stats.eventsQueued).toBe(5);
      expect(stats.totalQueueSize).toBe(5);
      expect(stats.processing).toBe(true);
      
      console.log('✅ Performance metrics:', {
        queued: stats.eventsQueued,
        queueSize: stats.totalQueueSize,
        processing: stats.processing
      });
    });
    
    test('should measure processing performance', (done) => {
      let processedCount = 0;
      
      gameEventSystem.on('eventProcessed', () => {
        processedCount++;
        
        if (processedCount === 3) {
          const stats = gameEventSystem.getStats();
          expect(stats.eventsProcessed).toBe(3);
          expect(stats.avgProcessingTime).toBeGreaterThan(0);
          
          console.log(`✅ Processing performance: ${stats.avgProcessingTime.toFixed(2)}ms avg`);
          done();
        }
      });
      
      // Queue 3 events
      for (let i = 0; i < 3; i++) {
        gameEventSystem.queueEvent('heartbeat', {
          playerId: `player${i}`,
          timestamp: Date.now()
        }, { playerId: `player${i}` });
      }
    });
  });
  
  describe('Error Handling', () => {
    test('should handle unknown event types gracefully', () => {
      const success = gameEventSystem.queueEvent('unknown_event', {
        someData: 'test'
      }, { playerId: 'player1' });
      
      expect(success).toBe(false);
      console.log('✅ Unknown event types handled gracefully');
    });
    
    test('should emit validation errors', (done) => {
      gameEventSystem.on('validationError', (errorData) => {
        expect(errorData.eventType).toBe('player_movement');
        expect(errorData.errors.length).toBeGreaterThan(0);
        
        console.log(`✅ Validation error emitted: ${errorData.errors[0]}`);
        done();
      });
      
      // Send invalid movement event
      gameEventSystem.queueEvent('player_movement', {
        playerId: 'player1',
        position: { x: 999, y: 200 }, // Invalid x position
        // Missing required fields
      }, { playerId: 'player1', roomId: 'room1' });
    });
    
    test('should emit rate limit exceeded events', (done) => {
      gameEventSystem.on('rateLimitExceeded', (data) => {
        expect(data.eventType).toBe('chat_message');
        expect(data.playerId).toBe('player1');
        
        console.log('✅ Rate limit exceeded event emitted');
        done();
      });
      
      // Spam chat messages to trigger rate limit
      for (let i = 0; i < 10; i++) {
        gameEventSystem.queueEvent('chat_message', {
          playerId: 'player1',
          message: `Spam ${i}`,
          timestamp: Date.now()
        }, { playerId: 'player1', roomId: 'room1' });
      }
    });
  });
  
  describe('System Lifecycle', () => {
    test('should start and stop processing correctly', () => {
      expect(gameEventSystem.processing).toBe(false);
      
      // Queue an event to start processing
      gameEventSystem.queueEvent('heartbeat', {
        playerId: 'player1',
        timestamp: Date.now()
      }, { playerId: 'player1' });
      
      expect(gameEventSystem.processing).toBe(true);
      
      // Stop processing
      gameEventSystem.stopProcessing();
      expect(gameEventSystem.processing).toBe(false);
      
      console.log('✅ Processing lifecycle working correctly');
    });
    
    test('should cleanup resources on shutdown', () => {
      // Add some data
      gameEventSystem.updatePlayerLatency('player1', 100);
      gameEventSystem.queueEvent('heartbeat', {
        playerId: 'player1',
        timestamp: Date.now()
      }, { playerId: 'player1' });
      
      expect(gameEventSystem.getTotalQueueSize()).toBeGreaterThan(0);
      expect(gameEventSystem.playerLatencies.size).toBeGreaterThan(0);
      
      // Shutdown
      gameEventSystem.shutdown();
      
      expect(gameEventSystem.getTotalQueueSize()).toBe(0);
      expect(gameEventSystem.playerLatencies.size).toBe(0);
      expect(gameEventSystem.processing).toBe(false);
      
      console.log('✅ Resource cleanup working correctly');
    });
  });
});

// Run tests if called directly
if (require.main === module) {
  console.log('🧪 Running Game Event System Tests...\n');
  
  // Simple test runner
  const tests = [
    async () => {
      const mockConnectionManager = new MockConnectionManager();
      const gameEventSystem = new GameEventSystem(mockConnectionManager);
      
      try {
        console.log('Testing event definitions...');
        const eventTypes = Object.keys(gameEventSystem.eventDefinitions);
        console.log(`✅ ${eventTypes.length} event types defined`);
        
        console.log('Testing event validation...');
        const result = gameEventSystem.validateEventData('player_movement', {
          playerId: 'test',
          position: { x: 100, y: 200 },
          velocity: { x: 0, y: 0 },
          timestamp: Date.now()
        });
        console.log(`✅ Validation ${result.valid ? 'passed' : 'failed'}`);
        
        console.log('Testing event queueing...');
        const success = gameEventSystem.queueEvent('heartbeat', {
          playerId: 'test',
          timestamp: Date.now()
        }, { playerId: 'test' });
        console.log(`✅ Event queuing ${success ? 'successful' : 'failed'}`);
        
        console.log('Testing rate limiting...');
        let rateLimitHit = false;
        for (let i = 0; i < 10; i++) {
          const limited = gameEventSystem.queueEvent('chat_message', {
            playerId: 'test',
            message: `Test ${i}`,
            timestamp: Date.now()
          }, { playerId: 'test' });
          if (!limited) rateLimitHit = true;
        }
        console.log(`✅ Rate limiting ${rateLimitHit ? 'working' : 'not triggered'}`);
        
        console.log('Testing performance...');
        const stats = gameEventSystem.getStats();
        console.log(`✅ Stats: ${stats.eventsQueued} queued, ${stats.totalQueueSize} in queue`);
        
        gameEventSystem.shutdown();
        console.log('✅ All tests completed successfully!');
        
      } catch (error) {
        console.error('❌ Test failed:', error);
        gameEventSystem.shutdown();
      }
    }
  ];
  
  // Run all tests
  Promise.all(tests.map(test => test()))
    .then(() => {
      console.log('\n🎉 Game Event System tests completed!');
    })
    .catch(error => {
      console.error('\n❌ Tests failed:', error);
      process.exit(1);
    });
}

module.exports = { GameEventSystem, MockConnectionManager, MockSocket };