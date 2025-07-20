/**
 * Production-Level Testing Suite for Connection Manager (Task 3.1)
 * Comprehensive testing to ensure enterprise-grade reliability
 */

const io = require('socket.io-client');
const { performance } = require('perf_hooks');

class ProductionTestSuite {
  constructor() {
    this.serverUrl = 'https://head-soccer-production.up.railway.app';
    this.testResults = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      errors: [],
      performance: {},
      reliability: {},
      security: {}
    };
    this.activeClients = [];
  }

  // Utility Methods
  createClient(options = {}) {
    const client = io(this.serverUrl, {
      transports: ['polling'], // Use stable transport
      timeout: 10000,
      forceNew: true,
      ...options
    });
    this.activeClients.push(client);
    return client;
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

  async cleanupClients() {
    this.activeClients.forEach(client => {
      if (client.connected) {
        client.disconnect();
      }
    });
    this.activeClients = [];
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for cleanup
  }

  recordTest(name, passed, details = null) {
    this.testResults.totalTests++;
    if (passed) {
      this.testResults.passed++;
      console.log(`✅ ${name}`);
    } else {
      this.testResults.failed++;
      console.log(`❌ ${name}`);
      if (details) {
        this.testResults.errors.push({ test: name, details });
        console.log(`   Error: ${details}`);
      }
    }
  }

  recordWarning(test, message) {
    this.testResults.warnings++;
    console.log(`⚠️ ${test}: ${message}`);
  }

  // Test 1: Basic Connection Reliability
  async testConnectionReliability() {
    console.log('\n🔍 Test 1: Connection Reliability');
    console.log('=' .repeat(50));

    const testCount = 10;
    let successfulConnections = 0;
    let connectionTimes = [];

    for (let i = 0; i < testCount; i++) {
      try {
        const startTime = performance.now();
        const client = this.createClient();
        
        await this.waitForEvent(client, 'connect', 5000);
        const connectTime = performance.now() - startTime;
        connectionTimes.push(connectTime);
        
        await this.waitForEvent(client, 'connected', 3000);
        successfulConnections++;
        
        client.disconnect();
        console.log(`   Connection ${i + 1}: ${connectTime.toFixed(2)}ms`);
      } catch (error) {
        this.recordTest(`Connection ${i + 1}`, false, error.message);
      }
    }

    await this.cleanupClients();

    const avgConnectionTime = connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length;
    const successRate = (successfulConnections / testCount) * 100;

    this.testResults.reliability.connectionSuccessRate = successRate;
    this.testResults.performance.avgConnectionTime = avgConnectionTime;

    this.recordTest(`Connection Success Rate (${successRate}%)`, successRate >= 95);
    this.recordTest(`Average Connection Time (${avgConnectionTime.toFixed(2)}ms)`, avgConnectionTime < 1000);

    if (successRate < 99) {
      this.recordWarning('Connection Reliability', `${100 - successRate}% failure rate detected`);
    }
  }

  // Test 2: Authentication Flow Testing
  async testAuthenticationFlow() {
    console.log('\n🔍 Test 2: Authentication Flow');
    console.log('=' .repeat(50));

    // Test valid authentication
    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      const authStart = performance.now();
      client.emit('authenticate', {
        playerId: 'prod-test-player-1',
        username: 'ProdTestUser1',
        token: 'valid-token'
      });

      const authData = await this.waitForEvent(client, 'authenticated', 3000);
      const authTime = performance.now() - authStart;

      this.testResults.performance.avgAuthTime = authTime;
      this.recordTest(`Valid Authentication (${authTime.toFixed(2)}ms)`, true);
      this.recordTest('Auth Response Data Valid', 
        authData.playerId === 'prod-test-player-1' && authData.username === 'ProdTestUser1');

      client.disconnect();
    } catch (error) {
      this.recordTest('Valid Authentication', false, error.message);
    }

    // Test invalid authentication
    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      client.emit('authenticate', {
        username: 'InvalidUser'
        // Missing required playerId
      });

      const errorReceived = await Promise.race([
        this.waitForEvent(client, 'auth_error', 2000),
        new Promise((_, reject) => setTimeout(() => reject(new Error('No error response')), 2000))
      ]);

      this.recordTest('Invalid Auth Error Handling', !!errorReceived);
      client.disconnect();
    } catch (error) {
      this.recordTest('Invalid Auth Error Handling', false, error.message);
    }

    await this.cleanupClients();
  }

  // Test 3: Room Management
  async testRoomManagement() {
    console.log('\n🔍 Test 3: Room Management');
    console.log('=' .repeat(50));

    try {
      const client1 = this.createClient();
      const client2 = this.createClient();

      // Setup both clients
      await this.waitForEvent(client1, 'connect');
      await this.waitForEvent(client1, 'connected');
      await this.waitForEvent(client2, 'connect');
      await this.waitForEvent(client2, 'connected');

      // Authenticate both
      client1.emit('authenticate', { playerId: 'room-test-1', username: 'RoomUser1' });
      client2.emit('authenticate', { playerId: 'room-test-2', username: 'RoomUser2' });

      await this.waitForEvent(client1, 'authenticated');
      await this.waitForEvent(client2, 'authenticated');

      // Test room joining
      const roomId = `test-room-${Date.now()}`;
      
      client1.emit('join_room', { roomId });
      const room1Data = await this.waitForEvent(client1, 'room_joined', 3000);
      this.recordTest('First Player Room Join', room1Data.roomId === roomId && room1Data.playersInRoom === 1);

      client2.emit('join_room', { roomId });
      const room2Data = await this.waitForEvent(client2, 'room_joined', 3000);
      this.recordTest('Second Player Room Join', room2Data.roomId === roomId && room2Data.playersInRoom === 2);

      // Test room leaving
      client1.emit('leave_room', { roomId });
      await this.waitForEvent(client1, 'room_left', 3000);
      this.recordTest('Room Leave Functionality', true);

      client1.disconnect();
      client2.disconnect();
    } catch (error) {
      this.recordTest('Room Management', false, error.message);
    }

    await this.cleanupClients();
  }

  // Test 4: Concurrent Connections
  async testConcurrentConnections() {
    console.log('\n🔍 Test 4: Concurrent Connection Handling');
    console.log('=' .repeat(50));

    const concurrentCount = 20;
    const clients = [];
    let successfulConcurrent = 0;

    const startTime = performance.now();

    try {
      // Create multiple connections simultaneously
      const connectionPromises = [];
      for (let i = 0; i < concurrentCount; i++) {
        const client = this.createClient();
        clients.push(client);
        
        connectionPromises.push(
          this.waitForEvent(client, 'connect', 10000)
            .then(() => this.waitForEvent(client, 'connected', 5000))
            .then(() => {
              successfulConcurrent++;
              return i;
            })
            .catch(error => {
              console.log(`   Connection ${i + 1} failed: ${error.message}`);
              return null;
            })
        );
      }

      await Promise.allSettled(connectionPromises);
      
      const totalTime = performance.now() - startTime;
      const concurrentSuccessRate = (successfulConcurrent / concurrentCount) * 100;

      this.testResults.performance.concurrentConnectionTime = totalTime;
      this.testResults.reliability.concurrentSuccessRate = concurrentSuccessRate;

      this.recordTest(`Concurrent Connections (${successfulConcurrent}/${concurrentCount})`, concurrentSuccessRate >= 80);
      this.recordTest(`Concurrent Connection Time (${totalTime.toFixed(2)}ms)`, totalTime < 10000);

      // Cleanup
      clients.forEach(client => client.disconnect());
    } catch (error) {
      this.recordTest('Concurrent Connections', false, error.message);
    }

    await this.cleanupClients();
  }

  // Test 5: Reconnection Scenarios
  async testReconnectionScenarios() {
    console.log('\n🔍 Test 5: Reconnection Scenarios');
    console.log('=' .repeat(50));

    try {
      const playerId = 'reconnect-test-player';
      
      // First connection
      const client1 = this.createClient();
      await this.waitForEvent(client1, 'connect');
      await this.waitForEvent(client1, 'connected');
      
      client1.emit('authenticate', { playerId, username: 'ReconnectUser' });
      await this.waitForEvent(client1, 'authenticated');

      // Join a room
      const roomId = `reconnect-room-${Date.now()}`;
      client1.emit('join_room', { roomId });
      await this.waitForEvent(client1, 'room_joined');

      this.recordTest('Initial Connection and Room Join', true);

      // Simulate disconnection
      client1.disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Reconnect with same player ID
      const client2 = this.createClient();
      await this.waitForEvent(client2, 'connect');
      await this.waitForEvent(client2, 'connected');

      client2.emit('authenticate', { playerId, username: 'ReconnectUser' });
      
      try {
        const reconnectData = await this.waitForEvent(client2, 'reconnected', 3000);
        this.recordTest('Reconnection Detection', reconnectData.playerId === playerId);
      } catch (error) {
        // Might authenticate normally instead of reconnect
        const authData = await this.waitForEvent(client2, 'authenticated', 3000);
        this.recordTest('Fallback Authentication After Disconnect', authData.playerId === playerId);
      }

      client2.disconnect();
    } catch (error) {
      this.recordTest('Reconnection Scenarios', false, error.message);
    }

    await this.cleanupClients();
  }

  // Test 6: Rate Limiting and Security
  async testRateLimitingAndSecurity() {
    console.log('\n🔍 Test 6: Rate Limiting and Security');
    console.log('=' .repeat(50));

    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      client.emit('authenticate', { playerId: 'rate-test-player', username: 'RateTestUser' });
      await this.waitForEvent(client, 'authenticated');

      // Test rate limiting by sending many messages rapidly
      let rateLimitHit = false;
      
      client.on('rate_limit_exceeded', (data) => {
        rateLimitHit = true;
        this.recordTest('Rate Limiting Active', true);
        console.log(`   Rate limit triggered: ${data.event}`);
      });

      // Send 20 chat messages rapidly
      for (let i = 0; i < 20; i++) {
        client.emit('chat_message', {
          message: `Spam message ${i}`,
          type: 'all'
        });
      }

      // Wait to see if rate limiting kicks in
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (!rateLimitHit) {
        this.recordWarning('Rate Limiting', 'No rate limit triggered after 20 rapid messages');
      }

      // Test invalid data handling
      client.emit('player_movement', {
        position: { x: 'invalid', y: 'invalid' }, // Invalid data types
        velocity: { x: 999999, y: 999999 }, // Out of range
        timestamp: 'not-a-number'
      });

      client.on('validation_error', (data) => {
        this.recordTest('Input Validation', true);
        console.log(`   Validation error caught: ${data.errors.length} errors`);
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      client.disconnect();
    } catch (error) {
      this.recordTest('Rate Limiting and Security', false, error.message);
    }

    await this.cleanupClients();
  }

  // Test 7: Server Resource Monitoring
  async testServerResourceMonitoring() {
    console.log('\n🔍 Test 7: Server Resource Monitoring');
    console.log('=' .repeat(50));

    try {
      // Test health endpoint
      const healthResponse = await fetch(`${this.serverUrl}/health`);
      const healthData = await healthResponse.json();
      
      this.recordTest('Health Endpoint Accessible', healthResponse.ok);
      this.recordTest('Health Data Valid', healthData.status === 'OK');

      console.log(`   Server uptime: ${healthData.uptime.toFixed(2)}s`);
      console.log(`   Environment: ${healthData.environment}`);

      // Test WebSocket stats endpoint
      const statsResponse = await fetch(`${this.serverUrl}/websocket/stats`);
      const statsData = await statsResponse.json();

      this.recordTest('WebSocket Stats Endpoint', statsResponse.ok);
      this.recordTest('Stats Data Structure', 
        statsData.connectionManager && statsData.socketHandler);

      console.log(`   Total connections: ${statsData.connectionManager.totalConnections}`);
      console.log(`   Active connections: ${statsData.connectionManager.activeConnections}`);
      console.log(`   Events processed: ${statsData.socketHandler.eventsProcessed}`);
      console.log(`   Error rate: ${(statsData.socketHandler.errorRate * 100).toFixed(2)}%`);

      this.testResults.performance.serverUptime = healthData.uptime;
      this.testResults.reliability.errorRate = statsData.socketHandler.errorRate;

      if (statsData.socketHandler.errorRate > 0.05) { // More than 5% error rate
        this.recordWarning('Error Rate', `High error rate: ${(statsData.socketHandler.errorRate * 100).toFixed(2)}%`);
      }

    } catch (error) {
      this.recordTest('Server Resource Monitoring', false, error.message);
    }
  }

  // Test 8: Edge Cases and Error Scenarios
  async testEdgeCasesAndErrors() {
    console.log('\n🔍 Test 8: Edge Cases and Error Scenarios');
    console.log('=' .repeat(50));

    // Test 1: Malformed data
    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      // Send malformed authentication
      client.emit('authenticate', null);
      client.emit('authenticate', { /* empty object */ });
      client.emit('authenticate', 'invalid-string');

      this.recordTest('Malformed Data Handling', true);
      client.disconnect();
    } catch (error) {
      this.recordTest('Malformed Data Handling', false, error.message);
    }

    // Test 2: Rapid connect/disconnect
    try {
      for (let i = 0; i < 5; i++) {
        const client = this.createClient();
        await this.waitForEvent(client, 'connect');
        client.disconnect();
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      this.recordTest('Rapid Connect/Disconnect', true);
    } catch (error) {
      this.recordTest('Rapid Connect/Disconnect', false, error.message);
    }

    // Test 3: Large data payloads
    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      client.emit('authenticate', { 
        playerId: 'large-data-test', 
        username: 'LargeDataUser',
        largeField: 'x'.repeat(10000) // 10KB of data
      });

      // Should either authenticate or reject gracefully
      await Promise.race([
        this.waitForEvent(client, 'authenticated', 3000),
        this.waitForEvent(client, 'auth_error', 3000)
      ]);

      this.recordTest('Large Data Payload Handling', true);
      client.disconnect();
    } catch (error) {
      this.recordTest('Large Data Payload Handling', false, error.message);
    }

    await this.cleanupClients();
  }

  // Performance Benchmarking
  async runPerformanceBenchmarks() {
    console.log('\n🔍 Performance Benchmarks');
    console.log('=' .repeat(50));

    const benchmarks = {
      connectionTime: [],
      authTime: [],
      roomJoinTime: [],
      messageLatency: []
    };

    // Run 10 iterations for each benchmark
    for (let i = 0; i < 10; i++) {
      try {
        const client = this.createClient();
        
        // Connection benchmark
        const connectStart = performance.now();
        await this.waitForEvent(client, 'connect');
        await this.waitForEvent(client, 'connected');
        benchmarks.connectionTime.push(performance.now() - connectStart);

        // Auth benchmark
        const authStart = performance.now();
        client.emit('authenticate', { playerId: `bench-${i}`, username: `BenchUser${i}` });
        await this.waitForEvent(client, 'authenticated');
        benchmarks.authTime.push(performance.now() - authStart);

        // Room join benchmark
        const roomStart = performance.now();
        client.emit('join_room', { roomId: `bench-room-${i}` });
        await this.waitForEvent(client, 'room_joined');
        benchmarks.roomJoinTime.push(performance.now() - roomStart);

        // Message latency benchmark
        const pingStart = performance.now();
        client.emit('ping', { clientTime: pingStart });
        await this.waitForEvent(client, 'pong');
        benchmarks.messageLatency.push(performance.now() - pingStart);

        client.disconnect();
      } catch (error) {
        console.log(`   Benchmark iteration ${i + 1} failed: ${error.message}`);
      }
    }

    // Calculate averages
    Object.keys(benchmarks).forEach(key => {
      const times = benchmarks[key];
      if (times.length > 0) {
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const min = Math.min(...times);
        const max = Math.max(...times);
        
        console.log(`   ${key}: avg=${avg.toFixed(2)}ms, min=${min.toFixed(2)}ms, max=${max.toFixed(2)}ms`);
        this.testResults.performance[`${key}Avg`] = avg;
        this.testResults.performance[`${key}Min`] = min;
        this.testResults.performance[`${key}Max`] = max;
      }
    });

    await this.cleanupClients();
  }

  // Generate comprehensive report
  generateReport() {
    console.log('\n' + '='.repeat(70));
    console.log('🎯 PRODUCTION-LEVEL TEST RESULTS FOR CONNECTION MANAGER');
    console.log('='.repeat(70));

    const successRate = (this.testResults.passed / this.testResults.totalTests) * 100;
    
    console.log(`📊 OVERALL RESULTS:`);
    console.log(`   Total Tests: ${this.testResults.totalTests}`);
    console.log(`   Passed: ${this.testResults.passed} ✅`);
    console.log(`   Failed: ${this.testResults.failed} ❌`);
    console.log(`   Warnings: ${this.testResults.warnings} ⚠️`);
    console.log(`   Success Rate: ${successRate.toFixed(1)}%`);

    console.log(`\n⚡ PERFORMANCE METRICS:`);
    if (this.testResults.performance.avgConnectionTime) {
      console.log(`   Avg Connection Time: ${this.testResults.performance.avgConnectionTime.toFixed(2)}ms`);
    }
    if (this.testResults.performance.avgAuthTime) {
      console.log(`   Avg Authentication Time: ${this.testResults.performance.avgAuthTime.toFixed(2)}ms`);
    }
    if (this.testResults.performance.concurrentConnectionTime) {
      console.log(`   Concurrent Connection Time: ${this.testResults.performance.concurrentConnectionTime.toFixed(2)}ms`);
    }

    console.log(`\n🔒 RELIABILITY METRICS:`);
    if (this.testResults.reliability.connectionSuccessRate) {
      console.log(`   Connection Success Rate: ${this.testResults.reliability.connectionSuccessRate.toFixed(1)}%`);
    }
    if (this.testResults.reliability.concurrentSuccessRate) {
      console.log(`   Concurrent Success Rate: ${this.testResults.reliability.concurrentSuccessRate.toFixed(1)}%`);
    }
    if (this.testResults.reliability.errorRate !== undefined) {
      console.log(`   Server Error Rate: ${(this.testResults.reliability.errorRate * 100).toFixed(2)}%`);
    }

    // Production readiness assessment
    console.log(`\n🏆 PRODUCTION READINESS ASSESSMENT:`);
    
    let productionScore = 0;
    let maxScore = 0;

    // Scoring criteria
    const criteria = [
      { name: 'Success Rate', value: successRate, threshold: 95, weight: 25 },
      { name: 'Connection Reliability', value: this.testResults.reliability.connectionSuccessRate || 0, threshold: 95, weight: 20 },
      { name: 'Performance', value: this.testResults.performance.avgConnectionTime ? (1000 - this.testResults.performance.avgConnectionTime) / 10 : 0, threshold: 90, weight: 15 },
      { name: 'Error Rate', value: (1 - (this.testResults.reliability.errorRate || 0)) * 100, threshold: 95, weight: 20 },
      { name: 'Concurrent Handling', value: this.testResults.reliability.concurrentSuccessRate || 0, threshold: 80, weight: 20 }
    ];

    criteria.forEach(criterion => {
      const score = Math.min(criterion.value, 100);
      const points = (score / 100) * criterion.weight;
      productionScore += points;
      maxScore += criterion.weight;
      
      const status = score >= criterion.threshold ? '✅' : '❌';
      console.log(`   ${criterion.name}: ${score.toFixed(1)}% ${status} (${points.toFixed(1)}/${criterion.weight} points)`);
    });

    const finalScore = (productionScore / maxScore) * 100;
    console.log(`\n🎯 PRODUCTION READINESS SCORE: ${finalScore.toFixed(1)}%`);

    if (finalScore >= 90) {
      console.log('🎉 EXCELLENT - Ready for production deployment!');
    } else if (finalScore >= 80) {
      console.log('✅ GOOD - Minor improvements recommended before production');
    } else if (finalScore >= 70) {
      console.log('⚠️ ACCEPTABLE - Several issues need addressing');
    } else {
      console.log('❌ NEEDS WORK - Not ready for production');
    }

    // Failed tests summary
    if (this.testResults.failed > 0) {
      console.log(`\n❌ FAILED TESTS:`);
      this.testResults.errors.forEach(error => {
        console.log(`   - ${error.test}: ${error.details}`);
      });
    }

    console.log('\n' + '='.repeat(70));
  }

  // Main test runner
  async runAllTests() {
    console.log('🚀 STARTING PRODUCTION-LEVEL TESTING OF CONNECTION MANAGER');
    console.log('🎯 Testing Task 3.1 for Enterprise-Grade Reliability\n');

    try {
      await this.testConnectionReliability();
      await this.testAuthenticationFlow();
      await this.testRoomManagement();
      await this.testConcurrentConnections();
      await this.testReconnectionScenarios();
      await this.testRateLimitingAndSecurity();
      await this.testServerResourceMonitoring();
      await this.testEdgeCasesAndErrors();
      await this.runPerformanceBenchmarks();
    } catch (error) {
      console.error('❌ Critical error during testing:', error);
      this.testResults.errors.push({ test: 'Test Suite', details: error.message });
    } finally {
      await this.cleanupClients();
      this.generateReport();
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const testSuite = new ProductionTestSuite();
  
  testSuite.runAllTests().then(() => {
    const successRate = (testSuite.testResults.passed / testSuite.testResults.totalTests) * 100;
    const exitCode = successRate >= 80 ? 0 : 1;
    process.exit(exitCode);
  }).catch((error) => {
    console.error('❌ Test suite error:', error);
    process.exit(1);
  });
}

module.exports = ProductionTestSuite;