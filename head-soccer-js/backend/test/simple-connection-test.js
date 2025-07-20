/**
 * Simple WebSocket Connection Test
 * Basic test to verify connection stability
 */

const io = require('socket.io-client');

function testConnection() {
  console.log('🧪 Simple WebSocket Connection Test');
  console.log('Connecting to production server...\n');
  
  const client = io('https://head-soccer-production.up.railway.app', {
    transports: ['websocket', 'polling'],
    timeout: 10000,
    forceNew: true
  });
  
  client.on('connect', () => {
    console.log(`✅ Connected: ${client.id}`);
    console.log('📊 Connection info:', {
      transport: client.io.engine.transport.name,
      readyState: client.io.engine.readyState
    });
  });
  
  client.on('connected', (data) => {
    console.log('🎉 Server welcome message received!');
    console.log('📝 Welcome data:', data);
    
    // Test authentication after receiving welcome
    setTimeout(() => {
      console.log('\n🔑 Testing authentication...');
      client.emit('authenticate', {
        playerId: 'simple-test-player',
        username: 'SimpleTestUser'
      });
    }, 500);
  });
  
  client.on('authenticated', (data) => {
    console.log('✅ Authentication successful!');
    console.log('📝 Auth data:', data);
    
    // Disconnect after successful auth
    setTimeout(() => {
      console.log('\n👋 Disconnecting...');
      client.disconnect();
    }, 1000);
  });
  
  client.on('auth_error', (data) => {
    console.log('❌ Authentication error:', data);
  });
  
  client.on('disconnect', (reason) => {
    console.log(`🔌 Disconnected: ${reason}`);
    process.exit(0);
  });
  
  client.on('connect_error', (error) => {
    console.log('❌ Connection error:', error.message);
    process.exit(1);
  });
  
  client.on('error', (error) => {
    console.log('❌ Socket error:', error);
  });
  
  // Timeout
  setTimeout(() => {
    console.log('\n⏰ Test timeout - disconnecting');
    client.disconnect();
    process.exit(0);
  }, 15000);
}

testConnection();