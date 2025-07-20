/**
 * Full WebSocket Flow Test
 * Test complete authentication and basic functionality
 */

const io = require('socket.io-client');

function testFullFlow() {
  console.log('🚀 Testing Complete WebSocket Flow\n');
  
  const client = io('https://head-soccer-production.up.railway.app', {
    transports: ['polling'], // Use working transport
    timeout: 10000,
    forceNew: true
  });
  
  client.on('connect', () => {
    console.log(`✅ Connected: ${client.id}`);
  });
  
  client.on('connected', (data) => {
    console.log('🎉 Welcome message received!');
    console.log(`   Server time: ${new Date(data.serverTime).toISOString()}`);
    console.log(`   Heartbeat interval: ${data.heartbeatInterval}ms`);
    
    // Test authentication
    setTimeout(() => {
      console.log('\n🔑 Testing authentication...');
      client.emit('authenticate', {
        playerId: 'full-test-player-123',
        username: 'FullTestUser',
        token: 'test-token'
      });
    }, 500);
  });
  
  client.on('authenticated', (data) => {
    console.log('✅ Authentication successful!');
    console.log(`   Player ID: ${data.playerId}`);
    console.log(`   Username: ${data.username}`);
    console.log(`   Socket ID: ${data.socketId}`);
    
    // Test room joining
    setTimeout(() => {
      console.log('\n🏠 Testing room management...');
      client.emit('join_room', { roomId: 'test-room-456' });
    }, 500);
  });
  
  client.on('room_joined', (data) => {
    console.log('✅ Room joined successfully!');
    console.log(`   Room ID: ${data.roomId}`);
    console.log(`   Players in room: ${data.playersInRoom}`);
    
    // Test ready up
    setTimeout(() => {
      console.log('\n⚡ Testing ready state...');
      client.emit('ready_up', { ready: true });
    }, 500);
  });
  
  client.on('ready_state_changed', (data) => {
    console.log('✅ Ready state changed!');
    console.log(`   Ready: ${data.ready}`);
    
    // Test chat
    setTimeout(() => {
      console.log('\n💬 Testing chat...');
      client.emit('chat_message', {
        message: 'Hello from test client!',
        type: 'all'
      });
    }, 500);
  });
  
  client.on('chat_message', (data) => {
    console.log('✅ Chat message received!');
    console.log(`   From: ${data.username}`);
    console.log(`   Message: ${data.message}`);
    
    // Complete test
    setTimeout(() => {
      console.log('\n🎯 All tests passed! Disconnecting...');
      client.disconnect();
    }, 1000);
  });
  
  // Error handling
  client.on('auth_error', (data) => {
    console.log('❌ Auth error:', data);
  });
  
  client.on('join_room_error', (data) => {
    console.log('❌ Room join error:', data);
  });
  
  client.on('validation_error', (data) => {
    console.log('❌ Validation error:', data);
  });
  
  client.on('disconnect', (reason) => {
    console.log(`\n🔌 Disconnected: ${reason}`);
    console.log('\n🎊 Connection Manager Test Complete!');
    process.exit(0);
  });
  
  client.on('connect_error', (error) => {
    console.log('❌ Connection error:', error.message);
    process.exit(1);
  });
  
  setTimeout(() => {
    console.log('⏰ Test timeout');
    client.disconnect();
  }, 20000);
}

testFullFlow();