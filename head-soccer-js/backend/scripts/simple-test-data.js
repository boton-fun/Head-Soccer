/**
 * Simple Test Data Script
 * Creates minimal test data to verify leaderboard functionality
 */

const { supabase } = require('../database/supabase');

async function createTestData() {
  console.log('🧪 Creating simple test data for leaderboard testing...');

  try {
    // Get existing users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username, elo_rating')
      .limit(10);

    if (usersError) throw usersError;
    if (!users || users.length === 0) {
      console.log('❌ No users found in database');
      return;
    }

    console.log(`📊 Found ${users.length} users, creating test stats...`);

    // Create simple stats for top 5 users
    const testStats = [
      { games_played: 50, games_won: 40, games_lost: 8, games_drawn: 2, goals_scored: 120, goals_conceded: 45 },
      { games_played: 45, games_won: 32, games_lost: 10, games_drawn: 3, goals_scored: 95, goals_conceded: 52 },
      { games_played: 38, games_won: 28, games_lost: 8, games_drawn: 2, goals_scored: 88, goals_conceded: 38 },
      { games_played: 42, games_won: 25, games_lost: 15, games_drawn: 2, goals_scored: 85, goals_conceded: 68 },
      { games_played: 35, games_won: 20, games_lost: 12, games_drawn: 3, goals_scored: 72, goals_conceded: 55 }
    ];

    for (let i = 0; i < Math.min(users.length, testStats.length); i++) {
      const user = users[i];
      const stats = testStats[i];
      
      try {
        // Delete existing stats if any
        await supabase
          .from('player_stats')
          .delete()
          .eq('user_id', user.id);

        // Insert new stats
        const { error } = await supabase
          .from('player_stats')
          .insert({
            user_id: user.id,
            ...stats,
            win_streak: Math.floor(Math.random() * 5),
            best_win_streak: Math.floor(Math.random() * 10) + 5,
            total_play_time_seconds: stats.games_played * (180 + Math.floor(Math.random() * 120))
          });

        if (error) {
          console.error(`❌ Error creating stats for ${user.username}:`, error);
        } else {
          console.log(`✅ Created stats for ${user.username}: ${stats.games_played} games, ${stats.games_won} wins`);
        }
      } catch (error) {
        console.error(`❌ Error processing ${user.username}:`, error);
      }
    }

    console.log('🎉 Test data creation completed!');
    
  } catch (error) {
    console.error('💥 Test data creation failed:', error);
  }
}

// Run if called directly
if (require.main === module) {
  createTestData().then(() => {
    console.log('Test data script finished');
    process.exit(0);
  }).catch((error) => {
    console.error('Test data script failed:', error);
    process.exit(1);
  });
}

module.exports = { createTestData };