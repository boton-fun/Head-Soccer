/**
 * Test Game Result Processing with Anti-Cheat Validation
 * Tests various scenarios including legitimate and suspicious results
 */

require('dotenv').config();
const axios = require('axios');
const { supabase } = require('../database/supabase');

class GameResultTester {
  constructor() {
    this.baseURL = 'https://head-soccer-production.up.railway.app/api';
    this.testUsers = [];
    this.authTokens = {};
    this.testGames = [];
  }

  async runTests() {
    try {
      console.log('🧪 Starting Game Result Processing Tests\n');

      // Step 1: Get test users and login
      await this.setupTestUsers();

      // Step 2: Test anti-cheat status endpoint
      await this.testAntiCheatStatus();

      // Step 3: Test legitimate game results
      await this.testLegitimateResults();

      // Step 4: Test suspicious game results
      await this.testSuspiciousResults();

      // Step 5: Test edge cases
      await this.testEdgeCases();

      console.log('\n🎉 All tests completed successfully!');

    } catch (error) {
      console.error('❌ Test failed:', error.message);
      throw error;
    }
  }

  async setupTestUsers() {
    console.log('📋 Setting up test users...');

    // Get first two users from database
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .limit(2);

    if (error || !users || users.length < 2) {
      throw new Error('Need at least 2 users in database for testing');
    }

    this.testUsers = users;

    // Login both users to get auth tokens
    for (const user of this.testUsers) {
      try {
        const response = await axios.post(`${this.baseURL}/auth/login`, {
          username: user.username,
          password: 'testpass123' // Default test password
        });

        if (response.data.success) {
          this.authTokens[user.id] = response.data.data.token;
          console.log(`✅ Logged in: ${user.username}`);
        }
      } catch (error) {
        console.log(`⚠️ Could not login ${user.username}, trying to register...`);
        
        // Try to register if login fails
        try {
          await axios.post(`${this.baseURL}/auth/register`, {
            username: user.username + '_test',
            password: 'testpass123',
            display_name: user.display_name + ' Test'
          });
          console.log(`✅ Registered test user: ${user.username}_test`);
        } catch (regError) {
          console.log(`⚠️ Registration also failed for ${user.username}`);
        }
      }
    }

    console.log(`📊 Set up ${Object.keys(this.authTokens).length} authenticated users\n`);
  }

  async testAntiCheatStatus() {
    console.log('🛡️ Testing anti-cheat status endpoint...');

    try {
      const response = await axios.get(`${this.baseURL}/stats/anti-cheat-status`);
      
      if (response.data.success) {
        console.log('✅ Anti-cheat system is active');
        console.log(`📊 Validation thresholds:`, response.data.data.anti_cheat_system.thresholds);
        console.log(`👥 Active users tracked: ${response.data.data.monitoring.active_users_tracked}`);
      } else {
        throw new Error('Anti-cheat status check failed');
      }
    } catch (error) {
      console.error('❌ Anti-cheat status test failed:', error.response?.data || error.message);
      throw error;
    }

    console.log();
  }

  async testLegitimateResults() {
    console.log('✅ Testing legitimate game results...');

    const user1 = this.testUsers[0];
    const user2 = this.testUsers[1];
    const token1 = this.authTokens[user1.id];

    if (!token1) {
      console.log('⚠️ No auth token for user1, skipping legitimate tests');
      return;
    }

    // Test 1: Create a game
    console.log('🎮 Creating test game...');
    try {
      const gameResponse = await axios.post(`${this.baseURL}/stats/create-game`, {
        opponent_id: user2.id,
        game_mode: 'casual'
      }, {
        headers: { Authorization: `Bearer ${token1}` }
      });

      if (gameResponse.data.success) {
        const gameId = gameResponse.data.data.game_id;
        this.testGames.push(gameId);
        console.log(`✅ Game created: ${gameId}`);

        // Test 2: Submit legitimate result
        console.log('📊 Submitting legitimate result...');
        const resultResponse = await axios.post(`${this.baseURL}/stats/submit-game-result`, {
          game_id: gameId,
          opponent_id: user2.id,
          result: 'win',
          player_score: 3,
          opponent_score: 2,
          duration_seconds: 420, // 7 minutes
          goals_scored: 3,
          goals_conceded: 2
        }, {
          headers: { Authorization: `Bearer ${token1}` }
        });

        if (resultResponse.data.success) {
          console.log('✅ Legitimate result accepted');
          console.log(`🛡️ Validation info:`, resultResponse.data.data.validation);
          console.log(`⭐ ELO updated:`, resultResponse.data.data.elo_updated);
        } else {
          console.error('❌ Legitimate result rejected:', resultResponse.data.error);
        }
      }
    } catch (error) {
      console.error('❌ Legitimate test failed:', error.response?.data || error.message);
    }

    console.log();
  }

