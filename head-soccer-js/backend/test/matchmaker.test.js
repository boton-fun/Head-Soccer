/**
 * Unit tests for Matchmaker class
 */

const Matchmaker = require('../modules/Matchmaker');
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
  
  console.log('\n🧪 Running Matchmaker Tests...\n');
  
  // Test 1: Matchmaker creation
  test('Should create Matchmaker with default values', () => {
    const matchmaker = new Matchmaker();
    assert(matchmaker.maxQueueSize === 1000);
    assert(matchmaker.maxWaitTime === 120000);
    assert(matchmaker.skillTolerance === 200);
    assert(matchmaker.maxConcurrentRooms === 100);
    assert(matchmaker.queue.length === 0);
    assert(matchmaker.activeRooms.size === 0);
  });
  
  // Test 2: Matchmaker creation with options
  test('Should create Matchmaker with custom options', () => {
    const matchmaker = new Matchmaker({
      maxQueueSize: 500,
      skillTolerance: 100,
      maxWaitTime: 60000,
      maxConcurrentRooms: 50
    });
    assert(matchmaker.maxQueueSize === 500);
    assert(matchmaker.skillTolerance === 100);
    assert(matchmaker.maxWaitTime === 60000);
    assert(matchmaker.maxConcurrentRooms === 50);
  });
  
  // Test 3: Add player to queue
  test('Should add player to queue successfully', () => {
    const matchmaker = new Matchmaker();
    const player = new Player('socket1', 'user1', 'Player1', { eloRating: 1300 });
    
    const result = matchmaker.addToQueue(player, { gameMode: 'casual' });
    
    assert(result.success === true);
    assert(result.position === 1);
    assert(result.estimatedWait > 0);
    assert(matchmaker.queue.length === 1);
    assert(matchmaker.playerQueues.has(player.id));
    assert(player.status === 'IN_QUEUE');
  });
  
  // Test 4: Prevent duplicate queue entries
  test('Should prevent adding same player twice', () => {
    const matchmaker = new Matchmaker();
    const player = new Player('socket1', 'user1', 'Player1');
    
    matchmaker.addToQueue(player);
    const result = matchmaker.addToQueue(player);
    
    assert(result.success === false);
    assert(result.reason === 'Player already in queue');
    assert(matchmaker.queue.length === 1);
  });
  
  // Test 5: Remove player from queue
  test('Should remove player from queue successfully', () => {
    const matchmaker = new Matchmaker();
    const player = new Player('socket1', 'user1', 'Player1');
    
    matchmaker.addToQueue(player);
    const result = matchmaker.removeFromQueue(player.id);
    
    assert(result.success === true);
    assert(matchmaker.queue.length === 0);
    assert(!matchmaker.playerQueues.has(player.id));
    assert(player.status === 'IDLE');
  });
  
  // Test 6: Queue position tracking
  test('Should track queue position correctly', () => {
    const matchmaker = new Matchmaker();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    const player3 = new Player('socket3', 'user3', 'Player3');
    
    matchmaker.addToQueue(player1);
    matchmaker.addToQueue(player2);
    matchmaker.addToQueue(player3);
    
    const pos1 = matchmaker.getQueuePosition(player1.id);
    const pos2 = matchmaker.getQueuePosition(player2.id);
    const pos3 = matchmaker.getQueuePosition(player3.id);
    
    assert(pos1.position === 1);
    assert(pos2.position === 2);
    assert(pos3.position === 3);
    assert(pos1.inQueue === true);
    assert(pos2.inQueue === true);
    assert(pos3.inQueue === true);
  });
  
  // Test 7: Match creation with compatible players
  test('Should create match with compatible players', () => {
    const matchmaker = new Matchmaker();
    const player1 = new Player('socket1', 'user1', 'Player1', { eloRating: 1200 });
    const player2 = new Player('socket2', 'user2', 'Player2', { eloRating: 1250 });
    
    matchmaker.addToQueue(player1, { gameMode: 'casual' });
    matchmaker.addToQueue(player2, { gameMode: 'casual' });
    
    // Process queue to find matches
    matchmaker.processQueue();
    
    // Both players should be removed from queue and placed in a room
    assert(matchmaker.queue.length === 0);
    assert(matchmaker.activeRooms.size === 1);
    assert(matchmaker.playerRoomMap.has(player1.id));
    assert(matchmaker.playerRoomMap.has(player2.id));
  });
  
  // Test 8: Prevent matching incompatible players
  test('Should not match players with different game modes', () => {
    const matchmaker = new Matchmaker();
    const player1 = new Player('socket1', 'user1', 'Player1', { eloRating: 1200 });
    const player2 = new Player('socket2', 'user2', 'Player2', { eloRating: 1250 });
    
    matchmaker.addToQueue(player1, { gameMode: 'casual' });
    matchmaker.addToQueue(player2, { gameMode: 'ranked' });
    
    matchmaker.processQueue();
    
    // Players should remain in queue (no match created)
    assert(matchmaker.queue.length === 2);
    assert(matchmaker.activeRooms.size === 0);
  });
  
  // Test 9: Skill tolerance matching
  test('Should respect skill tolerance in matching', () => {
    const matchmaker = new Matchmaker({ skillTolerance: 100 });
    const player1 = new Player('socket1', 'user1', 'Player1', { eloRating: 1200 });
    const player2 = new Player('socket2', 'user2', 'Player2', { eloRating: 1400 }); // 200 ELO diff
    
    matchmaker.addToQueue(player1, { gameMode: 'casual' });
    matchmaker.addToQueue(player2, { gameMode: 'casual' });
    
    matchmaker.processQueue();
    
    // Players should not be matched due to skill difference
    assert(matchmaker.queue.length === 2);
    assert(matchmaker.activeRooms.size === 0);
  });
  
  // Test 10: Skill tolerance increases over time
  test('Should increase skill tolerance over time', () => {
    const matchmaker = new Matchmaker({ 
      skillTolerance: 100, 
      skillToleranceIncrease: 50 
    });
    
    const player = new Player('socket1', 'user1', 'Player1', { eloRating: 1200 });
    const queueEntry = {
      id: 'test',
      player: player,
      joinedAt: Date.now() - 60000, // 1 minute ago
      eloRating: 1200,
      gameMode: 'casual',
      currentSkillTolerance: 100
    };
    
    matchmaker.queue.push(queueEntry);
    matchmaker.updateSkillTolerances();
    
    // Tolerance should increase (60s = 2 increments of 30s = +100)
    assert(queueEntry.currentSkillTolerance === 200);
  });
  
  // Test 11: Room cleanup
  test('Should clean up finished rooms', () => {
    const matchmaker = new Matchmaker();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    matchmaker.addToQueue(player1);
    matchmaker.addToQueue(player2);
    matchmaker.processQueue();
    
    // Get the created room and mark it as finished
    const roomId = matchmaker.playerRoomMap.get(player1.id);
    const room = matchmaker.activeRooms.get(roomId);
    room.status = 'FINISHED';
    
    // Run cleanup
    matchmaker.cleanupRooms();
    
    // Room should be removed
    assert(matchmaker.activeRooms.size === 0);
    assert(!matchmaker.playerRoomMap.has(player1.id));
    assert(!matchmaker.playerRoomMap.has(player2.id));
  });
  
  // Test 12: Disconnected player cleanup
  test('Should clean up disconnected players from queue', () => {
    const matchmaker = new Matchmaker();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    matchmaker.addToQueue(player1);
    matchmaker.addToQueue(player2);
    
    // Disconnect player1
    player1.handleDisconnect();
    
    // Run cleanup
    matchmaker.cleanupDisconnectedPlayers();
    
    // Only connected player should remain
    assert(matchmaker.queue.length === 1);
    assert(!matchmaker.playerQueues.has(player1.id));
    assert(matchmaker.playerQueues.has(player2.id));
  });
  
  // Test 13: Queue timeout cleanup
  test('Should clean up expired queue entries', () => {
    const matchmaker = new Matchmaker({ maxWaitTime: 1000 }); // 1 second
    const player = new Player('socket1', 'user1', 'Player1');
    
    // Manually create an expired queue entry
    const expiredEntry = {
      id: 'expired',
      player: player,
      joinedAt: Date.now() - 2000, // 2 seconds ago
      eloRating: 1200,
      gameMode: 'casual'
    };
    
    matchmaker.queue.push(expiredEntry);
    matchmaker.playerQueues.set(player.id, expiredEntry);
    
    matchmaker.cleanupExpiredQueueEntries();
    
    // Expired entry should be removed
    assert(matchmaker.queue.length === 0);
    assert(!matchmaker.playerQueues.has(player.id));
  });
  
  // Test 14: Service lifecycle
  test('Should start and stop service correctly', () => {
    const matchmaker = new Matchmaker();
    
    matchmaker.start();
    assert(matchmaker.queueInterval !== null);
    assert(matchmaker.cleanupInterval !== null);
    
    matchmaker.stop();
    assert(matchmaker.queueInterval === null);
    assert(matchmaker.cleanupInterval === null);
    assert(matchmaker.queue.length === 0);
    assert(matchmaker.activeRooms.size === 0);
  });
  
  // Test 15: Statistics tracking
  test('Should track statistics correctly', () => {
    const matchmaker = new Matchmaker();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    const initialStats = matchmaker.getStats();
    assert(initialStats.totalMatches === 0);
    assert(initialStats.currentQueueSize === 0);
    
    matchmaker.addToQueue(player1);
    matchmaker.addToQueue(player2);
    matchmaker.processQueue();
    
    const updatedStats = matchmaker.getStats();
    assert(updatedStats.totalMatches === 1);
    assert(updatedStats.successfulMatches === 1);
    assert(updatedStats.activeRoomsCount === 1);
  });
  
  // Test 16: Event system
  test('Should emit events correctly', () => {
    const matchmaker = new Matchmaker();
    let eventFired = false;
    let eventData = null;
    
    matchmaker.on('player_queued', (data) => {
      eventFired = true;
      eventData = data;
    });
    
    const player = new Player('socket1', 'user1', 'Player1');
    matchmaker.addToQueue(player);
    
    assert(eventFired === true);
    assert(eventData.playerId === player.id);
    assert(eventData.username === 'Player1');
  });
  
  // Test 17: Estimated wait time calculation
  test('Should calculate estimated wait time', () => {
    const matchmaker = new Matchmaker();
    const player = new Player('socket1', 'user1', 'Player1', { eloRating: 1200 });
    
    const result = matchmaker.addToQueue(player);
    
    assert(result.estimatedWait > 0);
    assert(typeof result.estimatedWait === 'number');
  });
  
  // Test 18: Game mode time limits
  test('Should set correct time limits for game modes', () => {
    const matchmaker = new Matchmaker();
    
    assert(matchmaker.getTimeLimitForMode('casual') === 300);
    assert(matchmaker.getTimeLimitForMode('ranked') === 600);
    assert(matchmaker.getTimeLimitForMode('tournament') === 900);
    assert(matchmaker.getTimeLimitForMode('unknown') === 300); // default
  });
  
  // Test 19: Game mode score limits
  test('Should set correct score limits for game modes', () => {
    const matchmaker = new Matchmaker();
    
    assert(matchmaker.getScoreLimitForMode('casual') === 3);
    assert(matchmaker.getScoreLimitForMode('ranked') === 5);
    assert(matchmaker.getScoreLimitForMode('tournament') === 0);
    assert(matchmaker.getScoreLimitForMode('unknown') === 3); // default
  });
  
  // Test 20: Queue full handling
  test('Should handle queue full condition', () => {
    const matchmaker = new Matchmaker({ maxQueueSize: 2 });
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    const player3 = new Player('socket3', 'user3', 'Player3');
    
    matchmaker.addToQueue(player1);
    matchmaker.addToQueue(player2);
    const result = matchmaker.addToQueue(player3);
    
    assert(result.success === false);
    assert(result.reason === 'Queue is full');
    assert(matchmaker.queue.length === 2);
  });
  
  // Test 21: Invalid player object handling
  test('Should handle invalid player objects', () => {
    const matchmaker = new Matchmaker();
    const result = matchmaker.addToQueue("not-a-player");
    
    assert(result.success === false);
    assert(result.reason === 'Invalid player object');
  });
  
  // Test 22: Room creation metadata
  test('Should create rooms with correct metadata', () => {
    const matchmaker = new Matchmaker();
    const player1 = new Player('socket1', 'user1', 'Player1', { eloRating: 1200 });
    const player2 = new Player('socket2', 'user2', 'Player2', { eloRating: 1300 });
    
    matchmaker.addToQueue(player1, { gameMode: 'ranked' });
    matchmaker.addToQueue(player2, { gameMode: 'ranked' });
    matchmaker.processQueue();
    
    const roomId = matchmaker.playerRoomMap.get(player1.id);
    const room = matchmaker.activeRooms.get(roomId);
    
    assert(room.gameMode === 'ranked');
    assert(room.metadata.matchmaker === true);
    assert(room.metadata.averageElo === 1250);
    assert(room.metadata.eloDifference === 100);
  });
  
  // Test 23: Player room retrieval
  test('Should retrieve player room correctly', () => {
    const matchmaker = new Matchmaker();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    matchmaker.addToQueue(player1);
    matchmaker.addToQueue(player2);
    matchmaker.processQueue();
    
    const room1 = matchmaker.getPlayerRoom(player1.id);
    const room2 = matchmaker.getPlayerRoom(player2.id);
    const room3 = matchmaker.getPlayerRoom('nonexistent');
    
    assert(room1 !== null);
    assert(room2 !== null);
    assert(room1 === room2); // Same room
    assert(room3 === null);
  });
  
  // Test 24: Status reporting
  test('Should provide detailed status information', () => {
    const matchmaker = new Matchmaker();
    const status = matchmaker.getStatus();
    
    assert(typeof status === 'object');
    assert(typeof status.isRunning === 'boolean');
    assert(typeof status.queue === 'object');
    assert(typeof status.rooms === 'object');
    assert(typeof status.configuration === 'object');
  });
  
  // Test 25: Statistics reset
  test('Should reset statistics correctly', () => {
    const matchmaker = new Matchmaker();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    matchmaker.addToQueue(player1);
    matchmaker.addToQueue(player2);
    matchmaker.processQueue();
    
    assert(matchmaker.stats.totalMatches === 1);
    
    matchmaker.resetStats();
    
    assert(matchmaker.stats.totalMatches === 0);
    assert(matchmaker.stats.successfulMatches === 0);
    assert(matchmaker.stats.timeoutMatches === 0);
  });
  
  // Test results
  console.log('\n📊 Matchmaker Test Results:');
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