/**
 * Simple stats update for testing leaderboards
 */

require('dotenv').config();
const { supabase } = require('../database/supabase');

async function updateSimpleStats() {
  try {
    console.log('📊 Updating simple player statistics...\n');

    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*');

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    console.log(`Found ${users.length} users to update`);

    // Update each user with simple stats
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      
      const gamesPlayed = Math.floor(Math.random() * 30) + 10; // 10-40 games
      const winRate = 0.3 + (Math.random() * 0.4); // 30-70% win rate
      const gamesWon = Math.floor(gamesPlayed * winRate);
      const gamesLost = Math.floor(gamesPlayed * (1 - winRate - 0.1));
      const gamesDrawn = gamesPlayed - gamesWon - gamesLost;

      const goalsScored = Math.floor(gamesPlayed * (1 + Math.random() * 2)); // 1-3 goals per game
      const goalsConceded = Math.floor(gamesPlayed * (0.5 + Math.random() * 1.5)); // 0.5-2 goals conceded

      // Update only the basic columns that exist
      const { error: statsError } = await supabase
        .from('player_stats')
        .update({
          games_played: gamesPlayed,
          games_won: gamesWon,
          games_lost: gamesLost,
          games_drawn: gamesDrawn,
          goals_scored: goalsScored,
          goals_conceded: goalsConceded,
          win_streak: Math.floor(Math.random() * 5),
          best_win_streak: Math.floor(Math.random() * 8),
          clean_sheets: Math.floor(gamesWon * 0.3),
          goals_per_game: parseFloat((goalsScored / gamesPlayed).toFixed(2))
        })
        .eq('user_id', user.id);

      if (statsError) {
        console.error(`❌ Failed to update stats for ${user.username}:`, statsError.message);
      } else {
        console.log(`✅ Updated ${user.username}: ${gamesPlayed} games, ${gamesWon} wins`);
      }

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n🎉 Simple stats update completed!');
    return users.length;

  } catch (error) {
    console.error('❌ Update failed:', error.message);
    throw error;
  }
}

updateSimpleStats().then(result => {
  console.log(`\n✅ Updated ${result} player statistics`);
}).catch(error => {
  console.error('❌ Failed:', error);
  process.exit(1);
});