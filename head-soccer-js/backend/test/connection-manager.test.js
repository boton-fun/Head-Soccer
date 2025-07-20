/**
 * Connection Manager Unit Tests
 * Comprehensive testing for WebSocket connection management
 */

const { Server } = require('socket.io');
const { createServer } = require('http');
const Client = require('socket.io-client');
const ConnectionManager = require('../websocket/connectionManager');

// Test configuration
const TEST_PORT = 3002;
const TEST_URL = `http://localhost:${TEST_PORT}`;

describe('Connection Manager', () => {
  let httpServer;
  let io;
  let connectionManager;
  let clientSocket;
  
  beforeEach((done) => {
    // Create HTTP server and Socket.IO instance
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: { origin: "*" }
    });
    
    // Initialize Connection Manager
    connectionManager = new ConnectionManager(io, {
      heartbeatInterval: 1000, // 1 second for testing
      connectionTimeout: 3000,  // 3 seconds for testing
      cleanupInterval: 2000     // 2 seconds for testing
    });
    
    httpServer.listen(TEST_PORT, () => {
      done();
    });
  });
  
  afterEach((done) => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    connectionManager.shutdown();
    httpServer.close(() => {
      done();
    });
  });
  
  describe('Basic Connection Management', () => {
    test('should handle new client connection', (done) => {
      connectionManager.on('connection', (data) => {
        expect(data.socketId).toBeDefined();
        expect(data.connection.socketId).toBe(data.socketId);
        expect(data.connection.isAuthenticated).toBe(false);
        done();
      });
      
      clientSocket = Client(TEST_URL);
    });
    
    test('should track connection statistics', (done) => {
      clientSocket = Client(TEST_URL);
      
      clientSocket.on('connected', () => {
        const stats = connectionManager.getStats();
        expect(stats.totalConnections).toBe(1);
        expect(stats.activeConnections).toBe(1);
        expect(stats.authenticatedConnections).toBe(0);
        done();
      });
    });
    
    test('should reject connections when at capacity', (done) => {
      // Set very low connection limit
      connectionManager.maxConnections = 1;
      
      const client1 = Client(TEST_URL);
      const client2 = Client(TEST_URL);
      
      client1.on('connected', () => {
        // First connection should succeed
        expect(true).toBe(true);
      });
      
      client2.on('connection_rejected', (data) => {
        expect(data.reason).toBe('Server at capacity');
        client1.disconnect();
        client2.disconnect();
        done();
      });
    });
  });
  
  describe('Player Authentication', () => {
    test('should authenticate player with valid data', (done) => {
      clientSocket = Client(TEST_URL);
      
      clientSocket.on('connected', () => {
        clientSocket.emit('authenticate', {
          playerId: 'test-player-123',
          username: 'TestPlayer',
          token: 'valid-token'
        });
      });
      
      clientSocket.on('authenticated', (data) => {
        expect(data.playerId).toBe('test-player-123');
        expect(data.username).toBe('TestPlayer');
        expect(data.socketId).toBeDefined();
        
        // Check if connection is tracked
        const playerConnection = connectionManager.getPlayerConnection('test-player-123');
        expect(playerConnection).toBeDefined();
        expect(playerConnection.isAuthenticated).toBe(true);
        done();
      });
    });
    
    test('should reject authentication with missing data', (done) => {
      clientSocket = Client(TEST_URL);
      
      clientSocket.on('connected', () => {
        clientSocket.emit('authenticate', {
          username: 'TestPlayer'
          // Missing playerId
        });
      });
      
      clientSocket.on('auth_error', (data) => {
        expect(data.reason).toBe('Missing required fields');
        done();
      });
    });
    
    test('should handle player reconnection', (done) => {
      const playerId = 'reconnect-test-player';
      
      // First connection
      const client1 = Client(TEST_URL);
      
      client1.on('connected', () => {
        client1.emit('authenticate', {
          playerId: playerId,
          username: 'ReconnectTest'
        });
      });
      
      client1.on('authenticated', () => {
        // Simulate disconnection and immediate reconnection
        client1.disconnect();
        
        setTimeout(() => {
          // Second connection (reconnection)
          const client2 = Client(TEST_URL);
          
          client2.on('connected', () => {
            client2.emit('authenticate', {
              playerId: playerId,
              username: 'ReconnectTest'
            });
          });
          
          client2.on('reconnected', (data) => {
            expect(data.playerId).toBe(playerId);
            expect(data.socketId).toBeDefined();
            expect(data.previousSocketId).toBeDefined();
            expect(data.reconnectCount).toBe(1);
            
            client2.disconnect();
            done();
          });
        }, 100);
      });
    });
  });
  
  describe('Room Management', () => {
    test('should handle room joining', (done) => {
      clientSocket = Client(TEST_URL);
      const roomId = 'test-room-123';
      
      clientSocket.on('connected', () => {
        clientSocket.emit('authenticate', {
          playerId: 'room-test-player',
          username: 'RoomTestPlayer'
        });
      });
      
      clientSocket.on('authenticated', () => {
        clientSocket.emit('join_room', { roomId });
      });
      
      clientSocket.on('room_joined', (data) => {
        expect(data.roomId).toBe(roomId);
        expect(data.playersInRoom).toBe(1);
        
        // Check room connections
        const roomConnections = connectionManager.getRoomConnections(roomId);
        expect(roomConnections.length).toBe(1);
        expect(roomConnections[0].roomId).toBe(roomId);
        done();
      });
    });
    
    test('should handle room leaving', (done) => {
      clientSocket = Client(TEST_URL);
      const roomId = 'leave-test-room';
      
      clientSocket.on('connected', () => {
        clientSocket.emit('authenticate', {
          playerId: 'leave-test-player',
          username: 'LeaveTestPlayer'
        });
      });
      
      clientSocket.on('authenticated', () => {
        clientSocket.emit('join_room', { roomId });
      });
      
      clientSocket.on('room_joined', () => {
        clientSocket.emit('leave_room', { roomId });
      });
      
      clientSocket.on('room_left', (data) => {
        expect(data.roomId).toBe(roomId);
        
        // Check room is cleaned up
        const roomConnections = connectionManager.getRoomConnections(roomId);
        expect(roomConnections.length).toBe(0);
        done();
      });
    });
    
    test('should automatically leave room on disconnection', (done) => {
      const roomId = 'auto-leave-room';
      
      connectionManager.on('player_left_room', (data) => {
        expect(data.roomId).toBe(roomId);
        
        // Check room is cleaned up
        setTimeout(() => {
          const roomConnections = connectionManager.getRoomConnections(roomId);
          expect(roomConnections.length).toBe(0);
          done();
        }, 100);
      });
      
      clientSocket = Client(TEST_URL);
      
      clientSocket.on('connected', () => {
        clientSocket.emit('authenticate', {
          playerId: 'auto-leave-player',
          username: 'AutoLeavePlayer'
        });
      });
      
      clientSocket.on('authenticated', () => {
        clientSocket.emit('join_room', { roomId });
      });
      
      clientSocket.on('room_joined', () => {
        // Disconnect to trigger auto-leave
        clientSocket.disconnect();
      });
    });
  });
  
  describe('Broadcasting', () => {
    test('should broadcast to all connected clients', (done) => {
      const client1 = Client(TEST_URL);
      const client2 = Client(TEST_URL);
      let messagesReceived = 0;
      
      const checkComplete = () => {
        messagesReceived++;
        if (messagesReceived === 2) {
          client1.disconnect();
          client2.disconnect();
          done();
        }
      };
      
      client1.on('test_broadcast', (data) => {
        expect(data.message).toBe('Hello everyone');
        checkComplete();
      });
      
      client2.on('test_broadcast', (data) => {
        expect(data.message).toBe('Hello everyone');
        checkComplete();
      });
      
      setTimeout(() => {
        connectionManager.broadcastToAll('test_broadcast', {
          message: 'Hello everyone'
        });
      }, 200);
    });
    
    test('should broadcast to specific room', (done) => {
      const roomId = 'broadcast-room';
      const client1 = Client(TEST_URL);
      const client2 = Client(TEST_URL);
      const client3 = Client(TEST_URL); // Not in room
      
      let client1Ready = false;
      let client2Ready = false;
      let client3MessageReceived = false;
      
      const checkReady = () => {
        if (client1Ready && client2Ready) {
          // Broadcast to room
          connectionManager.broadcastToRoom(roomId, 'room_broadcast', {
            message: 'Room message'
          });
          
          // Check that client3 didn't receive message
          setTimeout(() => {
            expect(client3MessageReceived).toBe(false);
            client1.disconnect();
            client2.disconnect();
            client3.disconnect();
            done();
          }, 200);
        }
      };
      
      // Client 1 and 2 join room
      client1.on('connected', () => {
        client1.emit('authenticate', { playerId: 'room-player-1', username: 'Player1' });
      });
      
      client1.on('authenticated', () => {
        client1.emit('join_room', { roomId });
      });
      
      client1.on('room_joined', () => {
        client1Ready = true;
        checkReady();
      });
      
      client2.on('connected', () => {
        client2.emit('authenticate', { playerId: 'room-player-2', username: 'Player2' });
      });
      
      client2.on('authenticated', () => {
        client2.emit('join_room', { roomId });
      });
      
      client2.on('room_joined', () => {
        client2Ready = true;
        checkReady();
      });
      
      // Client 3 doesn't join room
      client3.on('connected', () => {
        client3.emit('authenticate', { playerId: 'non-room-player', username: 'Player3' });
      });
      
      // Track messages
      let roomMessagesReceived = 0;
      
      client1.on('room_broadcast', (data) => {
        expect(data.message).toBe('Room message');
        roomMessagesReceived++;
      });
      
      client2.on('room_broadcast', (data) => {
        expect(data.message).toBe('Room message');
        roomMessagesReceived++;
      });
      
      client3.on('room_broadcast', () => {
        client3MessageReceived = true;
      });
    });
    
    test('should send message to specific player', (done) => {
      const playerId = 'specific-player';
      
      clientSocket = Client(TEST_URL);
      
      clientSocket.on('connected', () => {
        clientSocket.emit('authenticate', {
          playerId: playerId,
          username: 'SpecificPlayer'
        });
      });
      
      clientSocket.on('authenticated', () => {
        // Send message to specific player
        connectionManager.sendToPlayer(playerId, 'direct_message', {
          message: 'Hello specific player'
        });
      });
      
      clientSocket.on('direct_message', (data) => {
        expect(data.message).toBe('Hello specific player');
        done();
      });
    });
  });
  
  describe('Health Monitoring', () => {
    test('should respond to ping requests', (done) => {
      clientSocket = Client(TEST_URL);
      
      clientSocket.on('connected', () => {
        const startTime = Date.now();
        clientSocket.emit('ping', { clientTime: startTime });
      });
      
      clientSocket.on('pong', (data) => {
        expect(data.serverTime).toBeDefined();
        expect(data.clientTime).toBeDefined();
        expect(typeof data.serverTime).toBe('number');
        done();
      });
    });
    
    test('should track connection activity', (done) => {
      clientSocket = Client(TEST_URL);
      
      clientSocket.on('connected', () => {
        // Send multiple messages to track activity
        clientSocket.emit('ping', {});
        clientSocket.emit('ping', {});
        clientSocket.emit('ping', {});
        
        setTimeout(() => {
          const stats = connectionManager.getStats();
          expect(stats.activeConnections).toBe(1);
          
          // Check specific connection
          const connections = Array.from(connectionManager.connections.values());
          expect(connections.length).toBe(1);
          expect(connections[0].stats.messagesReceived).toBeGreaterThan(0);
          done();
        }, 100);
      });
    });
    
    test('should start and stop health monitoring', () => {
      expect(connectionManager.heartbeatIntervalId).toBe(null);
      expect(connectionManager.cleanupIntervalId).toBe(null);
      
      connectionManager.startMonitoring();
      
      expect(connectionManager.heartbeatIntervalId).not.toBe(null);
      expect(connectionManager.cleanupIntervalId).not.toBe(null);
      
      connectionManager.stopMonitoring();
      
      expect(connectionManager.heartbeatIntervalId).toBe(null);
      expect(connectionManager.cleanupIntervalId).toBe(null);
    });
  });
  
  describe('Error Handling', () => {
    test('should handle socket errors gracefully', (done) => {
      connectionManager.on('socket_error', (data) => {
        expect(data.socketId).toBeDefined();
        expect(data.error).toBeDefined();
        done();
      });
      
      clientSocket = Client(TEST_URL);
      
      clientSocket.on('connected', () => {
        // Force an error by sending invalid data
        clientSocket.emit('invalid_event', { invalid: 'data' });
        
        // Simulate socket error
        setTimeout(() => {
          clientSocket.emit('error', new Error('Test error'));
        }, 100);
      });
    });
    
    test('should handle disconnection cleanup', (done) => {
      connectionManager.on('player_disconnected', (data) => {
        expect(data.socketId).toBeDefined();
        expect(data.reason).toBeDefined();
        expect(data.connectionDuration).toBeGreaterThan(0);
        
        // Check cleanup
        setTimeout(() => {
          const stats = connectionManager.getStats();
          expect(stats.activeConnections).toBe(0);
          done();
        }, 6000); // Wait for cleanup timeout
      });
      
      clientSocket = Client(TEST_URL);
      
      clientSocket.on('connected', () => {
        clientSocket.disconnect();
      });
    });
  });
  
  describe('Performance and Limits', () => {
    test('should handle multiple concurrent connections', (done) => {
      const clientCount = 10;
      const clients = [];
      let connectedCount = 0;
      
      for (let i = 0; i < clientCount; i++) {
        const client = Client(TEST_URL);
        clients.push(client);
        
        client.on('connected', () => {
          connectedCount++;
          
          if (connectedCount === clientCount) {
            const stats = connectionManager.getStats();
            expect(stats.activeConnections).toBe(clientCount);
            expect(stats.totalConnections).toBe(clientCount);
            
            // Disconnect all
            clients.forEach(c => c.disconnect());
            done();
          }
        });
      }
    });
    
    test('should calculate statistics correctly', (done) => {
      clientSocket = Client(TEST_URL);
      
      clientSocket.on('connected', () => {
        clientSocket.emit('authenticate', {
          playerId: 'stats-player',
          username: 'StatsPlayer'
        });
      });
      
      clientSocket.on('authenticated', () => {
        const stats = connectionManager.getStats();
        
        expect(stats.totalConnections).toBe(1);
        expect(stats.activeConnections).toBe(1);
        expect(stats.authenticatedConnections).toBe(1);
        expect(stats.uptime).toBeGreaterThan(0);
        expect(stats.connectionsPerMinute).toBeGreaterThan(0);
        expect(stats.avgConnectionDuration).toBeGreaterThan(0);
        
        done();
      });
    });
  });
  
  describe('Graceful Shutdown', () => {
    test('should shutdown gracefully', (done) => {
      clientSocket = Client(TEST_URL);
      
      clientSocket.on('connected', () => {
        // Trigger shutdown
        connectionManager.shutdown();
      });
      
      clientSocket.on('server_shutdown', (data) => {
        expect(data.message).toBe('Server is shutting down');
        expect(data.timestamp).toBeDefined();
        done();
      });
      
      clientSocket.on('disconnect', (reason) => {
        expect(reason).toBe('server disconnect');
      });
    });
  });
});

