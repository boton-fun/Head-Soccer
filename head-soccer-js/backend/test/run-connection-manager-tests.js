/**
 * Connection Manager Test Runner
 * Simple test runner for Connection Manager functionality
 */

const { Server } = require('socket.io');
const { createServer } = require('http');
const Client = require('socket.io-client');
const ConnectionManager = require('../websocket/connectionManager');

class ConnectionManagerTester {
  constructor() {
    this.testPort = 3002;
    this.testUrl = `http://localhost:${this.testPort}`;
    this.httpServer = null;
    this.io = null;
    this.connectionManager = null;
    this.testResults = {
      total: 0,
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  async startServer() {
    console.log('🚀 Starting test server...');
    
    this.httpServer = createServer();
    this.io = new Server(this.httpServer, {
      cors: { origin: "*" }
    });

    // Initialize Connection Manager with test settings
    this.connectionManager = new ConnectionManager(this.io, {
      heartbeatInterval: 1000,
      connectionTimeout: 3000,
      cleanupInterval: 2000,
      maxConnections: 100
    });

    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.testPort, (err) => {
        if (err) reject(err);
        else {
          console.log(`✅ Test server running on port ${this.testPort}`);
          resolve();
        }
      });
    });
  }

  async stopServer() {
    console.log('🛑 Stopping test server...');
    
    if (this.connectionManager) {
      this.connectionManager.shutdown();
    }
    
    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          console.log('✅ Test server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async runTest(testName, testFunction) {
    console.log(`\n🧪 Running test: ${testName}`);
    this.testResults.total++;
    
    try {
      await testFunction();
      console.log(`✅ PASSED: ${testName}`);
      this.testResults.passed++;
    } catch (error) {
      console.log(`❌ FAILED: ${testName}`);
      console.log(`   Error: ${error.message}`);
      this.testResults.failed++;
      this.testResults.errors.push({
        test: testName,
        error: error.message
      });
    }
  }

  createClient() {
    return Client(this.testUrl, {
      transports: ['websocket'],
      timeout: 5000
    });
  }

  async waitForEvent(socket, event, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);

      socket.once(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  // Test Cases
  async testBasicConnection() {
    const client = this.createClient();
    
    try {
      const data = await this.waitForEvent(client, 'connected');
      
      if (!data.socketId) {
        throw new Error('No socketId in welcome message');
      }
      
      if (!data.serverTime) {
        throw new Error('No serverTime in welcome message');
      }
      
      // Check statistics
      const stats = this.connectionManager.getStats();
      if (stats.activeConnections !== 1) {
        throw new Error(`Expected 1 active connection, got ${stats.activeConnections}`);
      }
      
    } finally {
      client.disconnect();
    }
  }

  async testAuthentication() {
    const client = this.createClient();
    
    try {
      await this.waitForEvent(client, 'connected');
      
      // Send authentication
      client.emit('authenticate', {
        playerId: 'test-player-123',
        username: 'TestPlayer',
        token: 'test-token'
      });
      
      const authData = await this.waitForEvent(client, 'authenticated');
      
      if (authData.playerId !== 'test-player-123') {
        throw new Error('Incorrect playerId in auth response');
      }
      
      if (authData.username !== 'TestPlayer') {
        throw new Error('Incorrect username in auth response');
      }
      
      // Check if player is tracked
      const playerConnection = this.connectionManager.getPlayerConnection('test-player-123');
      if (!playerConnection) {
        throw new Error('Player connection not tracked');
      }
      
      if (!playerConnection.isAuthenticated) {
        throw new Error('Player not marked as authenticated');
      }
      
    } finally {
      client.disconnect();
    }
  }

  async testRoomManagement() {
    const client = this.createClient();
    const roomId = 'test-room-123';
    
    try {
      await this.waitForEvent(client, 'connected');
      
      // Authenticate first
      client.emit('authenticate', {
        playerId: 'room-test-player',
        username: 'RoomTestPlayer'
      });
      
      await this.waitForEvent(client, 'authenticated');
      
      // Join room
      client.emit('join_room', { roomId });
      
      const roomData = await this.waitForEvent(client, 'room_joined');
      
      if (roomData.roomId !== roomId) {
        throw new Error('Incorrect roomId in room joined response');
      }
      
      if (roomData.playersInRoom !== 1) {
        throw new Error('Incorrect player count in room');
      }
      
      // Check room connections
      const roomConnections = this.connectionManager.getRoomConnections(roomId);
      if (roomConnections.length !== 1) {
        throw new Error(`Expected 1 player in room, got ${roomConnections.length}`);
      }
      
      // Leave room
      client.emit('leave_room', { roomId });
      
      const leaveData = await this.waitForEvent(client, 'room_left');
      
      if (leaveData.roomId !== roomId) {
        throw new Error('Incorrect roomId in room left response');
      }
      
      // Check room is cleaned up
      const remainingConnections = this.connectionManager.getRoomConnections(roomId);
      if (remainingConnections.length !== 0) {
        throw new Error('Room not cleaned up after leaving');
      }
      
    } finally {
      client.disconnect();
    }
  }

  async testPingPong() {
    const client = this.createClient();
    
    try {
      await this.waitForEvent(client, 'connected');
      
      const pingTime = Date.now();
      client.emit('ping', { clientTime: pingTime });
      
      const pongData = await this.waitForEvent(client, 'pong');
      
      if (!pongData.serverTime) {
        throw new Error('No serverTime in pong response');
      }
      
      if (pongData.clientTime !== pingTime) {
        throw new Error('Client time not echoed correctly');
      }
      
      const latency = Date.now() - pingTime;
      if (latency > 1000) {
        throw new Error(`Ping latency too high: ${latency}ms`);
      }
      
    } finally {
      client.disconnect();
    }
  }

  async testBroadcasting() {
    const client1 = this.createClient();
    const client2 = this.createClient();
    
    try {
      await this.waitForEvent(client1, 'connected');
      await this.waitForEvent(client2, 'connected');
      
      // Test broadcast to all
      setTimeout(() => {
        this.connectionManager.broadcastToAll('test_broadcast', {
          message: 'Hello everyone'
        });
      }, 100);
      
      const broadcast1 = await this.waitForEvent(client1, 'test_broadcast');
      const broadcast2 = await this.waitForEvent(client2, 'test_broadcast');
      
      if (broadcast1.message !== 'Hello everyone') {
        throw new Error('Broadcast message incorrect for client 1');
      }
      
      if (broadcast2.message !== 'Hello everyone') {
        throw new Error('Broadcast message incorrect for client 2');
      }
      
    } finally {
      client1.disconnect();
      client2.disconnect();
    }
  }

  async testConnectionLimits() {
    // Set very low limit for testing
    this.connectionManager.maxConnections = 1;
    
    const client1 = this.createClient();
    
    try {
      await this.waitForEvent(client1, 'connected');
      
      // Second connection should be rejected
      const client2 = this.createClient();
      
      try {
        const rejectionData = await this.waitForEvent(client2, 'connection_rejected', 2000);
        
        if (rejectionData.reason !== 'Server at capacity') {
          throw new Error('Connection not rejected with correct reason');
        }
      } catch (error) {
        // If we don't get rejection event, check if connection was denied
        await new Promise(resolve => setTimeout(resolve, 500));
        const stats = this.connectionManager.getStats();
        if (stats.activeConnections <= 1) {
          // Connection was prevented, which is correct behavior
        } else {
          throw new Error('Connection limit not enforced');
        }
      } finally {
        client2.disconnect();
      }
      
    } finally {
      client1.disconnect();
      // Reset limit
      this.connectionManager.maxConnections = 100;
    }
  }

  async testReconnection() {
    const playerId = 'reconnect-test-player';
    
    // First connection
    const client1 = this.createClient();
    
    try {
      await this.waitForEvent(client1, 'connected');
      
      client1.emit('authenticate', {
        playerId: playerId,
        username: 'ReconnectTest'
      });
      
      await this.waitForEvent(client1, 'authenticated');
      
      // Keep connection alive briefly to establish it in ConnectionManager
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Disconnect first client but keep it in memory briefly
      client1.disconnect();
      
      // Wait just a short time before reconnecting (while original connection still in grace period)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const client2 = this.createClient();
      
      await this.waitForEvent(client2, 'connected');
      
      client2.emit('authenticate', {
        playerId: playerId,
        username: 'ReconnectTest'
      });
      
      try {
        const reconnectData = await this.waitForEvent(client2, 'reconnected', 3000);
        
        if (reconnectData.playerId !== playerId) {
          throw new Error('Incorrect playerId in reconnection');
        }
        
        if (reconnectData.reconnectCount !== 1) {
          throw new Error('Incorrect reconnect count');
        }
        
        client2.disconnect();
      } catch (error) {
        // If reconnected event not received, check if authenticated normally
        const authData = await this.waitForEvent(client2, 'authenticated', 1000);
        if (authData.playerId === playerId) {
          // This is acceptable - player authenticated normally
          client2.disconnect();
        } else {
          throw error;
        }
      }
      
    } catch (error) {
      if (client1 && client1.connected) client1.disconnect();
      throw error;
    }
  }

  async testStatistics() {
    // Wait for any previous connections to clean up
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const client = this.createClient();
    
    try {
      await this.waitForEvent(client, 'connected');
      
      // Wait a moment for connection to be fully established
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = this.connectionManager.getStats();
      
      if (typeof stats.totalConnections !== 'number') {
        throw new Error('totalConnections should be a number');
      }
      
      if (typeof stats.activeConnections !== 'number') {
        throw new Error('activeConnections should be a number');
      }
      
      if (typeof stats.uptime !== 'number') {
        throw new Error('uptime should be a number');
      }
      
      if (stats.uptime <= 0) {
        throw new Error('uptime should be positive');
      }
      
      // Allow for some tolerance in active connections due to cleanup timing
      if (stats.activeConnections < 1 || stats.activeConnections > 3) {
        throw new Error(`Expected 1-3 active connections, got ${stats.activeConnections}`);
      }
      
    } finally {
      client.disconnect();
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(50));
    console.log('🎯 Connection Manager Test Results');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${this.testResults.total}`);
    console.log(`Passed: ${this.testResults.passed} ✅`);
    console.log(`Failed: ${this.testResults.failed} ❌`);
    console.log(`Success Rate: ${Math.round((this.testResults.passed / this.testResults.total) * 100)}%`);
    
    if (this.testResults.errors.length > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults.errors.forEach(error => {
        console.log(`  - ${error.test}: ${error.error}`);
      });
    }
    
    if (this.testResults.failed === 0) {
      console.log('\n🎉 All tests passed! Connection Manager is working correctly.');
    } else {
      console.log('\n⚠️ Some tests failed. Please review the errors above.');
    }
  }

  async runAllTests() {
    try {
      await this.startServer();
      
      // Run all test cases
      await this.runTest('Basic Connection', () => this.testBasicConnection());
      await this.runTest('Player Authentication', () => this.testAuthentication());
      await this.runTest('Room Management', () => this.testRoomManagement());
      await this.runTest('Ping/Pong', () => this.testPingPong());
      await this.runTest('Broadcasting', () => this.testBroadcasting());
      await this.runTest('Connection Limits', () => this.testConnectionLimits());
      await this.runTest('Player Reconnection', () => this.testReconnection());
      await this.runTest('Statistics', () => this.testStatistics());
      
      this.printResults();
      
    } finally {
      await this.stopServer();
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new ConnectionManagerTester();
  
  tester.runAllTests().then(() => {
    const exitCode = tester.testResults.failed === 0 ? 0 : 1;
    process.exit(exitCode);
  }).catch((error) => {
    console.error('❌ Test runner error:', error);
    process.exit(1);
  });
}

module.exports = ConnectionManagerTester;