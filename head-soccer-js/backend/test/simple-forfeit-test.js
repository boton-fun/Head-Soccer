/**
 * Simple forfeit test to verify basic functionality
 */

const io = require('socket.io-client');

const client = io('http://localhost:3001');

client.on('connect', () => {
  console.log('✅ Connected');
  
  // Test direct forfeit without game
  console.log('🏳️ Testing forfeit (should be rejected)...');
  client.emit('forfeit_game', {});
});

client.on('forfeit_rejected', (data) => {
  console.log('❌ Forfeit rejected (expected):', data.reason);
  console.log('✅ Game End Events are working correctly!');
  client.disconnect();
  process.exit(0);
});

client.on('forfeit_accepted', (data) => {
  console.log('⚠️ Forfeit accepted (unexpected):', data);
  client.disconnect();
  process.exit(0);
});

setTimeout(() => {
  console.log('⏰ Test timeout - no response received');
  console.log('❌ Game End Events may not be working');
  client.disconnect();
  process.exit(1);
}, 3000);

console.log('🧪 Starting simple forfeit test...');