// Performance test suite
describe('Connection Manager Performance', () => {
  let httpServer;
  let io;
  let connectionManager;
  
  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer, {
      cors: { origin: "*" }
    });
    
    connectionManager = new ConnectionManager(io, {
      maxConnections: 1000,
      heartbeatInterval: 5000,
      connectionTimeout: 10000
    });
    
    httpServer.listen(TEST_PORT + 1, () => {
      done();
    });
  });
  
  afterAll((done) => {
    connectionManager.shutdown();
    httpServer.close(() => {
      done();
    });
  });
  
  test('should handle rapid connections and disconnections', async () => {
    const iterations = 50;
    const clients = [];
    
    const startTime = Date.now();
    
    // Create connections rapidly
    for (let i = 0; i < iterations; i++) {
      const client = Client(`http://localhost:${TEST_PORT + 1}`);
      clients.push(client);
      
      await new Promise(resolve => {
        client.on('connected', resolve);
      });
    }
    
    const connectionTime = Date.now() - startTime;
    console.log(`Created ${iterations} connections in ${connectionTime}ms`);
    
    // Disconnect all rapidly
    const disconnectStart = Date.now();
    clients.forEach(client => client.disconnect());
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const disconnectTime = Date.now() - disconnectStart;
    console.log(`Disconnected ${iterations} connections in ${disconnectTime}ms`);
    
    const stats = connectionManager.getStats();
    expect(stats.totalConnections).toBe(iterations);
    expect(connectionTime).toBeLessThan(5000); // Should connect within 5 seconds
    expect(disconnectTime).toBeLessThan(2000); // Should disconnect within 2 seconds
  }, 10000);
});

console.log('🧪 Connection Manager Test Suite Loaded');
console.log('Run with: npm test -- connection-manager.test.js');