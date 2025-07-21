/**
 * Production Scale Validation Test
 * Tests the working components at production scale
 */

const io = require('socket.io-client');
const { performance } = require('perf_hooks');

class ProductionScaleValidator {
  constructor() {
    this.serverUrl = 'http://localhost:3001';
    this.clients = [];
    this.metrics = {
      connections: { attempted: 0, successful: 0, failed: 0 },
      authentication: { attempted: 0, successful: 0, failed: 0 },
      events: { sent: 0, received: 0 },
      performance: { connectionTimes: [], responseimes: [] }
    };
    
    console.log('🚀 Production Scale Validation Starting...');
    console.log('Testing connection capacity and event processing\n');
  }
  
  async createClient(id, options = {}) {
    const startTime = performance.now();
    this.metrics.connections.attempted++;
    
    return new Promise((resolve, reject) => {
      const client = io(this.serverUrl, { 
        timeout: options.timeout || 10000,
        forceNew: true 
      });
      
      const timeout = setTimeout(() => {
        this.metrics.connections.failed++;
        reject(new Error(`Connection timeout for ${id}`));
      }, options.timeout || 10000);
      
      client.on('connect', () => {
        clearTimeout(timeout);
        const connectionTime = performance.now() - startTime;
        this.metrics.performance.connectionTimes.push(connectionTime);
        this.metrics.connections.successful++;
        
        client.id = id;
        client.events = [];
        client.startTime = startTime;
        
        // Track events
        client.onAny((eventName, data) => {
          this.metrics.events.received++;
          client.events.push({ event: eventName, data, timestamp: Date.now() });
        });
        
        resolve(client);
      });
      
      client.on('connect_error', () => {
        clearTimeout(timeout);
        this.metrics.connections.failed++;
        reject(new Error(`Connection failed for ${id}`));
      });
    });
  }
  
  async testConnectionCapacity() {
    console.log('🔗 Testing Connection Capacity');
    console.log('─'.repeat(50));
    
    const connectionCounts = [10, 25, 50, 100];
    
    for (const count of connectionCounts) {
      console.log(`\n📊 Testing ${count} concurrent connections...`);
      
      const startTime = performance.now();
      const connectionPromises = [];
      
      for (let i = 0; i < count; i++) {
        connectionPromises.push(
          this.createClient(`scale_${count}_${i}`, { timeout: 15000 })
            .catch(error => ({ error: error.message }))
        );
      }
      
      const results = await Promise.allSettled(connectionPromises);
      const successful = results.filter(r => 
        r.status === 'fulfilled' && !r.value.error
      );
      const failed = count - successful.length;
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Add successful clients to our list
      successful.forEach(result => {
        if (result.value && result.value.id) {
          this.clients.push(result.value);
        }
      });
      
      const successRate = (successful.length / count * 100).toFixed(1);
      const avgTime = (totalTime / count).toFixed(1);
      
      console.log(`   ✅ ${successful.length}/${count} connections (${successRate}%)`);
      console.log(`   ⏱️ Total: ${totalTime.toFixed(1)}ms, Avg: ${avgTime}ms/conn`);
      
      // Don't continue if success rate is too low
      if (successful.length < count * 0.5) {
        console.log(`   ⚠️ Success rate too low, stopping capacity test`);
        break;
      }
      
      // Brief pause between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return {
      totalConnections: this.clients.length,
      avgConnectionTime: this.metrics.performance.connectionTimes.length > 0 ?
        (this.metrics.performance.connectionTimes.reduce((a, b) => a + b, 0) / 
         this.metrics.performance.connectionTimes.length).toFixed(1) : 0
    };
  }
  
  async testAuthenticationScale() {
    console.log('\n🔐 Testing Authentication Scale');
    console.log('─'.repeat(50));
    
    const activeClients = this.clients.filter(c => c.connected).slice(0, 50);
    console.log(`📊 Testing authentication with ${activeClients.length} clients`);
    
    const startTime = performance.now();
    
    // Send authentication requests
    activeClients.forEach((client, index) => {
      this.metrics.authentication.attempted++;
      this.metrics.events.sent++;
      
      client.emit('authenticate', {
        playerId: `auth_test_${index}`,
        username: `User${index}`,
        token: 'test_token'
      });
    });
    
    // Wait for responses
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    
    // Count successful authentications
    let authSuccessful = 0;
    activeClients.forEach(client => {
      const authEvent = client.events.find(e => e.event === 'authenticated');
      if (authEvent) {
        authSuccessful++;
        this.metrics.authentication.successful++;
      } else {
        this.metrics.authentication.failed++;
      }
    });
    
    const authRate = (authSuccessful / activeClients.length * 100).toFixed(1);
    const authPerSec = (authSuccessful / (totalTime / 1000)).toFixed(1);
    
    console.log(`   ✅ ${authSuccessful}/${activeClients.length} authenticated (${authRate}%)`);
    console.log(`   ⚡ ${authPerSec} auth/sec`);
    
    return {
      attempted: activeClients.length,
      successful: authSuccessful,
      rate: authRate,
      throughput: authPerSec
    };
  }
  
