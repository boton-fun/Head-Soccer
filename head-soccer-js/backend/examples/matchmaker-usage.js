/**
 * Example usage of the Matchmaker class in the multiplayer system
 */

const Matchmaker = require('../modules/Matchmaker');
const Player = require('../modules/Player');

// Demonstrate comprehensive matchmaking scenarios
async function demonstrateMatchmakerUsage() {
  console.log('🎯 Head Soccer Multiplayer - Matchmaker Demo\n');
  
  // 1. Create matchmaker with custom settings
  console.log('1️⃣ Creating matchmaker service...');
  const matchmaker = new Matchmaker({
    maxQueueSize: 50,
    maxWaitTime: 60000,      // 1 minute max wait
    skillTolerance: 150,     // ELO tolerance
    skillToleranceIncrease: 25, // Increase every 30s
    queueUpdateInterval: 3000,  // 3 seconds
    maxConcurrentRooms: 20
  });
  
  console.log(`✅ Matchmaker created with custom settings`);
  console.log(`   Max Queue Size: ${matchmaker.maxQueueSize}`);
  console.log(`   Skill Tolerance: ${matchmaker.skillTolerance} ELO`);
  console.log(`   Max Wait Time: ${matchmaker.maxWaitTime/1000}s`);
  console.log(`   Update Interval: ${matchmaker.queueUpdateInterval/1000}s\n`);
  
  // 2. Set up event listeners
  console.log('2️⃣ Setting up event listeners...');
  
  matchmaker.on('player_queued', (data) => {
    console.log(`📥 Player queued: ${data.username} (position: ${data.position}, ELO: ${data.eloRating})`);
  });
  
  matchmaker.on('player_dequeued', (data) => {
    console.log(`📤 Player dequeued: ${data.username} (waited: ${Math.round(data.waitTime/1000)}s)`);
  });
  
  matchmaker.on('match_created', (data) => {
    console.log(`🎮 Match created: ${data.players[0].username} vs ${data.players[1].username}`);
    console.log(`   Room: ${data.roomId}`);
    console.log(`   Mode: ${data.gameMode}`);
    console.log(`   Average wait: ${Math.round(data.averageWaitTime/1000)}s`);
  });
  
  matchmaker.on('queue_timeout', (data) => {
    console.log(`⏰ Queue timeout: ${data.username} (waited: ${Math.round(data.waitTime/1000)}s)`);
  });
  
  console.log('✅ Event listeners configured\n');
  
  // 3. Start the matchmaker service
  console.log('3️⃣ Starting matchmaker service...');
  matchmaker.start();
  console.log('✅ Matchmaker service started\n');
  
  // 4. Create players with different skill levels
  console.log('4️⃣ Creating players...');
  const players = [
    new Player('socket_001', 'user_001', 'Rookie', { eloRating: 1000 }),
    new Player('socket_002', 'user_002', 'Beginner', { eloRating: 1100 }),
    new Player('socket_003', 'user_003', 'Average', { eloRating: 1200 }),
    new Player('socket_004', 'user_004', 'Skilled', { eloRating: 1300 }),
    new Player('socket_005', 'user_005', 'Expert', { eloRating: 1400 }),
    new Player('socket_006', 'user_006', 'Master', { eloRating: 1500 })
  ];
  
  players.forEach(player => {
    console.log(`   ${player.username}: ELO ${player.eloRating}`);
  });
  console.log();
  
  // 5. Add players to queue with different preferences
  console.log('5️⃣ Adding players to matchmaking queue...');
  
  // Add casual players
  let result = matchmaker.addToQueue(players[0], { gameMode: 'casual', region: 'US-East' });
  console.log(`${players[0].username}: ${result.success ? '✅' : '❌'} (${result.reason})`);
  
  result = matchmaker.addToQueue(players[1], { gameMode: 'casual', region: 'US-East' });
  console.log(`${players[1].username}: ${result.success ? '✅' : '❌'} (${result.reason})`);
  
  // Add ranked players
  result = matchmaker.addToQueue(players[2], { gameMode: 'ranked', region: 'US-East' });
  console.log(`${players[2].username}: ${result.success ? '✅' : '❌'} (${result.reason})`);
  
  result = matchmaker.addToQueue(players[3], { gameMode: 'ranked', region: 'US-East' });
  console.log(`${players[3].username}: ${result.success ? '✅' : '❌'} (${result.reason})`);
  
  // Add high-skill players (might not match immediately)
  result = matchmaker.addToQueue(players[4], { gameMode: 'ranked', region: 'US-East' });
  console.log(`${players[4].username}: ${result.success ? '✅' : '❌'} (${result.reason})`);
  
  result = matchmaker.addToQueue(players[5], { gameMode: 'casual', region: 'EU-West' });
  console.log(`${players[5].username}: ${result.success ? '✅' : '❌'} (${result.reason})`);
  
  console.log();
  
  // 6. Check queue positions
  console.log('6️⃣ Queue positions:');
  players.forEach(player => {
    const position = matchmaker.getQueuePosition(player.id);
    if (position.inQueue) {
      console.log(`   ${player.username}: Position ${position.position}, Est. wait: ${Math.round(position.estimatedWait/1000)}s`);
    }
  });
  console.log();
  
  // 7. Process queue and show matches
  console.log('7️⃣ Processing matchmaking queue...');
  matchmaker.processQueue();
  
  // Show current stats
  const stats = matchmaker.getStats();
  console.log(`\n📊 Current Statistics:`);
  console.log(`   Queue size: ${stats.currentQueueSize}`);
  console.log(`   Active rooms: ${stats.activeRoomsCount}`);
  console.log(`   Total matches: ${stats.totalMatches}`);
  console.log(`   Successful matches: ${stats.successfulMatches}`);
  
  // 8. Wait a bit and process again to show skill tolerance increase
  console.log('\n8️⃣ Waiting 5 seconds for skill tolerance increase...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log('Processing queue again...');
  matchmaker.processQueue();
  
  // 9. Add more players to create additional matches
  console.log('\n9️⃣ Adding more players for additional matches...');
  const moreePlayers = [
    new Player('socket_007', 'user_007', 'Challenger', { eloRating: 1150 }),
    new Player('socket_008', 'user_008', 'Competitor', { eloRating: 1250 }),
    new Player('socket_009', 'user_009', 'Warrior', { eloRating: 1350 }),
    new Player('socket_010', 'user_010', 'Champion', { eloRating: 1450 })
  ];
  
  moreePlayers.forEach(player => {
    const result = matchmaker.addToQueue(player, { gameMode: 'ranked', region: 'US-East' });
    console.log(`${player.username}: ${result.success ? '✅' : '❌'} (Position: ${result.position})`);
  });
  
  // Process queue again
  console.log('\nProcessing queue with new players...');
  matchmaker.processQueue();
  
  // 10. Show room details
  console.log('\n🔟 Active room details:');
  let roomCount = 1;
  for (const [roomId, room] of matchmaker.activeRooms.entries()) {
    console.log(`\nRoom ${roomCount}: ${roomId}`);
    console.log(`   Status: ${room.status}`);
    console.log(`   Game Mode: ${room.gameMode}`);
    console.log(`   Players: ${room.players.size}/${room.maxPlayers}`);
    console.log(`   Score Limit: ${room.scoreLimit}`);
    console.log(`   Time Limit: ${room.timeLimit}s`);
    
    if (room.metadata) {
      console.log(`   Average ELO: ${room.metadata.averageElo}`);
      console.log(`   ELO Difference: ${room.metadata.eloDifference}`);
    }
    
    const roomPlayers = Array.from(room.players.values());
    roomPlayers.forEach(player => {
      console.log(`     ${player.username} (${player.position}): ELO ${player.eloRating}`);
    });
    
    roomCount++;
  }
  
  // 11. Simulate player disconnection
  console.log('\n1️⃣1️⃣ Simulating player disconnection...');
  if (players[0].status === 'IN_QUEUE') {
    players[0].handleDisconnect();
    console.log(`${players[0].username} disconnected`);
    
    // Clean up disconnected players
    matchmaker.cleanupDisconnectedPlayers();
    console.log('Disconnected players cleaned up from queue');
  }
  
  // 12. Final statistics
  console.log('\n1️⃣2️⃣ Final matchmaking statistics:');
  const finalStats = matchmaker.getStats();
  console.log(`   Total players processed: ${players.length + moreePlayers.length}`);
  console.log(`   Current queue size: ${finalStats.currentQueueSize}`);
  console.log(`   Active rooms: ${finalStats.activeRoomsCount}`);
  console.log(`   Total matches created: ${finalStats.totalMatches}`);
  console.log(`   Successful matches: ${finalStats.successfulMatches}`);
  console.log(`   Average wait time: ${Math.round(finalStats.averageWaitTime/1000)}s`);
  
  if (finalStats.queueDetails.length > 0) {
    console.log('\n   Players still in queue:');
    finalStats.queueDetails.forEach(detail => {
      console.log(`     ${detail.username}: ELO ${detail.eloRating}, waited ${Math.round(detail.waitTime/1000)}s`);
    });
  }
  
  // 13. Test queue management operations
  console.log('\n1️⃣3️⃣ Testing queue management...');
  
  // Remove a player manually
  if (finalStats.queueDetails.length > 0) {
    const playerToRemove = finalStats.queueDetails[0];
    const removeResult = matchmaker.removeFromQueue(playerToRemove.playerId);
    console.log(`Manual removal of ${playerToRemove.username}: ${removeResult.success ? '✅' : '❌'}`);
  }
  
  // Try to add duplicate player
  const duplicateResult = matchmaker.addToQueue(players[2]); // Should already be in a room
  console.log(`Duplicate add attempt: ${duplicateResult.success ? '✅' : '❌'} (${duplicateResult.reason})`);
  
  // 14. System status report
  console.log('\n1️⃣4️⃣ System status report:');
  const status = matchmaker.getStatus();
  console.log(`   Service running: ${status.isRunning ? '✅' : '❌'}`);
  console.log(`   Queue: ${status.queue.size}/${status.queue.maxSize}`);
  console.log(`   Rooms: ${status.rooms.active}/${status.rooms.maxConcurrent}`);
  console.log(`   Configuration:`);
  console.log(`     Skill tolerance: ${status.configuration.skillTolerance} ELO`);
  console.log(`     Max wait time: ${status.configuration.maxWaitTime/1000}s`);
  console.log(`     Update interval: ${status.configuration.queueUpdateInterval/1000}s`);
  
  // 15. Cleanup
  console.log('\n1️⃣5️⃣ Stopping matchmaker service...');
  matchmaker.stop();
  console.log('✅ Matchmaker service stopped');
  
  console.log('\n🎯 Matchmaker demonstration completed successfully!');
}

// Demonstrate skill-based matching scenarios
async function demonstrateSkillBasedMatching() {
  console.log('\n\n🏆 Skill-Based Matching Demo\n');
  
  const matchmaker = new Matchmaker({
    skillTolerance: 100,
    skillToleranceIncrease: 50,
    queueUpdateInterval: 2000
  });
  
  matchmaker.start();
  
  // Create players with specific skill gaps
  const skillPlayers = [
    new Player('skill_001', 'u1', 'Bronze', { eloRating: 800 }),
    new Player('skill_002', 'u2', 'Silver', { eloRating: 1000 }),
    new Player('skill_003', 'u3', 'Gold', { eloRating: 1200 }),
    new Player('skill_004', 'u4', 'Platinum', { eloRating: 1400 }),
    new Player('skill_005', 'u5', 'Diamond', { eloRating: 1600 }),
    new Player('skill_006', 'u6', 'Master', { eloRating: 1800 })
  ];
  
  console.log('Adding players with wide skill gaps...');
  skillPlayers.forEach(player => {
    matchmaker.addToQueue(player, { gameMode: 'ranked' });
    console.log(`${player.username}: ELO ${player.eloRating}`);
  });
  
  console.log('\nInitial matching attempt (strict tolerance)...');
  matchmaker.processQueue();
  
  let stats = matchmaker.getStats();
  console.log(`Matches created: ${stats.totalMatches}`);
  console.log(`Players still queued: ${stats.currentQueueSize}`);
  
  // Wait for tolerance to increase
  console.log('\nWaiting 5 seconds for skill tolerance to increase...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log('Second matching attempt (increased tolerance)...');
  matchmaker.processQueue();
  
  stats = matchmaker.getStats();
  console.log(`Total matches created: ${stats.totalMatches}`);
  console.log(`Players still queued: ${stats.currentQueueSize}`);
  
  if (stats.currentQueueSize > 0) {
    console.log('\nRemaining players (likely too high/low skill):');
    stats.queueDetails.forEach(detail => {
      console.log(`  ${detail.username}: ELO ${detail.eloRating}`);
    });
  }
  
  matchmaker.stop();
  console.log('\n🏆 Skill-based matching demo completed!');
}

// Demonstrate high-load scenario
async function demonstrateHighLoadScenario() {
  console.log('\n\n⚡ High Load Scenario Demo\n');
  
  const matchmaker = new Matchmaker({
    maxQueueSize: 200,
    queueUpdateInterval: 1000, // Faster processing
    maxConcurrentRooms: 50
  });
  
  matchmaker.start();
  
  // Track match creation events
  let matchesCreated = 0;
  matchmaker.on('match_created', () => {
    matchesCreated++;
  });
  
  console.log('Creating 50 players for high-load test...');
  
  const highLoadPlayers = [];
  for (let i = 1; i <= 50; i++) {
    const player = new Player(
      `load_${i.toString().padStart(3, '0')}`,
      `user_${i}`,
      `Player${i}`,
      { eloRating: 1000 + Math.random() * 400 } // Random ELO between 1000-1400
    );
    highLoadPlayers.push(player);
  }
  
  // Add all players to queue
  console.log('Adding players to queue...');
  const startTime = Date.now();
  
  highLoadPlayers.forEach((player, index) => {
    const result = matchmaker.addToQueue(player, { gameMode: 'casual' });
    if (index % 10 === 0) {
      console.log(`Added ${index + 1}/50 players...`);
    }
  });
  
  const queueTime = Date.now() - startTime;
  console.log(`✅ All 50 players queued in ${queueTime}ms`);
  
  // Process queue multiple times
  console.log('\nProcessing queue...');
  const processStartTime = Date.now();
  
  for (let i = 0; i < 5; i++) {
    matchmaker.processQueue();
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  const processTime = Date.now() - processStartTime;
  
  const finalStats = matchmaker.getStats();
  console.log(`\n📊 High Load Results:`);
  console.log(`   Processing time: ${processTime}ms`);
  console.log(`   Matches created: ${matchesCreated}`);
  console.log(`   Players matched: ${matchesCreated * 2}`);
  console.log(`   Players remaining in queue: ${finalStats.currentQueueSize}`);
  console.log(`   Active rooms: ${finalStats.activeRoomsCount}`);
  console.log(`   Match rate: ${Math.round((matchesCreated * 2 / 50) * 100)}% of players matched`);
  
  matchmaker.stop();
  console.log('\n⚡ High load scenario completed!');
}

// Run all demonstrations
async function runAllDemos() {
  await demonstrateMatchmakerUsage();
  await demonstrateSkillBasedMatching();
  await demonstrateHighLoadScenario();
}

// Run demo
runAllDemos().catch(console.error);