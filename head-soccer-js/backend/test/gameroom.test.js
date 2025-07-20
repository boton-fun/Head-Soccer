/**
 * Unit tests for GameRoom class
 */

const GameRoom = require('../modules/GameRoom');
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
  
  console.log('\n🧪 Running GameRoom Class Tests...\n');
  
  // Test 1: GameRoom creation
  test('Should create a GameRoom with default values', () => {
    const room = new GameRoom();
    assert(typeof room.id === 'string');
    assert(room.status === 'WAITING');
    assert(room.maxPlayers === 2);
    assert(room.gameMode === 'casual');
    assert(room.timeLimit === 300);
    assert(room.scoreLimit === 5);
    assert(room.players.size === 0);
    assert(room.score.left === 0);
    assert(room.score.right === 0);
  });
  
  // Test 2: GameRoom creation with options
  test('Should create a GameRoom with custom options', () => {
    const room = new GameRoom('custom-room', {
      gameMode: 'ranked',
      timeLimit: 600,
      scoreLimit: 3,
      maxPlayers: 2
    });
    assert(room.id === 'custom-room');
    assert(room.gameMode === 'ranked');
    assert(room.timeLimit === 600);
    assert(room.scoreLimit === 3);
  });
  
  // Test 3: Add player to room
  test('Should successfully add a player to room', () => {
    const room = new GameRoom();
    const player = new Player('socket1', 'user1', 'Player1');
    
    const result = room.addPlayer(player);
    assert(result.success === true);
    assert(result.position === 'left');
    assert(room.players.size === 1);
    assert(room.playerPositions.left === player.id);
    assert(player.position === 'left');
  });
  
  // Test 4: Add second player
  test('Should add second player to right position', () => {
    const room = new GameRoom();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    room.addPlayer(player1);
    const result = room.addPlayer(player2);
    
    assert(result.success === true);
    assert(result.position === 'right');
    assert(room.players.size === 2);
    assert(room.playerPositions.right === player2.id);
    assert(player2.position === 'right');
  });
  
  // Test 5: Cannot add more than max players
  test('Should prevent adding more than max players', () => {
    const room = new GameRoom();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    const player3 = new Player('socket3', 'user3', 'Player3');
    
    room.addPlayer(player1);
    room.addPlayer(player2);
    const result = room.addPlayer(player3);
    
    assert(result.success === false);
    assert(result.reason === 'Room is full');
    assert(room.players.size === 2);
  });
  
  // Test 6: Cannot add same player twice
  test('Should prevent adding same player twice', () => {
    const room = new GameRoom();
    const player = new Player('socket1', 'user1', 'Player1');
    
    room.addPlayer(player);
    const result = room.addPlayer(player);
    
    assert(result.success === false);
    assert(result.reason === 'Player already in room');
    assert(room.players.size === 1);
  });
  
  // Test 7: Remove player from room
  test('Should successfully remove a player from room', () => {
    const room = new GameRoom();
    const player = new Player('socket1', 'user1', 'Player1');
    
    room.addPlayer(player);
    const result = room.removePlayer(player.id);
    
    assert(result.success === true);
    assert(room.players.size === 0);
    assert(room.playerPositions.left === null);
  });
  
  // Test 8: Cannot remove non-existent player
  test('Should handle removing non-existent player', () => {
    const room = new GameRoom();
    const result = room.removePlayer('non-existent-id');
    
    assert(result.success === false);
    assert(result.reason === 'Player not in room');
  });
  
  // Test 9: Get player by position
  test('Should get player by position correctly', () => {
    const room = new GameRoom();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    room.addPlayer(player1);
    room.addPlayer(player2);
    
    const leftPlayer = room.getPlayerByPosition('left');
    const rightPlayer = room.getPlayerByPosition('right');
    
    assert(leftPlayer.id === player1.id);
    assert(rightPlayer.id === player2.id);
    assert(room.getPlayerByPosition('invalid') === null);
  });
  
  // Test 10: Get opponent
  test('Should get opponent correctly', () => {
    const room = new GameRoom();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    room.addPlayer(player1);
    room.addPlayer(player2);
    
    const opponent1 = room.getOpponent(player1.id);
    const opponent2 = room.getOpponent(player2.id);
    
    assert(opponent1.id === player2.id);
    assert(opponent2.id === player1.id);
    assert(room.getOpponent('invalid-id') === null);
  });
  
  // Test 11: Check ready to start - not enough players
  test('Should require enough players to start', () => {
    const room = new GameRoom();
    const player = new Player('socket1', 'user1', 'Player1');
    
    room.addPlayer(player);
    const result = room.checkReadyToStart();
    
    assert(result.ready === false);
    assert(result.reason === 'Not enough players');
  });
  
  // Test 12: Check ready to start - players not ready
  test('Should require all players to be ready', async () => {
    const room = new GameRoom();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    room.addPlayer(player1);
    room.addPlayer(player2);
    
    // Players are already in room, just need to be ready
    
    const result = room.checkReadyToStart();
    
    assert(result.ready === false);
    assert(result.reason.includes('not ready'));
  });
  
  // Test 13: Start game successfully
  test('Should start game when all conditions met', async () => {
    const room = new GameRoom();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    room.addPlayer(player1);
    room.addPlayer(player2);
    
    // Prepare players
    player1.setReady(true);
    player2.setReady(true);
    
    const result = room.startGame();
    
    assert(result.success === true);
    assert(room.status === 'PLAYING');
    assert(room.gameStartTime !== null);
    assert(player1.status === 'IN_GAME');
    assert(player2.status === 'IN_GAME');
  });
  
  // Test 14: Pause and resume game
  test('Should pause and resume game correctly', async () => {
    const room = new GameRoom();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    room.addPlayer(player1);
    room.addPlayer(player2);
    
    player1.setReady(true);
    player2.setReady(true);
    
    room.startGame();
    
    // Pause game
    const pauseResult = room.pauseGame('test');
    assert(pauseResult === true);
    assert(room.status === 'PAUSED');
    assert(room.isPaused === true);
    
    // Resume game
    const resumeResult = room.resumeGame();
    assert(resumeResult === true);
    assert(room.status === 'PLAYING');
    assert(room.isPaused === false);
  });
  
  // Test 15: Update game time
  test('Should update game time correctly', async () => {
    const room = new GameRoom();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    room.addPlayer(player1);
    room.addPlayer(player2);
    
    player1.setReady(true);
    player2.setReady(true);
    
    room.startGame();
    
    room.updateGameTime(120);
    assert(room.currentGameTime === 120);
  });
  
  // Test 16: Add goal
  test('Should add goal correctly', async () => {
    const room = new GameRoom();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    room.addPlayer(player1);
    room.addPlayer(player2);
    
    player1.setReady(true);
    player2.setReady(true);
    
    room.startGame();
    
    const result = room.addGoal(player1.id, { shotType: 'header' });
    
    assert(result.success === true);
    assert(result.gameEnded === false);
    assert(room.score.left === 1);
    assert(room.score.right === 0);
    assert(room.goals.length === 1);
    assert(room.goals[0].playerId === player1.id);
    assert(room.goals[0].shotType === 'header');
  });
  
  // Test 17: Win by score limit
  test('Should end game when score limit reached', async () => {
    const room = new GameRoom('test-room', { scoreLimit: 2 });
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    room.addPlayer(player1);
    room.addPlayer(player2);
    
    player1.setReady(true);
    player2.setReady(true);
    
    room.startGame();
    
    // Score 2 goals
    room.addGoal(player1.id);
    const result = room.addGoal(player1.id);
    
    assert(result.success === true);
    assert(result.gameEnded === true);
    assert(room.status === 'FINISHED');
    assert(room.winner === player1.id);
    assert(room.winReason === 'score_limit');
  });
  
  // Test 18: Win by time limit
  test('Should end game when time limit reached', async () => {
    const room = new GameRoom('test-room', { timeLimit: 100 });
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    room.addPlayer(player1);
    room.addPlayer(player2);
    
    player1.setReady(true);
    player2.setReady(true);
    
    room.startGame();
    
    // Add some goals
    room.addGoal(player1.id);
    room.addGoal(player1.id);
    room.addGoal(player2.id);
    
    // Trigger time limit
    room.updateGameTime(100);
    
    assert(room.status === 'FINISHED');
    assert(room.winner === player1.id);
    assert(room.winReason === 'time_limit');
  });
  
  // Test 19: Draw game
  test('Should handle draw correctly', async () => {
    const room = new GameRoom('test-room', { timeLimit: 100 });
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    room.addPlayer(player1);
    room.addPlayer(player2);
    
    player1.setReady(true);
    player2.setReady(true);
    
    room.startGame();
    
    // Equal scores
    room.addGoal(player1.id);
    room.addGoal(player2.id);
    
    // Trigger time limit
    room.updateGameTime(100);
    
    assert(room.status === 'FINISHED');
    assert(room.winner === null);
    assert(room.winReason === 'draw');
  });
  
  // Test 20: Game events logging
  test('Should log game events correctly', async () => {
    const room = new GameRoom();
    const player = new Player('socket1', 'user1', 'Player1');
    
    const initialEvents = room.events.length;
    
    room.addPlayer(player);
    
    assert(room.events.length === initialEvents + 1);
    assert(room.events[room.events.length - 1].type === 'PLAYER_JOINED');
    assert(room.events[room.events.length - 1].data.playerId === player.id);
  });
  
  // Test 21: Room inactivity check
  test('Should detect room inactivity', () => {
    const room = new GameRoom();
    
    // Mock old activity time
    room.lastActivity = new Date(Date.now() - 700000); // 11+ minutes ago
    
    assert(room.isInactive() === true);
    assert(room.isInactive(500000) === true);  // 8+ minutes
    assert(room.isInactive(800000) === false); // 13+ minutes
  });
  
  // Test 22: JSON serialization
  test('Should serialize to JSON correctly', () => {
    const room = new GameRoom('test-room');
    const json = room.toJSON();
    
    assert(json.id === 'test-room');
    assert(json.status === 'WAITING');
    assert(json.maxPlayers === 2);
    assert(json.currentPlayers === 0);
    assert(typeof json.createdAt === 'object');
    assert(json.score.left === 0);
    assert(json.score.right === 0);
  });
  
  // Test 23: Public info
  test('Should return correct public info', async () => {
    const room = new GameRoom();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    room.addPlayer(player1);
    room.addPlayer(player2);
    
    const publicInfo = room.getPublicInfo();
    
    assert(publicInfo.id === room.id);
    assert(publicInfo.status === 'WAITING');
    assert(publicInfo.players.length === 2);
    assert(publicInfo.players[0].username === 'Player1');
    assert(publicInfo.players[1].username === 'Player2');
    assert(publicInfo.score.left === 0);
    assert(publicInfo.score.right === 0);
  });
  
  // Test 24: Game duration calculation
  test('Should calculate game duration correctly', async () => {
    const room = new GameRoom();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    room.addPlayer(player1);
    room.addPlayer(player2);
    
    player1.setReady(true);
    player2.setReady(true);
    
    room.startGame();
    
    // Mock game duration
    room.gameStartTime = new Date(Date.now() - 120000); // 2 minutes ago
    
    const duration = room.getGameDuration();
    assert(duration >= 119000); // Approximately 2 minutes
    assert(duration <= 121000);
  });
  
  // Test 25: Player removal during game pauses
  test('Should pause game when player leaves during play', async () => {
    const room = new GameRoom();
    const player1 = new Player('socket1', 'user1', 'Player1');
    const player2 = new Player('socket2', 'user2', 'Player2');
    
    room.addPlayer(player1);
    room.addPlayer(player2);
    
    player1.setReady(true);
    player2.setReady(true);
    
    room.startGame();
    assert(room.status === 'PLAYING');
    
    // Player leaves during game
    room.removePlayer(player1.id);
    
    assert(room.status === 'PAUSED');
    assert(room.players.size === 1);
  });
  
  // Test results
  console.log('\n📊 GameRoom Test Results:');
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