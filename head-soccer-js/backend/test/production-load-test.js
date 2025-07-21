/**
 * Production-Level Load Testing Suite
 * Tests authentication API under heavy load and concurrent usage
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

const PRODUCTION_URL = 'https://head-soccer-production.up.railway.app';
const API_BASE = `${PRODUCTION_URL}/api/auth`;

class ProductionLoadTester {
    constructor() {
        this.results = {
            totalTests: 0,
            passed: 0,
            failed: 0,
            errors: [],
            performance: {
                averageResponseTime: 0,
                maxResponseTime: 0,
                minResponseTime: Infinity,
                responseTimes: []
            },
            rateLimiting: {
                rateLimited: 0,
                successful: 0,
                total: 0
            }
        };
        console.log('🚀 Production Load Testing Suite');
        console.log('Target:', PRODUCTION_URL);
        console.log('='.repeat(80));
    }

    async makeRequest(method, endpoint, data = null, expectStatus = 200) {
        const startTime = performance.now();
        try {
            const response = await axios({
                method,
                url: `${API_BASE}${endpoint}`,
                data,
                timeout: 30000,
                validateStatus: () => true // Don't throw on non-2xx status
            });

            const endTime = performance.now();
            const responseTime = endTime - startTime;
            
            this.results.performance.responseTimes.push(responseTime);
            this.results.performance.maxResponseTime = Math.max(this.results.performance.maxResponseTime, responseTime);
            this.results.performance.minResponseTime = Math.min(this.results.performance.minResponseTime, responseTime);

            // Track rate limiting
            if (response.status === 429) {
                this.results.rateLimiting.rateLimited++;
            } else if (response.status >= 200 && response.status < 300) {
                this.results.rateLimiting.successful++;
            }
            this.results.rateLimiting.total++;

            return {
                status: response.status,
                data: response.data,
                responseTime,
                headers: response.headers
            };
        } catch (error) {
            const endTime = performance.now();
            const responseTime = endTime - startTime;
            
            this.results.errors.push({
                error: error.message,
                endpoint,
                responseTime
            });
            
            return {
                status: error.response?.status || 0,
                data: error.response?.data || { error: error.message },
                responseTime,
                error: true
            };
        }
    }

    async testConcurrentRegistrations(concurrency = 10) {
        console.log(`\n🔄 Testing ${concurrency} concurrent registrations...`);
        
        const promises = [];
        const startTime = performance.now();

        for (let i = 0; i < concurrency; i++) {
            const userData = {
                username: `loadtest_${Date.now()}_${i}`,
                password: 'LoadTest123!',
                display_name: `Load Test User ${i}`
            };

            promises.push(this.makeRequest('POST', '/register', userData, 201));
        }

        const results = await Promise.all(promises);
        const endTime = performance.now();
        const totalTime = endTime - startTime;

        const successful = results.filter(r => r.status === 201).length;
        const rateLimited = results.filter(r => r.status === 429).length;
        const errors = results.filter(r => r.error || (r.status !== 201 && r.status !== 429)).length;

        console.log(`   ✅ Successful: ${successful}/${concurrency} (${(successful/concurrency*100).toFixed(1)}%)`);
        console.log(`   🚫 Rate Limited: ${rateLimited}/${concurrency} (${(rateLimited/concurrency*100).toFixed(1)}%)`);
        console.log(`   ❌ Errors: ${errors}/${concurrency} (${(errors/concurrency*100).toFixed(1)}%)`);
        console.log(`   ⏱️  Total Time: ${totalTime.toFixed(0)}ms`);
        console.log(`   ⚡ Avg Response: ${(totalTime/concurrency).toFixed(0)}ms per request`);

        this.results.totalTests += concurrency;
        this.results.passed += successful;
        this.results.failed += (rateLimited + errors);

        return {
            concurrency,
            successful,
            rateLimited,
            errors,
            totalTime,
            avgResponseTime: totalTime / concurrency
        };
    }

    async testUsernameCheckPerformance(requestCount = 50) {
        console.log(`\n🔍 Testing ${requestCount} username availability checks...`);
        
        const promises = [];
        const startTime = performance.now();

        for (let i = 0; i < requestCount; i++) {
            const username = `perftest_${Date.now()}_${i}`;
            promises.push(this.makeRequest('POST', '/check-username', { username }));
        }

        const results = await Promise.all(promises);
        const endTime = performance.now();
        const totalTime = endTime - startTime;

        const successful = results.filter(r => r.status === 200).length;
        const rateLimited = results.filter(r => r.status === 429).length;
        const avgResponseTime = results
            .filter(r => r.status === 200)
            .reduce((sum, r) => sum + r.responseTime, 0) / successful;

        console.log(`   ✅ Successful: ${successful}/${requestCount} (${(successful/requestCount*100).toFixed(1)}%)`);
        console.log(`   🚫 Rate Limited: ${rateLimited}/${requestCount} (${(rateLimited/requestCount*100).toFixed(1)}%)`);
        console.log(`   ⏱️  Total Time: ${totalTime.toFixed(0)}ms`);
        console.log(`   ⚡ Avg Response: ${avgResponseTime.toFixed(0)}ms per request`);

        this.results.totalTests += requestCount;
        this.results.passed += successful;
        this.results.failed += rateLimited;

        return {
            requestCount,
            successful,
            rateLimited,
            avgResponseTime,
            totalTime
        };
    }

    async testRateLimitingBehavior() {
        console.log(`\n🛡️  Testing rate limiting behavior...`);
        
        const maxRequests = 20;
        const results = [];
        let consecutiveRateLimited = 0;

        console.log(`   Sending ${maxRequests} rapid requests to trigger rate limiting...`);

        for (let i = 0; i < maxRequests; i++) {
            const result = await this.makeRequest('POST', '/check-username', {
                username: `ratetest_${Date.now()}_${i}`
            });

            results.push(result);
            
            if (result.status === 429) {
                consecutiveRateLimited++;
                if (consecutiveRateLimited === 1) {
                    console.log(`   🚫 Rate limiting triggered at request ${i + 1}`);
                }
            } else {
                consecutiveRateLimited = 0;
            }

            // Small delay to see rate limiting pattern
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const successful = results.filter(r => r.status === 200).length;
        const rateLimited = results.filter(r => r.status === 429).length;

        console.log(`   ✅ Successful: ${successful}/${maxRequests} (${(successful/maxRequests*100).toFixed(1)}%)`);
        console.log(`   🚫 Rate Limited: ${rateLimited}/${maxRequests} (${(rateLimited/maxRequests*100).toFixed(1)}%)`);

        // Test rate limit recovery
        console.log(`   ⏳ Waiting for rate limit reset...`);
        await new Promise(resolve => setTimeout(resolve, 5000));

        const recoveryTest = await this.makeRequest('POST', '/check-username', {
            username: `recovery_${Date.now()}`
        });

        const recovered = recoveryTest.status === 200;
        console.log(`   🔄 Rate limit recovery: ${recovered ? 'SUCCESS' : 'FAILED'}`);

        return {
            maxRequests,
            successful,
            rateLimited,
            recovered,
            rateLimitTriggeredAt: maxRequests - successful - rateLimited
        };
    }

    async testDatabasePerformanceUnderLoad() {
        console.log(`\n💾 Testing database performance under load...`);
        
        // Test mixed operations: registrations and username checks
        const operations = [];
        const startTime = performance.now();

        // Create 15 registration operations
        for (let i = 0; i < 15; i++) {
            operations.push({
                type: 'registration',
                promise: this.makeRequest('POST', '/register', {
                    username: `dbtest_${Date.now()}_${i}`,
                    password: 'DBTest123!',
                    display_name: `DB Test ${i}`
                })
            });
        }

        // Create 35 username check operations
        for (let i = 0; i < 35; i++) {
            operations.push({
                type: 'username_check',
                promise: this.makeRequest('POST', '/check-username', {
                    username: `check_${Date.now()}_${i}`
                })
            });
        }

        // Shuffle operations to simulate real usage
        for (let i = operations.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [operations[i], operations[j]] = [operations[j], operations[i]];
        }

        const results = await Promise.all(operations.map(op => op.promise));
        const endTime = performance.now();
        const totalTime = endTime - startTime;

        const successful = results.filter(r => r.status >= 200 && r.status < 300).length;
        const avgDbResponseTime = results
            .filter(r => r.status >= 200 && r.status < 300)
            .reduce((sum, r) => sum + r.responseTime, 0) / successful;

        console.log(`   📊 Mixed Operations: ${operations.length} total`);
        console.log(`   ✅ Successful: ${successful}/${operations.length} (${(successful/operations.length*100).toFixed(1)}%)`);
        console.log(`   ⏱️  Total Time: ${totalTime.toFixed(0)}ms`);
        console.log(`   💾 Avg DB Response: ${avgDbResponseTime.toFixed(0)}ms`);

        return {
            totalOperations: operations.length,
            successful,
            avgDbResponseTime,
            totalTime
        };
    }

    async testErrorHandlingUnderLoad() {
        console.log(`\n❌ Testing error handling under load...`);
        
        const errorTests = [
            // Invalid usernames
            { username: 'a', password: 'ValidPass123!', expectedError: 'validation' },
            { username: 'toolongusernamethatexceedsthe20charlimit', password: 'ValidPass123!', expectedError: 'validation' },
            { username: 'invalid@user', password: 'ValidPass123!', expectedError: 'validation' },
            // Invalid passwords  
            { username: 'validuser1', password: 'short', expectedError: 'validation' },
            { username: 'validuser2', password: '', expectedError: 'validation' },
            // Missing fields
            { password: 'ValidPass123!', expectedError: 'validation' },
            { username: 'validuser3', expectedError: 'validation' }
        ];

        const promises = errorTests.map((testCase, index) => 
            this.makeRequest('POST', '/register', testCase)
        );

        const results = await Promise.all(promises);
        
        const properlyHandled = results.filter(r => 
            r.status === 400 && 
            r.data && 
            (r.data.error || r.data.details)
        ).length;

        console.log(`   📊 Error Test Cases: ${errorTests.length}`);
        console.log(`   ✅ Properly Handled: ${properlyHandled}/${errorTests.length} (${(properlyHandled/errorTests.length*100).toFixed(1)}%)`);

        return {
            testCases: errorTests.length,
            properlyHandled,
            successRate: (properlyHandled / errorTests.length) * 100
        };
    }

    generatePerformanceMetrics() {
        if (this.results.performance.responseTimes.length === 0) return null;

        const times = this.results.performance.responseTimes.sort((a, b) => a - b);
        const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
        const p50 = times[Math.floor(times.length * 0.5)];
        const p95 = times[Math.floor(times.length * 0.95)];
        const p99 = times[Math.floor(times.length * 0.99)];

        return {
            totalRequests: times.length,
            averageResponseTime: avg,
            medianResponseTime: p50,
            p95ResponseTime: p95,
            p99ResponseTime: p99,
            minResponseTime: this.results.performance.minResponseTime,
            maxResponseTime: this.results.performance.maxResponseTime
        };
    }

    async runFullProductionLoadTest() {
        console.log('🎯 PRODUCTION LOAD TESTING SUITE');
        console.log('Target Environment: PRODUCTION');
        console.log('🚀 Starting comprehensive load tests...\n');

        const testResults = {};

        try {
            // Test 1: Concurrent Registrations
            testResults.concurrentRegistrations = await this.testConcurrentRegistrations(10);
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Test 2: Username Check Performance
            testResults.usernameCheckPerformance = await this.testUsernameCheckPerformance(30);
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Test 3: Rate Limiting Behavior
            testResults.rateLimitingBehavior = await this.testRateLimitingBehavior();
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Test 4: Database Performance Under Load
            testResults.databasePerformance = await this.testDatabasePerformanceUnderLoad();
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Test 5: Error Handling Under Load
            testResults.errorHandling = await this.testErrorHandlingUnderLoad();

        } catch (error) {
            console.error('❌ Test suite error:', error.message);
            this.results.errors.push({ error: error.message, test: 'suite' });
        }

        // Generate final report
        this.generateFinalReport(testResults);
        
        return testResults;
    }

    generateFinalReport(testResults) {
        const performanceMetrics = this.generatePerformanceMetrics();
        
        console.log('\n' + '='.repeat(80));
        console.log('🏆 PRODUCTION LOAD TEST RESULTS');
        console.log('='.repeat(80));

        // Overall Statistics
        console.log('\n📊 OVERALL STATISTICS:');
        console.log(`   🎯 Total Tests: ${this.results.totalTests}`);
        console.log(`   ✅ Passed: ${this.results.passed} (${(this.results.passed/this.results.totalTests*100).toFixed(1)}%)`);
        console.log(`   ❌ Failed: ${this.results.failed} (${(this.results.failed/this.results.totalTests*100).toFixed(1)}%)`);
        console.log(`   🛑 Errors: ${this.results.errors.length}`);

        // Rate Limiting Statistics
        console.log('\n🛡️ RATE LIMITING STATISTICS:');
        console.log(`   📡 Total Requests: ${this.results.rateLimiting.total}`);
        console.log(`   ✅ Successful: ${this.results.rateLimiting.successful} (${(this.results.rateLimiting.successful/this.results.rateLimiting.total*100).toFixed(1)}%)`);
        console.log(`   🚫 Rate Limited: ${this.results.rateLimiting.rateLimited} (${(this.results.rateLimiting.rateLimited/this.results.rateLimiting.total*100).toFixed(1)}%)`);

        // Performance Metrics
        if (performanceMetrics) {
            console.log('\n⚡ PERFORMANCE METRICS:');
            console.log(`   📊 Total Requests: ${performanceMetrics.totalRequests}`);
            console.log(`   ⏱️  Average Response Time: ${performanceMetrics.averageResponseTime.toFixed(0)}ms`);
            console.log(`   📈 Median Response Time: ${performanceMetrics.medianResponseTime.toFixed(0)}ms`);
            console.log(`   🔥 95th Percentile: ${performanceMetrics.p95ResponseTime.toFixed(0)}ms`);
            console.log(`   🚀 99th Percentile: ${performanceMetrics.p99ResponseTime.toFixed(0)}ms`);
            console.log(`   ⚡ Fastest Response: ${performanceMetrics.minResponseTime.toFixed(0)}ms`);
            console.log(`   🐌 Slowest Response: ${performanceMetrics.maxResponseTime.toFixed(0)}ms`);
        }

        // Production Readiness Assessment
        console.log('\n🎯 PRODUCTION READINESS ASSESSMENT:');
        const successRate = (this.results.passed / this.results.totalTests) * 100;
        const avgResponseTime = performanceMetrics?.averageResponseTime || 0;

        if (successRate >= 90 && avgResponseTime <= 1000) {
            console.log('   🟢 EXCELLENT - Production ready for high load');
            console.log('   🚀 API handles concurrent requests well');
            console.log('   ⚡ Response times are optimal');
        } else if (successRate >= 75 && avgResponseTime <= 2000) {
            console.log('   🟡 GOOD - Production ready with monitoring');
            console.log('   📊 Good performance under load');
            console.log('   ⚠️  Monitor response times in production');
        } else if (successRate >= 60) {
            console.log('   🟠 FAIR - Needs optimization');
            console.log('   🔧 Consider performance improvements');
            console.log('   📈 Rate limiting may be too aggressive');
        } else {
            console.log('   🔴 POOR - Significant issues detected');
            console.log('   🛠️  Major performance problems');
            console.log('   🚨 Not recommended for production load');
        }

        console.log('\n' + '='.repeat(80));
        console.log('🏁 PRODUCTION LOAD TESTING COMPLETE');
        console.log('='.repeat(80));
    }
}

// Run production load tests if executed directly
if (require.main === module) {
    const tester = new ProductionLoadTester();
    
    tester.runFullProductionLoadTest().then(() => {
        console.log('\n✅ Production load testing complete!');
        process.exit(0);
    }).catch((error) => {
        console.error('❌ Production load test error:', error);
        process.exit(1);
    });
}

module.exports = ProductionLoadTester;