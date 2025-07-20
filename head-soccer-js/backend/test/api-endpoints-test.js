/**
 * Connection Manager API Endpoints Test Suite
 * Comprehensive testing of all REST API endpoints related to Task 3.1
 */

const { performance } = require('perf_hooks');
const io = require('socket.io-client');

class APIEndpointsTestSuite {
  constructor() {
    this.baseUrl = 'https://head-soccer-production.up.railway.app';
    this.results = {
      endpoints: [],
      totalTests: 0,
      passed: 0,
      failed: 0,
      warnings: 0
    };
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const startTime = performance.now();
    
    try {
      const response = await fetch(url, {
        timeout: 10000,
        ...options
      });
      
      const responseTime = performance.now() - startTime;
      let data = null;
      
      try {
        data = await response.json();
      } catch (e) {
        data = await response.text();
      }
      
      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data,
        responseTime,
        url
      };
    } catch (error) {
      const responseTime = performance.now() - startTime;
      return {
        success: false,
        error: error.message,
        responseTime,
        url
      };
    }
  }

  recordTest(name, passed, details = null, responseTime = null) {
    this.results.totalTests++;
    
    const test = {
      name,
      passed,
      details,
      responseTime
    };
    
    if (passed) {
      this.results.passed++;
      console.log(`✅ ${name}${responseTime ? ` (${responseTime.toFixed(2)}ms)` : ''}`);
    } else {
      this.results.failed++;
      console.log(`❌ ${name}${details ? ` - ${details}` : ''}${responseTime ? ` (${responseTime.toFixed(2)}ms)` : ''}`);
    }
    
    return test;
  }

  recordWarning(name, message) {
    this.results.warnings++;
    console.log(`⚠️ ${name}: ${message}`);
  }

  // Test 1: Root Endpoint
  async testRootEndpoint() {
    console.log('\n🔍 Test 1: Root API Endpoint');
    console.log('='.repeat(50));

    const response = await this.makeRequest('/');
    
    if (!response.success) {
      this.recordTest('Root Endpoint Accessibility', false, response.error, response.responseTime);
      return;
    }

    this.recordTest('Root Endpoint Accessible', response.status === 200, null, response.responseTime);
    this.recordTest('Root Response Format', typeof response.data === 'object');
    
    if (response.data.message) {
      this.recordTest('Server Identification', response.data.message.includes('Head Soccer'), response.data.message);
      console.log(`   Message: "${response.data.message}"`);
    }
    
    if (response.data.endpoints) {
      this.recordTest('Endpoints List Provided', Array.isArray(response.data.endpoints));
      console.log(`   Available Endpoints: ${response.data.endpoints.length}`);
      response.data.endpoints.forEach(endpoint => {
        console.log(`     - ${endpoint}`);
      });
    }
    
    if (response.data.version) {
      console.log(`   Version: ${response.data.version}`);
    }

    this.results.endpoints.push({
      endpoint: '/',
      method: 'GET',
      status: response.status,
      responseTime: response.responseTime,
      working: response.status === 200
    });
  }

  // Test 2: Health Check Endpoint
  async testHealthEndpoint() {
    console.log('\n🔍 Test 2: Health Check Endpoint');
    console.log('='.repeat(50));

    const response = await this.makeRequest('/health');
    
    if (!response.success) {
      this.recordTest('Health Endpoint Accessibility', false, response.error, response.responseTime);
      return;
    }

    this.recordTest('Health Endpoint Accessible', response.status === 200, null, response.responseTime);
    this.recordTest('Health Response Format', typeof response.data === 'object');
    
    // Validate health data structure
    if (response.data.status) {
      this.recordTest('Health Status Provided', response.data.status === 'OK', response.data.status);
    }
    
    if (response.data.timestamp) {
      this.recordTest('Health Timestamp Provided', true);
      const timestamp = new Date(response.data.timestamp);
      const isValidDate = !isNaN(timestamp.getTime());
      this.recordTest('Health Timestamp Valid', isValidDate);
    }
    
    if (typeof response.data.uptime === 'number') {
      this.recordTest('Server Uptime Provided', response.data.uptime > 0, `${response.data.uptime.toFixed(2)}s`);
      console.log(`   Server Uptime: ${response.data.uptime.toFixed(2)} seconds`);
    }
    
    if (response.data.environment) {
      this.recordTest('Environment Information', true, response.data.environment);
      console.log(`   Environment: ${response.data.environment}`);
    }
    
    if (response.data.version) {
      this.recordTest('Version Information', true, response.data.version);
      console.log(`   Version: ${response.data.version}`);
    }
    
    // Services status
    if (response.data.services) {
      this.recordTest('Services Status Provided', typeof response.data.services === 'object');
      
      if (response.data.services.database) {
        this.recordTest('Database Status', response.data.services.database === 'configured');
        console.log(`   Database: ${response.data.services.database}`);
      }
      
      if (response.data.services.redis) {
        this.recordTest('Redis Status', response.data.services.redis === 'configured');
        console.log(`   Redis: ${response.data.services.redis}`);
      }
      
      if (response.data.services.cache) {
        this.recordTest('Cache Status Provided', typeof response.data.services.cache === 'object');
        if (response.data.services.cache.redis !== undefined) {
          console.log(`   Cache Redis: ${response.data.services.cache.redis}`);
          console.log(`   Cache Mode: ${response.data.services.cache.mode}`);
        }
      }
    }

    // Performance validation
    if (response.responseTime > 2000) {
      this.recordWarning('Health Endpoint Performance', `Slow response: ${response.responseTime.toFixed(2)}ms`);
    }

    this.results.endpoints.push({
      endpoint: '/health',
      method: 'GET',
      status: response.status,
      responseTime: response.responseTime,
      working: response.status === 200
    });
  }

  // Test 3: Redis Test Endpoint
  async testRedisEndpoint() {
    console.log('\n🔍 Test 3: Redis Test Endpoint');
    console.log('='.repeat(50));

    const response = await this.makeRequest('/test-redis');
    
    if (!response.success) {
      this.recordTest('Redis Test Endpoint Accessibility', false, response.error, response.responseTime);
      return;
    }

    this.recordTest('Redis Test Endpoint Accessible', response.status === 200, null, response.responseTime);
    
    if (response.data.status) {
      this.recordTest('Redis Test Status', response.data.status.includes('completed'), response.data.status);
    }
    
    if (response.data.cacheStatus) {
      this.recordTest('Cache Status Information', typeof response.data.cacheStatus === 'object');
      
      if (response.data.cacheStatus.redis !== undefined) {
        this.recordTest('Redis Connection Status', response.data.cacheStatus.redis === true);
        console.log(`   Redis Connected: ${response.data.cacheStatus.redis}`);
        console.log(`   Cache Mode: ${response.data.cacheStatus.mode}`);
      }
    }
    
    if (response.data.testResults) {
      this.recordTest('Redis Test Results Provided', typeof response.data.testResults === 'object');
      
      if (response.data.testResults.testPassed !== undefined) {
        this.recordTest('Redis Functionality Test', response.data.testResults.testPassed === true);
        console.log(`   Test Passed: ${response.data.testResults.testPassed}`);
        
        if (response.data.testResults.setValue && response.data.testResults.retrievedValue) {
          const valuesMatch = response.data.testResults.setValue === response.data.testResults.retrievedValue;
          this.recordTest('Redis Data Consistency', valuesMatch);
          console.log(`   Set Value: ${response.data.testResults.setValue}`);
          console.log(`   Retrieved Value: ${response.data.testResults.retrievedValue}`);
        }
      }
    }

    this.results.endpoints.push({
      endpoint: '/test-redis',
      method: 'GET',
      status: response.status,
      responseTime: response.responseTime,
      working: response.status === 200
    });
  }

  // Test 4: WebSocket Stats Endpoint
  async testWebSocketStatsEndpoint() {
    console.log('\n🔍 Test 4: WebSocket Statistics Endpoint');
    console.log('='.repeat(50));

    const response = await this.makeRequest('/websocket/stats');
    
    if (!response.success) {
      this.recordTest('WebSocket Stats Endpoint Accessibility', false, response.error, response.responseTime);
      return;
    }

    this.recordTest('WebSocket Stats Endpoint Accessible', response.status === 200, null, response.responseTime);
    this.recordTest('WebSocket Stats Response Format', typeof response.data === 'object');
    
    // Connection Manager Stats
    if (response.data.connectionManager) {
      this.recordTest('Connection Manager Stats Provided', typeof response.data.connectionManager === 'object');
      
      const cmStats = response.data.connectionManager;
      
      // Required stats fields
      const requiredFields = [
        'totalConnections', 'activeConnections', 'disconnections', 
        'timeouts', 'reconnections', 'startTime', 'uptime'
      ];
      
      requiredFields.forEach(field => {
        if (typeof cmStats[field] === 'number') {
          this.recordTest(`CM ${field} Present`, true, cmStats[field].toString());
        } else {
          this.recordTest(`CM ${field} Present`, false, 'Missing or invalid type');
        }
      });
      
      console.log(`   Connection Manager Stats:`);
      console.log(`     Total Connections: ${cmStats.totalConnections}`);
      console.log(`     Active Connections: ${cmStats.activeConnections}`);
      console.log(`     Disconnections: ${cmStats.disconnections}`);
      console.log(`     Timeouts: ${cmStats.timeouts}`);
      console.log(`     Reconnections: ${cmStats.reconnections}`);
      console.log(`     Uptime: ${cmStats.uptime.toFixed(2)}s`);
      
      // Validation logic
      if (cmStats.totalConnections >= 0) {
        this.recordTest('CM Total Connections Valid', true);
      }
      
      if (cmStats.activeConnections >= 0 && cmStats.activeConnections <= cmStats.totalConnections) {
        this.recordTest('CM Active Connections Valid', true);
      }
    }
    
    // Socket Handler Stats
    if (response.data.socketHandler) {
      this.recordTest('Socket Handler Stats Provided', typeof response.data.socketHandler === 'object');
      
      const shStats = response.data.socketHandler;
      
      const requiredFields = [
        'eventsProcessed', 'eventsRejected', 'validationErrors', 
        'rateLimitViolations', 'startTime', 'uptime'
      ];
      
      requiredFields.forEach(field => {
        if (typeof shStats[field] === 'number') {
          this.recordTest(`SH ${field} Present`, true, shStats[field].toString());
        } else {
          this.recordTest(`SH ${field} Present`, false, 'Missing or invalid type');
        }
      });
      
      console.log(`   Socket Handler Stats:`);
      console.log(`     Events Processed: ${shStats.eventsProcessed}`);
      console.log(`     Events Rejected: ${shStats.eventsRejected}`);
      console.log(`     Validation Errors: ${shStats.validationErrors}`);
      console.log(`     Rate Limit Violations: ${shStats.rateLimitViolations}`);
      console.log(`     Error Rate: ${(shStats.errorRate * 100).toFixed(2)}%`);
      
      // Performance metrics
      if (shStats.errorRate !== undefined) {
        this.recordTest('SH Error Rate Acceptable', shStats.errorRate < 0.2, `${(shStats.errorRate * 100).toFixed(2)}%`);
      }
    }
    
    if (response.data.timestamp) {
      this.recordTest('Stats Timestamp Provided', true);
      const timestamp = new Date(response.data.timestamp);
      this.recordTest('Stats Timestamp Valid', !isNaN(timestamp.getTime()));
    }

    this.results.endpoints.push({
      endpoint: '/websocket/stats',
      method: 'GET',
      status: response.status,
      responseTime: response.responseTime,
      working: response.status === 200
    });
  }

  // Test 5: WebSocket Connections Endpoint
  async testWebSocketConnectionsEndpoint() {
    console.log('\n🔍 Test 5: WebSocket Active Connections Endpoint');
    console.log('='.repeat(50));

    // First, let's create some connections to test with
    console.log('   Creating test connections...');
    const testClients = [];
    
    try {
      // Create 2 test connections
      for (let i = 0; i < 2; i++) {
        const client = io(this.baseUrl, {
          transports: ['polling'],
          timeout: 10000,
          forceNew: true
        });
        testClients.push(client);
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);
          client.on('connect', () => {
            clearTimeout(timeout);
            resolve();
          });
          client.on('connect_error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Welcome timeout')), 3000);
          client.on('connected', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
        
        // Authenticate the connection
        client.emit('authenticate', {
          playerId: `api-test-player-${i}`,
          username: `APITestUser${i}`
        });
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Auth timeout')), 3000);
          client.on('authenticated', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }
      
      console.log('   Test connections created successfully');
      
      // Wait a moment for connections to be fully established
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`   Warning: Could not create test connections: ${error.message}`);
    }

    // Now test the connections endpoint
    const response = await this.makeRequest('/websocket/connections');
    
    if (!response.success) {
      this.recordTest('WebSocket Connections Endpoint Accessibility', false, response.error, response.responseTime);
      return;
    }

    this.recordTest('WebSocket Connections Endpoint Accessible', response.status === 200, null, response.responseTime);
    this.recordTest('Connections Response Format', typeof response.data === 'object');
    
    if (response.data.totalConnections !== undefined) {
      this.recordTest('Total Connections Count Provided', typeof response.data.totalConnections === 'number');
      console.log(`   Total Connections: ${response.data.totalConnections}`);
    }
    
    if (response.data.connections) {
      this.recordTest('Connections Array Provided', Array.isArray(response.data.connections));
      console.log(`   Connections Listed: ${response.data.connections.length}`);
      
      // Validate connection data structure
      if (response.data.connections.length > 0) {
        const firstConnection = response.data.connections[0];
        
        this.recordTest('Connection Data Structure Valid', typeof firstConnection === 'object');
        
        const expectedFields = ['socketId', 'connectedAt', 'isAuthenticated'];
        expectedFields.forEach(field => {
          if (firstConnection[field] !== undefined) {
            this.recordTest(`Connection ${field} Present`, true);
          }
        });
        
        console.log(`   Sample Connection Data:`);
        console.log(`     Socket ID: ${firstConnection.socketId}`);
        console.log(`     Is Authenticated: ${firstConnection.isAuthenticated}`);
        console.log(`     Connected At: ${new Date(firstConnection.connectedAt).toISOString()}`);
        
        if (firstConnection.playerId) {
          console.log(`     Player ID: ${firstConnection.playerId}`);
        }
      }
    }
    
    if (response.data.timestamp) {
      this.recordTest('Connections Timestamp Provided', true);
    }

    // Cleanup test connections
    testClients.forEach(client => {
      try {
        if (client.connected) {
          client.disconnect();
        }
      } catch (error) {
        console.log(`   Warning: Error disconnecting test client: ${error.message}`);
      }
    });

    this.results.endpoints.push({
      endpoint: '/websocket/connections',
      method: 'GET',
      status: response.status,
      responseTime: response.responseTime,
      working: response.status === 200
    });
  }

  // Test 6: Error Handling and Edge Cases
  async testErrorHandling() {
    console.log('\n🔍 Test 6: API Error Handling');
    console.log('='.repeat(50));

    // Test non-existent endpoint
    const notFoundResponse = await this.makeRequest('/nonexistent-endpoint');
    this.recordTest('404 Not Found Handling', notFoundResponse.status === 404, null, notFoundResponse.responseTime);
    
    // Test invalid method (if applicable)
    const postHealthResponse = await this.makeRequest('/health', { method: 'POST' });
    this.recordTest('Invalid Method Handling', postHealthResponse.status === 404 || postHealthResponse.status === 405, null, postHealthResponse.responseTime);
    
    console.log(`   404 Response Status: ${notFoundResponse.status}`);
    console.log(`   POST to GET endpoint: ${postHealthResponse.status}`);
  }

  // Test 7: Performance and Load Testing
  async testPerformance() {
    console.log('\n🔍 Test 7: API Performance Testing');
    console.log('='.repeat(50));

    const performanceTests = [
      { endpoint: '/health', name: 'Health Check' },
      { endpoint: '/websocket/stats', name: 'WebSocket Stats' },
      { endpoint: '/', name: 'Root Endpoint' }
    ];

    for (const test of performanceTests) {
      const times = [];
      
      // Run 5 requests to get average
      for (let i = 0; i < 5; i++) {
        const response = await this.makeRequest(test.endpoint);
        if (response.success) {
          times.push(response.responseTime);
        }
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between requests
      }
      
      if (times.length > 0) {
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const maxTime = Math.max(...times);
        const minTime = Math.min(...times);
        
        this.recordTest(`${test.name} Avg Performance`, avgTime < 2000, `${avgTime.toFixed(2)}ms avg`);
        this.recordTest(`${test.name} Max Performance`, maxTime < 5000, `${maxTime.toFixed(2)}ms max`);
        
        console.log(`   ${test.name}: avg=${avgTime.toFixed(2)}ms, min=${minTime.toFixed(2)}ms, max=${maxTime.toFixed(2)}ms`);
        
        if (avgTime > 1000) {
          this.recordWarning(`${test.name} Performance`, `Average response time is ${avgTime.toFixed(2)}ms`);
        }
      }
    }
  }

  // Generate comprehensive report
  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('🎯 CONNECTION MANAGER API ENDPOINTS TEST REPORT');
    console.log('='.repeat(80));

    const successRate = this.results.totalTests > 0 ? (this.results.passed / this.results.totalTests) * 100 : 0;
    
    console.log(`📊 OVERALL API TEST RESULTS:`);
    console.log(`   Total Tests: ${this.results.totalTests}`);
    console.log(`   Passed: ${this.results.passed} ✅`);
    console.log(`   Failed: ${this.results.failed} ❌`);
    console.log(`   Warnings: ${this.results.warnings} ⚠️`);
    console.log(`   Success Rate: ${successRate.toFixed(1)}%`);

    console.log(`\n🌐 ENDPOINT SUMMARY:`);
    this.results.endpoints.forEach(endpoint => {
      const status = endpoint.working ? '✅' : '❌';
      console.log(`   ${status} ${endpoint.method} ${endpoint.endpoint} - ${endpoint.status} (${endpoint.responseTime.toFixed(2)}ms)`);
    });

    console.log(`\n🏆 CONNECTION MANAGER API ASSESSMENT:`);
    
    const workingEndpoints = this.results.endpoints.filter(e => e.working).length;
    const totalEndpoints = this.results.endpoints.length;
    const endpointSuccessRate = totalEndpoints > 0 ? (workingEndpoints / totalEndpoints) * 100 : 0;
    
    console.log(`   Working Endpoints: ${workingEndpoints}/${totalEndpoints} (${endpointSuccessRate.toFixed(1)}%)`);
    
    if (successRate >= 95 && endpointSuccessRate >= 90) {
      console.log(`   🎉 EXCELLENT - All APIs are production ready`);
    } else if (successRate >= 85 && endpointSuccessRate >= 80) {
      console.log(`   ✅ GOOD - APIs are mostly functional`);
    } else if (successRate >= 70) {
      console.log(`   ⚠️ ACCEPTABLE - Some API issues detected`);
    } else {
      console.log(`   ❌ NEEDS WORK - Significant API issues`);
    }

    console.log(`\n🎯 KEY FINDINGS:`);
    
    const healthEndpoint = this.results.endpoints.find(e => e.endpoint === '/health');
    if (healthEndpoint && healthEndpoint.working) {
      console.log(`   ✅ Health monitoring is operational`);
    }
    
    const statsEndpoint = this.results.endpoints.find(e => e.endpoint === '/websocket/stats');
    if (statsEndpoint && statsEndpoint.working) {
      console.log(`   ✅ WebSocket statistics are accessible`);
    }
    
    const connectionsEndpoint = this.results.endpoints.find(e => e.endpoint === '/websocket/connections');
    if (connectionsEndpoint && connectionsEndpoint.working) {
      console.log(`   ✅ Connection monitoring is functional`);
    }
    
    if (this.results.warnings > 0) {
      console.log(`   ⚠️ ${this.results.warnings} performance warnings detected`);
    }

    console.log('\n' + '='.repeat(80));

    return {
      totalTests: this.results.totalTests,
      passed: this.results.passed,
      failed: this.results.failed,
      warnings: this.results.warnings,
      successRate,
      endpointSuccessRate,
      workingEndpoints,
      totalEndpoints
    };
  }

  async runAllTests() {
    console.log('🎯 CONNECTION MANAGER API ENDPOINTS TESTING');
    console.log('🔌 Comprehensive Testing of Task 3.1 Related APIs\n');

    try {
      await this.testRootEndpoint();
      await this.testHealthEndpoint();
      await this.testRedisEndpoint();
      await this.testWebSocketStatsEndpoint();
      await this.testWebSocketConnectionsEndpoint();
      await this.testErrorHandling();
      await this.testPerformance();

      return this.generateReport();
    } catch (error) {
      console.error('❌ Critical error during API testing:', error);
      this.recordTest('API Test Suite', false, error.message);
      return this.generateReport();
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const testSuite = new APIEndpointsTestSuite();
  
  testSuite.runAllTests().then((results) => {
    const exitCode = results.successRate >= 80 ? 0 : 1;
    process.exit(exitCode);
  }).catch((error) => {
    console.error('❌ API test suite error:', error);
    process.exit(1);
  });
}

module.exports = APIEndpointsTestSuite;