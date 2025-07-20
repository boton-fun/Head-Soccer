/**
 * Manual Connection Manager Test
 * Simple test to verify WebSocket functionality
 */

const io = require('socket.io-client');

async function testBasicConnection() {
  console.log('🧪 Testing Basic WebSocket Connection...\n');
  
  const serverUrl = 'https://head-soccer-production.up.railway.app';
  console.log(`Connecting to: ${serverUrl}`);
  
  return new Promise((resolve, reject) => {
    const client = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: true
    });
    
    let testResults = {
      connected: false,
      welcomeReceived: false,
      authenticated: false,
      pingWorking: false,
      errors: []
    };
    
    // Connection events
    client.on('connect', () => {
      console.log(`✅ Connected: ${client.id}`);
      testResults.connected = true;
    });
    
    client.on('connected', (data) => {
      console.log('📝 Server welcome message received:', {
        socketId: data.socketId,
        serverTime: new Date(data.serverTime).toISOString(),
        heartbeatInterval: data.heartbeatInterval
      });
      testResults.welcomeReceived = true;
      
      // Test authentication
      setTimeout(() => {
        console.log('🔑 Testing authentication...');
        client.emit('authenticate', {
          playerId: 'manual-test-player',
          username: 'ManualTestUser',
          token: 'test-token'
        });
      }, 500);
    });
    
    client.on('authenticated', (data) => {
      console.log('✅ Authentication successful:', {
        playerId: data.playerId,
        username: data.username,
        socketId: data.socketId
      });
      testResults.authenticated = true;
      
      // Test ping
      setTimeout(() => {
        console.log('🏓 Testing ping...');
        const startTime = Date.now();
        client.emit('ping', { clientTime: startTime });
      }, 500);
    });
    
    client.on('pong', (data) => {
      const latency = Date.now() - data.clientTime;
      console.log(`✅ Ping successful! Latency: ${latency}ms`);
      testResults.pingWorking = true;
      
      // Complete test
      setTimeout(() => {
        client.disconnect();
        resolve(testResults);
      }, 1000);
    });
    
    // Error handling
    client.on('auth_error', (data) => {
      console.log('❌ Auth error:', data);
      testResults.errors.push('auth_error');
    });
    
    client.on('connect_error', (error) => {
      console.log('❌ Connection error:', error.message);
      testResults.errors.push('connect_error');
    });
    
    client.on('disconnect', (reason) => {
      console.log(`🔌 Disconnected: ${reason}`);
    });
    
    // Error events
    client.on('error', (error) => {
      console.log('❌ Socket error:', error);
      testResults.errors.push('socket_error');
    });
    
    // Timeout
    setTimeout(() => {
      console.log('⏰ Test timeout reached');
      if (!testResults.connected) {
        reject(new Error('Failed to connect within timeout'));
      } else {
        client.disconnect();
        resolve(testResults);
      }
    }, 15000);
  });
}

async function testConnectionManager() {
  console.log('🚀 Manual Connection Manager Test');
  console.log('='.repeat(50));
  
  try {
    const results = await testBasicConnection();
    
    console.log('\n📊 Test Results:');
    console.log(`Connected: ${results.connected ? '✅' : '❌'}`);
    console.log(`Welcome Message: ${results.welcomeReceived ? '✅' : '❌'}`);
    console.log(`Authentication: ${results.authenticated ? '✅' : '❌'}`);
    console.log(`Ping/Pong: ${results.pingWorking ? '✅' : '❌'}`);
    console.log(`Errors: ${results.errors.length} (${results.errors.join(', ')})`);
    
    const successCount = [
      results.connected,
      results.welcomeReceived,
      results.authenticated,
      results.pingWorking
    ].filter(Boolean).length;
    
    const successRate = Math.round((successCount / 4) * 100);
    
    console.log(`\n🎯 Success Rate: ${successRate}% (${successCount}/4)`);
    
    if (successRate >= 75) {
      console.log('🎉 Connection Manager is working well!');
    } else if (successRate >= 50) {
      console.log('⚠️ Connection Manager has some issues but is functional');
    } else {
      console.log('❌ Connection Manager needs attention');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Test if server stats endpoint is accessible
async function testServerEndpoints() {
  console.log('\n🌐 Testing Server Endpoints...');
  
  const endpoints = [
    '/health',
    '/websocket/stats'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`https://head-soccer-production.up.railway.app${endpoint}`);
      const data = await response.json();
      
      if (response.ok) {
        console.log(`✅ ${endpoint}: OK`);
        if (endpoint === '/websocket/stats' && data.connectionManager) {
          console.log(`   Active Connections: ${data.connectionManager.activeConnections}`);
          console.log(`   Total Connections: ${data.connectionManager.totalConnections}`);
        }
      } else {
        console.log(`❌ ${endpoint}: ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ ${endpoint}: Error - ${error.message}`);
    }
  }
}

// Run all tests
async function runAllTests() {
  await testConnectionManager();
  await testServerEndpoints();
}

if (require.main === module) {
  runAllTests().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
}

module.exports = { testBasicConnection, testServerEndpoints };