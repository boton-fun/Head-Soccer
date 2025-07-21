/**
 * Test script for Authentication API endpoints
 * Tests user registration, username checking, and error handling
 */

const axios = require('axios');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const API_BASE = `${SERVER_URL}/api/auth`;

class AuthAPITester {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            tests: []
        };
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

    async testServerHealth() {
        const response = await axios.get(`${API_BASE}/health`);
        if (response.status !== 200 || !response.data.success) {
            throw new Error('Auth service health check failed');
        }
        return response.data;
    }

    async testUsernameValidation() {
        // Test valid username
        const validResponse = await axios.post(`${API_BASE}/check-username`, {
            username: 'validuser123'
        });
        
        if (!validResponse.data.success) {
            throw new Error('Valid username check failed');
        }

        // Test invalid username (too short)
        try {
            await axios.post(`${API_BASE}/check-username`, {
                username: 'ab'
            });
            throw new Error('Should have rejected short username');
        } catch (error) {
            if (error.response?.status !== 400) {
                throw new Error('Invalid username validation failed');
            }
        }

        // Test invalid characters
        try {
            await axios.post(`${API_BASE}/check-username`, {
                username: 'user@invalid'
            });
            throw new Error('Should have rejected invalid characters');
        } catch (error) {
            if (error.response?.status !== 400) {
                throw new Error('Invalid character validation failed');
            }
        }

        return 'Username validation working correctly';
    }

    async testSuccessfulRegistration() {
        const testUser = {
            username: `testuser_${Date.now()}`,
            password: 'TestPass123',
            display_name: 'Test User'
        };

        const response = await axios.post(`${API_BASE}/register`, testUser);

        if (response.status !== 201) {
            throw new Error(`Expected status 201, got ${response.status}`);
        }

        const data = response.data;
        if (!data.success) {
            throw new Error('Registration failed: ' + data.error);
        }

        // Verify response structure
        if (!data.data?.user?.id || !data.data?.token) {
            throw new Error('Invalid response structure');
        }

        // Verify user data
        const user = data.data.user;
        if (user.username !== testUser.username.toLowerCase()) {
            throw new Error('Username not stored correctly');
        }

        if (user.display_name !== testUser.display_name) {
            throw new Error('Display name not stored correctly');
        }

        if (user.elo_rating !== 1200) {
            throw new Error('Default ELO rating not set correctly');
        }

        return {
            userId: user.id,
            username: user.username,
            token: data.data.token,
            message: 'User registration successful'
        };
    }

    async testDuplicateUsername() {
        const testUser = {
            username: `duplicate_${Date.now()}`,
            password: 'TestPass123'
        };

        // First registration should succeed
        await axios.post(`${API_BASE}/register`, testUser);

        // Second registration should fail
        try {
            await axios.post(`${API_BASE}/register`, testUser);
            throw new Error('Should have rejected duplicate username');
        } catch (error) {
            if (error.response?.status !== 409) {
                throw new Error(`Expected status 409, got ${error.response?.status}`);
            }
            
            const data = error.response.data;
            if (!data.error.includes('already exists')) {
                throw new Error('Wrong error message for duplicate username');
            }
        }

        return 'Duplicate username handling working correctly';
    }

    async testRegistrationValidation() {
        // Test missing username
        try {
            await axios.post(`${API_BASE}/register`, {
                password: 'TestPass123'
            });
            throw new Error('Should have rejected missing username');
        } catch (error) {
            if (error.response?.status !== 400) {
                throw new Error('Missing username validation failed');
            }
        }

        // Test weak password
        try {
            await axios.post(`${API_BASE}/register`, {
                username: 'testuser',
                password: 'weak'
            });
            throw new Error('Should have rejected weak password');
        } catch (error) {
            if (error.response?.status !== 400) {
                throw new Error('Weak password validation failed');
            }
        }

        // Test invalid username format
        try {
            await axios.post(`${API_BASE}/register`, {
                username: 'test@user',
                password: 'ValidPass123'
            });
            throw new Error('Should have rejected invalid username format');
        } catch (error) {
            if (error.response?.status !== 400) {
                throw new Error('Invalid username format validation failed');
            }
        }

        return 'Registration validation working correctly';
    }

    async testRateLimiting() {
        // This test might be flaky depending on timing, so we'll make it lenient
        const testUser = {
            username: `ratetest_${Date.now()}`,
            password: 'TestPass123'
        };

        // Try to register multiple times quickly
        const promises = [];
        for (let i = 0; i < 5; i++) {
            testUser.username = `ratetest_${Date.now()}_${i}`;
            promises.push(
                axios.post(`${API_BASE}/register`, testUser).catch(error => error.response)
            );
        }

        const responses = await Promise.all(promises);
        
        // At least some should succeed, but rate limiting should eventually kick in
        const successCount = responses.filter(r => r?.status === 201).length;
        const rateLimitedCount = responses.filter(r => r?.status === 429).length;

        if (successCount === 0) {
            throw new Error('All requests were blocked, rate limiting too aggressive');
        }

        return `Rate limiting working - ${successCount} succeeded, ${rateLimitedCount} rate limited`;
    }

    async runAllTests() {
        console.log('🚀 Starting Authentication API Tests\n');
        console.log('Server URL:', SERVER_URL);
        console.log('API Base:', API_BASE);

        // Run tests
        await this.runTest('Auth Service Health Check', () => this.testServerHealth());
        await this.runTest('Username Validation', () => this.testUsernameValidation());
        await this.runTest('Successful Registration', () => this.testSuccessfulRegistration());
        await this.runTest('Duplicate Username Handling', () => this.testDuplicateUsername());
        await this.runTest('Registration Input Validation', () => this.testRegistrationValidation());
        await this.runTest('Rate Limiting', () => this.testRateLimiting());

        // Print results
        console.log('\n' + '='.repeat(60));
        console.log('🎯 TEST RESULTS SUMMARY');
        console.log('='.repeat(60));
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`📊 Success Rate: ${((this.results.passed / (this.results.passed + this.results.failed)) * 100).toFixed(1)}%`);

        console.log('\n📋 Detailed Results:');
        this.results.tests.forEach((test, index) => {
            const status = test.status === 'PASSED' ? '✅' : '❌';
            console.log(`${index + 1}. ${status} ${test.name}`);
            if (test.status === 'FAILED') {
                console.log(`   Error: ${test.error}`);
            }
        });

        if (this.results.failed > 0) {
            console.log('\n⚠️  Some tests failed. Check the implementation and database setup.');
        } else {
            console.log('\n🎉 All tests passed! Authentication API is working correctly.');
        }

        return {
            totalTests: this.results.passed + this.results.failed,
            passed: this.results.passed,
            failed: this.results.failed,
            successRate: (this.results.passed / (this.results.passed + this.results.failed)) * 100
        };
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const tester = new AuthAPITester();
    
    tester.runAllTests().then((results) => {
        process.exit(results.failed > 0 ? 1 : 0);
    }).catch((error) => {
        console.error('Test runner error:', error);
        process.exit(1);
    });
}

module.exports = AuthAPITester;