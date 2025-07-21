/**
 * Check existing data in database
 */

require('dotenv').config();
const { supabase } = require('../database/supabase');

async function checkData() {
  try {
    console.log('🔍 Checking database data...\n');

    // Check users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*');

    if (usersError) {
      console.error('❌ Error fetching users:', usersError.message);
    } else {
      console.log(`📊 Users: ${users.length}`);
      users.slice(0, 5).forEach(user => {
        console.log(`  - ${user.username} (${user.display_name}) - ELO: ${user.elo_rating}`);
      });
      if (users.length > 5) console.log(`  ... and ${users.length - 5} more`);
    }

    // Check games
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('*');

    if (gamesError) {
      console.error('❌ Error fetching games:', gamesError.message);
    } else {
      console.log(`\n🎮 Games: ${games.length}`);
      games.slice(0, 3).forEach(game => {
        console.log(`  - Game: ${game.player1_score} - ${game.player2_score} (${game.status})`);
      });
    }

    // Check player stats
    const { data: stats, error: statsError } = await supabase
      .from('player_stats')
      .select('*');

    if (statsError) {
      console.error('❌ Error fetching stats:', statsError.message);
    } else {
      console.log(`\n📈 Player Stats: ${stats.length}`);
      stats.slice(0, 3).forEach(stat => {
        console.log(`  - User: ${stat.user_id} - ${stat.games_played} games, ${stat.games_won} wins`);
      });
    }

    return { users: users?.length || 0, games: games?.length || 0, stats: stats?.length || 0 };

  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkData().then(result => {
  console.log('\n✅ Check complete:', result);
});