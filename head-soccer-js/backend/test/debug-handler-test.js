/**
 * Debug Handler Test - Check if event handlers are working at all
 */

const io = require('socket.io-client');

const client = io('http://localhost:3001', { timeout: 3000 });

console.log('🔍 Testing basic event handler functionality...\n');

client.on('connect', () => {
  console.log('✅ Connected to server');
  
  // Test basic registration first
  client.emit('register_player', {
    playerId: 'debug_test',
    username: 'DebugTester',
    character: 'default'
  });
  
  console.log('📡 Sent register_player event');
  
  setTimeout(() => {
    console.log('🏳️ Sending forfeit_game...');
    client.emit('forfeit_game', { reason: 'debug' });
  }, 1000);
  
  setTimeout(() => {
    console.log('🏁 Sending request_game_end...');
    client.emit('request_game_end', { reason: 'technical_issue' });
  }, 2000);
  
  setTimeout(() => {
    console.log('🧪 Sending test event (should not exist)...');
    client.emit('test_nonexistent_event', { data: 'test' });
  }, 3000);
  
  setTimeout(() => {
    console.log('🔌 Disconnecting...');
    client.disconnect();
    process.exit(0);
  }, 5000);
});

// Listen for any response
client.on('player_registered', (data) => {
  console.log('✅ Player registered response:', data);
});

client.on('registration_error', (data) => {
  console.log('❌ Registration error:', data);
});

client.on('forfeit_accepted', (data) => {
  console.log('✅ Forfeit accepted:', data);
});

client.on('forfeit_rejected', (data) => {
  console.log('❌ Forfeit rejected:', data);
});

client.on('game_end_accepted', (data) => {
  console.log('✅ Game end accepted:', data);
});

client.on('game_end_rejected', (data) => {
  console.log('❌ Game end rejected:', data);
});

// Listen for any event
client.onAny((eventName, data) => {
  console.log(`📨 Received event '${eventName}':`, data);
});

client.on('connect_error', (error) => {
  console.error('💥 Connection failed:', error.message);
  process.exit(1);
});

client.on('disconnect', (reason) => {
  console.log('🔌 Disconnected:', reason);
});