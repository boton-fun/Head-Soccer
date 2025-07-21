/**
 * Test script for Login and Profile API endpoints
 * Tests user login, profile retrieval, and profile updates
 */

const axios = require('axios');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const API_BASE = `${SERVER_URL}/api/auth`;

class LoginProfileTester {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            tests: []
        };
        this.testUser = null;
        this.testToken = null;
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

    async setupTestUser() {
        // Create a test user for login tests
        const testUserData = {
            username: `logintest_${Date.now()}`,
            password: 'LoginTest123!',
            display_name: 'Login Test User'
        };

        const response = await axios.post(`${API_BASE}/register`, testUserData);
        if (response.status !== 201) {
            throw new Error('Failed to create test user for login tests');
        }

        this.testUser = {
            ...testUserData,
            id: response.data.data.user.id,
            token: response.data.data.token
        };

        console.log(`\n📝 Created test user: ${this.testUser.username}`);
        return this.testUser;
    }

    async testSuccessfulLogin() {
        const loginData = {
            username: this.testUser.username,
            password: this.testUser.password
        };

        const response = await axios.post(`${API_BASE}/login`, loginData);

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        const data = response.data;
        if (!data.success) {
            throw new Error('Login failed: ' + data.error);
        }

        // Verify response structure
        if (!data.data?.user?.id || !data.data?.token) {
            throw new Error('Invalid login response structure');
        }

        // Verify user data
        const user = data.data.user;
        if (user.username !== this.testUser.username.toLowerCase()) {
            throw new Error('Username mismatch in login response');
        }

        if (!user.display_name || !user.elo_rating) {
            throw new Error('Missing user data in login response');
        }

        // Store token for subsequent tests
        this.testToken = data.data.token;

        return {
            userId: user.id,
            username: user.username,
            hasToken: !!data.data.token,
            expiresIn: data.data.expiresIn,
            message: 'Login successful'
        };
    }

    async testInvalidCredentials() {
        // Test with wrong password
        try {
            await axios.post(`${API_BASE}/login`, {
                username: this.testUser.username,
                password: 'wrongpassword'
            });
            throw new Error('Should have rejected invalid password');
        } catch (error) {
            if (error.response?.status !== 401) {
                throw new Error(`Expected status 401, got ${error.response?.status}`);
            }
            
            const data = error.response.data;
            if (!data.error.includes('Invalid username or password')) {
                throw new Error('Wrong error message for invalid credentials');
            }
        }

        // Test with non-existent username
        try {
            await axios.post(`${API_BASE}/login`, {
                username: 'nonexistentuser',
                password: 'anypassword'
            });
            throw new Error('Should have rejected non-existent username');
        } catch (error) {
            if (error.response?.status !== 401) {
                throw new Error(`Expected status 401, got ${error.response?.status}`);
            }
        }

        return 'Invalid credentials properly rejected';
    }

    async testLoginValidation() {
        // Test missing username
        try {
            await axios.post(`${API_BASE}/login`, {
                password: 'somepassword'
            });
            throw new Error('Should have rejected missing username');
        } catch (error) {
            if (error.response?.status !== 400) {
                throw new Error('Missing username validation failed');
            }
        }

        // Test missing password
        try {
            await axios.post(`${API_BASE}/login`, {
                username: 'someuser'
            });
            throw new Error('Should have rejected missing password');
        } catch (error) {
            if (error.response?.status !== 400) {
                throw new Error('Missing password validation failed');
            }
        }

        return 'Login input validation working correctly';
    }

    async testProfileRetrieval() {
        if (!this.testToken) {
            throw new Error('No authentication token available for profile test');
        }

        const response = await axios.get(`${API_BASE}/profile`, {
            headers: {
                'Authorization': `Bearer ${this.testToken}`
            }
        });

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        const data = response.data;
        if (!data.success) {
            throw new Error('Profile retrieval failed: ' + data.error);
        }

        // Verify response structure
        if (!data.data?.user) {
            throw new Error('Invalid profile response structure');
        }

        const user = data.data.user;
        if (user.id !== this.testUser.id) {
            throw new Error('Profile user ID mismatch');
        }

        if (user.username !== this.testUser.username.toLowerCase()) {
            throw new Error('Profile username mismatch');
        }

        // Check if stats are included (may be null for new user)
        if (data.data.stats !== null && typeof data.data.stats !== 'object') {
            throw new Error('Invalid stats format in profile response');
        }

        return {
            userId: user.id,
            username: user.username,
            displayName: user.display_name,
            eloRating: user.elo_rating,
            hasStats: data.data.stats !== null,
            message: 'Profile retrieved successfully'
        };
    }

    async testProfileUpdate() {
        if (!this.testToken) {
            throw new Error('No authentication token available for profile update test');
        }

        const updateData = {
            display_name: 'Updated Test User',
            character_id: 'player2'
        };

        const response = await axios.put(`${API_BASE}/profile`, updateData, {
            headers: {
                'Authorization': `Bearer ${this.testToken}`
            }
        });

        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }

        const data = response.data;
        if (!data.success) {
            throw new Error('Profile update failed: ' + data.error);
        }

        // Verify response structure
        if (!data.data?.user) {
            throw new Error('Invalid profile update response structure');
        }

        const user = data.data.user;
        if (user.display_name !== updateData.display_name) {
            throw new Error('Display name not updated correctly');
        }

        if (user.character_id !== updateData.character_id) {
            throw new Error('Character ID not updated correctly');
        }

        if (!user.updated_at) {
            throw new Error('Updated timestamp not set');
        }

        return {
            userId: user.id,
            displayName: user.display_name,
            characterId: user.character_id,
            updatedAt: user.updated_at,
            message: 'Profile updated successfully'
        };
    }

    async testProfileUpdateValidation() {
        if (!this.testToken) {
            throw new Error('No authentication token available for validation test');
        }

        // Test invalid display name (too long)
        try {
            await axios.put(`${API_BASE}/profile`, {
                display_name: 'A'.repeat(51) // 51 characters, limit is 50
            }, {
                headers: {
                    'Authorization': `Bearer ${this.testToken}`
                }
            });
            throw new Error('Should have rejected too long display name');
        } catch (error) {
            if (error.response?.status !== 400) {
                throw new Error('Display name length validation failed');
            }
        }

        // Test invalid character ID
        try {
            await axios.put(`${API_BASE}/profile`, {
                character_id: 'invalidcharacter'
            }, {
                headers: {
                    'Authorization': `Bearer ${this.testToken}`
                }
            });
            throw new Error('Should have rejected invalid character ID');
        } catch (error) {
            if (error.response?.status !== 400) {
                throw new Error('Character ID validation failed');
            }
        }

        // Test invalid avatar URL
        try {
            await axios.put(`${API_BASE}/profile`, {
                avatar_url: 'not-a-valid-url'
            }, {
                headers: {
                    'Authorization': `Bearer ${this.testToken}`
                }
            });
            throw new Error('Should have rejected invalid avatar URL');
        } catch (error) {
            if (error.response?.status !== 400) {
                throw new Error('Avatar URL validation failed');
            }
        }

        return 'Profile update validation working correctly';
    }

    async testAuthenticationMiddleware() {
        // Test profile access without token
        try {
            await axios.get(`${API_BASE}/profile`);
            throw new Error('Should have rejected request without token');
        } catch (error) {
            if (error.response?.status !== 401) {
                throw new Error('Missing token validation failed');
            }
        }

        // Test profile access with invalid token
        try {
            await axios.get(`${API_BASE}/profile`, {
                headers: {
                    'Authorization': 'Bearer invalid-token'
                }
            });
            throw new Error('Should have rejected invalid token');
        } catch (error) {
            if (error.response?.status !== 401) {
                throw new Error('Invalid token validation failed');
            }
        }

        // Test profile access with malformed authorization header
        try {
            await axios.get(`${API_BASE}/profile`, {
                headers: {
                    'Authorization': 'InvalidFormat token'
                }
            });
            throw new Error('Should have rejected malformed authorization header');
        } catch (error) {
            if (error.response?.status !== 401) {
                throw new Error('Malformed authorization header validation failed');
            }
        }

        return 'Authentication middleware working correctly';
    }

    async runAllTests() {
        console.log('🚀 Starting Login & Profile API Tests\n');
        console.log('Server URL:', SERVER_URL);
        console.log('API Base:', API_BASE);

        // Setup
        await this.setupTestUser();

        // Run tests
        await this.runTest('User Login - Success', () => this.testSuccessfulLogin());
        await this.runTest('User Login - Invalid Credentials', () => this.testInvalidCredentials());
        await this.runTest('User Login - Input Validation', () => this.testLoginValidation());
        await this.runTest('Profile Retrieval', () => this.testProfileRetrieval());
        await this.runTest('Profile Update', () => this.testProfileUpdate());
        await this.runTest('Profile Update Validation', () => this.testProfileUpdateValidation());
        await this.runTest('Authentication Middleware', () => this.testAuthenticationMiddleware());

        // Print results
        console.log('\n' + '='.repeat(60));
        console.log('🎯 LOGIN & PROFILE TEST RESULTS');
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
            console.log('\n🎉 All tests passed! Login and Profile APIs are working correctly.');
        }

        console.log(`\n📝 Test user created: ${this.testUser?.username} (ID: ${this.testUser?.id})`);

        return {
            totalTests: this.results.passed + this.results.failed,
            passed: this.results.passed,
            failed: this.results.failed,
            successRate: (this.results.passed / (this.results.passed + this.results.failed)) * 100,
            testUser: this.testUser
        };
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const tester = new LoginProfileTester();
    
    tester.runAllTests().then((results) => {
        process.exit(results.failed > 0 ? 1 : 0);
    }).catch((error) => {
        console.error('Test runner error:', error);
        process.exit(1);
    });
}

module.exports = LoginProfileTester;