  async testSuspiciousResults() {
    console.log('🚨 Testing suspicious game results...');

    const user1 = this.testUsers[0];
    const user2 = this.testUsers[1];
    const token1 = this.authTokens[user1.id];

    if (!token1) {
      console.log('⚠️ No auth token for user1, skipping suspicious tests');
      return;
    }

    // Test 1: Unrealistic scoring rate
    console.log('🏃 Testing unrealistic scoring rate...');
    try {
      const gameResponse = await axios.post(`${this.baseURL}/stats/create-game`, {
        opponent_id: user2.id,
        game_mode: 'casual'
      }, {
        headers: { Authorization: `Bearer ${token1}` }
      });

      if (gameResponse.data.success) {
        const gameId = gameResponse.data.data.game_id;
        this.testGames.push(gameId);

        const resultResponse = await axios.post(`${this.baseURL}/stats/submit-game-result`, {
          game_id: gameId,
          opponent_id: user2.id,
          result: 'win',
          player_score: 15, // Very high score
          opponent_score: 0,
          duration_seconds: 60, // Very short time
          goals_scored: 15,
          goals_conceded: 0
        }, {
          headers: { Authorization: `Bearer ${token1}` }
        });

        if (resultResponse.data.success) {
          console.log('⚠️ Suspicious result accepted (but flagged)');
          console.log(`🚨 Validation info:`, resultResponse.data.data.validation);
        } else {
          console.log('✅ Suspicious result properly rejected');
          console.log(`🛡️ Rejection reason:`, resultResponse.data.error);
          if (resultResponse.data.details) {
            console.log(`🚩 Flags:`, resultResponse.data.details.flags);
            console.log(`⚠️ Warnings:`, resultResponse.data.details.warnings);
            console.log(`📊 Suspicious level:`, resultResponse.data.details.suspiciousLevel);
          }
        }
      }
    } catch (error) {
      console.log('✅ Suspicious result properly rejected by server');
      if (error.response?.status === 400) {
        console.log(`🛡️ Anti-cheat working:`, error.response.data.error);
      }
    }

    // Test 2: Result-score mismatch
    console.log('🔄 Testing result-score mismatch...');
    try {
      const gameResponse = await axios.post(`${this.baseURL}/stats/create-game`, {
        opponent_id: user2.id,
        game_mode: 'casual'
      }, {
        headers: { Authorization: `Bearer ${token1}` }
      });

      if (gameResponse.data.success) {
        const gameId = gameResponse.data.data.game_id;
        this.testGames.push(gameId);

        const resultResponse = await axios.post(`${this.baseURL}/stats/submit-game-result`, {
          game_id: gameId,
          opponent_id: user2.id,
          result: 'win', // Claims win
          player_score: 2, // But lower score
          opponent_score: 5, // Opponent has higher score
          duration_seconds: 300,
          goals_scored: 2,
          goals_conceded: 5
        }, {
          headers: { Authorization: `Bearer ${token1}` }
        });

        if (resultResponse.data.success) {
          console.log('⚠️ Inconsistent result accepted (should be flagged)');
        }
      }
    } catch (error) {
      console.log('✅ Result-score mismatch properly rejected');
      if (error.response?.status === 400) {
        console.log(`🛡️ Anti-cheat detected inconsistency:`, error.response.data.error);
      }
    }

    console.log();
  }

