/**
 * Simple Socket.IO connection test
 */

const io = require('socket.io-client');

console.log('Testing Socket.IO connection...');

const client = io('http://localhost:3001', {
  forceNew: true,
  reconnection: false,
  timeout: 5000,
  transports: ['websocket', 'polling']
});

client.on('connect', () => {
  console.log('✅ Connected successfully:', client.id);
  client.disconnect();
  process.exit(0);
});

client.on('connect_error', (error) => {
  console.log('❌ Connection failed:', error.message);
  console.log('Error details:', error);
  process.exit(1);
});

client.on('disconnect', () => {
  console.log('🔌 Disconnected');
});

setTimeout(() => {
  console.log('⏰ Connection timeout');
  client.disconnect();
  process.exit(1);
}, 10000);