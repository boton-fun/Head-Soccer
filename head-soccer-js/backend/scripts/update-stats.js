/**
 * Update player stats manually for testing leaderboards
 */

require('dotenv').config();
const { supabase } = require('../database/supabase');

async function updateStats() {
  try {
    console.log('📊 Updating player statistics for leaderboard testing...\n');

    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*');

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    console.log(`Found ${users.length} users to update`);

    // Create realistic stats for each user
    const statsUpdates = users.map((user, index) => {
      const gamesPlayed = Math.floor(Math.random() * 50) + 10; // 10-60 games
      const winRate = 0.3 + (Math.random() * 0.4); // 30-70% win rate
      const gamesWon = Math.floor(gamesPlayed * winRate);
      const gamesLost = Math.floor(gamesPlayed * (1 - winRate - 0.1));
      const gamesDrawn = gamesPlayed - gamesWon - gamesLost;

      const goalsScored = Math.floor(gamesPlayed * (1.5 + Math.random() * 2)); // 1.5-3.5 goals per game
      const goalsConceded = Math.floor(gamesPlayed * (1 + Math.random() * 2)); // 1-3 goals conceded per game

      // Update ELO based on performance
      const newElo = 1000 + Math.floor(gamesWon * 15 + (goalsScored - goalsConceded) * 2);

      return {
        user_id: user.id,
        games_played: gamesPlayed,
        games_won: gamesWon,
        games_lost: gamesLost,
        games_drawn: gamesDrawn,
        goals_scored: goalsScored,
        goals_conceded: goalsConceded,
        clean_sheets: Math.floor(gamesWon * 0.3), // 30% of wins are clean sheets
        win_streak: Math.floor(Math.random() * 8), // 0-7 win streak
        current_streak: Math.floor(Math.random() * 11) - 5, // -5 to +5 current streak
        max_goals_in_game: Math.floor(Math.random() * 5) + 1, // 1-5 max goals
        avg_goals_per_game: parseFloat((goalsScored / gamesPlayed).toFixed(2)),
        avg_goals_conceded: parseFloat((goalsConceded / gamesPlayed).toFixed(2)),
        win_rate: parseFloat((winRate * 100).toFixed(2)),
        elo: newElo
      };
    });

    // Update player stats
    for (let i = 0; i < statsUpdates.length; i++) {
      const stat = statsUpdates[i];
      const user = users[i];

      // Update player_stats table
      const { error: statsError } = await supabase
        .from('player_stats')
        .update({
          games_played: stat.games_played,
          games_won: stat.games_won,
          games_lost: stat.games_lost,
          games_drawn: stat.games_drawn,
          goals_scored: stat.goals_scored,
          goals_conceded: stat.goals_conceded,
          clean_sheets: stat.clean_sheets,
          win_streak: stat.win_streak,
          current_streak: stat.current_streak,
          max_goals_in_game: stat.max_goals_in_game,
          avg_goals_per_game: stat.avg_goals_per_game,
          avg_goals_conceded: stat.avg_goals_conceded,
          win_rate: stat.win_rate
        })
        .eq('user_id', stat.user_id);

      if (statsError) {
        console.error(`❌ Failed to update stats for ${user.username}:`, statsError.message);
      } else {
        console.log(`✅ Updated stats for ${user.username}: ${stat.games_played} games, ${stat.win_rate}% win rate`);
      }

      // Update user ELO
      const { error: eloError } = await supabase
        .from('users')
        .update({ elo_rating: stat.elo })
        .eq('id', user.id);

      if (eloError) {
        console.error(`❌ Failed to update ELO for ${user.username}:`, eloError.message);
      }

      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n🎉 Player statistics updated successfully!');

    // Show top performers
    const topPerformers = statsUpdates
      .sort((a, b) => b.elo - a.elo)
      .slice(0, 5);

    console.log('\n🏆 Top 5 Players by ELO:');
    topPerformers.forEach((stat, index) => {
      const user = users.find(u => u.id === stat.user_id);
      console.log(`${index + 1}. ${user.display_name} - ELO: ${stat.elo} (${stat.win_rate}% wins)`);
    });

    return statsUpdates.length;

  } catch (error) {
    console.error('❌ Update failed:', error.message);
    throw error;
  }
}

updateStats().then(result => {
  console.log(`\n✅ Updated ${result} player statistics`);
}).catch(error => {
  console.error('❌ Failed:', error);
  process.exit(1);
});