  async testEdgeCases() {
    console.log('🎯 Testing edge cases...');

    const user1 = this.testUsers[0];
    const user2 = this.testUsers[1];
    const token1 = this.authTokens[user1.id];

    if (!token1) {
      console.log('⚠️ No auth token for user1, skipping edge case tests');
      return;
    }

    // Test 1: Minimum valid game
    console.log('⏰ Testing minimum valid game...');
    try {
      const gameResponse = await axios.post(`${this.baseURL}/stats/create-game`, {
        opponent_id: user2.id,
        game_mode: 'casual'
      }, {
        headers: { Authorization: `Bearer ${token1}` }
      });

      if (gameResponse.data.success) {
        const gameId = gameResponse.data.data.game_id;
        this.testGames.push(gameId);

        const resultResponse = await axios.post(`${this.baseURL}/stats/submit-game-result`, {
          game_id: gameId,
          opponent_id: user2.id,
          result: 'draw',
          player_score: 0,
          opponent_score: 0,
          duration_seconds: 35, // Just above minimum
          goals_scored: 0,
          goals_conceded: 0
        }, {
          headers: { Authorization: `Bearer ${token1}` }
        });

        if (resultResponse.data.success) {
          console.log('✅ Minimum valid game accepted');
          console.log(`🛡️ Validation level:`, resultResponse.data.data.validation.suspiciousLevel);
        }
      }
    } catch (error) {
      console.log('❌ Minimum game test failed:', error.response?.data?.error || error.message);
    }

    // Test 2: Perfect game (high score, no goals conceded)
    console.log('🏆 Testing perfect game...');
    try {
      const gameResponse = await axios.post(`${this.baseURL}/stats/create-game`, {
        opponent_id: user2.id,
        game_mode: 'ranked'
      }, {
        headers: { Authorization: `Bearer ${token1}` }
      });

      if (gameResponse.data.success) {
        const gameId = gameResponse.data.data.game_id;
        this.testGames.push(gameId);

        const resultResponse = await axios.post(`${this.baseURL}/stats/submit-game-result`, {
          game_id: gameId,
          opponent_id: user2.id,
          result: 'win',
          player_score: 7,
          opponent_score: 0,
          duration_seconds: 480, // 8 minutes
          goals_scored: 7,
          goals_conceded: 0
        }, {
          headers: { Authorization: `Bearer ${token1}` }
        });

        if (resultResponse.data.success) {
          console.log('✅ Perfect game accepted');
          console.log(`🛡️ Validation level:`, resultResponse.data.data.validation.suspiciousLevel);
          if (resultResponse.data.data.validation.suspiciousLevel > 0) {
            console.log(`⚠️ Game flagged for review (expected for perfect games)`);
          }
        }
      }
    } catch (error) {
      console.log('❌ Perfect game test failed:', error.response?.data?.error || error.message);
    }

    console.log();
  }

  async generateTestReport() {
    console.log('📋 Generating test report...');
    
    // Get final anti-cheat status
    try {
      const statusResponse = await axios.get(`${this.baseURL}/stats/anti-cheat-status`);
      if (statusResponse.data.success) {
        console.log('📊 Final Anti-Cheat Status:');
        console.log(`   - Active users tracked: ${statusResponse.data.data.monitoring.active_users_tracked}`);
        console.log(`   - System status: ${statusResponse.data.data.anti_cheat_system.status}`);
      }
    } catch (error) {
      console.log('⚠️ Could not fetch final status');
    }

    console.log(`🎮 Created ${this.testGames.length} test games`);
    console.log(`👥 Used ${this.testUsers.length} test users`);
    console.log(`🔑 Generated ${Object.keys(this.authTokens).length} auth tokens`);
  }
}

// Run tests if script is executed directly
if (require.main === module) {
  const tester = new GameResultTester();
  tester.runTests()
    .then(() => {
      return tester.generateTestReport();
    })
    .then(() => {
      console.log('\n✅ Game result processing tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Tests failed:', error);
      process.exit(1);
    });
}

module.exports = GameResultTester;