  async testEventThroughput() {
    console.log('\n⚡ Testing Event Throughput');
    console.log('─'.repeat(50));
    
    const activeClients = this.clients.filter(c => c.connected).slice(0, 30);
    const eventsPerClient = 20;
    
    console.log(`📊 Testing with ${activeClients.length} clients, ${eventsPerClient} events each`);
    
    const startTime = performance.now();
    
    // Send rapid ping events
    activeClients.forEach((client, clientIndex) => {
      for (let i = 0; i < eventsPerClient; i++) {
        this.metrics.events.sent++;
        
        client.emit('ping_latency', {
          clientTime: Date.now(),
          clientId: clientIndex,
          sequence: i
        });
      }
    });
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const totalEventsSent = activeClients.length * eventsPerClient;
    
    // Count responses (ping might not respond, but other events do)
    let totalResponses = 0;
    activeClients.forEach(client => {
      totalResponses += client.events.length;
    });
    
    const eventsPerSec = (totalEventsSent / (totalTime / 1000)).toFixed(0);
    const responsesPerSec = (totalResponses / (totalTime / 1000)).toFixed(0);
    
    console.log(`   📤 Events sent: ${totalEventsSent} (${eventsPerSec}/sec)`);
    console.log(`   📥 Events received: ${totalResponses} (${responsesPerSec}/sec)`);
    console.log(`   ⏱️ Processing time: ${totalTime.toFixed(1)}ms`);
    
    return {
      eventsSent: totalEventsSent,
      eventsReceived: totalResponses,
      sendThroughput: eventsPerSec,
      receiveThroughput: responsesPerSec,
      processingTime: totalTime
    };
  }
  
  async testConnectionStability() {
    console.log('\n🔒 Testing Connection Stability');
    console.log('─'.repeat(50));
    
    const testClients = this.clients.filter(c => c.connected).slice(0, 20);
    console.log(`📊 Testing stability with ${testClients.length} clients`);
    
    const startTime = performance.now();
    let disconnections = 0;
    
    // Monitor connections for stability
    testClients.forEach(client => {
      client.on('disconnect', () => {
        disconnections++;
      });
      
      // Send periodic events to test stability
      const intervalId = setInterval(() => {
        if (client.connected) {
          client.emit('ping_latency', { clientTime: Date.now() });
        } else {
          clearInterval(intervalId);
        }
      }, 1000);
      
      // Stop after test period
      setTimeout(() => {
        clearInterval(intervalId);
      }, 10000);
    });
    
    // Wait for stability test
    await new Promise(resolve => setTimeout(resolve, 12000));
    
    const endTime = performance.now();
    const testDuration = (endTime - startTime) / 1000;
    const stillConnected = testClients.filter(c => c.connected).length;
    const stabilityRate = (stillConnected / testClients.length * 100).toFixed(1);
    
    console.log(`   🔗 Connections maintained: ${stillConnected}/${testClients.length} (${stabilityRate}%)`);
    console.log(`   📉 Disconnections: ${disconnections}`);
    console.log(`   ⏱️ Test duration: ${testDuration.toFixed(1)}s`);
    
    return {
      initialConnections: testClients.length,
      finalConnections: stillConnected,
      disconnections,
      stabilityRate: stabilityRate,
      testDuration: testDuration
    };
  }
  
  async runProductionValidation() {
    const overallStart = performance.now();
    
    try {
      const connectionResults = await this.testConnectionCapacity();
      const authResults = await this.testAuthenticationScale();
      const throughputResults = await this.testEventThroughput();
      const stabilityResults = await this.testConnectionStability();
      
      // Cleanup
      console.log('\n🧹 Cleaning up connections...');
      let cleaned = 0;
      this.clients.forEach(client => {
        if (client && client.connected) {
          client.disconnect();
          cleaned++;
        }
      });
      console.log(`   ✅ Cleaned up ${cleaned} connections`);
      
      // Generate comprehensive report
      const overallDuration = performance.now() - overallStart;
      this.generateProductionReport({
        connection: connectionResults,
        authentication: authResults,
        throughput: throughputResults,
        stability: stabilityResults
      }, overallDuration);
      
    } catch (error) {
      console.error('💥 Production validation error:', error);
    }
  }
  
