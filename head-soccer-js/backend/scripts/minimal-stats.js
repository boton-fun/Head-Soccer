/**
 * Minimal stats update - just games_played
 */

require('dotenv').config();
const { supabase } = require('../database/supabase');

async function updateMinimalStats() {
  try {
    console.log('📊 Updating minimal stats (games_played only)...\n');

    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*');

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    console.log(`Found ${users.length} users to update`);

    // Update each user with just games_played
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      
      const gamesPlayed = Math.floor(Math.random() * 20) + 5; // 5-25 games
      const gamesWon = Math.floor(gamesPlayed * 0.5); // Roughly 50% win rate
      const gamesLost = Math.floor(gamesPlayed * 0.4); // 40% lose rate
      const gamesDrawn = gamesPlayed - gamesWon - gamesLost; // Rest are draws

      // Try minimal update first
      const { error: statsError } = await supabase
        .from('player_stats')
        .update({
          games_played: gamesPlayed,
          games_won: gamesWon,
          games_lost: gamesLost,
          games_drawn: gamesDrawn
        })
        .eq('user_id', user.id);

      if (statsError) {
        console.error(`❌ Failed to update stats for ${user.username}:`, statsError.message);
      } else {
        console.log(`✅ Updated ${user.username}: ${gamesPlayed} games played`);
      }
    }

    console.log('\n🎉 Minimal stats update completed!');
    return users.length;

  } catch (error) {
    console.error('❌ Update failed:', error.message);
    throw error;
  }
}

updateMinimalStats().then(result => {
  console.log(`\n✅ Updated ${result} player statistics`);
}).catch(error => {
  console.error('❌ Failed:', error);
  process.exit(1);
});