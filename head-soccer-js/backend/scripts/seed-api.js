/**
 * Database Seeding via API
 * Uses the working registration API to create users, then generates games and stats
 */

require('dotenv').config();
const axios = require('axios');
const { supabase } = require('../database/supabase');

class APISeeder {
  constructor() {
    this.baseURL = 'https://head-soccer-production.up.railway.app/api'; // Use production server
    this.users = [];
    this.games = [];
    this.playerStats = [];
  }

  // Generate user data
  generateUsers() {
    const characters = ['character1', 'character2', 'character3', 'character4', 'character5'];
    const usernames = [
      'soccerking', 'goalmaster', 'ballwizard', 'headhunter', 'kicklegend',
      'scoremachine', 'fieldrunner', 'netshaker', 'ballstorm', 'gamechanger',
      'proplayer99', 'elitestriker', 'championx', 'speeddemon', 'powershot',
      'trickmaster', 'defensewall', 'attackforce', 'midfieldking', 'goalkeeper',
      'rocketshot', 'ballcontrol', 'skillmaster', 'teamcaptain', 'victoryseeker'
    ];

    this.users = usernames.map((username, index) => ({
      username: username,
      password: 'testpass123', // Simple password for testing
      display_name: username.charAt(0).toUpperCase() + username.slice(1),
      character_id: characters[index % characters.length]
    }));

    return this.users;
  }