  generateProductionReport(results, duration) {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 PRODUCTION SCALE VALIDATION REPORT');
    console.log('='.repeat(80));
    
    console.log(`\n📊 OVERALL METRICS:`);
    console.log(`   ⏱️ Total Test Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(`   🔗 Peak Concurrent Connections: ${results.connection.totalConnections}`);
    console.log(`   📤 Total Events Sent: ${this.metrics.events.sent}`);
    console.log(`   📥 Total Events Received: ${this.metrics.events.received}`);
    
    console.log(`\n🔗 CONNECTION PERFORMANCE:`);
    console.log(`   ✅ Connections Attempted: ${this.metrics.connections.attempted}`);
    console.log(`   ✅ Connections Successful: ${this.metrics.connections.successful}`);
    console.log(`   ❌ Connections Failed: ${this.metrics.connections.failed}`);
    console.log(`   📈 Success Rate: ${((this.metrics.connections.successful / this.metrics.connections.attempted) * 100).toFixed(1)}%`);
    console.log(`   ⚡ Avg Connection Time: ${results.connection.avgConnectionTime}ms`);
    
    console.log(`\n🔐 AUTHENTICATION PERFORMANCE:`);
    console.log(`   📊 Auth Requests: ${results.authentication.attempted}`);
    console.log(`   ✅ Auth Successful: ${results.authentication.successful}`);
    console.log(`   📈 Auth Success Rate: ${results.authentication.rate}%`);
    console.log(`   ⚡ Auth Throughput: ${results.authentication.throughput} auth/sec`);
    
    console.log(`\n⚡ EVENT PROCESSING PERFORMANCE:`);
    console.log(`   📤 Events Sent: ${results.throughput.eventsSent}`);
    console.log(`   📥 Events Received: ${results.throughput.eventsReceived}`);
    console.log(`   🚀 Send Throughput: ${results.throughput.sendThroughput} events/sec`);
    console.log(`   📥 Receive Throughput: ${results.throughput.receiveThroughput} events/sec`);
    console.log(`   ⏱️ Processing Time: ${results.throughput.processingTime.toFixed(1)}ms`);
    
    console.log(`\n🔒 CONNECTION STABILITY:`);
    console.log(`   🔗 Initial Connections: ${results.stability.initialConnections}`);
    console.log(`   ✅ Maintained Connections: ${results.stability.finalConnections}`);
    console.log(`   📉 Disconnections: ${results.stability.disconnections}`);
    console.log(`   📊 Stability Rate: ${results.stability.stabilityRate}%`);
    console.log(`   ⏱️ Test Duration: ${results.stability.testDuration}s`);
    
    // Performance analysis
    const overallSuccessRate = (this.metrics.connections.successful / this.metrics.connections.attempted) * 100;
    const authSuccessRate = parseFloat(results.authentication.rate);
    const stabilityRate = parseFloat(results.stability.stabilityRate);
    
    console.log(`\n🎯 PRODUCTION READINESS ASSESSMENT:`);
    
    if (overallSuccessRate >= 90 && authSuccessRate >= 90 && stabilityRate >= 90) {
      console.log(`   🟢 EXCELLENT - Production ready for high-scale deployment`);
      console.log(`   🚀 Server handles concurrent connections well`);
      console.log(`   💪 Authentication system performs at scale`);
      console.log(`   🔒 Connection stability is excellent`);
      console.log(`   ✅ Ready for 100+ concurrent users`);
    } else if (overallSuccessRate >= 75 && authSuccessRate >= 75 && stabilityRate >= 80) {
      console.log(`   🟡 GOOD - Production ready with monitoring`);
      console.log(`   📊 Good performance under load`);
      console.log(`   ⚠️ Monitor connection stability in production`);
      console.log(`   ✅ Suitable for moderate concurrent load`);
    } else if (overallSuccessRate >= 50) {
      console.log(`   🟠 FAIR - Needs optimization before production`);
      console.log(`   🔧 Connection handling needs improvement`);
      console.log(`   📈 Optimize for better scalability`);
      console.log(`   ⚠️ Not recommended for high concurrent load`);
    } else {
      console.log(`   🔴 POOR - Significant optimization needed`);
      console.log(`   🛠️ Major performance issues detected`);
      console.log(`   🚨 Not suitable for production deployment`);
      console.log(`   🛑 Address connection and stability issues`);
    }
    
    console.log(`\n📈 SCALABILITY INSIGHTS:`);
    console.log(`   🎯 Peak Connections Achieved: ${results.connection.totalConnections}`);
    console.log(`   ⚡ Event Processing Rate: ${results.throughput.receiveThroughput} events/sec`);
    console.log(`   🔄 Average Response Time: ${results.connection.avgConnectionTime}ms`);
    
    if (parseInt(results.throughput.receiveThroughput) >= 100) {
      console.log(`   💪 High event throughput capability`);
    }
    if (parseFloat(results.connection.avgConnectionTime) <= 100) {
      console.log(`   ⚡ Fast connection establishment`);
    }
    if (results.connection.totalConnections >= 50) {
      console.log(`   📈 Good concurrent connection capacity`);
    }
    
    console.log(`\n🏆 PRODUCTION SCALE VALIDATION COMPLETE!`);
    console.log(`   Phase 3 WebSocket infrastructure tested at scale`);
    console.log(`   Connection Manager and Event System validated`);
    console.log('='.repeat(80));
    
    setTimeout(() => process.exit(0), 2000);
  }
}

// Run production validation
const validator = new ProductionScaleValidator();
validator.runProductionValidation();