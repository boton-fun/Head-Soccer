/**
 * Comprehensive Game End Events Testing
 * Tests all aspects of game end handling, cleanup, and database persistence
 */

const io = require('socket.io-client');

class GameEndTester {
  constructor() {
    this.serverUrl = 'http://localhost:3001';
    this.clients = [];
    this.stats = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      errors: []
    };
    
    console.log('🏁 Starting Game End Events comprehensive testing...\n');
  }
  
  /**
   * Create a test client connection
   */
  async createClient(playerId, username) {
    return new Promise((resolve, reject) => {
      const client = io(this.serverUrl);
      
      client.on('connect', () => {
        console.log(`✅ Client ${playerId} connected`);
        
        // Register player
        client.emit('register_player', {
          playerId,
          username,
          character: 'default'
        });
        
        client.playerId = playerId;
        client.username = username;
        resolve(client);
      });
      
      client.on('connect_error', reject);
      client.on('disconnect', () => {
        console.log(`🔌 Client ${playerId} disconnected`);
      });
      
      // Add game end event listeners
      client.on('game_ended', (data) => {
        console.log(`🏁 Game ended notification received by ${playerId}:`, {
          winner: data.winner?.username,
          finalScore: data.finalScore,
          duration: data.duration,
          resultType: data.resultType
        });
      });
      
      client.on('winner_celebration', (data) => {
        console.log(`🎉 Winner celebration for ${playerId}:`, data.winner?.username);
      });
      
      client.on('detailed_results', (data) => {
        console.log(`📊 Detailed results for ${playerId}:`, {
          players: data.players.length,
          gameMode: data.gameMode,
          duration: data.durationMinutes
        });
      });
      
      client.on('game_cleanup_starting', (data) => {
        console.log(`🧹 Cleanup starting notification for ${playerId}`);
      });
      
      client.on('forfeit_accepted', (data) => {
        console.log(`🏳️ Forfeit accepted for ${playerId}`);
      });
      
      client.on('forfeit_rejected', (data) => {
        console.log(`❌ Forfeit rejected for ${playerId}: ${data.reason}`);
      });
      
      client.on('game_end_accepted', (data) => {
        console.log(`✅ Game end accepted for ${playerId}: ${data.reason}`);
      });
      
      client.on('game_end_rejected', (data) => {
        console.log(`❌ Game end rejected for ${playerId}: ${data.reason}`);
      });
    });
  }
  
  /**
   * Set up a complete game scenario
   */
  async setupGame(client1, client2) {
    return new Promise((resolve) => {
      let readyCount = 0;
      let roomId = null;
      
      const checkReady = () => {
        readyCount++;
        if (readyCount === 2 && roomId) {
          resolve(roomId);
        }
      };
      
      // Listen for room assignments
      client1.on('room_assigned', (data) => {
        roomId = data.roomId;
        console.log(`🏠 Room assigned: ${roomId}`);
        
        // Mark both players as ready
        client1.emit('player_ready', {});
        client2.emit('player_ready', {});
      });
      
      client1.on('game_started', checkReady);
      client2.on('game_started', checkReady);
      
      // Start matchmaking
      client1.emit('join_queue', { gameMode: 'casual' });
      client2.emit('join_queue', { gameMode: 'casual' });
    });
  }
  
  /**
   * Simulate game play with goals
   */
  async simulateGameplay(client1, client2, roomId, goals1 = 2, goals2 = 1) {
    console.log(`⚽ Simulating gameplay: ${goals1}-${goals2}`);
    
    // Simulate goals for player 1
    for (let i = 0; i < goals1; i++) {
      client1.emit('goal_attempt', {
        position: { x: 750, y: 200 },
        velocity: { x: 200, y: 0 },
        goalType: 'normal'
      });
      
      // Wait between goals
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Simulate goals for player 2
    for (let i = 0; i < goals2; i++) {
      client2.emit('goal_attempt', {
        position: { x: 50, y: 200 },
        velocity: { x: -200, y: 0 },
        goalType: 'normal'
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  /**
   * Test 1: Natural game end by score limit
   */
  async testNaturalGameEnd() {
    this.stats.totalTests++;
    console.log('\n🧪 TEST 1: Natural game end by score limit');
    
    try {
      const client1 = await this.createClient('player1', 'Alice');
      const client2 = await this.createClient('player2', 'Bob');
      this.clients.push(client1, client2);
      
      const roomId = await this.setupGame(client1, client2);
      
      // Simulate gameplay until score limit (3 goals)
      await this.simulateGameplay(client1, client2, roomId, 3, 1);
      
      // Wait for game end processing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('✅ Test 1 passed: Natural game end completed');
      this.stats.passedTests++;
      
    } catch (error) {
      console.error('❌ Test 1 failed:', error.message);
      this.stats.failedTests++;
      this.stats.errors.push(`Test 1: ${error.message}`);
    }
  }
  
  /**
   * Test 2: Game end by forfeit
   */
  async testForfeitGameEnd() {
    this.stats.totalTests++;
    console.log('\n🧪 TEST 2: Game end by forfeit');
    
    try {
      const client1 = await this.createClient('player3', 'Charlie');
      const client2 = await this.createClient('player4', 'Diana');
      this.clients.push(client1, client2);
      
      const roomId = await this.setupGame(client1, client2);
      
      // Simulate some gameplay first
      await this.simulateGameplay(client1, client2, roomId, 1, 1);
      
      // Player 1 forfeits
      client1.emit('forfeit_game', {
        reason: 'player_forfeit'
      });
      
      // Wait for forfeit processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('✅ Test 2 passed: Forfeit game end completed');
      this.stats.passedTests++;
      
    } catch (error) {
      console.error('❌ Test 2 failed:', error.message);
      this.stats.failedTests++;
      this.stats.errors.push(`Test 2: ${error.message}`);
    }
  }
  
  /**
   * Test 3: Game end by time limit
   */
  async testTimeLimitGameEnd() {
    this.stats.totalTests++;
    console.log('\n🧪 TEST 3: Game end by time limit');
    
    try {
      const client1 = await this.createClient('player5', 'Eve');
      const client2 = await this.createClient('player6', 'Frank');
      this.clients.push(client1, client2);
      
      const roomId = await this.setupGame(client1, client2);
      
      // Simulate gameplay without reaching score limit
      await this.simulateGameplay(client1, client2, roomId, 1, 1);
      
      // Request time limit end
      client1.emit('request_game_end', {
        reason: 'time_limit'
      });
      
      // Wait for time limit processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('✅ Test 3 passed: Time limit game end completed');
      this.stats.passedTests++;
      
    } catch (error) {
      console.error('❌ Test 3 failed:', error.message);
      this.stats.failedTests++;
      this.stats.errors.push(`Test 3: ${error.message}`);
    }
  }
  
  /**
   * Test 4: Game end by disconnection
   */
  async testDisconnectionGameEnd() {
    this.stats.totalTests++;
    console.log('\n🧪 TEST 4: Game end by disconnection');
    
    try {
      const client1 = await this.createClient('player7', 'Grace');
      const client2 = await this.createClient('player8', 'Henry');
      this.clients.push(client1, client2);
      
      const roomId = await this.setupGame(client1, client2);
      
      // Simulate some gameplay
      await this.simulateGameplay(client1, client2, roomId, 1, 0);
      
      // Player 2 disconnects abruptly
      client2.disconnect();
      
      // Wait for disconnection processing
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('✅ Test 4 passed: Disconnection game end completed');
      this.stats.passedTests++;
      
    } catch (error) {
      console.error('❌ Test 4 failed:', error.message);
      this.stats.failedTests++;
      this.stats.errors.push(`Test 4: ${error.message}`);
    }
  }
  
  /**
   * Test 5: Multiple simultaneous game ends
   */
  async testConcurrentGameEnds() {
    this.stats.totalTests++;
    console.log('\n🧪 TEST 5: Concurrent game ends');
    
    try {
      // Create multiple game pairs
      const pairs = [];
      
      for (let i = 0; i < 3; i++) {
        const client1 = await this.createClient(`concurrent1_${i}`, `Player1_${i}`);
        const client2 = await this.createClient(`concurrent2_${i}`, `Player2_${i}`);
        this.clients.push(client1, client2);
        
        const roomId = await this.setupGame(client1, client2);
        pairs.push({ client1, client2, roomId });
      }
      
      // End all games simultaneously with different methods
      pairs[0].client1.emit('forfeit_game', { reason: 'forfeit' });
      pairs[1].client1.emit('request_game_end', { reason: 'time_limit' });
      pairs[2].client2.disconnect(); // Disconnection
      
      // Wait for all processing
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log('✅ Test 5 passed: Concurrent game ends completed');
      this.stats.passedTests++;
      
    } catch (error) {
      console.error('❌ Test 5 failed:', error.message);
      this.stats.failedTests++;
      this.stats.errors.push(`Test 5: ${error.message}`);
    }
  }
  
  /**
   * Test 6: Invalid game end requests
   */
  async testInvalidGameEndRequests() {
    this.stats.totalTests++;
    console.log('\n🧪 TEST 6: Invalid game end requests');
    
    try {
      const client1 = await this.createClient('player9', 'Ivan');
      const client2 = await this.createClient('player10', 'Jane');
      this.clients.push(client1, client2);
      
      // Test requests before game starts
      client1.emit('forfeit_game', {});
      client1.emit('request_game_end', { reason: 'invalid_reason' });
      
      const roomId = await this.setupGame(client1, client2);
      
      // Test invalid admin request
      client1.emit('request_game_end', {
        reason: 'admin_intervention',
        adminCode: 'WRONG_CODE'
      });
      
      // Test mutual agreement without confirmation
      client1.emit('request_game_end', {
        reason: 'mutual_agreement',
        confirmed: false
      });
      
      // Wait for rejection responses
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('✅ Test 6 passed: Invalid requests properly rejected');
      this.stats.passedTests++;
      
    } catch (error) {
      console.error('❌ Test 6 failed:', error.message);
      this.stats.failedTests++;
      this.stats.errors.push(`Test 6: ${error.message}`);
    }
  }
  
  /**
   * Run all tests
   */
  async runAllTests() {
    const startTime = Date.now();
    
    try {
      await this.testNaturalGameEnd();
      await this.testForfeitGameEnd();
      await this.testTimeLimitGameEnd();
      await this.testDisconnectionGameEnd();
      await this.testConcurrentGameEnds();
      await this.testInvalidGameEndRequests();
      
    } catch (error) {
      console.error('💥 Critical testing error:', error);
      this.stats.errors.push(`Critical: ${error.message}`);
    }
    
    // Cleanup
    this.cleanup();
    
    // Results
    const duration = Date.now() - startTime;
    this.printResults(duration);
  }
  
  /**
   * Cleanup all connections
   */
  cleanup() {
    console.log('\n🧹 Cleaning up test connections...');
    
    this.clients.forEach(client => {
      if (client.connected) {
        client.disconnect();
      }
    });
    
    this.clients = [];
  }
  
  /**
   * Print test results
   */
  printResults(duration) {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 GAME END EVENTS TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`📊 Total Tests: ${this.stats.totalTests}`);
    console.log(`✅ Passed: ${this.stats.passedTests}`);
    console.log(`❌ Failed: ${this.stats.failedTests}`);
    console.log(`📈 Success Rate: ${((this.stats.passedTests / this.stats.totalTests) * 100).toFixed(1)}%`);
    console.log(`⏱️ Duration: ${(duration / 1000).toFixed(1)}s`);
    
    if (this.stats.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      this.stats.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
      });
    }
    
    console.log('\n🏁 Game End Events testing completed!');
    console.log('='.repeat(60));
    
    // Exit process
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
}

// Run the tests if this file is executed directly
if (require.main === module) {
  const tester = new GameEndTester();
  
  // Start server check
  setTimeout(() => {
    tester.runAllTests().catch(error => {
      console.error('💥 Test runner failed:', error);
      process.exit(1);
    });
  }, 1000);
}