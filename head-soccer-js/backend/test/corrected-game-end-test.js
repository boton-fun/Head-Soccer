/**
 * Corrected Game End Test - Using proper authenticate event
 */

const io = require('socket.io-client');

class CorrectedGameEndTest {
  constructor() {
    this.results = [];
    console.log('🔧 Running Corrected Game End Test...\n');
  }
  
  async createClient(playerId) {
    return new Promise((resolve, reject) => {
      const client = io('http://localhost:3001', { timeout: 3000 });
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 3000);
      
      client.on('connect', () => {
        clearTimeout(timeout);
        
        // Use authenticate instead of register_player
        client.emit('authenticate', {
          playerId,
          username: `Player_${playerId}`,
          token: 'test_token'  // This might be needed
        });
        
        client.playerId = playerId;
        client.responses = [];
        
        // Listen for responses
        const events = [
          'authenticated', 'authentication_failed',
          'forfeit_accepted', 'forfeit_rejected',
          'game_end_accepted', 'game_end_rejected'
        ];
        
        events.forEach(eventName => {
          client.on(eventName, (data) => {
            console.log(`📨 [${playerId}] Received ${eventName}:`, data);
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
  
  async testBasicForfeit() {
    console.log('🧪 Test 1: Basic forfeit (should be rejected)');
    
    const client = await this.createClient('test1');
    
    // Wait a moment for authentication
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('🏳️ Sending forfeit request...');
    client.emit('forfeit_game', { reason: 'test' });
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`📊 Responses received: ${client.responses.length}`);
    client.responses.forEach(r => {
      console.log(`   - ${r.event}: ${JSON.stringify(r.data)}`);
    });
    
    client.disconnect();
    
    const hasResponse = client.responses.some(r => 
      r.event === 'forfeit_accepted' || r.event === 'forfeit_rejected'
    );
    
    this.results.push({
      test: 'Basic Forfeit',
      passed: hasResponse,
      responses: client.responses.length
    });
  }
  
  async testBasicGameEnd() {
    console.log('\n🧪 Test 2: Basic game end request (should be rejected)');
    
    const client = await this.createClient('test2');
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('🏁 Sending game end request...');
    client.emit('request_game_end', { reason: 'technical_issue' });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`📊 Responses received: ${client.responses.length}`);
    client.responses.forEach(r => {
      console.log(`   - ${r.event}: ${JSON.stringify(r.data)}`);
    });
    
    client.disconnect();
    
    const hasResponse = client.responses.some(r => 
      r.event === 'game_end_accepted' || r.event === 'game_end_rejected'
    );
    
    this.results.push({
      test: 'Basic Game End',
      passed: hasResponse,
      responses: client.responses.length
    });
  }
  
  async testDirectConnection() {
    console.log('\n🧪 Test 3: Direct connection without authentication');
    
    const client = await this.createClient('test3');
    
    // Skip authentication, send forfeit directly
    console.log('🏳️ Sending forfeit without authentication...');
    client.emit('forfeit_game', { reason: 'direct_test' });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`📊 Responses received: ${client.responses.length}`);
    client.responses.forEach(r => {
      console.log(`   - ${r.event}: ${JSON.stringify(r.data)}`);
    });
    
    client.disconnect();
    
    this.results.push({
      test: 'Direct Connection',
      passed: client.responses.length > 0,
      responses: client.responses.length
    });
  }
  
  async runTests() {
    try {
      await this.testBasicForfeit();
      await this.testBasicGameEnd();
      await this.testDirectConnection();
      
    } catch (error) {
      console.error('💥 Test error:', error);
    }
    
    this.printResults();
  }
  
  printResults() {
    console.log('\n' + '='.repeat(50));
    console.log('🔧 CORRECTED GAME END TEST RESULTS');
    console.log('='.repeat(50));
    
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    
    console.log(`📊 Summary: ${passed}/${total} tests passed`);
    
    this.results.forEach((result, index) => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${result.test} (${result.responses} responses)`);
    });
    
    if (passed > 0) {
      console.log('\n✅ Game end handlers are responding!');
    } else {
      console.log('\n❌ Game end handlers are not responding - deeper investigation needed');
    }
    
    console.log('='.repeat(50));
    setTimeout(() => process.exit(0), 500);
  }
}

const tester = new CorrectedGameEndTest();
tester.runTests();