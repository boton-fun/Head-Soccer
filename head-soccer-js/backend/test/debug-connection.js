/**
 * Debug WebSocket Connection
 * Detailed debugging of connection flow
 */

const io = require('socket.io-client');

function debugConnection() {
  console.log('🔍 Debugging WebSocket Connection Flow\n');
  
  const client = io('https://head-soccer-production.up.railway.app', {
    transports: ['websocket', 'polling'],
    timeout: 10000,
    forceNew: true
  });
  
  // Track all events
  const events = [
    'connect', 'disconnect', 'error', 'connect_error',
    'connected', 'authenticated', 'auth_error',
    'connection_rejected', 'ping', 'pong'
  ];
  
  events.forEach(event => {
    client.on(event, (data) => {
      console.log(`📡 Event: ${event}`, data || '(no data)');
    });
  });
  
  // Check if server is responding to basic events
  client.on('connect', () => {
    console.log('\n🔄 Testing server responsiveness...');
    
    // Try sending a simple ping first
    setTimeout(() => {
      console.log('📤 Sending ping...');
      client.emit('ping', { test: true });
    }, 100);
    
    // Try authentication after ping
    setTimeout(() => {
      console.log('📤 Sending authentication...');
      client.emit('authenticate', {
        playerId: 'debug-player',
        username: 'DebugUser'
      });
    }, 500);
    
    // Try a non-existent event to see error handling
    setTimeout(() => {
      console.log('📤 Sending invalid event...');
      client.emit('nonexistent_event', { test: true });
    }, 1000);
  });
  
  // Monitor connection state
  let connectionChecks = 0;
  const checkInterval = setInterval(() => {
    connectionChecks++;
    console.log(`🔄 Connection check ${connectionChecks}:`, {
      connected: client.connected,
      transport: client.io?.engine?.transport?.name || 'unknown',
      readyState: client.io?.engine?.readyState || 'unknown'
    });
    
    if (connectionChecks >= 10 || !client.connected) {
      clearInterval(checkInterval);
      if (client.connected) {
        client.disconnect();
      }
      process.exit(0);
    }
  }, 1000);
}

debugConnection();