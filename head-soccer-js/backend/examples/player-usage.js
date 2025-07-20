/**
 * Example usage of the Player class in the multiplayer system
 */

const Player = require('../modules/Player');

// Simulate a multiplayer scenario
async function demonstratePlayerUsage() {
  console.log('🎮 Head Soccer Multiplayer - Player Class Demo\n');
  
  // 1. Create two players
  console.log('1️⃣ Creating players...');
  const player1 = new Player('socket_001', 'user_123', 'SoccerPro', {
    characterId: 'player1',
    eloRating: 1350
  });
  
  const player2 = new Player('socket_002', 'user_456', 'GoalMaster', {
    characterId: 'player3',
    eloRating: 1280
  });
  
  console.log(`✅ Player 1: ${player1.username} (ELO: ${player1.eloRating})`);
  console.log(`✅ Player 2: ${player2.username} (ELO: ${player2.eloRating})\n`);
  
  // 2. Players join matchmaking queue
  console.log('2️⃣ Players joining matchmaking...');
  player1.setStatus('IN_QUEUE');
  player2.setStatus('IN_QUEUE');
  console.log(`${player1.username} status: ${player1.status}`);
  console.log(`${player2.username} status: ${player2.status}\n`);
  
  // 3. Matchmaker creates a room and assigns players
  console.log('3️⃣ Matchmaker assigns players to room...');
  const roomId = 'room_game_001';
  
  await player1.joinRoom(roomId);
  await player2.joinRoom(roomId);
  
  player1.updateRoomPosition('left');
  player2.updateRoomPosition('right');
  
  console.log(`✅ Both players joined room: ${roomId}`);
  console.log(`${player1.username} position: ${player1.position}`);
  console.log(`${player2.username} position: ${player2.position}\n`);
  
  // 4. Players ready up
  console.log('4️⃣ Players getting ready...');
  
  // Check if players can be ready
  const p1Validation = player1.validateReadyState();
  const p2Validation = player2.validateReadyState();
  
  console.log(`${player1.username} ready validation:`, p1Validation);
  console.log(`${player2.username} ready validation:`, p2Validation);
  
  player1.setReady(true);
  player2.setReady(true);
  
  console.log(`✅ Both players ready!\n`);
  
  // 5. Game starts
  console.log('5️⃣ Game starting...');
  player1.setStatus('IN_GAME');
  player2.setStatus('IN_GAME');
  console.log('🚀 GAME STARTED!\n');
  
  // 6. Simulate network latency updates
  console.log('6️⃣ Simulating network conditions...');
  player1.updateLatency(45);
  player2.updateLatency(120);
  
  console.log(`${player1.username} latency: ${player1.latency}ms (${player1.connectionQuality})`);
  console.log(`${player2.username} latency: ${player2.latency}ms (${player2.connectionQuality})\n`);
  
  // 7. Simulate game events
  console.log('7️⃣ Simulating game events...');
  
  // Player 1 scores
  player1.updateSessionStats({ goalsScored: 1 });
  player2.updateSessionStats({ goalsConceded: 1 });
  console.log('⚽ GOAL! Player 1 scores!');
  
  // Player 2 scores twice
  player2.updateSessionStats({ goalsScored: 2 });
  player1.updateSessionStats({ goalsConceded: 2 });
  console.log('⚽ GOAL! Player 2 scores!');
  console.log('⚽ GOAL! Player 2 scores again!\n');
  
  // 8. Player 1 disconnects
  console.log('8️⃣ Simulating disconnection...');
  player1.handleDisconnect();
  console.log(`❌ ${player1.username} disconnected!`);
  console.log(`Connection status:`, player1.getConnectionStatus());
  
  // Game pauses...
  
  // 9. Player 1 reconnects
  console.log('\n9️⃣ Simulating reconnection...');
  player1.handleReconnect('socket_001_new');
  console.log(`✅ ${player1.username} reconnected!`);
  console.log(`New socket ID: ${player1.socketId}\n`);
  
  // 10. Game ends
  console.log('🔟 Game ending...');
  
  // Update final stats
  player1.updateSessionStats({ 
    gamesPlayed: 1, 
    gamesLost: 1,
    totalPlayTime: 180 
  });
  
  player2.updateSessionStats({ 
    gamesPlayed: 1, 
    gamesWon: 1,
    totalPlayTime: 180 
  });
  
  // Players leave room
  await player1.leaveRoom();
  await player2.leaveRoom();
  
  console.log('🏁 GAME OVER!\n');
  
  // 11. Display final stats
  console.log('📊 Final Session Statistics:');
  console.log('\nPlayer 1:', player1.username);
  console.log(player1.sessionStats);
  console.log('\nPlayer 2:', player2.username);
  console.log(player2.sessionStats);
  
  // 12. Show public info (what other players see)
  console.log('\n👥 Public Player Information:');
  console.log('Player 1:', player1.getPublicInfo());
  console.log('Player 2:', player2.getPublicInfo());
}

// Run demo
demonstratePlayerUsage().catch(console.error);