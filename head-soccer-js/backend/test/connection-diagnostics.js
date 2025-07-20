/**
 * Connection Diagnostics
 * Detailed analysis of connection issues in production
 */

const io = require('socket.io-client');
const { performance } = require('perf_hooks');

class ConnectionDiagnostics {
  constructor() {
    this.serverUrl = 'https://head-soccer-production.up.railway.app';
    this.results = {
      connectionAttempts: 0,
      successfulConnections: 0,
      timeouts: 0,
      errors: [],
      timings: []
    };
  }

  async testSingleConnection(id) {
    console.log(`🔍 Testing connection ${id}...`);
    
    return new Promise((resolve) => {
      const startTime = performance.now();
      let connected = false;
      let welcomeReceived = false;
      
      const client = io(this.serverUrl, {
        transports: ['polling'],
        timeout: 15000,
        forceNew: true
      });

      const result = {
        id,
        connected: false,
        welcomeReceived: false,
        connectionTime: null,
        welcomeTime: null,
        error: null,
        transport: null
      };

      // Connection success
      client.on('connect', () => {
        connected = true;
        result.connected = true;
        result.connectionTime = performance.now() - startTime;
        result.transport = client.io.engine.transport.name;
        console.log(`   ✅ Connection ${id}: Connected in ${result.connectionTime.toFixed(2)}ms (${result.transport})`);
      });

      // Welcome message
      client.on('connected', (data) => {
        welcomeReceived = true;
        result.welcomeReceived = true;
        result.welcomeTime = performance.now() - startTime;
        console.log(`   📝 Connection ${id}: Welcome received in ${result.welcomeTime.toFixed(2)}ms`);
        
        // Disconnect after successful welcome
        setTimeout(() => {
          client.disconnect();
          resolve(result);
        }, 500);
      });

      // Connection errors
      client.on('connect_error', (error) => {
        result.error = `Connect error: ${error.message}`;
        console.log(`   ❌ Connection ${id}: ${result.error}`);
        client.disconnect();
        resolve(result);
      });

      // Disconnection
      client.on('disconnect', (reason) => {
        if (!result.welcomeReceived && connected) {
          result.error = `Disconnected before welcome: ${reason}`;
        }
      });

      // Timeout
      setTimeout(() => {
        if (!connected) {
          result.error = 'Connection timeout (15s)';
          console.log(`   ⏰ Connection ${id}: Timeout`);
        } else if (!welcomeReceived) {
          result.error = 'Welcome timeout (15s)';
          console.log(`   ⏰ Connection ${id}: Welcome timeout`);
        }
        
        client.disconnect();
        resolve(result);
      }, 15000);
    });
  }

