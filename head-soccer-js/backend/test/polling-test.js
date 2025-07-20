/**
 * Test with polling transport only
 */

const io = require('socket.io-client');

function testPolling() {
  console.log('🔍 Testing with Polling Transport Only\n');
  
  const client = io('https://head-soccer-production.up.railway.app', {
    transports: ['polling'], // Only use polling
    timeout: 10000,
    forceNew: true
  });
  
  client.on('connect', () => {
    console.log(`✅ Connected via polling: ${client.id}`);
    console.log('📊 Transport:', client.io.engine.transport.name);
    
    // Test if server responds
    setTimeout(() => {
      console.log('📤 Sending test message...');
      client.emit('ping', { test: true });
    }, 500);
  });
  
  client.on('connected', (data) => {
    console.log('🎉 Server welcome received!', data);
  });
  
  client.on('pong', (data) => {
    console.log('✅ Pong received!', data);
    client.disconnect();
  });
  
  client.on('disconnect', (reason) => {
    console.log(`🔌 Disconnected: ${reason}`);
    process.exit(0);
  });
  
  client.on('connect_error', (error) => {
    console.log('❌ Connection error:', error.message);
    process.exit(1);
  });
  
  setTimeout(() => {
    console.log('⏰ Timeout reached');
    client.disconnect();
    process.exit(0);
  }, 15000);
}

testPolling();