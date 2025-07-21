/**
 * Simple Game Result Test
 * Quick test of the game result system functionality
 */

require('dotenv').config();
const axios = require('axios');

async function testGameSystem() {
  console.log('🎮 Testing Game Result System\n');

  const baseURL = 'https://head-soccer-production.up.railway.app/api';

  try {
    // Test 1: Health check
    console.log('🏥 Testing stats health...');
    const healthResponse = await axios.get(`${baseURL}/stats/health`);
    console.log('✅ Stats service:', healthResponse.data);

    // Test 2: Try to login with known user
    console.log('\n🔐 Testing authentication...');
    try {
      const loginResponse = await axios.post(`${baseURL}/auth/login`, {
        username: 'soccerking',
        password: 'testpass123'
      });
      
      if (loginResponse.data.success) {
        const token = loginResponse.data.data.token;
        console.log('✅ Login successful');

        // Test 3: Get user profile
        console.log('\n👤 Getting user profile...');
        const profileResponse = await axios.get(`${baseURL}/auth/profile`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (profileResponse.data.success) {
          const user = profileResponse.data.data;
          console.log('✅ User profile:', {
            username: user.username,
            display_name: user.display_name,
            elo_rating: user.elo_rating
          });

          // Test 4: Try to get another user for opponent
          console.log('\n🔍 Looking for opponent...');
          const { data: users } = await require('../database/supabase').supabase
            .from('users')
            .select('*')
            .neq('id', user.id)
            .limit(1);

          if (users && users.length > 0) {
            const opponent = users[0];
            console.log('✅ Found opponent:', opponent.username);

            // Test 5: Try creating a game
            console.log('\n🎮 Creating test game...');
            try {
              const gameResponse = await axios.post(`${baseURL}/stats/create-game`, {
                opponent_id: opponent.id,
                game_mode: 'casual'
              }, {
                headers: { Authorization: `Bearer ${token}` }
              });

              if (gameResponse.data.success) {
                console.log('✅ Game created:', gameResponse.data.data);
                const gameId = gameResponse.data.data.game_id;

                // Test 6: Submit game result
                console.log('\n📊 Submitting game result...');
                const resultResponse = await axios.post(`${baseURL}/stats/submit-game-result`, {
                  game_id: gameId,
                  opponent_id: opponent.id,
                  result: 'win',
                  player_score: 3,
                  opponent_score: 1,
                  duration_seconds: 300,
                  goals_scored: 3,
                  goals_conceded: 1
                }, {
                  headers: { Authorization: `Bearer ${token}` }
                });

                if (resultResponse.data.success) {
                  console.log('✅ Game result submitted successfully!');
                  console.log('📋 Result data:', resultResponse.data.data);
                  
                  if (resultResponse.data.data.validation) {
                    console.log('🛡️ Anti-cheat validation:', resultResponse.data.data.validation);
                  }
                } else {
                  console.log('❌ Game result failed:', resultResponse.data);
                }
              } else {
                console.log('❌ Game creation failed:', gameResponse.data);
              }
            } catch (error) {
              console.log('❌ Game creation error:', error.response?.data?.error || error.message);
            }
          } else {
            console.log('⚠️ No opponent found');
          }
        } else {
          console.log('❌ Profile fetch failed');
        }
      } else {
        console.log('❌ Login failed:', loginResponse.data);
      }
    } catch (error) {
      console.log('❌ Authentication error:', error.response?.data?.error || error.message);
    }

  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }

  console.log('\n🏁 Game system test completed');
}

testGameSystem();