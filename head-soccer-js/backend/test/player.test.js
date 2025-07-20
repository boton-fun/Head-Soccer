/**
 * Unit tests for Player class
 */

const Player = require('../modules/Player');

// Simple test runner
function runTests() {
  let passedTests = 0;
  let failedTests = 0;
  
  function test(description, testFn) {
    try {
      testFn();
      console.log(`✅ ${description}`);
      passedTests++;
    } catch (error) {
      console.log(`❌ ${description}`);
      console.log(`   Error: ${error.message}`);
      failedTests++;
    }
  }
  
  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }
  
  console.log('\n🧪 Running Player Class Tests...\n');
  
  // Test 1: Player creation
  test('Should create a player with default values', () => {
    const player = new Player('socket123');
    assert(player.socketId === 'socket123');
    assert(player.username === 'Guest');
    assert(player.userId === null);
    assert(player.status === 'IDLE');
    assert(player.isConnected === true);
    assert(player.currentRoom === null);
  });
  
  // Test 2: Player creation with options
  test('Should create a player with custom options', () => {
    const player = new Player('socket456', 'user123', 'PlayerOne', {
      characterId: 'player2',
      eloRating: 1500
    });
    assert(player.username === 'PlayerOne');
    assert(player.userId === 'user123');
    assert(player.characterId === 'player2');
    assert(player.eloRating === 1500);
  });
  
  // Test 3: Room joining
  test('Should successfully join a room', async () => {
    const player = new Player('socket789');
    const result = await player.joinRoom('room123');
    assert(result === true);
    assert(player.currentRoom === 'room123');
    assert(player.status === 'IN_ROOM');
    assert(player.isReady === false);
  });
  
  // Test 4: Cannot join room when already in one
  test('Should prevent joining room when already in one', async () => {
    const player = new Player('socket999');
    await player.joinRoom('room1');
    const result = await player.joinRoom('room2');
    assert(result === false);
    assert(player.currentRoom === 'room1');
  });
  
  // Test 5: Leave room
  test('Should successfully leave a room', async () => {
    const player = new Player('socket111');
    await player.joinRoom('room123');
    const result = await player.leaveRoom();
    assert(result === true);
    assert(player.currentRoom === null);
    assert(player.status === 'IDLE');
    assert(player.position === null);
  });
  
  // Test 6: Ready state management
  test('Should manage ready state correctly', async () => {
    const player = new Player('socket222');
    
    // Cannot set ready without room
    let result = player.setReady(true);
    assert(result === false);
    assert(player.isReady === false);
    
    // Can set ready in room
    await player.joinRoom('room123');
    result = player.setReady(true);
    assert(result === true);
    assert(player.isReady === true);
    
    // Can unset ready
    result = player.setReady(false);
    assert(result === true);
    assert(player.isReady === false);
  });
  
  // Test 7: Position assignment
  test('Should update room position correctly', () => {
    const player = new Player('socket333');
    player.updateRoomPosition('left');
    assert(player.position === 'left');
    
    player.updateRoomPosition('right');
    assert(player.position === 'right');
  });
  
  // Test 8: Invalid position should throw
  test('Should throw error for invalid position', () => {
    const player = new Player('socket444');
    try {
      player.updateRoomPosition('middle');
      assert(false, 'Should have thrown error');
    } catch (error) {
      assert(error.message.includes('Invalid position'));
    }
  });
  
  // Test 9: Activity tracking
  test('Should track activity correctly', () => {
    const player = new Player('socket555');
    const initialActivity = player.lastActivity;
    
    // Wait a bit and update activity
    setTimeout(() => {
      player.updateActivity();
      assert(player.lastActivity > initialActivity);
      assert(player.isActive() === true);
    }, 10);
  });
  
  // Test 10: Connection handling
  test('Should handle disconnect and reconnect', () => {
    const player = new Player('socket666');
    
    // Disconnect
    player.handleDisconnect();
    assert(player.isConnected === false);
    assert(player.status === 'DISCONNECTED');
    assert(player.sessionStats.disconnections === 1);
    
    // Reconnect
    const result = player.handleReconnect('socket777');
    assert(result === true);
    assert(player.socketId === 'socket777');
    assert(player.isConnected === true);
  });
  
  // Test 11: Latency updates
  test('Should update latency and connection quality', () => {
    const player = new Player('socket888');
    
    player.updateLatency(30);
    assert(player.latency === 30);
    assert(player.connectionQuality === 'good');
    
    player.updateLatency(100);
    assert(player.latency === 100);
    assert(player.connectionQuality === 'moderate');
    
    player.updateLatency(200);
    assert(player.latency === 200);
    assert(player.connectionQuality === 'poor');
  });
  
  // Test 12: Status management
  test('Should manage status transitions correctly', () => {
    const player = new Player('socket999');
    
    player.setStatus('IN_QUEUE');
    assert(player.status === 'IN_QUEUE');
    
    player.setStatus('IN_GAME');
    assert(player.status === 'IN_GAME');
  });
  
  // Test 13: Invalid status should throw
  test('Should throw error for invalid status', () => {
    const player = new Player('socket000');
    try {
      player.setStatus('INVALID_STATUS');
      assert(false, 'Should have thrown error');
    } catch (error) {
      assert(error.message.includes('Invalid status'));
    }
  });
  
  // Test 14: Session stats update
  test('Should update session statistics', () => {
    const player = new Player('socket112');
    
    player.updateSessionStats({
      gamesPlayed: 2,
      gamesWon: 1,
      goalsScored: 5
    });
    
    assert(player.sessionStats.gamesPlayed === 2);
    assert(player.sessionStats.gamesWon === 1);
    assert(player.sessionStats.goalsScored === 5);
  });
  
  // Test 15: JSON serialization
  test('Should serialize to JSON correctly', () => {
    const player = new Player('socket113', 'user123', 'TestPlayer');
    const json = player.toJSON();
    
    assert(json.username === 'TestPlayer');
    assert(json.userId === 'user123');
    assert(json.socketId === undefined); // Should not expose socket ID
    assert(json.sessionStats !== undefined);
  });
  
  // Test 16: Public info
  test('Should return correct public info', async () => {
    const player = new Player('socket114', 'user123', 'TestPlayer');
    await player.joinRoom('room123'); // Need to be in room first
    player.updateRoomPosition('left');
    player.setReady(true);
    
    const publicInfo = player.getPublicInfo();
    
    assert(publicInfo.username === 'TestPlayer');
    assert(publicInfo.position === 'left');
    assert(publicInfo.isReady === true);
    assert(publicInfo.socketId === undefined); // Should not expose
    assert(publicInfo.userId === undefined); // Should not expose
  });
  
  // Test results
  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Total: ${passedTests + failedTests}`);
  
  return failedTests === 0;
}

// Run tests if called directly
if (require.main === module) {
  const success = runTests();
  process.exit(success ? 0 : 1);
}

module.exports = { runTests };