  async runSerialTests(count = 10) {
    console.log(`\n🔍 Running ${count} serial connection tests...`);
    console.log('='.repeat(50));

    const results = [];
    
    for (let i = 1; i <= count; i++) {
      const result = await this.testSingleConnection(i);
      results.push(result);
      
      // Wait between connections
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  async runConcurrentTests(count = 5) {
    console.log(`\n🔍 Running ${count} concurrent connection tests...`);
    console.log('='.repeat(50));

    const promises = [];
    for (let i = 1; i <= count; i++) {
      promises.push(this.testSingleConnection(`C${i}`));
    }

    const results = await Promise.all(promises);
    return results;
  }

  async testServerHealth() {
    console.log('\n🔍 Testing server health...');
    console.log('='.repeat(50));

    try {
      // Health endpoint
      const healthStart = performance.now();
      const healthResponse = await fetch(`${this.serverUrl}/health`);
      const healthTime = performance.now() - healthStart;
      const healthData = await healthResponse.json();

      console.log(`✅ Health endpoint: ${healthTime.toFixed(2)}ms`);
      console.log(`   Status: ${healthData.status}`);
      console.log(`   Uptime: ${healthData.uptime.toFixed(2)}s`);
      console.log(`   Environment: ${healthData.environment}`);

      // WebSocket stats
      const statsStart = performance.now();
      const statsResponse = await fetch(`${this.serverUrl}/websocket/stats`);
      const statsTime = performance.now() - statsStart;
      const statsData = await statsResponse.json();

      console.log(`✅ Stats endpoint: ${statsTime.toFixed(2)}ms`);
      console.log(`   Active connections: ${statsData.connectionManager.activeConnections}`);
      console.log(`   Total connections: ${statsData.connectionManager.totalConnections}`);
      console.log(`   Events processed: ${statsData.socketHandler.eventsProcessed}`);
      console.log(`   Error rate: ${(statsData.socketHandler.errorRate * 100).toFixed(2)}%`);

      return {
        healthTime,
        statsTime,
        serverData: { healthData, statsData }
      };
    } catch (error) {
      console.log(`❌ Server health check failed: ${error.message}`);
      return { error: error.message };
    }
  }

  analyzeResults(results) {
    console.log('\n📊 CONNECTION ANALYSIS');
    console.log('='.repeat(50));

    const total = results.length;
    const successful = results.filter(r => r.connected).length;
    const welcomeReceived = results.filter(r => r.welcomeReceived).length;
    const timeouts = results.filter(r => r.error && r.error.includes('timeout')).length;
    const errors = results.filter(r => r.error).length;

    console.log(`Total attempts: ${total}`);
    console.log(`Successful connections: ${successful} (${(successful/total*100).toFixed(1)}%)`);
    console.log(`Welcome messages: ${welcomeReceived} (${(welcomeReceived/total*100).toFixed(1)}%)`);
    console.log(`Timeouts: ${timeouts} (${(timeouts/total*100).toFixed(1)}%)`);
    console.log(`Errors: ${errors} (${(errors/total*100).toFixed(1)}%)`);

    // Timing analysis
    const connectedResults = results.filter(r => r.connected && r.connectionTime);
    if (connectedResults.length > 0) {
      const connectionTimes = connectedResults.map(r => r.connectionTime);
      const avgConnection = connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length;
      const minConnection = Math.min(...connectionTimes);
      const maxConnection = Math.max(...connectionTimes);

      console.log(`\n⚡ CONNECTION TIMING:`);
      console.log(`   Average: ${avgConnection.toFixed(2)}ms`);
      console.log(`   Min: ${minConnection.toFixed(2)}ms`);
      console.log(`   Max: ${maxConnection.toFixed(2)}ms`);
    }

    const welcomeResults = results.filter(r => r.welcomeReceived && r.welcomeTime);
    if (welcomeResults.length > 0) {
      const welcomeTimes = welcomeResults.map(r => r.welcomeTime);
      const avgWelcome = welcomeTimes.reduce((a, b) => a + b, 0) / welcomeTimes.length;
      const minWelcome = Math.min(...welcomeTimes);
      const maxWelcome = Math.max(...welcomeTimes);

      console.log(`\n📝 WELCOME TIMING:`);
      console.log(`   Average: ${avgWelcome.toFixed(2)}ms`);
      console.log(`   Min: ${minWelcome.toFixed(2)}ms`);
      console.log(`   Max: ${maxWelcome.toFixed(2)}ms`);
    }

    // Error analysis
    const errorTypes = {};
    results.filter(r => r.error).forEach(r => {
      errorTypes[r.error] = (errorTypes[r.error] || 0) + 1;
    });

    if (Object.keys(errorTypes).length > 0) {
      console.log(`\n❌ ERROR BREAKDOWN:`);
      Object.entries(errorTypes).forEach(([error, count]) => {
        console.log(`   ${error}: ${count} times`);
      });
    }

    // Transport analysis
    const transports = {};
    results.filter(r => r.transport).forEach(r => {
      transports[r.transport] = (transports[r.transport] || 0) + 1;
    });

    if (Object.keys(transports).length > 0) {
      console.log(`\n🚀 TRANSPORT USAGE:`);
      Object.entries(transports).forEach(([transport, count]) => {
        console.log(`   ${transport}: ${count} connections`);
      });
    }

    return {
      successRate: successful / total,
      welcomeRate: welcomeReceived / total,
      errorRate: errors / total,
      avgConnectionTime: connectedResults.length > 0 ? 
        connectedResults.reduce((sum, r) => sum + r.connectionTime, 0) / connectedResults.length : null,
      avgWelcomeTime: welcomeResults.length > 0 ? 
        welcomeResults.reduce((sum, r) => sum + r.welcomeTime, 0) / welcomeResults.length : null
    };
  }

  async runDiagnostics() {
    console.log('🔍 CONNECTION MANAGER DIAGNOSTICS');
    console.log('🎯 Detailed Analysis of Production Connection Issues\n');

    // 1. Server health check
    const healthResults = await this.testServerHealth();

    // 2. Serial connection tests
    const serialResults = await this.runSerialTests(10);
    const serialAnalysis = this.analyzeResults(serialResults);

    // 3. Concurrent connection tests
    const concurrentResults = await this.runConcurrentTests(5);
    const concurrentAnalysis = this.analyzeResults(concurrentResults);

    // 4. Generate recommendations
    console.log('\n🎯 DIAGNOSTIC SUMMARY & RECOMMENDATIONS');
    console.log('='.repeat(50));

    console.log(`📈 SERIAL PERFORMANCE:`);
    console.log(`   Success Rate: ${(serialAnalysis.successRate * 100).toFixed(1)}%`);
    console.log(`   Welcome Rate: ${(serialAnalysis.welcomeRate * 100).toFixed(1)}%`);
    if (serialAnalysis.avgConnectionTime) {
      console.log(`   Avg Connection Time: ${serialAnalysis.avgConnectionTime.toFixed(2)}ms`);
    }

    console.log(`\n📈 CONCURRENT PERFORMANCE:`);
    console.log(`   Success Rate: ${(concurrentAnalysis.successRate * 100).toFixed(1)}%`);
    console.log(`   Welcome Rate: ${(concurrentAnalysis.welcomeRate * 100).toFixed(1)}%`);

    console.log(`\n💡 RECOMMENDATIONS:`);
    
    if (serialAnalysis.successRate < 0.9) {
      console.log(`   ⚠️ Low success rate (${(serialAnalysis.successRate * 100).toFixed(1)}%) - Server may be overloaded`);
    }
    
    if (serialAnalysis.avgConnectionTime && serialAnalysis.avgConnectionTime > 1000) {
      console.log(`   ⚠️ Slow connections (${serialAnalysis.avgConnectionTime.toFixed(2)}ms) - Optimize connection handling`);
    }
    
    if (concurrentAnalysis.successRate < serialAnalysis.successRate - 0.1) {
      console.log(`   ⚠️ Concurrent performance degradation - Connection pool limits`);
    }
    
    if (serialAnalysis.successRate > 0.8) {
      console.log(`   ✅ Connection Manager core functionality is working`);
    }
    
    if (healthResults.serverData) {
      console.log(`   ✅ Server health endpoints responsive`);
    }

    console.log(`\n🎯 PRODUCTION READINESS:`);
    const overallScore = (serialAnalysis.successRate + serialAnalysis.welcomeRate) / 2;
    
    if (overallScore >= 0.95) {
      console.log(`   🎉 EXCELLENT (${(overallScore * 100).toFixed(1)}%) - Production ready`);
    } else if (overallScore >= 0.85) {
      console.log(`   ✅ GOOD (${(overallScore * 100).toFixed(1)}%) - Minor optimizations needed`);
    } else if (overallScore >= 0.7) {
      console.log(`   ⚠️ ACCEPTABLE (${(overallScore * 100).toFixed(1)}%) - Needs improvement`);
    } else {
      console.log(`   ❌ NEEDS WORK (${(overallScore * 100).toFixed(1)}%) - Significant issues`);
    }

    return {
      serial: serialAnalysis,
      concurrent: concurrentAnalysis,
      health: healthResults,
      overallScore
    };
  }
}

// Run diagnostics if called directly
if (require.main === module) {
  const diagnostics = new ConnectionDiagnostics();
  
  diagnostics.runDiagnostics().then((results) => {
    const exitCode = results.overallScore >= 0.8 ? 0 : 1;
    process.exit(exitCode);
  }).catch((error) => {
    console.error('❌ Diagnostics error:', error);
    process.exit(1);
  });
}

module.exports = ConnectionDiagnostics;