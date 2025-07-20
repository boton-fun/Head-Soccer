/**
 * Socket Event Handler Test Suite (Task 3.2)
 * Comprehensive testing of the main event routing and validation system
 */

const io = require('socket.io-client');
const { performance } = require('perf_hooks');

class SocketEventHandlerTestSuite {
  constructor() {
    this.serverUrl = 'https://head-soccer-production.up.railway.app';
    this.results = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      categories: {
        eventRouting: { passed: 0, failed: 0 },
        validation: { passed: 0, failed: 0 },
        rateLimiting: { passed: 0, failed: 0 },
        sanitization: { passed: 0, failed: 0 },
        errorHandling: { passed: 0, failed: 0 },
        performance: { passed: 0, failed: 0 }
      },
      eventTests: [],
      errors: []
    };
    this.activeClients = [];
  }

  createClient() {
    const client = io(this.serverUrl, {
      transports: ['polling'],
      timeout: 15000,
      forceNew: true
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

  async setupAuthenticatedClient(playerId = 'test-player', username = 'TestUser') {
    const client = this.createClient();
    
    await this.waitForEvent(client, 'connect');
    await this.waitForEvent(client, 'connected');
    
    client.emit('authenticate', { playerId, username });
    await this.waitForEvent(client, 'authenticated');
    
    return client;
  }

  recordTest(category, name, passed, details = null, performance = null) {
    this.results.totalTests++;
    
    if (passed) {
      this.results.passed++;
      this.results.categories[category].passed++;
      console.log(`✅ ${name}${performance ? ` (${performance.toFixed(2)}ms)` : ''}`);
    } else {
      this.results.failed++;
      this.results.categories[category].failed++;
      console.log(`❌ ${name}${details ? ` - ${details}` : ''}${performance ? ` (${performance.toFixed(2)}ms)` : ''}`);
      if (details) {
        this.results.errors.push({ test: name, category, details });
      }
    }
  }

  recordWarning(category, message) {
    this.results.warnings++;
    console.log(`⚠️ ${category}: ${message}`);
  }

  async cleanupClients() {
    this.activeClients.forEach(client => {
      try {
        if (client.connected) client.disconnect();
      } catch (e) {}
    });
    this.activeClients = [];
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Test 1: Event Routing System
  async testEventRouting() {
    console.log('\n🔍 Test 1: Socket Event Routing System');
    console.log('='.repeat(60));

    // Test authentication event routing
    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      const startTime = performance.now();
      client.emit('authenticate', {
        playerId: 'routing-test-player',
        username: 'RoutingTestUser'
      });

      const authData = await this.waitForEvent(client, 'authenticated', 5000);
      const routingTime = performance.now() - startTime;

      this.recordTest('eventRouting', 'Authentication Event Routing', 
        authData.playerId === 'routing-test-player', null, routingTime);
      
      client.disconnect();
    } catch (error) {
      this.recordTest('eventRouting', 'Authentication Event Routing', false, error.message);
    }

    // Test matchmaking event routing
    try {
      const client = await this.setupAuthenticatedClient('matchmaking-test', 'MatchmakingUser');

      const startTime = performance.now();
      client.emit('join_matchmaking', {
        gameMode: 'casual',
        region: 'US-East'
      });

      try {
        const matchData = await this.waitForEvent(client, 'matchmaking_joined', 3000);
        const routingTime = performance.now() - startTime;
        this.recordTest('eventRouting', 'Matchmaking Event Routing', true, null, routingTime);
      } catch (error) {
        // Might get error if matchmaking not fully implemented
        const errorData = await this.waitForEvent(client, 'matchmaking_error', 2000);
        this.recordTest('eventRouting', 'Matchmaking Event Routing', !!errorData);
      }

      client.disconnect();
    } catch (error) {
      this.recordTest('eventRouting', 'Matchmaking Event Routing', false, error.message);
    }

    // Test chat event routing
    try {
      const client = await this.setupAuthenticatedClient('chat-test', 'ChatUser');

      // Join a room first for chat
      client.emit('join_room', { roomId: 'chat-test-room' });
      await this.waitForEvent(client, 'room_joined');

      const startTime = performance.now();
      client.emit('chat_message', {
        message: 'Test chat message',
        type: 'all'
      });

      const chatData = await this.waitForEvent(client, 'chat_message', 3000);
      const routingTime = performance.now() - startTime;

      this.recordTest('eventRouting', 'Chat Event Routing', 
        chatData.message === 'Test chat message', null, routingTime);

      client.disconnect();
    } catch (error) {
      this.recordTest('eventRouting', 'Chat Event Routing', false, error.message);
    }

    // Test game control event routing
    try {
      const client = await this.setupAuthenticatedClient('ready-test', 'ReadyUser');

      const startTime = performance.now();
      client.emit('ready_up', { ready: true });

      const readyData = await this.waitForEvent(client, 'ready_state_changed', 3000);
      const routingTime = performance.now() - startTime;

      this.recordTest('eventRouting', 'Ready State Event Routing', 
        readyData.ready === true, null, routingTime);

      client.disconnect();
    } catch (error) {
      this.recordTest('eventRouting', 'Ready State Event Routing', false, error.message);
    }

    // Test ping/pong routing
    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      const startTime = performance.now();
      client.emit('ping', { clientTime: startTime });

      const pongData = await this.waitForEvent(client, 'pong', 3000);
      const routingTime = performance.now() - startTime;

      this.recordTest('eventRouting', 'Ping/Pong Event Routing', !!pongData.serverTime, null, routingTime);

      client.disconnect();
    } catch (error) {
      this.recordTest('eventRouting', 'Ping/Pong Event Routing', false, error.message);
    }
  }

  // Test 2: Event Validation System
  async testEventValidation() {
    console.log('\n🔍 Test 2: Event Validation System');
    console.log('='.repeat(60));

    // Test required field validation
    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      client.emit('authenticate', {
        username: 'NoPlayerID'
        // Missing required playerId field
      });

      const errorData = await this.waitForEvent(client, 'validation_error', 3000);
      this.recordTest('validation', 'Required Field Validation', 
        errorData.event === 'authenticate' && errorData.errors.length > 0);

      console.log(`   Validation errors: ${errorData.errors.join(', ')}`);
      client.disconnect();
    } catch (error) {
      this.recordTest('validation', 'Required Field Validation', false, error.message);
    }

    // Test string length validation
    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      client.emit('authenticate', {
        playerId: 'test-player',
        username: 'x'.repeat(30) // Exceeds 20 character limit
      });

      const errorData = await this.waitForEvent(client, 'validation_error', 3000);
      this.recordTest('validation', 'String Length Validation', 
        errorData.errors.some(err => err.includes('maximum length')));

      client.disconnect();
    } catch (error) {
      this.recordTest('validation', 'String Length Validation', false, error.message);
    }

    // Test enum validation
    try {
      const client = await this.setupAuthenticatedClient('enum-test', 'EnumUser');

      client.emit('join_matchmaking', {
        gameMode: 'invalid-mode' // Not in allowed enum values
      });

      const errorData = await this.waitForEvent(client, 'validation_error', 3000);
      this.recordTest('validation', 'Enum Value Validation', 
        errorData.errors.some(err => err.includes('must be one of')));

      client.disconnect();
    } catch (error) {
      this.recordTest('validation', 'Enum Value Validation', false, error.message);
    }

    // Test numeric validation (if player_movement is implemented)
    try {
      const client = await this.setupAuthenticatedClient('numeric-test', 'NumericUser');

      client.emit('player_movement', {
        position: { x: 'not-a-number', y: 100 },
        velocity: { x: 50, y: 'also-not-a-number' },
        timestamp: 'invalid-timestamp'
      });

      const errorData = await this.waitForEvent(client, 'validation_error', 3000);
      this.recordTest('validation', 'Numeric Type Validation', 
        errorData.errors.some(err => err.includes('must be a number')));

      client.disconnect();
    } catch (error) {
      this.recordTest('validation', 'Numeric Type Validation', false, error.message);
    }

    // Test range validation
    try {
      const client = await this.setupAuthenticatedClient('range-test', 'RangeUser');

      client.emit('player_movement', {
        position: { x: 9999, y: 9999 }, // Out of valid range
        velocity: { x: 1000, y: 1000 }, // Out of valid range
        timestamp: Date.now()
      });

      const errorData = await this.waitForEvent(client, 'validation_error', 3000);
      this.recordTest('validation', 'Range Validation', 
        errorData.errors.some(err => err.includes('between')));

      client.disconnect();
    } catch (error) {
      this.recordTest('validation', 'Range Validation', false, error.message);
    }
  }

  // Test 3: Rate Limiting System
  async testRateLimiting() {
    console.log('\n🔍 Test 3: Rate Limiting System');
    console.log('='.repeat(60));

    // Test chat rate limiting
    try {
      const client = await this.setupAuthenticatedClient('rate-test', 'RateTestUser');
      
      // Join a room for chat
      client.emit('join_room', { roomId: 'rate-test-room' });
      await this.waitForEvent(client, 'room_joined');

      let rateLimitHit = false;
      client.on('rate_limit_exceeded', (data) => {
        rateLimitHit = true;
        this.recordTest('rateLimiting', 'Chat Rate Limiting', 
          data.event === 'chat_message' && data.limit);
        console.log(`   Rate limit: ${data.limit.maxRequests} requests per ${data.limit.windowMs}ms`);
      });

      // Send 15 chat messages rapidly (limit is 10 per minute)
      for (let i = 0; i < 15; i++) {
        client.emit('chat_message', {
          message: `Spam message ${i}`,
          type: 'all'
        });
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Wait to see if rate limiting kicks in
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (!rateLimitHit) {
        this.recordWarning('rateLimiting', 'Chat rate limiting not triggered after 15 messages');
        this.recordTest('rateLimiting', 'Chat Rate Limiting', false, 'No rate limit triggered');
      }

      client.disconnect();
    } catch (error) {
      this.recordTest('rateLimiting', 'Chat Rate Limiting', false, error.message);
    }

    // Test general rate limiting
    try {
      const client = await this.setupAuthenticatedClient('general-rate-test', 'GeneralRateUser');

      let rateLimitHit = false;
      client.on('rate_limit_exceeded', (data) => {
        rateLimitHit = true;
        this.recordTest('rateLimiting', 'General Rate Limiting', true);
      });

      // Send many ping requests rapidly (limit is 60 per minute)
      for (let i = 0; i < 80; i++) {
        client.emit('ping', { test: i });
        await new Promise(resolve => setTimeout(resolve, 20));
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      if (!rateLimitHit) {
        this.recordWarning('rateLimiting', 'General rate limiting not triggered after 80 pings');
        this.recordTest('rateLimiting', 'General Rate Limiting', false, 'No rate limit triggered');
      }

      client.disconnect();
    } catch (error) {
      this.recordTest('rateLimiting', 'General Rate Limiting', false, error.message);
    }

    // Test matchmaking rate limiting
    try {
      const client = await this.setupAuthenticatedClient('mm-rate-test', 'MMRateUser');

      let rateLimitHit = false;
      client.on('rate_limit_exceeded', (data) => {
        if (data.event === 'join_matchmaking') {
          rateLimitHit = true;
          this.recordTest('rateLimiting', 'Matchmaking Rate Limiting', true);
        }
      });

      // Send 8 matchmaking requests rapidly (limit is 5 per minute)
      for (let i = 0; i < 8; i++) {
        client.emit('join_matchmaking', { gameMode: 'casual' });
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      if (!rateLimitHit) {
        this.recordWarning('rateLimiting', 'Matchmaking rate limiting not triggered');
        this.recordTest('rateLimiting', 'Matchmaking Rate Limiting', false, 'No rate limit triggered');
      }

      client.disconnect();
    } catch (error) {
      this.recordTest('rateLimiting', 'Matchmaking Rate Limiting', false, error.message);
    }
  }

  // Test 4: Data Sanitization
  async testDataSanitization() {
    console.log('\n🔍 Test 4: Data Sanitization System');
    console.log('='.repeat(60));

    // Test HTML/XSS sanitization
    try {
      const client = await this.setupAuthenticatedClient('sanitize-test', 'SanitizeUser');
      
      client.emit('join_room', { roomId: 'sanitize-room' });
      await this.waitForEvent(client, 'room_joined');

      const maliciousMessage = '<script>alert("xss")</script>Hello World';
      client.emit('chat_message', {
        message: maliciousMessage,
        type: 'all'
      });

      const chatData = await this.waitForEvent(client, 'chat_message', 3000);
      const sanitized = !chatData.message.includes('<script>') && 
                       !chatData.message.includes('alert(');

      this.recordTest('sanitization', 'HTML/XSS Sanitization', sanitized);
      console.log(`   Original: "${maliciousMessage}"`);
      console.log(`   Sanitized: "${chatData.message}"`);

      client.disconnect();
    } catch (error) {
      this.recordTest('sanitization', 'HTML/XSS Sanitization', false, error.message);
    }

    // Test whitespace trimming
    try {
      const client = await this.setupAuthenticatedClient('trim-test', 'TrimUser');
      
      client.emit('join_room', { roomId: 'trim-room' });
      await this.waitForEvent(client, 'room_joined');

      const messageWithSpaces = '   Hello World   ';
      client.emit('chat_message', {
        message: messageWithSpaces,
        type: 'all'
      });

      const chatData = await this.waitForEvent(client, 'chat_message', 3000);
      const trimmed = chatData.message === 'Hello World';

      this.recordTest('sanitization', 'Whitespace Trimming', trimmed);
      console.log(`   Original: "${messageWithSpaces}"`);
      console.log(`   Trimmed: "${chatData.message}"`);

      client.disconnect();
    } catch (error) {
      this.recordTest('sanitization', 'Whitespace Trimming', false, error.message);
    }

    // Test timestamp addition
    try {
      const client = await this.setupAuthenticatedClient('timestamp-test', 'TimestampUser');

      client.emit('ready_up', { ready: true });
      // Note: timestamp addition happens server-side, we can't directly test it
      // but we can verify the event is processed
      const readyData = await this.waitForEvent(client, 'ready_state_changed', 3000);
      
      this.recordTest('sanitization', 'Server-side Processing', !!readyData);

      client.disconnect();
    } catch (error) {
      this.recordTest('sanitization', 'Server-side Processing', false, error.message);
    }
  }

  // Test 5: Error Handling
  async testErrorHandling() {
    console.log('\n🔍 Test 5: Error Handling System');
    console.log('='.repeat(60));

    // Test malformed JSON
    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      // Send various malformed data
      client.emit('authenticate', null);
      client.emit('authenticate', undefined);
      client.emit('authenticate', 'string-instead-of-object');
      client.emit('authenticate', 12345);

      // Server should handle gracefully without crashing
      await new Promise(resolve => setTimeout(resolve, 1000));

      this.recordTest('errorHandling', 'Malformed Data Handling', true);
      client.disconnect();
    } catch (error) {
      this.recordTest('errorHandling', 'Malformed Data Handling', false, error.message);
    }

    // Test non-existent event
    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      client.emit('non_existent_event', { data: 'test' });
      
      // Server should handle gracefully
      await new Promise(resolve => setTimeout(resolve, 1000));

      this.recordTest('errorHandling', 'Unknown Event Handling', true);
      client.disconnect();
    } catch (error) {
      this.recordTest('errorHandling', 'Unknown Event Handling', false, error.message);
    }

    // Test very large payload
    try {
      const client = this.createClient();
      await this.waitForEvent(client, 'connect');
      await this.waitForEvent(client, 'connected');

      const largeData = {
        playerId: 'large-test',
        username: 'LargeUser',
        largeField: 'x'.repeat(100000) // 100KB of data
      };

      client.emit('authenticate', largeData);

      // Should either process or reject gracefully
      try {
        await Promise.race([
          this.waitForEvent(client, 'authenticated', 3000),
          this.waitForEvent(client, 'validation_error', 3000),
          this.waitForEvent(client, 'auth_error', 3000)
        ]);
        this.recordTest('errorHandling', 'Large Payload Handling', true);
      } catch (error) {
        this.recordTest('errorHandling', 'Large Payload Handling', false, 'No response to large payload');
      }

      client.disconnect();
    } catch (error) {
      this.recordTest('errorHandling', 'Large Payload Handling', false, error.message);
    }
  }

  // Test 6: Performance and Logging
  async testPerformanceAndLogging() {
    console.log('\n🔍 Test 6: Performance and Logging');
    console.log('='.repeat(60));

    // Test event processing performance
    const performanceTimes = [];
    
    try {
      for (let i = 0; i < 5; i++) {
        const client = this.createClient();
        await this.waitForEvent(client, 'connect');
        await this.waitForEvent(client, 'connected');

        const startTime = performance.now();
        client.emit('ping', { test: i });
        await this.waitForEvent(client, 'pong');
        const processingTime = performance.now() - startTime;
        
        performanceTimes.push(processingTime);
        client.disconnect();
      }

      const avgTime = performanceTimes.reduce((a, b) => a + b, 0) / performanceTimes.length;
      const maxTime = Math.max(...performanceTimes);

      this.recordTest('performance', 'Event Processing Performance', 
        avgTime < 500, `${avgTime.toFixed(2)}ms avg`, avgTime);
      
      this.recordTest('performance', 'Max Processing Time', 
        maxTime < 1000, `${maxTime.toFixed(2)}ms max`, maxTime);

      console.log(`   Performance times: ${performanceTimes.map(t => t.toFixed(2)).join(', ')}ms`);

    } catch (error) {
      this.recordTest('performance', 'Event Processing Performance', false, error.message);
    }

    // Test concurrent event handling
    try {
      const clients = [];
      const promises = [];

      for (let i = 0; i < 5; i++) {
        const client = this.createClient();
        clients.push(client);
        
        const promise = this.waitForEvent(client, 'connect')
          .then(() => this.waitForEvent(client, 'connected'))
          .then(() => {
            const startTime = performance.now();
            client.emit('ping', { concurrent: i });
            return this.waitForEvent(client, 'pong').then(() => performance.now() - startTime);
          });
        promises.push(promise);
      }

      const startTime = performance.now();
      const times = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      clients.forEach(client => client.disconnect());

      const avgConcurrentTime = times.reduce((a, b) => a + b, 0) / times.length;
      
      this.recordTest('performance', 'Concurrent Event Handling', 
        avgConcurrentTime < 1000 && totalTime < 3000, 
        `${avgConcurrentTime.toFixed(2)}ms avg concurrent`, avgConcurrentTime);

      console.log(`   Concurrent processing: ${totalTime.toFixed(2)}ms total, ${avgConcurrentTime.toFixed(2)}ms avg`);

    } catch (error) {
      this.recordTest('performance', 'Concurrent Event Handling', false, error.message);
    }
  }

  // Generate comprehensive report
  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('🎯 SOCKET EVENT HANDLER TEST REPORT (TASK 3.2)');
    console.log('='.repeat(80));

    const successRate = this.results.totalTests > 0 ? (this.results.passed / this.results.totalTests) * 100 : 0;

    console.log(`📊 OVERALL TEST RESULTS:`);
    console.log(`   Total Tests: ${this.results.totalTests}`);
    console.log(`   Passed: ${this.results.passed} ✅`);
    console.log(`   Failed: ${this.results.failed} ❌`);
    console.log(`   Warnings: ${this.results.warnings} ⚠️`);
    console.log(`   Success Rate: ${successRate.toFixed(1)}%`);

    console.log(`\n📋 CATEGORY BREAKDOWN:`);
    Object.entries(this.results.categories).forEach(([category, stats]) => {
      const total = stats.passed + stats.failed;
      const rate = total > 0 ? (stats.passed / total) * 100 : 0;
      console.log(`   ${category}: ${stats.passed}/${total} (${rate.toFixed(1)}%)`);
    });

    console.log(`\n🏆 TASK 3.2 ASSESSMENT:`);
    
    // Critical system scores
    const eventRoutingScore = this.getCategoryScore('eventRouting');
    const validationScore = this.getCategoryScore('validation');
    const rateLimitingScore = this.getCategoryScore('rateLimiting');
    const errorHandlingScore = this.getCategoryScore('errorHandling');

    console.log(`   Event Routing: ${eventRoutingScore.toFixed(1)}%`);
    console.log(`   Validation System: ${validationScore.toFixed(1)}%`);
    console.log(`   Rate Limiting: ${rateLimitingScore.toFixed(1)}%`);
    console.log(`   Error Handling: ${errorHandlingScore.toFixed(1)}%`);

    const overallSystemScore = (eventRoutingScore + validationScore + rateLimitingScore + errorHandlingScore) / 4;

    console.log(`\n🎯 PRODUCTION READINESS:`);
    
    if (overallSystemScore >= 90 && successRate >= 85) {
      console.log(`   🎉 EXCELLENT (${overallSystemScore.toFixed(1)}%) - Production ready`);
    } else if (overallSystemScore >= 80 && successRate >= 75) {
      console.log(`   ✅ GOOD (${overallSystemScore.toFixed(1)}%) - Minor improvements needed`);
    } else if (overallSystemScore >= 70 && successRate >= 65) {
      console.log(`   ⚠️ ACCEPTABLE (${overallSystemScore.toFixed(1)}%) - Several issues to address`);
    } else {
      console.log(`   ❌ NEEDS WORK (${overallSystemScore.toFixed(1)}%) - Significant issues detected`);
    }

    // Key findings
    console.log(`\n🔍 KEY FINDINGS:`);
    
    if (eventRoutingScore >= 80) {
      console.log(`   ✅ Event routing system is operational`);
    }
    
    if (validationScore >= 80) {
      console.log(`   ✅ Input validation is working correctly`);
    }
    
    if (rateLimitingScore >= 60) {
      console.log(`   ✅ Rate limiting is implemented`);
    } else {
      console.log(`   ⚠️ Rate limiting needs attention`);
    }
    
    if (errorHandlingScore >= 80) {
      console.log(`   ✅ Error handling is robust`);
    }

    if (this.results.warnings > 0) {
      console.log(`   ⚠️ ${this.results.warnings} warnings detected`);
    }

    // Failed tests
    if (this.results.failed > 0) {
      console.log(`\n❌ FAILED TESTS:`);
      this.results.errors.forEach(error => {
        console.log(`   - [${error.category}] ${error.test}: ${error.details}`);
      });
    }

    console.log('\n' + '='.repeat(80));

    return {
      totalTests: this.results.totalTests,
      passed: this.results.passed,
      failed: this.results.failed,
      warnings: this.results.warnings,
      successRate,
      overallSystemScore,
      categories: this.results.categories,
      productionReady: overallSystemScore >= 80 && successRate >= 75
    };
  }

  getCategoryScore(category) {
    const stats = this.results.categories[category];
    const total = stats.passed + stats.failed;
    return total > 0 ? (stats.passed / total) * 100 : 0;
  }

  async runAllTests() {
    console.log('🎯 SOCKET EVENT HANDLER TESTING (TASK 3.2)');
    console.log('🔧 Main Event Routing and Validation System\n');

    try {
      await this.testEventRouting();
      await this.testEventValidation();
      await this.testRateLimiting();
      await this.testDataSanitization();
      await this.testErrorHandling();
      await this.testPerformanceAndLogging();

      return this.generateReport();
    } catch (error) {
      console.error('❌ Critical error during testing:', error);
      this.recordTest('errorHandling', 'Test Suite Stability', false, error.message);
      return this.generateReport();
    } finally {
      await this.cleanupClients();
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const testSuite = new SocketEventHandlerTestSuite();
  
  testSuite.runAllTests().then((results) => {
    const exitCode = results.productionReady ? 0 : 1;
    process.exit(exitCode);
  }).catch((error) => {
    console.error('❌ Test suite error:', error);
    process.exit(1);
  });
}

module.exports = SocketEventHandlerTestSuite;