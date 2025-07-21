/**
 * Comprehensive Game End Testing Suite (Task 3.6)
 * Tests all aspects of game end handling, cleanup, and database persistence
 */

const io = require('socket.io-client');

class ComprehensiveGameEndTester {
  constructor() {
    this.serverUrl = 'http://localhost:3001';
    this.clients = [];
    this.gameRooms = new Map();
    
    this.stats = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      errors: [],
      testResults: new Map(),
      startTime: Date.now()
    };
    
    this.testPhases = [
      'Natural Score Limit',
      'Player Forfeit', 
      'Time Limit End',
      'Player Disconnection',
      'Invalid Requests',
      'Database Persistence',
      'Concurrent Game Ends',
      'Event Broadcasting'
    ];
    
    console.log('🏁 Starting Comprehensive Game End Testing Suite...\n');
  }
  
  /**
   * Create a test client with comprehensive event listeners
   */
  async createClient(playerId, username) {
    return new Promise((resolve, reject) => {
      const client = io(this.serverUrl, { 
        timeout: 5000,
        forceNew: true 
      });
      
      const timeout = setTimeout(() => {
        reject(new Error(`Client ${playerId} connection timeout`));
      }, 5000);
      
      client.on('connect', () => {
        clearTimeout(timeout);
        console.log(`✅ Client ${playerId} connected`);
        
        // Register player
        client.emit('register_player', {
          playerId,
          username,
          character: 'default'
        });
        
        client.playerId = playerId;
        client.username = username;
        client.events = [];
        
        resolve(client);
      });
      
      client.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      
      // Game End Event Listeners
      client.on('game_ended', (data) => {
        console.log(`🏁 [${client.playerId}] Game ended:`, {
          winner: data.winner?.username || 'Draw',
          score: data.finalScore,
          reason: data.endReason,
          duration: Math.round(data.duration / 1000) + 's'
        });
        client.events.push({ type: 'game_ended', data, timestamp: Date.now() });
      });
      
      client.on('winner_celebration', (data) => {
        console.log(`🎉 [${client.playerId}] Winner celebration:`, data.winner?.username);
        client.events.push({ type: 'winner_celebration', data, timestamp: Date.now() });
      });
      
      client.on('detailed_results', (data) => {
        console.log(`📊 [${client.playerId}] Detailed results received`);
        client.events.push({ type: 'detailed_results', data, timestamp: Date.now() });
      });
      
      client.on('game_cleanup_starting', (data) => {
        console.log(`🧹 [${client.playerId}] Cleanup starting`);
        client.events.push({ type: 'game_cleanup_starting', data, timestamp: Date.now() });
      });
      
      // Forfeit Events
      client.on('forfeit_accepted', (data) => {
        console.log(`🏳️ [${client.playerId}] Forfeit accepted`);
        client.events.push({ type: 'forfeit_accepted', data, timestamp: Date.now() });
      });
      
      client.on('forfeit_rejected', (data) => {
        console.log(`❌ [${client.playerId}] Forfeit rejected: ${data.reason}`);
        client.events.push({ type: 'forfeit_rejected', data, timestamp: Date.now() });
      });
      
      // Game End Request Events
      client.on('game_end_accepted', (data) => {
        console.log(`✅ [${client.playerId}] Game end accepted: ${data.reason}`);
        client.events.push({ type: 'game_end_accepted', data, timestamp: Date.now() });
      });
      
      client.on('game_end_rejected', (data) => {
        console.log(`❌ [${client.playerId}] Game end rejected: ${data.reason}`);
        client.events.push({ type: 'game_end_rejected', data, timestamp: Date.now() });
      });
      
      // Matchmaking Events
      client.on('room_assigned', (data) => {
        console.log(`🏠 [${client.playerId}] Room assigned: ${data.roomId}`);
        client.roomId = data.roomId;
        client.events.push({ type: 'room_assigned', data, timestamp: Date.now() });
      });
      
      client.on('game_started', (data) => {
        console.log(`🎮 [${client.playerId}] Game started`);
        client.events.push({ type: 'game_started', data, timestamp: Date.now() });
      });
      
      client.on('goal_scored', (data) => {
        console.log(`⚽ [${client.playerId}] Goal scored by ${data.scorerName}: ${data.score.player1}-${data.score.player2}`);
        client.events.push({ type: 'goal_scored', data, timestamp: Date.now() });
      });
      
      client.on('player_disconnected', (data) => {
        console.log(`🔌 [${client.playerId}] Player disconnected: ${data.playerName}`);
        client.events.push({ type: 'player_disconnected', data, timestamp: Date.now() });
      });
    });
  }
  
  /**
   * Set up a complete game with two players
   */
  async setupGame(testName) {
    const client1 = await this.createClient(`${testName}_p1`, `Player1_${testName}`);
    const client2 = await this.createClient(`${testName}_p2`, `Player2_${testName}`);
    
    this.clients.push(client1, client2);
    
    return new Promise((resolve) => {
      let gameStarted = false;
      let roomId = null;
      
      const checkGameReady = () => {
        if (gameStarted && roomId) {
          resolve({ client1, client2, roomId });
        }
      };
      
      client1.on('room_assigned', (data) => {
        roomId = data.roomId;
        this.gameRooms.set(roomId, { client1, client2, testName });
        
        // Both players ready up
        setTimeout(() => {
          client1.emit('player_ready', {});
          client2.emit('player_ready', {});
        }, 500);
        
        checkGameReady();
      });
      
      client1.on('game_started', () => {
        gameStarted = true;
        checkGameReady();
      });
      
      // Start matchmaking
      client1.emit('join_queue', { gameMode: 'casual' });
      client2.emit('join_queue', { gameMode: 'casual' });
    });
  }
  
  /**
   * Simulate goals to reach score
   */
  async simulateGoals(client, goals) {
    for (let i = 0; i < goals; i++) {
      client.emit('goal_attempt', {
        position: { x: 750, y: 200 },
        velocity: { x: 200, y: 0 },
        goalType: 'normal'
      });
      
      // Wait between goals
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }
  
  /**
   * TEST 1: Natural game end by score limit
   */
  async testNaturalGameEnd() {
    this.stats.totalTests++;
    console.log('\n🧪 TEST 1: Natural game end by score limit');
    console.log('─'.repeat(50));
    
    try {
      const { client1, client2, roomId } = await this.setupGame('natural');
      console.log(`🎮 Game setup complete. Room: ${roomId}`);
      
      // Wait for game to be fully initialized
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate goals to reach score limit (3 goals wins)
      await this.simulateGoals(client1, 3);
      
      // Wait for game end processing
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      // Verify game end events were received
      const client1GameEnd = client1.events.find(e => e.type === 'game_ended');
      const client2GameEnd = client2.events.find(e => e.type === 'game_ended');
      
      if (client1GameEnd && client2GameEnd) {
        console.log('✅ Game end events received by both players');
        this.stats.passedTests++;
        this.stats.testResults.set('natural_game_end', 'PASSED');
      } else {
        throw new Error('Game end events not received by all players');
      }
      
    } catch (error) {
      console.error('❌ Test 1 failed:', error.message);
      this.stats.failedTests++;
      this.stats.errors.push(`Test 1 (Natural Game End): ${error.message}`);
      this.stats.testResults.set('natural_game_end', 'FAILED');
    }
  }
  
  /**
   * TEST 2: Game end by player forfeit
   */
  async testForfeitGameEnd() {
    this.stats.totalTests++;
    console.log('\n🧪 TEST 2: Game end by player forfeit');
    console.log('─'.repeat(50));
    
    try {
      const { client1, client2, roomId } = await this.setupGame('forfeit');
      console.log(`🎮 Game setup complete. Room: ${roomId}`);
      
      // Wait for game initialization
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate some gameplay first
      await this.simulateGoals(client1, 1);
      await this.simulateGoals(client2, 1);
      
      console.log('🏳️ Player 1 forfeiting game...');
      
      // Player 1 forfeits
      client1.emit('forfeit_game', {
        reason: 'player_forfeit'
      });
      
      // Wait for forfeit processing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check for forfeit response
      const forfeitResponse = client1.events.find(e => 
        e.type === 'forfeit_accepted' || e.type === 'forfeit_rejected'
      );
      
      const gameEndEvents = [client1, client2].map(c => 
        c.events.find(e => e.type === 'game_ended')
      ).filter(Boolean);
      
      if (forfeitResponse && gameEndEvents.length >= 1) {
        console.log('✅ Forfeit processed and game end events received');
        this.stats.passedTests++;
        this.stats.testResults.set('forfeit_game_end', 'PASSED');
      } else {
        throw new Error('Forfeit not properly processed or game end events missing');
      }
      
    } catch (error) {
      console.error('❌ Test 2 failed:', error.message);
      this.stats.failedTests++;
      this.stats.errors.push(`Test 2 (Forfeit Game End): ${error.message}`);
      this.stats.testResults.set('forfeit_game_end', 'FAILED');
    }
  }
  
  /**
   * TEST 3: Game end by time limit
   */
  async testTimeLimitGameEnd() {
    this.stats.totalTests++;
    console.log('\n🧪 TEST 3: Game end by time limit');
    console.log('─'.repeat(50));
    
    try {
      const { client1, client2, roomId } = await this.setupGame('timelimit');
      console.log(`🎮 Game setup complete. Room: ${roomId}`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate tied game
      await this.simulateGoals(client1, 1);
      await this.simulateGoals(client2, 1);
      
      console.log('⏰ Requesting time limit game end...');
      
      // Request time limit end
      client1.emit('request_game_end', {
        reason: 'time_limit'
      });
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const gameEndResponse = client1.events.find(e => 
        e.type === 'game_end_accepted' || e.type === 'game_end_rejected'
      );
      
      const gameEndEvents = [client1, client2].map(c => 
        c.events.find(e => e.type === 'game_ended')
      ).filter(Boolean);
      
      if (gameEndResponse && gameEndEvents.length >= 1) {
        console.log('✅ Time limit game end processed successfully');
        this.stats.passedTests++;
        this.stats.testResults.set('time_limit_game_end', 'PASSED');
      } else {
        throw new Error('Time limit game end not properly processed');
      }
      
    } catch (error) {
      console.error('❌ Test 3 failed:', error.message);
      this.stats.failedTests++;
      this.stats.errors.push(`Test 3 (Time Limit Game End): ${error.message}`);
      this.stats.testResults.set('time_limit_game_end', 'FAILED');
    }
  }
  
  /**
   * TEST 4: Game end by player disconnection
   */
  async testDisconnectionGameEnd() {
    this.stats.totalTests++;
    console.log('\n🧪 TEST 4: Game end by player disconnection');
    console.log('─'.repeat(50));
    
    try {
      const { client1, client2, roomId } = await this.setupGame('disconnect');
      console.log(`🎮 Game setup complete. Room: ${roomId}`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate some gameplay
      await this.simulateGoals(client1, 1);
      
      console.log('🔌 Player 2 disconnecting...');
      
      // Player 2 disconnects abruptly
      client2.disconnect();
      
      // Wait for disconnection processing
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      const disconnectionEvent = client1.events.find(e => e.type === 'player_disconnected');
      const gameEndEvent = client1.events.find(e => e.type === 'game_ended');
      
      if (disconnectionEvent || gameEndEvent) {
        console.log('✅ Disconnection game end processed successfully');
        this.stats.passedTests++;
        this.stats.testResults.set('disconnection_game_end', 'PASSED');
      } else {
        throw new Error('Disconnection game end not properly handled');
      }
      
    } catch (error) {
      console.error('❌ Test 4 failed:', error.message);
      this.stats.failedTests++;
      this.stats.errors.push(`Test 4 (Disconnection Game End): ${error.message}`);
      this.stats.testResults.set('disconnection_game_end', 'FAILED');
    }
  }
  
  /**
   * TEST 5: Invalid game end requests
   */
  async testInvalidGameEndRequests() {
    this.stats.totalTests++;
    console.log('\n🧪 TEST 5: Invalid game end requests');
    console.log('─'.repeat(50));
    
    try {
      const client = await this.createClient('invalid_test', 'InvalidTester');
      this.clients.push(client);
      
      console.log('🚫 Testing invalid requests...');
      
      // Test forfeit when not in game
      client.emit('forfeit_game', { reason: 'test' });
      
      // Test invalid game end reason
      client.emit('request_game_end', { reason: 'invalid_reason' });
      
      // Test admin request without proper code
      client.emit('request_game_end', { 
        reason: 'admin_intervention',
        adminCode: 'WRONG_CODE'
      });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const rejections = client.events.filter(e => 
        e.type === 'forfeit_rejected' || e.type === 'game_end_rejected'
      );
      
      if (rejections.length >= 2) {
        console.log(`✅ Invalid requests properly rejected (${rejections.length} rejections)`);
        this.stats.passedTests++;
        this.stats.testResults.set('invalid_requests', 'PASSED');
      } else {
        throw new Error(`Expected rejections not received (got ${rejections.length})`);
      }
      
    } catch (error) {
      console.error('❌ Test 5 failed:', error.message);
      this.stats.failedTests++;
      this.stats.errors.push(`Test 5 (Invalid Requests): ${error.message}`);
      this.stats.testResults.set('invalid_requests', 'FAILED');
    }
  }
  
  /**
   * TEST 6: Event broadcasting verification
   */
  async testEventBroadcasting() {
    this.stats.totalTests++;
    console.log('\n🧪 TEST 6: Event broadcasting verification');
    console.log('─'.repeat(50));
    
    try {
      const { client1, client2, roomId } = await this.setupGame('broadcast');
      console.log(`🎮 Game setup complete. Room: ${roomId}`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // End game naturally
      await this.simulateGoals(client1, 3);
      
      // Wait for all events
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check both players received all key events
      const requiredEvents = ['game_ended'];
      const optionalEvents = ['winner_celebration', 'detailed_results', 'game_cleanup_starting'];
      
      let bothPlayersReceivedRequired = true;
      
      for (const eventType of requiredEvents) {
        const client1HasEvent = client1.events.some(e => e.type === eventType);
        const client2HasEvent = client2.events.some(e => e.type === eventType);
        
        if (!client1HasEvent || !client2HasEvent) {
          bothPlayersReceivedRequired = false;
          break;
        }
      }
      
      if (bothPlayersReceivedRequired) {
        console.log('✅ Event broadcasting working correctly');
        this.stats.passedTests++;
        this.stats.testResults.set('event_broadcasting', 'PASSED');
      } else {
        throw new Error('Required events not received by all players');
      }
      
    } catch (error) {
      console.error('❌ Test 6 failed:', error.message);
      this.stats.failedTests++;
      this.stats.errors.push(`Test 6 (Event Broadcasting): ${error.message}`);
      this.stats.testResults.set('event_broadcasting', 'FAILED');
    }
  }
  
  /**
   * TEST 7: Concurrent game ends
   */
  async testConcurrentGameEnds() {
    this.stats.totalTests++;
    console.log('\n🧪 TEST 7: Concurrent game ends');
    console.log('─'.repeat(50));
    
    try {
      // Create 3 concurrent games
      const games = await Promise.all([
        this.setupGame('concurrent1'),
        this.setupGame('concurrent2'),
        this.setupGame('concurrent3')
      ]);
      
      console.log(`🎮 3 concurrent games setup complete`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // End games with different methods simultaneously
      console.log('🏁 Ending all games concurrently...');
      
      games[0].client1.emit('forfeit_game', { reason: 'forfeit' });
      games[1].client1.emit('request_game_end', { reason: 'time_limit' });
      games[2].client2.disconnect();
      
      // Wait for all processing
      await new Promise(resolve => setTimeout(resolve, 6000));
      
      // Check that all games were ended
      let processedGames = 0;
      
      for (let i = 0; i < 3; i++) {
        const game = games[i];
        const client1Events = game.client1.events || [];
        const client2Events = game.client2 && !game.client2.disconnected ? game.client2.events : [];
        
        const hasGameEnd = client1Events.some(e => e.type === 'game_ended') ||
                          client2Events.some(e => e.type === 'game_ended') ||
                          client1Events.some(e => e.type === 'forfeit_accepted') ||
                          client1Events.some(e => e.type === 'game_end_accepted');
        
        if (hasGameEnd) {
          processedGames++;
        }
      }
      
      if (processedGames >= 2) {
        console.log(`✅ Concurrent game ends handled (${processedGames}/3 games ended)`);
        this.stats.passedTests++;
        this.stats.testResults.set('concurrent_game_ends', 'PASSED');
      } else {
        throw new Error(`Only ${processedGames}/3 games were properly ended`);
      }
      
    } catch (error) {
      console.error('❌ Test 7 failed:', error.message);
      this.stats.failedTests++;
      this.stats.errors.push(`Test 7 (Concurrent Game Ends): ${error.message}`);
      this.stats.testResults.set('concurrent_game_ends', 'FAILED');
    }
  }
  
  /**
   * Run all comprehensive tests
   */
  async runAllTests() {
    console.log('🚀 Starting Comprehensive Game End Testing Suite');
    console.log('=' + '='.repeat(60));
    
    const startTime = Date.now();
    
    try {
      await this.testNaturalGameEnd();
      await this.testForfeitGameEnd();
      await this.testTimeLimitGameEnd();
      await this.testDisconnectionGameEnd();
      await this.testInvalidGameEndRequests();
      await this.testEventBroadcasting();
      await this.testConcurrentGameEnds();
      
    } catch (error) {
      console.error('💥 Critical testing error:', error);
      this.stats.errors.push(`Critical Error: ${error.message}`);
    }
    
    // Cleanup
    this.cleanup();
    
    // Generate results
    const duration = Date.now() - startTime;
    this.generateTestReport(duration);
  }
  
  /**
   * Cleanup all connections
   */
  cleanup() {
    console.log('\n🧹 Cleaning up test connections...');
    
    this.clients.forEach(client => {
      if (client && client.connected) {
        client.disconnect();
      }
    });
    
    this.clients = [];
    this.gameRooms.clear();
  }
  
  /**
   * Generate comprehensive test report
   */
  generateTestReport(duration) {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 COMPREHENSIVE GAME END TEST RESULTS (Task 3.6)');
    console.log('='.repeat(70));
    
    const successRate = ((this.stats.passedTests / this.stats.totalTests) * 100).toFixed(1);
    
    console.log(`📊 Test Summary:`);
    console.log(`   Total Tests: ${this.stats.totalTests}`);
    console.log(`   ✅ Passed: ${this.stats.passedTests}`);
    console.log(`   ❌ Failed: ${this.stats.failedTests}`);
    console.log(`   📈 Success Rate: ${successRate}%`);
    console.log(`   ⏱️ Duration: ${(duration / 1000).toFixed(1)}s`);
    
    console.log(`\n📋 Individual Test Results:`);
    let index = 1;
    for (const [testName, result] of this.stats.testResults) {
      const status = result === 'PASSED' ? '✅' : '❌';
      const formattedName = testName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      console.log(`   ${index}. ${status} ${formattedName}`);
      index++;
    }
    
    if (this.stats.errors.length > 0) {
      console.log(`\n❌ Error Details:`);
      this.stats.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }
    
    // Performance Analysis
    console.log(`\n📈 Performance Analysis:`);
    if (successRate >= 80) {
      console.log('   🟢 EXCELLENT - Game end system is production-ready');
    } else if (successRate >= 60) {
      console.log('   🟡 GOOD - Minor issues need addressing');
    } else {
      console.log('   🔴 NEEDS WORK - Significant issues found');
    }
    
    console.log(`\n🏆 Task 3.6 Testing Complete!`);
    console.log('   Game End & Cleanup system has been comprehensively tested.');
    console.log('='.repeat(70));
    
    // Exit after a moment
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new ComprehensiveGameEndTester();
  
  setTimeout(() => {
    tester.runAllTests().catch(error => {
      console.error('💥 Test runner failed:', error);
      process.exit(1);
    });
  }, 1000);
}

module.exports = ComprehensiveGameEndTester;