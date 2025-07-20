/**
 * WebSocket Integration Test
 * Tests Connection Manager and Socket Handler functionality
 */

const io = require('socket.io-client');

async function testWebSocketConnection() {
  console.log('🧪 Testing WebSocket Connection...\n');
  
  const serverUrl = process.env.NODE_ENV === 'production' 
    ? 'https://head-soccer-production.up.railway.app'
    : 'http://localhost:3001';
  
  console.log(`Connecting to: ${serverUrl}`);
  
  // Create client connection
  const client = io(serverUrl, {
    transports: ['websocket'],
    timeout: 5000
  });
  
  return new Promise((resolve, reject) => {
    let testResults = {
      connected: false,
      authenticated: false,
      pingLatency: null,
      eventsReceived: [],
      errors: []
    };
    
    // Connection successful
    client.on('connect', () => {
      console.log(`✅ Connected: ${client.id}`);
      testResults.connected = true;
      
      // Test authentication
      setTimeout(() => {
        console.log('🔑 Testing authentication...');
        client.emit('authenticate', {
          playerId: 'test-player-123',
          username: 'TestPlayer',
          token: 'test-token'
        });
      }, 100);
    });
    
    // Connection confirmation from server
    client.on('connected', (data) => {
      console.log('📝 Server welcome:', data);
      testResults.eventsReceived.push('connected');
    });
    
    // Authentication response
    client.on('authenticated', (data) => {
      console.log('✅ Authenticated:', data);
      testResults.authenticated = true;
      testResults.eventsReceived.push('authenticated');
      
      // Test ping latency
      setTimeout(() => {
        console.log('🏓 Testing ping latency...');
        const startTime = Date.now();
        client.emit('ping_latency', { clientTime: startTime });
      }, 100);
    });
    
    // Ping latency response
    client.on('pong_latency', (data) => {
      const latency = Date.now() - data.clientTime;
      console.log(`🏓 Ping latency: ${latency}ms`);
      testResults.pingLatency = latency;
      testResults.eventsReceived.push('pong_latency');
      
      // Test matchmaking
      setTimeout(() => {
        console.log('🎯 Testing matchmaking...');
        client.emit('join_matchmaking', {
          gameMode: 'casual',
          region: 'US-East'
        });
      }, 100);
    });
    
    // Matchmaking response
    client.on('matchmaking_joined', (data) => {
      console.log('🎮 Joined matchmaking:', data);
      testResults.eventsReceived.push('matchmaking_joined');
      
      // Test leaving matchmaking
      setTimeout(() => {
        console.log('🚪 Testing leave matchmaking...');
        client.emit('leave_matchmaking', {});
      }, 100);
    });
    
    client.on('matchmaking_left', (data) => {
      console.log('👋 Left matchmaking:', data);
      testResults.eventsReceived.push('matchmaking_left');
      
      // Complete test
      setTimeout(() => {
        client.disconnect();
        resolve(testResults);
      }, 500);
    });
    
    // Error handling
    client.on('auth_error', (data) => {
      console.log('❌ Auth error:', data);
      testResults.errors.push('auth_error');
    });
    
    client.on('matchmaking_error', (data) => {
      console.log('❌ Matchmaking error:', data);
      testResults.errors.push('matchmaking_error');
    });
    
    client.on('validation_error', (data) => {
      console.log('❌ Validation error:', data);
      testResults.errors.push('validation_error');
    });
    
    client.on('rate_limit_exceeded', (data) => {
      console.log('⏱️ Rate limit exceeded:', data);
      testResults.errors.push('rate_limit_exceeded');
    });
    
    client.on('connect_error', (error) => {
      console.log('❌ Connection error:', error.message);
      testResults.errors.push('connect_error');
      reject(error);
    });
    
    client.on('disconnect', (reason) => {
      console.log(`🔌 Disconnected: ${reason}`);
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (client.connected) {
        client.disconnect();
      }
      if (testResults.eventsReceived.length === 0) {
        reject(new Error('Test timeout - no events received'));
      } else {
        resolve(testResults);
      }
    }, 30000);
  });
}

