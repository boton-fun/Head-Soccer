/**
 * Debug Game End Events - Simple test to see what's happening
 */

const io = require('socket.io-client');

const client = io('http://localhost:3001', { 
  timeout: 5000,
  forceNew: true 
});

client.on('connect', () => {
  console.log('✅ Connected to server');
  
  // Register player first
  client.emit('register_player', {
    playerId: 'debug_player',
    username: 'DebugPlayer',
    character: 'default'
  });
  
  console.log('📡 Sent register_player event');
  
  setTimeout(() => {
    console.log('🏳️ Sending forfeit_game event...');
    client.emit('forfeit_game', { reason: 'debug_test' });
  }, 1000);
  
  setTimeout(() => {
    console.log('🏁 Sending request_game_end event...');
    client.emit('request_game_end', { reason: 'technical_issue' });
  }, 2000);
  
  setTimeout(() => {
    console.log('🔌 Disconnecting...');
    client.disconnect();
    process.exit(0);
  }, 4000);
});

// Listen for all possible responses
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

client.on('player_registered', (data) => {
  console.log('✅ Player registered:', data);
});

client.on('registration_error', (data) => {
  console.log('❌ Registration error:', data);
});

client.on('connect_error', (error) => {
  console.error('💥 Connection error:', error);
  process.exit(1);
});

client.on('error', (error) => {
  console.error('💥 Socket error:', error);
});

client.on('disconnect', (reason) => {
  console.log('🔌 Disconnected:', reason);
});

console.log('🏁 Starting debug test...');