/**
 * Quick Game End Test - Verify core game end functionality
 */

const io = require('socket.io-client');

class QuickGameEndTest {
  constructor() {
    this.serverUrl = 'http://localhost:3001';
    this.testResults = [];
  }
  
  async createClient(playerId) {
    return new Promise((resolve, reject) => {
      const client = io(this.serverUrl, { 
        timeout: 5000,
        forceNew: true 
      });
      
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);
      
      client.on('connect', () => {
        clearTimeout(timeout);
        console.log(`✅ Client ${playerId} connected`);
        
        client.emit('register_player', {
          playerId,
          username: `Player_${playerId}`,
          character: 'default'
        });
        
        client.playerId = playerId;
        resolve(client);
      });
      
      client.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      
      // Add game end event listeners
      client.on('game_ended', (data) => {
        console.log(`🏁 Game ended notification for ${playerId}:`, {
          winner: data.winner?.username || 'Draw',
          score: data.finalScore,
          reason: data.endReason
        });
      });
      
      client.on('forfeit_accepted', (data) => {
        console.log(`🏳️ Forfeit accepted for ${playerId}`);
        this.testResults.push({ test: 'forfeit', success: true });
      });
      
      client.on('forfeit_rejected', (data) => {
        console.log(`❌ Forfeit rejected for ${playerId}: ${data.reason}`);
        this.testResults.push({ test: 'forfeit', success: false, reason: data.reason });
      });
      
      client.on('game_end_accepted', (data) => {
        console.log(`✅ Game end accepted for ${playerId}: ${data.reason}`);
        this.testResults.push({ test: 'game_end', success: true });
      });
      
      client.on('game_end_rejected', (data) => {
        console.log(`❌ Game end rejected for ${playerId}: ${data.reason}`);
        this.testResults.push({ test: 'game_end', success: false, reason: data.reason });
      });
    });
  }
  
  async testForfeitWhenNotInGame() {
    console.log('\n🧪 Test 1: Forfeit when not in game');
    
    try {
      const client = await this.createClient('test1');
      
      // Try to forfeit before joining a game
      client.emit('forfeit_game', { reason: 'test' });
      
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      client.disconnect();
      console.log('✅ Test 1 completed');
      
    } catch (error) {
      console.error('❌ Test 1 failed:', error.message);
    }
  }
  
  async testInvalidGameEndRequest() {
    console.log('\n🧪 Test 2: Invalid game end request');
    
    try {
      const client = await this.createClient('test2');
      
      // Try invalid game end request
      client.emit('request_game_end', { 
        reason: 'invalid_reason'
      });
      
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      client.disconnect();
      console.log('✅ Test 2 completed');
      
    } catch (error) {
      console.error('❌ Test 2 failed:', error.message);
    }
  }
  
  async testValidGameEndRequest() {
    console.log('\n🧪 Test 3: Valid game end request (but not in game)');
    
    try {
      const client = await this.createClient('test3');
      
      // Try valid game end request
      client.emit('request_game_end', { 
        reason: 'technical_issue'
      });
      
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      client.disconnect();
      console.log('✅ Test 3 completed');
      
    } catch (error) {
      console.error('❌ Test 3 failed:', error.message);
    }
  }
  
  async runQuickTests() {
    console.log('🏁 Starting Quick Game End Tests...\n');
    
    const startTime = Date.now();
    
    try {
      await this.testForfeitWhenNotInGame();
      await this.testInvalidGameEndRequest();
      await this.testValidGameEndRequest();
      
      // Wait a moment for final responses
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error('💥 Test error:', error);
    }
    
    const duration = Date.now() - startTime;
    this.printResults(duration);
  }
  
  printResults(duration) {
    console.log('\n' + '='.repeat(50));
    console.log('🧪 QUICK GAME END TEST RESULTS');
    console.log('='.repeat(50));
    console.log(`⏱️ Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(`📊 Responses received: ${this.testResults.length}`);
    
    if (this.testResults.length > 0) {
      console.log('\n📋 Test Responses:');
      this.testResults.forEach((result, index) => {
        const status = result.success ? '✅' : '❌';
        const reason = result.reason ? ` (${result.reason})` : '';
        console.log(`${index + 1}. ${status} ${result.test}${reason}`);
      });
    } else {
      console.log('\n⚠️ No test responses received - events may not be working properly');
    }
    
    console.log('\n🏁 Quick tests completed!');
    console.log('='.repeat(50));
    
    setTimeout(() => process.exit(0), 500);
  }
}

// Run the tests
if (require.main === module) {
  const tester = new QuickGameEndTest();
  
  setTimeout(() => {
    tester.runQuickTests().catch(error => {
      console.error('💥 Test runner failed:', error);
      process.exit(1);
    });
  }, 500);
}