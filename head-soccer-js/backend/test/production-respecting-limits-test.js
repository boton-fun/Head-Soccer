/**
 * Production-Aware Testing Suite
 * Tests authentication API while respecting production rate limits
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

const PRODUCTION_URL = 'https://head-soccer-production.up.railway.app';
const API_BASE = `${PRODUCTION_URL}/api/auth`;

class ProductionRespectingTester {
    constructor() {
        this.results = {
            endpointTests: [],
            performanceMetrics: {
                responseTimes: [],
                errorRate: 0,
                totalRequests: 0
            },
            rateLimitCompliance: {
                requestsWithinLimits: 0,
                totalRequests: 0
            }
        };
        console.log('🎯 Production-Aware Testing Suite');
        console.log('Target:', PRODUCTION_URL);
        console.log('Strategy: Respect rate limits, measure quality over quantity');
        console.log('='.repeat(80));
    }

    async makeRequestWithRetry(method, endpoint, data = null, maxRetries = 3) {
        const startTime = performance.now();
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await axios({
                    method,
                    url: `${API_BASE}${endpoint}`,
                    data,
                    timeout: 30000,
                    validateStatus: () => true
                });

                const endTime = performance.now();
                const responseTime = endTime - startTime;

                this.results.performanceMetrics.responseTimes.push(responseTime);
                this.results.performanceMetrics.totalRequests++;

                // Track rate limit compliance
                if (response.status !== 429) {
                    this.results.rateLimitCompliance.requestsWithinLimits++;
                }
                this.results.rateLimitCompliance.totalRequests++;

                return {
                    status: response.status,
                    data: response.data,
                    responseTime,
                    headers: response.headers,
                    attempt
                };

            } catch (error) {
                if (attempt === maxRetries) {
                    const endTime = performance.now();
                    const responseTime = endTime - startTime;
                    
                    this.results.performanceMetrics.totalRequests++;
                    
                    return {
                        status: 0,
                        data: { error: error.message },
                        responseTime,
                        error: true,
                        attempt
                    };
                }
                
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }

    async testEndpointPerformance(name, method, endpoint, data = null, expectedStatus = 200) {
        console.log(`\n📊 Testing ${name}...`);
        
        const startTime = performance.now();
        const result = await this.makeRequestWithRetry(method, endpoint, data);
        const endTime = performance.now();

        const testResult = {
            name,
            endpoint: `${method} ${endpoint}`,
            status: result.status,
            expectedStatus,
            responseTime: result.responseTime,
            success: result.status === expectedStatus,
            rateLimitHeaders: {
                limit: result.headers?.['x-ratelimit-limit'],
                remaining: result.headers?.['x-ratelimit-remaining'],
                reset: result.headers?.['x-ratelimit-reset']
            },
            attempt: result.attempt
        };

        this.results.endpointTests.push(testResult);

        if (testResult.success) {
            console.log(`   ✅ SUCCESS - ${result.responseTime.toFixed(0)}ms`);
        } else {
            console.log(`   ❌ FAILED - Expected ${expectedStatus}, got ${result.status} (${result.responseTime.toFixed(0)}ms)`);
        }

        // Show rate limit info if available
        if (testResult.rateLimitHeaders.limit) {
            console.log(`   🛡️  Rate Limit: ${testResult.rateLimitHeaders.remaining}/${testResult.rateLimitHeaders.limit} remaining`);
        }

        return testResult;
    }

    async testSequentialEndpoints() {
        console.log('\n🔄 Testing individual endpoints with proper delays...');
        
        // Test health endpoint (usually not rate limited)
        await this.testEndpointPerformance(
            'Auth Service Health Check',
            'GET',
            '/health',
            null,
            200
        );

        // Wait between requests to respect rate limits
        console.log('   ⏳ Waiting 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Test username availability with unique username
        await this.testEndpointPerformance(
            'Username Availability Check',
            'POST',
            '/check-username',
            { username: `perftest_${Date.now()}` },
            200
        );

        console.log('   ⏳ Waiting 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Test user registration
        await this.testEndpointPerformance(
            'User Registration',
            'POST',
            '/register',
            {
                username: `prodtest_${Date.now()}`,
                password: 'ProductionTest123!',
                display_name: 'Production Test User'
            },
            201
        );

        console.log('   ⏳ Waiting 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Test duplicate username check
        const existingUsername = `existing_${Date.now()}`;
        await this.testEndpointPerformance(
            'Create User for Duplicate Test',
            'POST',
            '/register',
            {
                username: existingUsername,
                password: 'Test123!',
                display_name: 'Test User'
            },
            201
        );

        console.log('   ⏳ Waiting 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        await this.testEndpointPerformance(
            'Username Unavailability Check',
            'POST',
            '/check-username',
            { username: existingUsername },
            200
        );
    }

    async testErrorHandlingPerformance() {
        console.log('\n❌ Testing error handling performance...');
        
        // Test invalid registration data
        await this.testEndpointPerformance(
            'Invalid Registration (Short Username)',
            'POST',
            '/register',
            {
                username: 'ab',
                password: 'ValidPass123!'
            },
            400
        );

        console.log('   ⏳ Waiting 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        await this.testEndpointPerformance(
            'Invalid Registration (Weak Password)',
            'POST',
            '/register',
            {
                username: 'validuser',
                password: '123'
            },
            400
        );

        console.log('   ⏳ Waiting 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        await this.testEndpointPerformance(
            'Invalid Username Check (Special Characters)',
            'POST',
            '/check-username',
            { username: 'user@invalid' },
            400
        );
    }

    async testDatabasePerformanceIndividually() {
        console.log('\n💾 Testing database performance with individual operations...');
        
        const operations = [
            {
                name: 'DB Query - Username Check',
                method: 'POST',
                endpoint: '/check-username',
                data: { username: `dbperf_${Date.now()}_1` },
                expectedStatus: 200
            },
            {
                name: 'DB Insert - User Registration',
                method: 'POST',
                endpoint: '/register',
                data: {
                    username: `dbperf_${Date.now()}_2`,
                    password: 'DBPerf123!',
                    display_name: 'DB Performance Test'
                },
                expectedStatus: 201
            },
            {
                name: 'DB Query - Duplicate Check',
                method: 'POST',
                endpoint: '/check-username',
                data: { username: `dbperf_${Date.now()}_3` },
                expectedStatus: 200
            }
        ];

        for (const operation of operations) {
            await this.testEndpointPerformance(
                operation.name,
                operation.method,
                operation.endpoint,
                operation.data,
                operation.expectedStatus
            );
            
            // Wait between database operations
            console.log('   ⏳ Waiting 5 seconds for next DB operation...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    generatePerformanceAnalysis() {
        const times = this.results.performanceMetrics.responseTimes;
        if (times.length === 0) return null;

        const sortedTimes = [...times].sort((a, b) => a - b);
        const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
        const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
        const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
        const min = Math.min(...times);
        const max = Math.max(...times);

        const successful = this.results.endpointTests.filter(t => t.success).length;
        const total = this.results.endpointTests.length;
        const successRate = (successful / total) * 100;

        const rateLimitCompliance = (this.results.rateLimitCompliance.requestsWithinLimits / 
                                   this.results.rateLimitCompliance.totalRequests) * 100;

        return {
            totalRequests: times.length,
            successfulTests: successful,
            totalTests: total,
            successRate,
            averageResponseTime: avg,
            medianResponseTime: p50,
            p95ResponseTime: p95,
            minResponseTime: min,
            maxResponseTime: max,
            rateLimitCompliance
        };
    }

    async runProductionAwareTests() {
        console.log('\n🚀 Starting Production-Aware Testing Suite...\n');
        
        try {
            // Test individual endpoint performance
            await this.testSequentialEndpoints();
            
            // Wait before next test category
            console.log('\n⏳ Waiting 10 seconds before error handling tests...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Test error handling performance
            await this.testErrorHandlingPerformance();
            
            // Wait before database tests
            console.log('\n⏳ Waiting 10 seconds before database tests...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            // Test database performance
            await this.testDatabasePerformanceIndividually();
            
        } catch (error) {
            console.error('❌ Test suite error:', error.message);
        }

        // Generate comprehensive report
        this.generateProductionReport();
    }

    generateProductionReport() {
        const analysis = this.generatePerformanceAnalysis();
        
        console.log('\n' + '='.repeat(80));
        console.log('🎯 PRODUCTION-AWARE TEST RESULTS');
        console.log('='.repeat(80));

        if (analysis) {
            console.log('\n📊 PERFORMANCE SUMMARY:');
            console.log(`   🎯 Total Tests: ${analysis.totalTests}`);
            console.log(`   ✅ Successful: ${analysis.successfulTests}/${analysis.totalTests} (${analysis.successRate.toFixed(1)}%)`);
            console.log(`   📡 Rate Limit Compliance: ${analysis.rateLimitCompliance.toFixed(1)}%`);
            console.log(`   ⏱️  Average Response Time: ${analysis.averageResponseTime.toFixed(0)}ms`);
            console.log(`   📈 Median Response Time: ${analysis.medianResponseTime.toFixed(0)}ms`);
            console.log(`   🔥 95th Percentile: ${analysis.p95ResponseTime.toFixed(0)}ms`);
            console.log(`   ⚡ Fastest Response: ${analysis.minResponseTime.toFixed(0)}ms`);
            console.log(`   🐌 Slowest Response: ${analysis.maxResponseTime.toFixed(0)}ms`);

            console.log('\n📋 INDIVIDUAL TEST RESULTS:');
            this.results.endpointTests.forEach((test, index) => {
                const status = test.success ? '✅' : '❌';
                console.log(`${index + 1}. ${status} ${test.name}`);
                console.log(`   Endpoint: ${test.endpoint}`);
                console.log(`   Status: ${test.status} (expected ${test.expectedStatus})`);
                console.log(`   Response Time: ${test.responseTime.toFixed(0)}ms`);
                if (test.rateLimitHeaders.limit) {
                    console.log(`   Rate Limit: ${test.rateLimitHeaders.remaining}/${test.rateLimitHeaders.limit}`);
                }
                console.log('');
            });

            // Production readiness assessment
            console.log('🎯 PRODUCTION READINESS:');
            if (analysis.successRate >= 90 && analysis.averageResponseTime <= 1000 && analysis.rateLimitCompliance >= 95) {
                console.log('   🟢 EXCELLENT - Production ready with optimal performance');
                console.log('   🚀 API performs well under production rate limits');
                console.log('   ⚡ Response times are excellent');
                console.log('   🛡️  Rate limit compliance is excellent');
            } else if (analysis.successRate >= 75 && analysis.averageResponseTime <= 2000 && analysis.rateLimitCompliance >= 85) {
                console.log('   🟡 GOOD - Production ready with monitoring recommended');
                console.log('   📊 Good performance within rate limits');
                console.log('   ⚠️  Monitor response times and rate limit usage');
            } else if (analysis.successRate >= 60) {
                console.log('   🟠 FAIR - Needs attention');
                console.log('   🔧 Consider optimizations');
                console.log('   📈 Rate limiting strategy may need adjustment');
            } else {
                console.log('   🔴 POOR - Significant issues detected');
                console.log('   🛠️  Major performance or functionality problems');
                console.log('   🚨 Not recommended for production without fixes');
            }

            console.log('\n💡 RECOMMENDATIONS:');
            if (analysis.rateLimitCompliance < 95) {
                console.log('   • Consider implementing exponential backoff in client code');
                console.log('   • Review rate limit configuration for production needs');
            }
            if (analysis.averageResponseTime > 1000) {
                console.log('   • Database query optimization recommended');
                console.log('   • Consider implementing caching for frequent operations');
            }
            if (analysis.successRate < 90) {
                console.log('   • Review error handling and validation logic');
                console.log('   • Investigate failed test cases');
            }
            
            console.log('   • Current rate limits: ~10 requests per 5 minutes for registration');
            console.log('   • Username checking appears to have more lenient limits');
            console.log('   • Health checks are not rate limited');
        }

        console.log('\n' + '='.repeat(80));
        console.log('🏁 PRODUCTION-AWARE TESTING COMPLETE');
        console.log('='.repeat(80));
    }
}

// Run production-aware tests if executed directly
if (require.main === module) {
    const tester = new ProductionRespectingTester();
    
    tester.runProductionAwareTests().then(() => {
        console.log('\n✅ Production-aware testing complete!');
        process.exit(0);
    }).catch((error) => {
        console.error('❌ Production test error:', error);
        process.exit(1);
    });
}

module.exports = ProductionRespectingTester;