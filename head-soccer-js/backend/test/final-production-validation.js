/**
 * Final Production Validation for Connection Manager
 * Comprehensive validation of all features with proper timing
 */

const io = require('socket.io-client');
const { performance } = require('perf_hooks');

class FinalProductionValidation {
  constructor() {
    this.serverUrl = 'https://head-soccer-production.up.railway.app';
    this.results = {
      tests: [],
      passed: 0,
      failed: 0,
      warnings: 0
    };
  }

  createClient() {
    return io(this.serverUrl, {
      transports: ['polling'],
      timeout: 15000,
      forceNew: true
    });
  }

  async waitForEvent(socket, event, timeout = 10000) {
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

  recordTest(name, passed, details = null, warning = false) {
    this.results.tests.push({ name, passed, details, warning });
    
    if (warning) {
      this.results.warnings++;
      console.log(`⚠️ ${name}${details ? ` - ${details}` : ''}`);
    } else if (passed) {
      this.results.passed++;
      console.log(`✅ ${name}`);
    } else {
      this.results.failed++;
      console.log(`❌ ${name}${details ? ` - ${details}` : ''}`);
    }
  }

  async testBasicConnectivity() {
    console.log('\n🔍 Test 1: Basic Connectivity & Welcome Message');
    console.log('='.repeat(60));

    try {
      const client = this.createClient();
      const startTime = performance.now();

      await this.waitForEvent(client, 'connect');
      const connectTime = performance.now() - startTime;

      const welcomeData = await this.waitForEvent(client, 'connected');
      const welcomeTime = performance.now() - startTime;

      this.recordTest('WebSocket Connection Established', true);
      this.recordTest('Welcome Message Received', !!welcomeData.socketId);
      this.recordTest('Server Time Provided', !!welcomeData.serverTime);
      this.recordTest('Heartbeat Interval Configured', !!welcomeData.heartbeatInterval);
      
      if (connectTime > 2000) {
        this.recordTest('Connection Speed', false, `${connectTime.toFixed(2)}ms (>2s)`, true);
      } else {
        this.recordTest('Connection Speed Acceptable', connectTime < 1500);
      }

      client.disconnect();
      console.log(`   Connection Time: ${connectTime.toFixed(2)}ms`);
      console.log(`   Welcome Time: ${welcomeTime.toFixed(2)}ms`);
      
    } catch (error) {
      this.recordTest('Basic Connectivity', false, error.message);
    }
  }

  async testAuthenticationFlow() {
    console.log('\n🔍 Test 2: Complete Authentication Flow');
    console.log('='.repeat(60));

    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      // Valid authentication
      const authStart = performance.now();
      client.emit('authenticate', {
        playerId: 'final-test-player-123',
        username: 'FinalTestUser',
        token: 'production-test-token'
      });

      const authData = await this.waitForEvent(client, 'authenticated');
      const authTime = performance.now() - authStart;

      this.recordTest('Player Authentication Success', true);
      this.recordTest('Player ID Returned', authData.playerId === 'final-test-player-123');
      this.recordTest('Username Returned', authData.username === 'FinalTestUser');
      this.recordTest('Socket ID Provided', !!authData.socketId);
      this.recordTest('Authentication Response Time', authTime < 1000);

      console.log(`   Authentication Time: ${authTime.toFixed(2)}ms`);
      console.log(`   Player ID: ${authData.playerId}`);
      console.log(`   Username: ${authData.username}`);

      client.disconnect();
    } catch (error) {
      this.recordTest('Authentication Flow', false, error.message);
    }

    // Test invalid authentication
    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      client.emit('authenticate', {
        username: 'NoPlayerID'
        // Missing required playerId
      });

      try {
        await this.waitForEvent(client, 'auth_error', 3000);
        this.recordTest('Invalid Auth Error Handling', true);
      } catch (error) {
        this.recordTest('Invalid Auth Error Handling', false, 'No error response received');
      }

      client.disconnect();
    } catch (error) {
      this.recordTest('Invalid Auth Testing', false, error.message);
    }
  }

  async testRoomManagement() {
    console.log('\n🔍 Test 3: Room Management System');
    console.log('='.repeat(60));

    try {
      const client1 = this.createClient();
      const client2 = this.createClient();

      // Setup clients
      await this.waitForEvent(client1, 'connect');
      await this.waitForEvent(client1, 'connected');
      await this.waitForEvent(client2, 'connect');
      await this.waitForEvent(client2, 'connected');

      // Authenticate both
      client1.emit('authenticate', { playerId: 'room-player-1', username: 'RoomUser1' });
      client2.emit('authenticate', { playerId: 'room-player-2', username: 'RoomUser2' });

      await this.waitForEvent(client1, 'authenticated');
      await this.waitForEvent(client2, 'authenticated');

      const roomId = `final-test-room-${Date.now()}`;

      // First player joins
      client1.emit('join_room', { roomId });
      const room1Data = await this.waitForEvent(client1, 'room_joined');

      this.recordTest('Room Creation & First Join', room1Data.roomId === roomId);
      this.recordTest('Player Count Tracking', room1Data.playersInRoom === 1);

      // Second player joins
      client2.emit('join_room', { roomId });
      const room2Data = await this.waitForEvent(client2, 'room_joined');

      this.recordTest('Second Player Join', room2Data.roomId === roomId);
      this.recordTest('Player Count Update', room2Data.playersInRoom === 2);

      // First player leaves
      client1.emit('leave_room', { roomId });
      await this.waitForEvent(client1, 'room_left');

      this.recordTest('Room Leave Functionality', true);

      console.log(`   Room ID: ${roomId}`);
      console.log(`   Players joined successfully: 2`);

      client1.disconnect();
      client2.disconnect();
    } catch (error) {
      this.recordTest('Room Management', false, error.message);
    }
  }

  async testReadyStateManagement() {
    console.log('\n🔍 Test 4: Ready State Management');
    console.log('='.repeat(60));

    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      client.emit('authenticate', { playerId: 'ready-test-player', username: 'ReadyTestUser' });
      await this.waitForEvent(client, 'authenticated');

      // Test ready up
      client.emit('ready_up', { ready: true });
      const readyData = await this.waitForEvent(client, 'ready_state_changed');

      this.recordTest('Ready State Change', readyData.ready === true);

      // Test ready down
      client.emit('ready_up', { ready: false });
      const unreadyData = await this.waitForEvent(client, 'ready_state_changed');

      this.recordTest('Unready State Change', unreadyData.ready === false);

      console.log(`   Ready state management: Working`);

      client.disconnect();
    } catch (error) {
      this.recordTest('Ready State Management', false, error.message);
    }
  }

  async testChatSystem() {
    console.log('\n🔍 Test 5: Chat System');
    console.log('='.repeat(60));

    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      client.emit('authenticate', { playerId: 'chat-test-player', username: 'ChatTestUser' });
      await this.waitForEvent(client, 'authenticated');

      // Join a room for chat
      const roomId = `chat-test-room-${Date.now()}`;
      client.emit('join_room', { roomId });
      await this.waitForEvent(client, 'room_joined');

      // Send chat message
      const testMessage = 'Hello from final production test!';
      client.emit('chat_message', {
        message: testMessage,
        type: 'all'
      });

      const chatResponse = await this.waitForEvent(client, 'chat_message');

      this.recordTest('Chat Message Send', true);
      this.recordTest('Chat Message Echo', chatResponse.message === testMessage);
      this.recordTest('Chat Username Included', chatResponse.username === 'ChatTestUser');
      this.recordTest('Chat Timestamp Provided', !!chatResponse.timestamp);

      console.log(`   Message: "${chatResponse.message}"`);
      console.log(`   From: ${chatResponse.username}`);

      client.disconnect();
    } catch (error) {
      this.recordTest('Chat System', false, error.message);
    }
  }

  async testPingPongLatency() {
    console.log('\n🔍 Test 6: Ping/Pong Latency System');
    console.log('='.repeat(60));

    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      const latencies = [];

      for (let i = 0; i < 5; i++) {
        const pingStart = performance.now();
        client.emit('ping', { clientTime: pingStart });
        
        const pongData = await this.waitForEvent(client, 'pong');
        const latency = performance.now() - pingStart;
        latencies.push(latency);

        await new Promise(resolve => setTimeout(resolve, 200)); // Wait between pings
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      this.recordTest('Ping/Pong System Functional', true);
      this.recordTest('Average Latency Acceptable', avgLatency < 1000);
      this.recordTest('Max Latency Reasonable', maxLatency < 2000);

      console.log(`   Average Latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`   Max Latency: ${maxLatency.toFixed(2)}ms`);
      console.log(`   Min Latency: ${Math.min(...latencies).toFixed(2)}ms`);

      client.disconnect();
    } catch (error) {
      this.recordTest('Ping/Pong System', false, error.message);
    }
  }

  async testServerResourcesAndStats() {
    console.log('\n🔍 Test 7: Server Resources & Statistics');
    console.log('='.repeat(60));

    try {
      // Health endpoint
      const healthResponse = await fetch(`${this.serverUrl}/health`);
      const healthData = await healthResponse.json();

      this.recordTest('Health Endpoint Accessible', healthResponse.ok);
      this.recordTest('Health Status OK', healthData.status === 'OK');
      this.recordTest('Server Uptime Provided', typeof healthData.uptime === 'number');
      this.recordTest('Environment Configured', !!healthData.environment);

      // WebSocket stats
      const statsResponse = await fetch(`${this.serverUrl}/websocket/stats`);
      const statsData = await statsResponse.json();

      this.recordTest('WebSocket Stats Accessible', statsResponse.ok);
      this.recordTest('Connection Manager Stats', !!statsData.connectionManager);
      this.recordTest('Socket Handler Stats', !!statsData.socketHandler);

      console.log(`   Server Uptime: ${healthData.uptime.toFixed(2)}s`);
      console.log(`   Environment: ${healthData.environment}`);
      console.log(`   Total Connections: ${statsData.connectionManager.totalConnections}`);
      console.log(`   Events Processed: ${statsData.socketHandler.eventsProcessed}`);
      console.log(`   Error Rate: ${(statsData.socketHandler.errorRate * 100).toFixed(2)}%`);

      if (statsData.socketHandler.errorRate > 0.1) {
        this.recordTest('Server Error Rate', false, `High error rate: ${(statsData.socketHandler.errorRate * 100).toFixed(2)}%`, true);
      } else {
        this.recordTest('Server Error Rate Acceptable', true);
      }

    } catch (error) {
      this.recordTest('Server Resources & Stats', false, error.message);
    }
  }

  async testConcurrentConnections() {
    console.log('\n🔍 Test 8: Concurrent Connection Handling');
    console.log('='.repeat(60));

    const concurrentCount = 8;
    const clients = [];
    let successfulConnections = 0;

    try {
      const connectionPromises = [];

      for (let i = 0; i < concurrentCount; i++) {
        const client = this.createClient();
        clients.push(client);

        const promise = this.waitForEvent(client, 'connect')
          .then(() => this.waitForEvent(client, 'connected'))
          .then(() => {
            successfulConnections++;
            return i;
          })
          .catch(() => null);

        connectionPromises.push(promise);
      }

      await Promise.allSettled(connectionPromises);

      const successRate = (successfulConnections / concurrentCount) * 100;

      this.recordTest('Concurrent Connections Handled', successfulConnections > 0);
      this.recordTest('Concurrent Success Rate', successRate >= 75);

      if (successRate < 90) {
        this.recordTest('Concurrent Performance', false, `${successRate.toFixed(1)}% success rate`, true);
      } else {
        this.recordTest('Concurrent Performance Good', true);
      }

      console.log(`   Successful: ${successfulConnections}/${concurrentCount} (${successRate.toFixed(1)}%)`);

    } catch (error) {
      this.recordTest('Concurrent Connection Testing', false, error.message);
    } finally {
      // Cleanup
      clients.forEach(client => {
        try {
          if (client.connected) client.disconnect();
        } catch (e) {}
      });
    }
  }

  generateFinalReport() {
    console.log('\n' + '='.repeat(80));
    console.log('🎯 FINAL PRODUCTION VALIDATION REPORT - CONNECTION MANAGER');
    console.log('='.repeat(80));

    const totalTests = this.results.passed + this.results.failed;
    const successRate = totalTests > 0 ? (this.results.passed / totalTests) * 100 : 0;

    console.log(`📊 TEST RESULTS SUMMARY:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${this.results.passed} ✅`);
    console.log(`   Failed: ${this.results.failed} ❌`);
    console.log(`   Warnings: ${this.results.warnings} ⚠️`);
    console.log(`   Success Rate: ${successRate.toFixed(1)}%`);

    console.log(`\n📋 DETAILED TEST RESULTS:`);
    this.results.tests.forEach(test => {
      const icon = test.warning ? '⚠️' : (test.passed ? '✅' : '❌');
      console.log(`   ${icon} ${test.name}${test.details ? ` - ${test.details}` : ''}`);
    });

    console.log(`\n🏆 PRODUCTION READINESS ASSESSMENT:`);

    // Critical features assessment
    const criticalTests = [
      'WebSocket Connection Established',
      'Welcome Message Received',
      'Player Authentication Success',
      'Room Creation & First Join',
      'Chat Message Send',
      'Ping/Pong System Functional',
      'Health Endpoint Accessible',
      'WebSocket Stats Accessible'
    ];

    const criticalPassed = criticalTests.filter(testName => 
      this.results.tests.find(t => t.name === testName && t.passed)
    ).length;

    const criticalScore = (criticalPassed / criticalTests.length) * 100;

    console.log(`   Core Functionality: ${criticalPassed}/${criticalTests.length} (${criticalScore.toFixed(1)}%)`);

    if (criticalScore >= 95 && successRate >= 90) {
      console.log(`   🎉 PRODUCTION READY - All critical systems operational`);
    } else if (criticalScore >= 85 && successRate >= 80) {
      console.log(`   ✅ MOSTLY READY - Minor issues to address`);
    } else if (criticalScore >= 70 && successRate >= 70) {
      console.log(`   ⚠️ NEEDS IMPROVEMENT - Several issues detected`);
    } else {
      console.log(`   ❌ NOT READY - Critical issues must be resolved`);
    }

    console.log(`\n🎯 FINAL RECOMMENDATION:`);
    
    if (this.results.failed === 0) {
      console.log(`   🚀 CONNECTION MANAGER IS PRODUCTION READY!`);
      console.log(`   ✅ All tests passed successfully`);
      console.log(`   ✅ No critical issues detected`);
      console.log(`   ✅ Ready for enterprise deployment`);
    } else if (this.results.failed <= 2 && successRate >= 85) {
      console.log(`   ✅ CONNECTION MANAGER IS READY WITH MINOR ISSUES`);
      console.log(`   ⚠️ Address failed tests before full deployment`);
      console.log(`   ✅ Core functionality is solid`);
    } else {
      console.log(`   ⚠️ CONNECTION MANAGER NEEDS OPTIMIZATION`);
      console.log(`   ❌ Address critical issues before production`);
      console.log(`   🔧 Review failed tests and implement fixes`);
    }

    console.log('\n' + '='.repeat(80));

    return {
      totalTests,
      passed: this.results.passed,
      failed: this.results.failed,
      warnings: this.results.warnings,
      successRate,
      criticalScore,
      productionReady: this.results.failed === 0 && successRate >= 90
    };
  }

  async runValidation() {
    console.log('🎯 FINAL PRODUCTION VALIDATION FOR CONNECTION MANAGER');
    console.log('🚀 Task 3.1 - Enterprise-Grade Testing\n');

    try {
      await this.testBasicConnectivity();
      await this.testAuthenticationFlow();
      await this.testRoomManagement();
      await this.testReadyStateManagement();
      await this.testChatSystem();
      await this.testPingPongLatency();
      await this.testServerResourcesAndStats();
      await this.testConcurrentConnections();

      return this.generateFinalReport();
    } catch (error) {
      console.error('❌ Critical validation error:', error);
      this.recordTest('Validation Suite', false, error.message);
      return this.generateFinalReport();
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new FinalProductionValidation();
  
  validator.runValidation().then((results) => {
    const exitCode = results.productionReady ? 0 : 1;
    process.exit(exitCode);
  }).catch((error) => {
    console.error('❌ Validation error:', error);
    process.exit(1);
  });
}

module.exports = FinalProductionValidation;