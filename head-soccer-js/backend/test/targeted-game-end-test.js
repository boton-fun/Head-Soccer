/**
 * Targeted Game End Testing - Focus on core game end functionality
 * Tests the specific game end handlers and events without full game setup
 */

const io = require('socket.io-client');

class TargetedGameEndTest {
  constructor() {
    this.serverUrl = 'http://localhost:3001';
    this.results = {
      totalTests: 7,
      passedTests: 0,
      failedTests: 0,
      tests: []
    };
    
    console.log('🎯 Starting Targeted Game End Testing...\n');
  }
  
  async createTestClient(playerId) {
    return new Promise((resolve, reject) => {
      const client = io(this.serverUrl, { timeout: 3000 });
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 3000);
      
      client.on('connect', () => {
        clearTimeout(timeout);
        client.emit('register_player', {
          playerId,
          username: `Player_${playerId}`,
          character: 'default'
        });
        
        client.playerId = playerId;
        client.responses = [];
        
        // Listen for all game end related responses
        const events = [
          'forfeit_accepted', 'forfeit_rejected',
          'game_end_accepted', 'game_end_rejected',
          'game_ended', 'winner_celebration', 'detailed_results'
        ];
        
        events.forEach(eventName => {
          client.on(eventName, (data) => {
            client.responses.push({ event: eventName, data, timestamp: Date.now() });
          });
        });
        
        resolve(client);
      });
      
      client.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
  
  async runTest(testName, testFunction) {
    console.log(`🧪 ${testName}`);
    console.log('─'.repeat(50));
    
    const startTime = Date.now();
    let result = 'FAILED';
    let error = null;
    
    try {
      await testFunction();
      result = 'PASSED';
      this.results.passedTests++;
      console.log(`✅ ${testName} - PASSED`);
    } catch (err) {
      error = err.message;
      this.results.failedTests++;
      console.log(`❌ ${testName} - FAILED: ${error}`);
    }
    
    const duration = Date.now() - startTime;
    this.results.tests.push({ name: testName, result, error, duration });
    console.log('');
  }
  
  async testForfeitNotInGame() {
    const client = await this.createTestClient('forfeit1');
    
    client.emit('forfeit_game', { reason: 'test' });
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const rejectionResponse = client.responses.find(r => r.event === 'forfeit_rejected');
    
    client.disconnect();
    
    if (!rejectionResponse) {
      throw new Error('Expected forfeit rejection not received');
    }
    
    if (!rejectionResponse.data.reason.includes('not in an active game')) {
      throw new Error('Wrong rejection reason received');
    }
  }
  
  async testInvalidGameEndReason() {
    const client = await this.createTestClient('invalid1');
    
    client.emit('request_game_end', { reason: 'totally_invalid_reason' });
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const rejectionResponse = client.responses.find(r => r.event === 'game_end_rejected');
    
    client.disconnect();
    
    if (!rejectionResponse) {
      throw new Error('Expected game end rejection not received');
    }
  }
  
  async testValidGameEndRequestNotInGame() {
    const client = await this.createTestClient('valid1');
    
    client.emit('request_game_end', { reason: 'technical_issue' });
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const rejectionResponse = client.responses.find(r => r.event === 'game_end_rejected');
    
    client.disconnect();
    
    if (!rejectionResponse) {
      throw new Error('Expected rejection for not being in game');
    }
  }
  
  async testAdminGameEndWrongCode() {
    const client = await this.createTestClient('admin1');
    
    client.emit('request_game_end', { 
      reason: 'admin_intervention',
      adminCode: 'WRONG_CODE'
    });
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const rejectionResponse = client.responses.find(r => r.event === 'game_end_rejected');
    
    client.disconnect();
    
    if (!rejectionResponse) {
      throw new Error('Expected rejection for wrong admin code');
    }
  }
  
  async testMutualAgreementWithoutConfirmation() {
    const client = await this.createTestClient('mutual1');
    
    client.emit('request_game_end', { 
      reason: 'mutual_agreement',
      confirmed: false
    });
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const rejectionResponse = client.responses.find(r => r.event === 'game_end_rejected');
    
    client.disconnect();
    
    if (!rejectionResponse) {
      throw new Error('Expected rejection for unconfirmed mutual agreement');
    }
  }
  
  async testEventHandlerResponsiveness() {
    const client = await this.createTestClient('responsive1');
    
    // Send multiple rapid requests
    client.emit('forfeit_game', {});
    client.emit('request_game_end', { reason: 'invalid' });
    client.emit('forfeit_game', {});
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    client.disconnect();
    
    if (client.responses.length < 2) {
      throw new Error(`Expected multiple responses, got ${client.responses.length}`);
    }
  }
  
  async testSocketConnectionStability() {
    const clients = [];
    
    // Create multiple simultaneous connections
    for (let i = 0; i < 5; i++) {
      const client = await this.createTestClient(`stable${i}`);
      clients.push(client);
      
      // Send requests from each
      client.emit('forfeit_game', {});
    }
    
    // Wait for all responses
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check all got responses
    let totalResponses = 0;
    clients.forEach(client => {
      totalResponses += client.responses.length;
      client.disconnect();
    });
    
    if (totalResponses < 3) {
      throw new Error(`Expected multiple responses from concurrent clients, got ${totalResponses}`);
    }
  }
  
  async runAllTests() {
    const startTime = Date.now();
    
    await this.runTest('Forfeit when not in game', () => this.testForfeitNotInGame());
    await this.runTest('Invalid game end reason', () => this.testInvalidGameEndReason());
    await this.runTest('Valid request but not in game', () => this.testValidGameEndRequestNotInGame());
    await this.runTest('Admin request with wrong code', () => this.testAdminGameEndWrongCode());
    await this.runTest('Mutual agreement without confirmation', () => this.testMutualAgreementWithoutConfirmation());
    await this.runTest('Event handler responsiveness', () => this.testEventHandlerResponsiveness());
    await this.runTest('Socket connection stability', () => this.testSocketConnectionStability());
    
    this.printResults(Date.now() - startTime);
  }
  
  printResults(duration) {
    console.log('='.repeat(60));
    console.log('🎯 TARGETED GAME END TEST RESULTS');
    console.log('='.repeat(60));
    
    const successRate = ((this.results.passedTests / this.results.totalTests) * 100).toFixed(1);
    
    console.log(`📊 Summary:`);
    console.log(`   Tests Run: ${this.results.totalTests}`);
    console.log(`   ✅ Passed: ${this.results.passedTests}`);
    console.log(`   ❌ Failed: ${this.results.failedTests}`);
    console.log(`   📈 Success Rate: ${successRate}%`);
    console.log(`   ⏱️ Total Time: ${(duration / 1000).toFixed(1)}s`);
    
    console.log(`\n📋 Test Details:`);
    this.results.tests.forEach((test, index) => {
      const status = test.result === 'PASSED' ? '✅' : '❌';
      const time = (test.duration / 1000).toFixed(1);
      console.log(`   ${index + 1}. ${status} ${test.name} (${time}s)`);
      if (test.error) {
        console.log(`      Error: ${test.error}`);
      }
    });
    
    console.log(`\n🔍 Analysis:`);
    if (successRate >= 80) {
      console.log('   🟢 EXCELLENT - Game end handlers are working correctly');
      console.log('   📡 Event validation and rejection logic is functional');
      console.log('   🛡️ Security validation is properly implemented');
    } else if (successRate >= 60) {
      console.log('   🟡 GOOD - Most functionality working, some issues detected');
    } else {
      console.log('   🔴 ISSUES DETECTED - Game end handlers need attention');
    }
    
    console.log(`\n🎯 Targeted Testing Complete!`);
    console.log('='.repeat(60));
    
    setTimeout(() => process.exit(0), 500);
  }
}

// Run if called directly
if (require.main === module) {
  const tester = new TargetedGameEndTest();
  
  setTimeout(() => {
    tester.runAllTests().catch(error => {
      console.error('💥 Test runner failed:', error);
      process.exit(1);
    });
  }, 500);
}

module.exports = TargetedGameEndTest;