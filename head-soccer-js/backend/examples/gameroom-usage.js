/**
 * Example usage of the GameRoom class in the multiplayer system
 */

const GameRoom = require('../modules/GameRoom');
const Player = require('../modules/Player');

// Simulate a complete multiplayer game scenario
async function demonstrateGameRoomUsage() {
  console.log('🏟️ Head Soccer Multiplayer - GameRoom Class Demo\n');
  
  // 1. Create a game room
  console.log('1️⃣ Creating game room...');
  const room = new GameRoom('demo-room-001', {
    gameMode: 'ranked',
    timeLimit: 180,  // 3 minutes
    scoreLimit: 3,   // First to 3 goals
    metadata: {
      tournament: 'demo-tournament',
      region: 'NA-East'
    }
  });
  
  console.log(`✅ Room created: ${room.id}`);
  console.log(`   Game Mode: ${room.gameMode}`);
  console.log(`   Time Limit: ${room.timeLimit}s`);
  console.log(`   Score Limit: ${room.scoreLimit} goals\n`);
  
  // 2. Create two players
  console.log('2️⃣ Creating players...');
  const player1 = new Player('socket_001', 'user_123', 'SoccerKing', {
    characterId: 'player1',
    eloRating: 1450
  });
  
  const player2 = new Player('socket_002', 'user_456', 'GoalHunter', {
    characterId: 'player3',
    eloRating: 1380
  });
  
  console.log(`✅ ${player1.username} (ELO: ${player1.eloRating})`);
  console.log(`✅ ${player2.username} (ELO: ${player2.eloRating})\n`);
  
  // 3. Add players to room
  console.log('3️⃣ Adding players to room...');
  
  const addResult1 = room.addPlayer(player1);
  console.log(`${player1.username} joined: ${addResult1.success ? '✅' : '❌'} (Position: ${addResult1.position})`);
  
  const addResult2 = room.addPlayer(player2);
  console.log(`${player2.username} joined: ${addResult2.success ? '✅' : '❌'} (Position: ${addResult2.position})\n`);
  
  // 4. Players get ready for game
  console.log('4️⃣ Players preparing for game...');
  
  player1.setReady(true);
  player2.setReady(true);
  
  console.log(`${player1.username} ready: ✅`);
  console.log(`${player2.username} ready: ✅\n`);
  
  // 5. Check if room is ready to start
  console.log('5️⃣ Checking if ready to start...');
  const readyCheck = room.checkReadyToStart();
  console.log(`Ready to start: ${readyCheck.ready ? '✅' : '❌'}`);
  console.log(`Reason: ${readyCheck.reason}\n`);
  
  // 6. Start the game
  console.log('6️⃣ Starting game...');
  const startResult = room.startGame();
  console.log(`Game started: ${startResult.success ? '✅' : '❌'}`);
  console.log(`Status: ${room.status}`);
  console.log(`🚀 GAME BEGINS!\n`);
  
  // 7. Simulate game time progression and events
  console.log('7️⃣ Simulating gameplay...\n');
  
  // First 30 seconds - no goals
  room.updateGameTime(30);
  console.log(`⏱️ 30s - Game in progress...`);
  
  // 45 seconds - Player 1 scores first goal
  room.updateGameTime(45);
  let goalResult = room.addGoal(player1.id, { 
    shotType: 'volley',
    ballSpeed: 85,
    position: { x: 120, y: 200 }
  });
  console.log(`⚽ 45s - GOAL! ${player1.username} scores! (${room.score.left}-${room.score.right})`);
  console.log(`   Shot type: volley, Ball speed: 85 km/h`);
  
  // 78 seconds - Player 2 equalizes
  room.updateGameTime(78);
  goalResult = room.addGoal(player2.id, { 
    shotType: 'header',
    ballSpeed: 72,
    position: { x: 220, y: 180 }
  });
  console.log(`⚽ 78s - GOAL! ${player2.username} equalizes! (${room.score.left}-${room.score.right})`);
  console.log(`   Shot type: header, Ball speed: 72 km/h`);
  
  // 95 seconds - Player 1 scores again
  room.updateGameTime(95);
  goalResult = room.addGoal(player1.id, { 
    shotType: 'power_shot',
    ballSpeed: 95,
    position: { x: 140, y: 190 }
  });
  console.log(`⚽ 95s - GOAL! ${player1.username} takes the lead! (${room.score.left}-${room.score.right})`);
  console.log(`   Shot type: power shot, Ball speed: 95 km/h`);
  
  // 110 seconds - Player 2 gets sent off (simulation of disconnection)
  console.log(`\n❌ 110s - ${player2.username} connection issues...`);
  player2.handleDisconnect();
  console.log(`Game paused due to player disconnection`);
  
  // Player 2 reconnects after 15 seconds
  console.log(`✅ 125s - ${player2.username} reconnected!`);
  player2.handleReconnect('socket_002_new');
  room.resumeGame();
  console.log(`Game resumed`);
  
  // 140 seconds - Player 2 scores dramatic equalizer
  room.updateGameTime(140);
  goalResult = room.addGoal(player2.id, { 
    shotType: 'bicycle_kick',
    ballSpeed: 88,
    position: { x: 250, y: 195 }
  });
  console.log(`⚽ 140s - INCREDIBLE! ${player2.username} bicycle kick equalizer! (${room.score.left}-${room.score.right})`);
  console.log(`   Shot type: bicycle kick, Ball speed: 88 km/h`);
  
  // 155 seconds - Player 1 scores the winner
  room.updateGameTime(155);
  goalResult = room.addGoal(player1.id, { 
    shotType: 'chip_shot',
    ballSpeed: 65,
    position: { x: 160, y: 185 }
  });
  console.log(`⚽ 155s - MATCH WINNER! ${player1.username} with a delicate chip! (${room.score.left}-${room.score.right})`);
  console.log(`   Shot type: chip shot, Ball speed: 65 km/h`);
  
  if (goalResult.gameEnded) {
    console.log(`🏆 GAME OVER! ${player1.username} wins!`);
  }
  
  // 8. Display final game statistics
  console.log(`\n8️⃣ Final Game Statistics:`);
  console.log(`🏆 Winner: ${room.winner ? room.players.get(room.winner).username : 'Draw'}`);
  console.log(`📊 Final Score: ${room.score.left} - ${room.score.right}`);
  console.log(`⏱️ Game Duration: ${Math.floor(room.getGameDuration() / 1000)}s`);
  console.log(`⚽ Total Goals: ${room.goals.length}`);
  console.log(`🎯 Win Reason: ${room.winReason}`);
  
  // 9. Display detailed goal information
  console.log(`\n9️⃣ Goal Details:`);
  room.goals.forEach((goal, index) => {
    console.log(`   Goal ${index + 1}: ${goal.playerName} at ${goal.gameTime}s (${goal.shotType || 'standard'})`);
  });
  
  // 10. Display player session stats
  console.log(`\n🔟 Player Session Statistics:`);
  console.log(`\n${player1.username}:`);
  console.log(`   Goals: ${player1.sessionStats.goalsScored}`);
  console.log(`   Goals Conceded: ${player1.sessionStats.goalsConceded}`);
  console.log(`   Games: ${player1.sessionStats.gamesPlayed}`);
  console.log(`   Wins: ${player1.sessionStats.gamesWon}`);
  console.log(`   Losses: ${player1.sessionStats.gamesLost}`);
  
  console.log(`\n${player2.username}:`);
  console.log(`   Goals: ${player2.sessionStats.goalsScored}`);
  console.log(`   Goals Conceded: ${player2.sessionStats.goalsConceded}`);
  console.log(`   Games: ${player2.sessionStats.gamesPlayed}`);
  console.log(`   Wins: ${player2.sessionStats.gamesWon}`);
  console.log(`   Losses: ${player2.sessionStats.gamesLost}`);
  console.log(`   Disconnections: ${player2.sessionStats.disconnections}`);
  
  // 11. Display game events log
  console.log(`\n1️⃣1️⃣ Game Events Log (${room.events.length} events):`);
  room.events.slice(-8).forEach((event, index) => { // Show last 8 events
    const time = event.gameTime ? `${event.gameTime}s` : 'Pre-game';
    console.log(`   ${time}: ${event.type} - ${JSON.stringify(event.data)}`);
  });
  
  // 12. Room cleanup simulation
  console.log(`\n1️⃣2️⃣ Room cleanup...`);
  
  // Players leave room
  await player1.leaveRoom();
  await player2.leaveRoom();
  
  room.removePlayer(player1.id);
  room.removePlayer(player2.id);
  
  console.log(`✅ Players removed from room`);
  console.log(`📊 Room status: ${room.status}`);
  console.log(`👥 Players remaining: ${room.players.size}`);
  
  // 13. Display room summary
  console.log(`\n1️⃣3️⃣ Room Summary:`);
  const roomSummary = room.toJSON();
  console.log(`   Room ID: ${roomSummary.id}`);
  console.log(`   Game Mode: ${roomSummary.gameMode}`);
  console.log(`   Status: ${roomSummary.status}`);
  console.log(`   Created: ${roomSummary.createdAt.toLocaleTimeString()}`);
  console.log(`   Started: ${roomSummary.gameStartTime?.toLocaleTimeString()}`);
  console.log(`   Ended: ${roomSummary.gameEndTime?.toLocaleTimeString()}`);
  console.log(`   Duration: ${Math.floor((roomSummary.gameEndTime - roomSummary.gameStartTime) / 1000)}s`);
  
  console.log(`\n🎮 GameRoom demonstration completed successfully!`);
}

