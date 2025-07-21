/**
 * Simple Login and Profile Test
 * Tests the new login and profile endpoints with manual setup
 */

const axios = require('axios');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3003';
const API_BASE = `${SERVER_URL}/api/auth`;

async function testLoginAndProfile() {
    console.log('🧪 Simple Login & Profile Test');
    console.log('=====================================');
    
    // Test 1: Health check
    console.log('\n1. Testing Auth Service Health...');
    try {
        const healthResponse = await axios.get(`${API_BASE}/health`);
        console.log('✅ Health check passed:', healthResponse.data);
    } catch (error) {
        console.log('❌ Health check failed:', error.message);
        return;
    }

    // Test 2: Try to create a test user (may fail due to rate limiting)
    console.log('\n2. Attempting to create test user...');
    let testUser = null;
    let testToken = null;
    
    try {
        const uniqueUsername = `qt_${Date.now().toString().slice(-8)}`;
        const registerResponse = await axios.post(`${API_BASE}/register`, {
            username: uniqueUsername,
            password: 'QuickTest123!',
            display_name: 'Quick Test User'
        });
        
        if (registerResponse.status === 201) {
            testUser = {
                username: uniqueUsername,
                password: 'QuickTest123!',
                id: registerResponse.data.data.user.id
            };
            testToken = registerResponse.data.data.token;
            console.log('✅ Test user created:', testUser.username);
        }
    } catch (error) {
        if (error.response?.status === 429) {
            console.log('⚠️ Rate limited - using manual test approach');
            // Use a hardcoded test user for manual testing
            testUser = {
                username: 'manualtest', // You can manually create this user
                password: 'ManualTest123!',
                id: null
            };
        } else {
            console.log('❌ User creation failed:', error.response?.data || error.message);
            return;
        }
    }

    if (!testUser) {
        console.log('❌ No test user available for login tests');
        return;
    }

    // Test 3: User Login
    console.log('\n3. Testing User Login...');
    try {
        const loginResponse = await axios.post(`${API_BASE}/login`, {
            username: testUser.username,
            password: testUser.password
        });

        if (loginResponse.status === 200 && loginResponse.data.success) {
            testToken = loginResponse.data.data.token;
            testUser.id = loginResponse.data.data.user.id;
            console.log('✅ Login successful');
            console.log('  Token received:', !!testToken);
            console.log('  User ID:', testUser.id);
            console.log('  Display name:', loginResponse.data.data.user.display_name);
            console.log('  ELO rating:', loginResponse.data.data.user.elo_rating);
        } else {
            console.log('❌ Login failed - invalid response structure');
            return;
        }
    } catch (error) {
        console.log('❌ Login failed:', error.response?.data || error.message);
        if (error.response?.status === 401) {
            console.log('  This might mean the test user doesn\'t exist or wrong password');
        }
        return;
    }

    // Test 4: Invalid Login
    console.log('\n4. Testing Invalid Login...');
    try {
        await axios.post(`${API_BASE}/login`, {
            username: testUser.username,
            password: 'wrongpassword'
        });
        console.log('❌ Invalid login should have failed');
    } catch (error) {
        if (error.response?.status === 401) {
            console.log('✅ Invalid login properly rejected');
        } else {
            console.log('❌ Unexpected error for invalid login:', error.message);
        }
    }

    // Test 5: Profile Retrieval
    console.log('\n5. Testing Profile Retrieval...');
    try {
        const profileResponse = await axios.get(`${API_BASE}/profile`, {
            headers: {
                'Authorization': `Bearer ${testToken}`
            }
        });

        if (profileResponse.status === 200 && profileResponse.data.success) {
            const profile = profileResponse.data.data;
            console.log('✅ Profile retrieved successfully');
            console.log('  Username:', profile.user.username);
            console.log('  Display name:', profile.user.display_name);
            console.log('  Character ID:', profile.user.character_id);
            console.log('  ELO rating:', profile.user.elo_rating);
            console.log('  Has stats:', profile.stats !== null);
            if (profile.stats) {
                console.log('  Games played:', profile.stats.games_played);
                console.log('  Games won:', profile.stats.games_won);
            }
        } else {
            console.log('❌ Profile retrieval failed - invalid response structure');
        }
    } catch (error) {
        console.log('❌ Profile retrieval failed:', error.response?.data || error.message);
    }

    // Test 6: Profile Update
    console.log('\n6. Testing Profile Update...');
    try {
        const updateResponse = await axios.put(`${API_BASE}/profile`, {
            display_name: 'Updated Test User',
            character_id: 'player3'
        }, {
            headers: {
                'Authorization': `Bearer ${testToken}`
            }
        });

        if (updateResponse.status === 200 && updateResponse.data.success) {
            const updatedProfile = updateResponse.data.data.user;
            console.log('✅ Profile updated successfully');
            console.log('  New display name:', updatedProfile.display_name);
            console.log('  New character ID:', updatedProfile.character_id);
            console.log('  Updated at:', updatedProfile.updated_at);
        } else {
            console.log('❌ Profile update failed - invalid response structure');
        }
    } catch (error) {
        console.log('❌ Profile update failed:', error.response?.data || error.message);
    }

    // Test 7: Authentication Middleware
    console.log('\n7. Testing Authentication Middleware...');
    try {
        await axios.get(`${API_BASE}/profile`);
        console.log('❌ Should have rejected request without token');
    } catch (error) {
        if (error.response?.status === 401) {
            console.log('✅ Properly rejected request without token');
        } else {
            console.log('❌ Unexpected error for missing token:', error.message);
        }
    }

    try {
        await axios.get(`${API_BASE}/profile`, {
            headers: {
                'Authorization': 'Bearer invalid-token'
            }
        });
        console.log('❌ Should have rejected invalid token');
    } catch (error) {
        if (error.response?.status === 401) {
            console.log('✅ Properly rejected invalid token');
        } else {
            console.log('❌ Unexpected error for invalid token:', error.message);
        }
    }

    console.log('\n=====================================');
    console.log('🎉 Login & Profile Tests Completed!');
    console.log('=====================================');
    
    if (testUser && testUser.username.startsWith('quicktest_')) {
        console.log(`\n📝 Test user: ${testUser.username} (ID: ${testUser.id})`);
        console.log('ℹ️ This user was created for testing and can be cleaned up if needed.');
    }
}

// Run the test
testLoginAndProfile().catch(console.error);