  // Register users via API
  async registerUsers() {
    console.log('🌱 Registering users via API...');
    const registeredUsers = [];

    for (let i = 0; i < this.users.length; i++) {
      const user = this.users[i];
      
      try {
        const response = await axios.post(`${this.baseURL}/auth/register`, user);
        
        if (response.data.success) {
          console.log(`✅ Registered: ${user.username}`);
          registeredUsers.push({
            ...response.data.user,
            password: user.password // Keep for potential login tests
          });
        } else {
          console.log(`⚠️ Failed to register ${user.username}: ${response.data.error}`);
        }
      } catch (error) {
        console.log(`❌ Error registering ${user.username}: ${error.response?.data?.error || error.message}`);
      }

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ Registered ${registeredUsers.length} users`);
    return registeredUsers;
  }

  // Generate games with registered users
  generateGames(registeredUsers) {
    console.log('📊 Generating games...');
    const gameCount = 100; // Reduced count for testing
    
    for (let i = 0; i < gameCount; i++) {
      // Pick two random different users
      const player1Index = Math.floor(Math.random() * registeredUsers.length);
      let player2Index;
      do {
        player2Index = Math.floor(Math.random() * registeredUsers.length);
      } while (player2Index === player1Index);

      const player1 = registeredUsers[player1Index];
      const player2 = registeredUsers[player2Index];

      // Generate realistic scores (0-4 goals per player, more realistic)
      const player1Score = Math.floor(Math.random() * 5);
      const player2Score = Math.floor(Math.random() * 5);
      
      // Determine winner
      let winner = null;
      if (player1Score > player2Score) {
        winner = player1.id;
      } else if (player2Score > player1Score) {
        winner = player2.id;
      }

      // Game duration (2-6 minutes)
      const duration = Math.floor(Math.random() * 240) + 120;

      // Random game mode
      const gameModes = ['ranked', 'casual', 'tournament'];
      const gameMode = gameModes[Math.floor(Math.random() * gameModes.length)];

      // Random date in last 15 days
      const gameDate = new Date(Date.now() - Math.random() * 15 * 24 * 60 * 60 * 1000).toISOString();

      const game = {
        player1_id: player1.id,
        player2_id: player2.id,
        player1_score: player1Score,
        player2_score: player2Score,
        winner_id: winner,
        status: 'completed',
        game_mode: gameMode,
        duration_seconds: duration,
        created_at: gameDate,
        completed_at: gameDate
      };

      this.games.push(game);
    }

    console.log(`✅ Generated ${this.games.length} games`);
    return this.games;
  }

  // Insert games directly to database
  async insertGames() {
    console.log('🎮 Inserting games into database...');
    
    const { data, error } = await supabase
      .from('games')
      .insert(this.games)
      .select();

    if (error) {
      throw new Error(`Failed to insert games: ${error.message}`);
    }

    console.log(`✅ Inserted ${data.length} games`);
    return data;
  }

  // Calculate and insert player stats
  async calculateAndInsertStats(registeredUsers) {
    console.log('📊 Calculating player statistics...');
    const stats = {};

    // Initialize stats for all users
    registeredUsers.forEach(user => {
      stats[user.id] = {
        user_id: user.id,
        games_played: 0,
        games_won: 0,
        games_lost: 0,
        games_drawn: 0,
        goals_scored: 0,
        goals_conceded: 0,
        clean_sheets: 0,
        win_streak: 0,
        current_streak: 0,
        max_goals_in_game: 0,
        avg_goals_per_game: 0,
        avg_goals_conceded: 0,
        win_rate: 0
      };
    });

    // Process each game
    this.games.forEach(game => {
      const p1Stats = stats[game.player1_id];
      const p2Stats = stats[game.player2_id];

      if (!p1Stats || !p2Stats) return;

      // Update games played
      p1Stats.games_played++;
      p2Stats.games_played++;

      // Update goals
      p1Stats.goals_scored += game.player1_score;
      p1Stats.goals_conceded += game.player2_score;
      p2Stats.goals_scored += game.player2_score;
      p2Stats.goals_conceded += game.player1_score;

      // Update max goals in game
      p1Stats.max_goals_in_game = Math.max(p1Stats.max_goals_in_game, game.player1_score);
      p2Stats.max_goals_in_game = Math.max(p2Stats.max_goals_in_game, game.player2_score);

      // Update clean sheets
      if (game.player2_score === 0) p1Stats.clean_sheets++;
      if (game.player1_score === 0) p2Stats.clean_sheets++;

      // Update win/loss/draw
      if (game.winner_id === game.player1_id) {
        p1Stats.games_won++;
        p2Stats.games_lost++;
      } else if (game.winner_id === game.player2_id) {
        p2Stats.games_won++;
        p1Stats.games_lost++;
      } else {
        p1Stats.games_drawn++;
        p2Stats.games_drawn++;
      }
    });

    // Calculate averages and win rates
    const playerStatsList = Object.values(stats).map(stat => {
      if (stat.games_played > 0) {
        stat.avg_goals_per_game = parseFloat((stat.goals_scored / stat.games_played).toFixed(2));
        stat.avg_goals_conceded = parseFloat((stat.goals_conceded / stat.games_played).toFixed(2));
        stat.win_rate = parseFloat(((stat.games_won / stat.games_played) * 100).toFixed(2));
      }

      // Random current streak (-3 to +7)
      stat.current_streak = Math.floor(Math.random() * 11) - 3;
      stat.win_streak = Math.max(0, stat.current_streak);

      return stat;
    });

    // Insert stats
    const { data, error } = await supabase
      .from('player_stats')
      .insert(playerStatsList)
      .select();

    if (error) {
      throw new Error(`Failed to insert player stats: ${error.message}`);
    }

    console.log(`✅ Inserted ${data.length} player statistics`);
    this.playerStats = data;
    return data;
  }

  // Clear existing data
  async clearData() {
    console.log('🧹 Clearing existing data...');
    
    // Delete in reverse dependency order
    await supabase.from('player_stats').delete().neq('user_id', 'nonexistent');
    await supabase.from('games').delete().neq('id', 'nonexistent');
    await supabase.from('users').delete().neq('username', 'nonexistent');
    
    console.log('✅ Data cleared');
  }

  // Main seeding process
  async seed() {
    try {
      console.log('🚀 Starting API-based database seeding...\n');
      
      // Clear existing data
      await this.clearData();
      
      // Generate and register users
      this.generateUsers();
      const registeredUsers = await this.registerUsers();
      
      if (registeredUsers.length === 0) {
        throw new Error('No users were registered successfully');
      }

      // Generate games and insert them
      this.generateGames(registeredUsers);
      await this.insertGames();
      
      // Calculate and insert statistics
      await this.calculateAndInsertStats(registeredUsers);
      
      console.log('\n🎉 Database seeding completed successfully!');
      
      // Display summary
      const topPlayers = this.playerStats
        .sort((a, b) => b.win_rate - a.win_rate)
        .slice(0, 5);
        
      console.log('\n📈 Top 5 Players by Win Rate:');
      topPlayers.forEach((player, index) => {
        const user = registeredUsers.find(u => u.id === player.user_id);
        console.log(`${index + 1}. ${user.display_name} - ${player.win_rate}% (${player.games_won}W/${player.games_lost}L/${player.games_drawn}D)`);
      });

      return {
        users: registeredUsers.length,
        games: this.games.length,
        stats: this.playerStats.length
      };
      
    } catch (error) {
      console.error('❌ Seeding failed:', error.message);
      throw error;
    }
  }
}

module.exports = APISeeder;

// If run directly
if (require.main === module) {
  const seeder = new APISeeder();
  seeder.seed()
    .then((result) => {
      console.log('\n✅ Seeding complete:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}