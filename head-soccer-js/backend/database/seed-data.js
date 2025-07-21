/**
 * Database Seeding Script
 * Populates the database with dummy users, games, and statistics for testing
 */

const { supabase } = require('./supabase');

class DatabaseSeeder {
  constructor() {
    this.users = [];
    this.games = [];
    this.playerStats = [];
  }

  // Generate realistic dummy users
  generateUsers() {
    const characters = ['character1', 'character2', 'character3', 'character4', 'character5'];
    const usernames = [
      'SoccerKing', 'GoalMaster', 'BallWizard', 'HeadHunter', 'KickLegend',
      'ScoreMachine', 'FieldRunner', 'NetShaker', 'BallStorm', 'GameChanger',
      'ProPlayer99', 'EliteStriker', 'ChampionX', 'SpeedDemon', 'PowerShot',
      'TrickMaster', 'DefenseWall', 'AttackForce', 'MidFieldKing', 'GoalKeeper',
      'RocketShot', 'BallControl', 'SkillMaster', 'TeamCaptain', 'VictorySeeker'
    ];

    this.users = usernames.map((username, index) => ({
      username: username.toLowerCase(),
      display_name: username,
      password_hash: '$2b$10$dummy.hash.for.testing.purposes.only.12345', // Dummy hash
      character_id: characters[index % characters.length],
      elo_rating: Math.floor(Math.random() * 1000) + 1000 // 1000-2000 ELO
    }));

    return this.users;
  }

  // Generate realistic game results (must be called after users are inserted)
  generateGames(insertedUsers) {
    const gameCount = 150; // Generate 150 games
    
    for (let i = 0; i < gameCount; i++) {
      // Pick two random different users
      const player1Index = Math.floor(Math.random() * insertedUsers.length);
      let player2Index;
      do {
        player2Index = Math.floor(Math.random() * insertedUsers.length);
      } while (player2Index === player1Index);

      const player1 = insertedUsers[player1Index];
      const player2 = insertedUsers[player2Index];

      // Generate realistic scores (0-5 goals per player)
      const player1Score = Math.floor(Math.random() * 6);
      const player2Score = Math.floor(Math.random() * 6);
      
      // Determine winner
      let winner = null;
      if (player1Score > player2Score) {
        winner = player1.id;
      } else if (player2Score > player1Score) {
        winner = player2.id;
      }
      // If scores are equal, winner stays null (draw)

      // Game duration (3-8 minutes)
      const duration = Math.floor(Math.random() * 300) + 180;

      // Random game mode
      const gameModes = ['ranked', 'casual', 'tournament'];
      const gameMode = gameModes[Math.floor(Math.random() * gameModes.length)];

      // Random date in last 30 days
      const gameDate = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();

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

    return this.games;
  }

  // Calculate player statistics from games (must be called after games are generated)
  calculatePlayerStats(insertedUsers) {
    const stats = {};

    // Initialize stats for all users
    insertedUsers.forEach(user => {
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
        win_rate: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
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
    Object.values(stats).forEach(stat => {
      if (stat.games_played > 0) {
        stat.avg_goals_per_game = parseFloat((stat.goals_scored / stat.games_played).toFixed(2));
        stat.avg_goals_conceded = parseFloat((stat.goals_conceded / stat.games_played).toFixed(2));
        stat.win_rate = parseFloat(((stat.games_won / stat.games_played) * 100).toFixed(2));
      }

      // Random current streak (-5 to +10)
      stat.current_streak = Math.floor(Math.random() * 16) - 5;
      stat.win_streak = Math.max(0, stat.current_streak);
    });

    this.playerStats = Object.values(stats);
    return this.playerStats;
  }

  // Insert users into database
  async seedUsers() {
    console.log('🌱 Seeding users...');
    
    const { data, error } = await supabase
      .from('users')
      .insert(this.users)
      .select();

    if (error) {
      throw new Error(`Failed to seed users: ${error.message}`);
    }

    console.log(`✅ Seeded ${data.length} users`);
    return data;
  }

  // Insert games into database
  async seedGames() {
    console.log('🌱 Seeding games...');
    
    const { data, error } = await supabase
      .from('games')
      .insert(this.games)
      .select();

    if (error) {
      throw new Error(`Failed to seed games: ${error.message}`);
    }

    console.log(`✅ Seeded ${data.length} games`);
    return data;
  }

  // Insert player stats into database
  async seedPlayerStats() {
    console.log('🌱 Seeding player stats...');
    
    const { data, error } = await supabase
      .from('player_stats')
      .insert(this.playerStats)
      .select();

    if (error) {
      throw new Error(`Failed to seed player stats: ${error.message}`);
    }

    console.log(`✅ Seeded ${data.length} player stats`);
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

  // Run complete seeding process
  async seedDatabase() {
    try {
      console.log('🚀 Starting database seeding...\n');
      
      // Clear existing data
      await this.clearData();
      
      // Generate and insert users first
      console.log('📊 Generating dummy users...');
      this.generateUsers();
      console.log(`Generated ${this.users.length} users`);
      
      const insertedUsers = await this.seedUsers();
      
      // Generate games using the inserted users with UUIDs
      console.log('📊 Generating games and statistics...');
      this.generateGames(insertedUsers);
      this.calculatePlayerStats(insertedUsers);
      
      console.log(`Generated:
  - ${this.games.length} games  
  - ${this.playerStats.length} player statistics\n`);

      // Insert games and stats
      await this.seedGames();
      await this.seedPlayerStats();
      
      console.log('\n🎉 Database seeding completed successfully!');
      
      // Display summary
      const topPlayers = this.playerStats
        .sort((a, b) => b.win_rate - a.win_rate)
        .slice(0, 5);
        
      console.log('\n📈 Top 5 Players by Win Rate:');
      topPlayers.forEach((player, index) => {
        const user = insertedUsers.find(u => u.id === player.user_id);
        console.log(`${index + 1}. ${user.display_name} - ${player.win_rate}% (${player.games_won}W/${player.games_lost}L/${player.games_drawn}D)`);
      });

      return {
        users: insertedUsers.length,
        games: this.games.length,
        stats: this.playerStats.length
      };
      
    } catch (error) {
      console.error('❌ Seeding failed:', error.message);
      throw error;
    }
  }
}

module.exports = DatabaseSeeder;

// If run directly
if (require.main === module) {
  const seeder = new DatabaseSeeder();
  seeder.seedDatabase()
    .then((result) => {
      console.log('\n✅ Seeding complete:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}