async function testRateLimiting() {
  console.log('\n🧪 Testing Rate Limiting...\n');
  
  const serverUrl = process.env.NODE_ENV === 'production' 
    ? 'https://head-soccer-production.up.railway.app'
    : 'http://localhost:3001';
  
  const client = io(serverUrl, {
    transports: ['websocket'],
    timeout: 5000
  });
  
  return new Promise((resolve, reject) => {
    let rateLimitHit = false;
    
    client.on('connect', () => {
      console.log(`✅ Connected for rate limit test: ${client.id}`);
      
      // Authenticate first
      client.emit('authenticate', {
        playerId: 'rate-test-player',
        username: 'RateTestPlayer'
      });
    });
    
    client.on('authenticated', () => {
      console.log('🔥 Spamming chat messages to trigger rate limit...');
      
      // Send many chat messages rapidly
      for (let i = 0; i < 15; i++) {
        setTimeout(() => {
          client.emit('chat_message', {
            message: `Spam message ${i + 1}`,
            type: 'all'
          });
        }, i * 50); // 50ms intervals
      }
    });
    
    client.on('rate_limit_exceeded', (data) => {
      console.log('✅ Rate limit triggered as expected:', data);
      rateLimitHit = true;
      
      setTimeout(() => {
        client.disconnect();
        resolve({ rateLimitHit });
      }, 1000);
    });
    
    client.on('connect_error', (error) => {
      reject(error);
    });
    
    // Timeout
    setTimeout(() => {
      client.disconnect();
      resolve({ rateLimitHit });
    }, 10000);
  });
}

async function runWebSocketTests() {
  console.log('🚀 Starting WebSocket Integration Tests\n');
  
  try {
    // Test 1: Basic connection and functionality
    console.log('='.repeat(50));
    const connectionTest = await testWebSocketConnection();
    
    console.log('\n📊 Connection Test Results:');
    console.log(`Connected: ${connectionTest.connected ? '✅' : '❌'}`);
    console.log(`Authenticated: ${connectionTest.authenticated ? '✅' : '❌'}`);
    console.log(`Ping Latency: ${connectionTest.pingLatency || 'N/A'}ms`);
    console.log(`Events Received: ${connectionTest.eventsReceived.length}`);
    console.log(`  - ${connectionTest.eventsReceived.join(', ')}`);
    console.log(`Errors: ${connectionTest.errors.length}`);
    if (connectionTest.errors.length > 0) {
      console.log(`  - ${connectionTest.errors.join(', ')}`);
    }
    
    // Test 2: Rate limiting
    console.log('\n' + '='.repeat(50));
    const rateLimitTest = await testRateLimiting();
    
    console.log('\n📊 Rate Limit Test Results:');
    console.log(`Rate Limit Triggered: ${rateLimitTest.rateLimitHit ? '✅' : '❌'}`);
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('🎯 WebSocket Test Summary:');
    
    const totalTests = 5; // connected, authenticated, ping, events, rate limit
    let passedTests = 0;
    
    if (connectionTest.connected) passedTests++;
    if (connectionTest.authenticated) passedTests++;
    if (connectionTest.pingLatency !== null) passedTests++;
    if (connectionTest.eventsReceived.length >= 3) passedTests++; // At least 3 events
    if (rateLimitTest.rateLimitHit) passedTests++;
    
    console.log(`✅ Passed: ${passedTests}/${totalTests} tests`);
    console.log(`🎯 Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    
    if (passedTests === totalTests) {
      console.log('\n🎉 All WebSocket tests passed! Real-time functionality is working correctly.');
    } else {
      console.log('\n⚠️ Some tests failed. Check the details above.');
    }
    
  } catch (error) {
    console.error('❌ WebSocket test failed:', error.message);
    process.exit(1);
  }
}

// Run tests if called directly
if (require.main === module) {
  runWebSocketTests().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

module.exports = { runWebSocketTests };