// Advanced example: Tournament-style room with custom settings
async function demonstrateTournamentRoom() {
  console.log('\n\n🏆 Tournament Room Demo\n');
  
  const tournamentRoom = new GameRoom('tournament-final', {
    gameMode: 'tournament',
    timeLimit: 300,  // 5 minutes
    scoreLimit: 0,   // No score limit - time only
    metadata: {
      tournament: 'World Championship',
      round: 'Final',
      prize: '1000 coins',
      spectators: 1250
    }
  });
  
  console.log(`🏆 Tournament Final Room Created`);
  console.log(`   Mode: ${tournamentRoom.gameMode}`);
  console.log(`   Time: ${tournamentRoom.timeLimit}s (no score limit)`);
  console.log(`   Prize: ${tournamentRoom.metadata.prize}`);
  console.log(`   Spectators: ${tournamentRoom.metadata.spectators}`);
  
  const finalist1 = new Player('socket_final_1', 'pro_player_1', 'ChampionX', {
    characterId: 'player1',
    eloRating: 2100
  });
  
  const finalist2 = new Player('socket_final_2', 'pro_player_2', 'LegendY', {
    characterId: 'player2',
    eloRating: 2080
  });
  
  tournamentRoom.addPlayer(finalist1);
  tournamentRoom.addPlayer(finalist2);
  
  finalist1.setReady(true);
  finalist2.setReady(true);
  
  tournamentRoom.startGame();
  
  console.log(`\n🚀 Tournament Final begins!`);
  console.log(`   ${finalist1.username} (ELO: ${finalist1.eloRating}) vs ${finalist2.username} (ELO: ${finalist2.eloRating})`);
  
  // Simulate intense final match
  tournamentRoom.updateGameTime(120);
  tournamentRoom.addGoal(finalist1.id);
  console.log(`⚽ 2:00 - ${finalist1.username} opens scoring!`);
  
  tournamentRoom.updateGameTime(185);
  tournamentRoom.addGoal(finalist2.id);
  console.log(`⚽ 3:05 - ${finalist2.username} equalizes!`);
  
  tournamentRoom.updateGameTime(270);
  tournamentRoom.addGoal(finalist1.id);
  console.log(`⚽ 4:30 - ${finalist1.username} scores a late winner!`);
  
  // Time expires
  tournamentRoom.updateGameTime(300);
  
  console.log(`\n🏆 TOURNAMENT CHAMPION: ${finalist1.username}!`);
  console.log(`   Final Score: ${tournamentRoom.score.left}-${tournamentRoom.score.right}`);
  console.log(`   Prize won: ${tournamentRoom.metadata.prize}`);
}

// Example of room error handling
async function demonstrateErrorHandling() {
  console.log('\n\n⚠️ Error Handling Demo\n');
  
  const room = new GameRoom();
  const player = new Player('socket1', 'user1', 'TestPlayer');
  
  // Try to start game without enough players
  let result = room.startGame();
  console.log(`Start without players: ${result.success ? '✅' : '❌'} (${result.reason})`);
  
  // Try to add invalid player
  result = room.addPlayer("not-a-player-object");
  console.log(`Add invalid player: ${result.success ? '✅' : '❌'} (${result.reason})`);
  
  // Try to add goal when game not started
  result = room.addGoal(player.id);
  console.log(`Goal without game: ${result.success ? '✅' : '❌'} (${result.reason})`);
  
  // Try to remove non-existent player
  result = room.removePlayer('non-existent-id');
  console.log(`Remove invalid player: ${result.success ? '✅' : '❌'} (${result.reason})`);
  
  console.log(`\n✅ Error handling working correctly!`);
}

// Run all demonstrations
async function runAllDemos() {
  await demonstrateGameRoomUsage();
  await demonstrateTournamentRoom();
  await demonstrateErrorHandling();
}

// Run demo
runAllDemos().catch(console.error);