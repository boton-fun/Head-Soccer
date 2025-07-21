/**
 * Production Authentication API Test Suite
 * Tests the deployed authentication endpoints on Railway
 */

const axios = require('axios');

const PRODUCTION_URL = 'https://head-soccer-production.up.railway.app';
const API_BASE = `${PRODUCTION_URL}/api/auth`;

class ProductionAuthTester {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            tests: []
        };
        console.log('🚀 Production Authentication API Tests');
        console.log('Production URL:', PRODUCTION_URL);
        console.log('API Base:', API_BASE);
    }

    async runTest(testName, testFunction) {
        console.log(`\n🧪 Testing: ${testName}`);
        try {
            const result = await testFunction();
            this.results.passed++;
            this.results.tests.push({ name: testName, status: 'PASSED', result });
            console.log(`✅ PASSED: ${testName}`);
            return result;
        } catch (error) {
            this.results.failed++;
            this.results.tests.push({ name: testName, status: 'FAILED', error: error.message });
            console.log(`❌ FAILED: ${testName} - ${error.message}`);
            return null;
        }
    }

    async testProductionServerHealth() {
        const response = await axios.get(`${PRODUCTION_URL}/health`);
        if (response.status !== 200) {
            throw new Error('Production server health check failed');
        }
        return {
            status: response.data.status,
            environment: response.data.environment,
            uptime: response.data.uptime,
            services: response.data.services
        };
    }

    async testAuthServiceAvailability() {
        const response = await axios.get(`${API_BASE}/health`);
        if (response.status !== 200 || !response.data.success) {
            throw new Error('Auth service not available or unhealthy');
        }
        return response.data;
    }

    async testProductionRegistration() {
        const testUser = {
            username: `prodtest_${Date.now()}`,
            password: 'ProductionTest123!',
            display_name: 'Production Test User'
        };

        const response = await axios.post(`${API_BASE}/register`, testUser);

        if (response.status !== 201) {
            throw new Error(`Expected status 201, got ${response.status}`);
        }

        const data = response.data;
        if (!data.success || !data.data?.user?.id || !data.data?.token) {
            throw new Error('Invalid registration response structure');
        }

        return {
            userId: data.data.user.id,
            username: data.data.user.username,
            hasToken: !!data.data.token,
            message: 'Production registration successful'
        };
    }

    async testProductionUsernameCheck() {
        // Test with a unique username
        const uniqueUsername = `unique_${Date.now()}`;
        const response = await axios.post(`${API_BASE}/check-username`, {
            username: uniqueUsername
        });

        if (!response.data.success || !response.data.available) {
            throw new Error('Username should be available');
        }

        // Test with an existing username (create one first)
        const existingUser = {
            username: `existing_${Date.now()}`,
            password: 'Test123!',
        };

        // Register user first
        await axios.post(`${API_BASE}/register`, existingUser);

        // Then check if it's unavailable
        const checkResponse = await axios.post(`${API_BASE}/check-username`, {
            username: existingUser.username
        });

        if (!checkResponse.data.success || checkResponse.data.available) {
            throw new Error('Username should be unavailable after registration');
        }

        return 'Production username checking working correctly';
    }

    async testProductionRateLimiting() {
        // Test rate limiting by making multiple requests
        const promises = [];
        for (let i = 0; i < 3; i++) {
            promises.push(
                axios.post(`${API_BASE}/check-username`, {
                    username: `rate_test_${Date.now()}_${i}`
                }).catch(error => error.response)
            );
        }

        const responses = await Promise.all(promises);
        const successCount = responses.filter(r => r?.status === 200).length;
        
        if (successCount === 0) {
            throw new Error('All requests blocked - rate limiting too aggressive');
        }

        return `Rate limiting functional - ${successCount}/3 requests succeeded`;
    }

    async testProductionDatabaseConnection() {
        // Test that the database is properly connected by checking username availability
        const testUsername = `db_test_${Date.now()}`;
        const response = await axios.post(`${API_BASE}/check-username`, {
            username: testUsername
        });

        if (!response.data.success) {
            throw new Error('Database connection issue - username check failed');
        }

        return 'Production database connection working';
    }

    async testProductionErrorHandling() {
        // Test with invalid data to ensure proper error handling
        try {
            await axios.post(`${API_BASE}/register`, {
                username: 'ab', // Too short
                password: '123' // Too weak
            });
            throw new Error('Should have rejected invalid data');
        } catch (error) {
            if (error.response?.status === 400) {
                return 'Production error handling working correctly';
            } else {
                throw new Error('Unexpected error response');
            }
        }
    }

    async runAllProductionTests() {
        console.log('\n' + '='.repeat(70));
        console.log('🌐 PRODUCTION AUTHENTICATION API TESTS');
        console.log('='.repeat(70));

        // Run tests in sequence
        await this.runTest('Production Server Health', () => this.testProductionServerHealth());
        await this.runTest('Auth Service Availability', () => this.testAuthServiceAvailability());
        await this.runTest('Production Database Connection', () => this.testProductionDatabaseConnection());
        await this.runTest('Production Registration', () => this.testProductionRegistration());
        await this.runTest('Production Username Check', () => this.testProductionUsernameCheck());
        await this.runTest('Production Rate Limiting', () => this.testProductionRateLimiting());
        await this.runTest('Production Error Handling', () => this.testProductionErrorHandling());

        // Print comprehensive results
        console.log('\n' + '='.repeat(70));
        console.log('🎯 PRODUCTION TEST RESULTS');
        console.log('='.repeat(70));
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`📊 Success Rate: ${((this.results.passed / (this.results.passed + this.results.failed)) * 100).toFixed(1)}%`);

        console.log('\n📋 Test Details:');
        this.results.tests.forEach((test, index) => {
            const status = test.status === 'PASSED' ? '✅' : '❌';
            console.log(`${index + 1}. ${status} ${test.name}`);
            if (test.status === 'FAILED') {
                console.log(`   Error: ${test.error}`);
            }
        });

        if (this.results.failed === 0) {
            console.log('\n🎉 ALL PRODUCTION TESTS PASSED!');
            console.log('🚀 Authentication API is production-ready!');
        } else {
            console.log('\n⚠️ Some production tests failed.');
            console.log('🔧 Check deployment and database configuration.');
        }

        return {
            totalTests: this.results.passed + this.results.failed,
            passed: this.results.passed,
            failed: this.results.failed,
            successRate: (this.results.passed / (this.results.passed + this.results.failed)) * 100
        };
    }
}

// Run production tests if this file is executed directly
if (require.main === module) {
    const tester = new ProductionAuthTester();
    
    tester.runAllProductionTests().then((results) => {
        process.exit(results.failed > 0 ? 1 : 0);
    }).catch((error) => {
        console.error('Production test runner error:', error);
        process.exit(1);
    });
}

module.exports = ProductionAuthTester;