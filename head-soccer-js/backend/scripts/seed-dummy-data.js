/**
 * Dummy Data Seeding Script
 * Creates realistic test data for leaderboard and statistics testing
 */

const { supabase } = require('../database/supabase');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Dummy player data with varied skill levels
const DUMMY_PLAYERS = [
  { username: 'ronaldinho_legend', display_name: 'Ronaldinho Legend', skill: 'expert' },
  { username: 'messi_goat', display_name: 'Messi GOAT', skill: 'expert' },
  { username: 'cr7_machine', display_name: 'CR7 Machine', skill: 'expert' },
  { username: 'neymar_skills', display_name: 'Neymar Skills', skill: 'advanced' },
  { username: 'mbappe_speed', display_name: 'Mbappe Speed', skill: 'advanced' },
  { username: 'benzema_clutch', display_name: 'Benzema Clutch', skill: 'advanced' },
  { username: 'haaland_goal', display_name: 'Haaland Goal Machine', skill: 'intermediate' },
  { username: 'kane_england', display_name: 'Harry Kane', skill: 'intermediate' },
  { username: 'salah_pharaoh', display_name: 'Mo Salah', skill: 'intermediate' },
  { username: 'rookie_player1', display_name: 'Rookie Player', skill: 'beginner' },
  { username: 'amateur_joe', display_name: 'Amateur Joe', skill: 'beginner' },
  { username: 'learning_sam', display_name: 'Learning Sam', skill: 'beginner' },
  { username: 'pro_gamer99', display_name: 'Pro Gamer', skill: 'advanced' },
  { username: 'casual_fan', display_name: 'Casual Fan', skill: 'intermediate' },
  { username: 'weekend_warrior', display_name: 'Weekend Warrior', skill: 'intermediate' }
];

// Skill level to ELO mapping
const SKILL_ELO = {
  'expert': [1800, 2500],
  'advanced': [1500, 1799],
  'intermediate': [1200, 1499],
  'beginner': [800, 1199]
};

// Character pool
const CHARACTERS = ['player1', 'player2', 'player3', 'player4', 'player5'];

/**
 * Generate random number between min and max (inclusive)
 */
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get random element from array
 */
function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate ELO rating based on skill level
 */
function generateELO(skill) {
  const [min, max] = SKILL_ELO[skill];
  return randomBetween(min, max);
}

/**
 * Create dummy users
 */
async function createDummyUsers() {
  console.log('🎭 Creating dummy users...');
  const createdUsers = [];
  
  for (const playerData of DUMMY_PLAYERS) {
    try {
      const userId = crypto.randomUUID();
      const hashedPassword = await bcrypt.hash('testpass123', 12);
      const eloRating = generateELO(playerData.skill);
      
      const userData = {
        id: userId,
        username: playerData.username,
        display_name: playerData.display_name,
        password_hash: hashedPassword,
        character_id: randomChoice(CHARACTERS),
        elo_rating: eloRating,
        created_at: new Date(Date.now() - randomBetween(1, 180) * 24 * 60 * 60 * 1000).toISOString(), // Random date in last 6 months
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single();

      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          console.log(`⚠️  User ${playerData.username} already exists, skipping...`);
          // Get existing user
          const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('username', playerData.username)
            .single();
          
          if (existingUser) {
            createdUsers.push({ ...existingUser, skill: playerData.skill });
          }
          continue;
        }
        throw error;
      }

      createdUsers.push({ ...data, skill: playerData.skill });
      console.log(`✅ Created user: ${playerData.username} (ELO: ${eloRating})`);
      
      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ Error creating user ${playerData.username}:`, error);
    }
  }
  
  console.log(`🎉 Created ${createdUsers.length} users`);
  return createdUsers;
}

/**
 * Generate realistic game statistics based on skill level
 */
function generateGameStats(skill, gamesPlayed) {
  let baseWinRate, baseGoalsPerGame, basePlayTime;
  
  switch (skill) {
    case 'expert':
      baseWinRate = randomBetween(75, 90) / 100;
      baseGoalsPerGame = randomBetween(25, 40) / 10;
      basePlayTime = randomBetween(180, 300); // 3-5 minutes per game
      break;
    case 'advanced':
      baseWinRate = randomBetween(60, 75) / 100;
      baseGoalsPerGame = randomBetween(20, 30) / 10;
      basePlayTime = randomBetween(200, 320);
      break;
    case 'intermediate':
      baseWinRate = randomBetween(45, 60) / 100;
      baseGoalsPerGame = randomBetween(15, 25) / 10;
      basePlayTime = randomBetween(240, 360);
      break;
    case 'beginner':
      baseWinRate = randomBetween(20, 45) / 100;
      baseGoalsPerGame = randomBetween(8, 18) / 10;
      basePlayTime = randomBetween(300, 420);
      break;
  }

  const gamesWon = Math.floor(gamesPlayed * baseWinRate);
  const gamesLost = Math.floor(gamesPlayed * (1 - baseWinRate) * 0.8); // 80% of non-wins are losses
  const gamesDrawn = gamesPlayed - gamesWon - gamesLost;
  
  const goalsScored = Math.floor(gamesPlayed * baseGoalsPerGame);
  const goalsConceded = Math.floor(goalsScored * (1.2 - baseWinRate)); // Better players concede less
  
  const totalPlayTime = Math.floor(gamesPlayed * basePlayTime);
  const winStreak = Math.min(randomBetween(0, Math.floor(gamesWon)), 15);
  const bestWinStreak = Math.min(winStreak + randomBetween(0, 5), Math.floor(gamesWon));

  return {
    games_played: gamesPlayed,
    games_won: gamesWon,
    games_lost: gamesLost,
    games_drawn: gamesDrawn,
    goals_scored: goalsScored,
    goals_conceded: goalsConceded,
    win_streak: winStreak,
    best_win_streak: bestWinStreak,
    total_play_time_seconds: totalPlayTime,
    last_played_at: new Date(Date.now() - randomBetween(0, 7) * 24 * 60 * 60 * 1000).toISOString() // Last 7 days
  };
}

/**
 * Create player statistics
 */
async function createPlayerStatistics(users) {
  console.log('📊 Creating player statistics...');
  
  for (const user of users) {
    try {
      // Generate games played based on skill level and account age
      const accountAge = (Date.now() - new Date(user.created_at).getTime()) / (24 * 60 * 60 * 1000);
      const maxGames = Math.min(Math.floor(accountAge * 2), 500); // Up to 2 games per day, max 500
      
      let gamesPlayed;
      switch (user.skill) {
        case 'expert': gamesPlayed = randomBetween(Math.max(50, maxGames * 0.8), maxGames); break;
        case 'advanced': gamesPlayed = randomBetween(Math.max(30, maxGames * 0.6), Math.floor(maxGames * 0.9)); break;
        case 'intermediate': gamesPlayed = randomBetween(Math.max(15, maxGames * 0.3), Math.floor(maxGames * 0.7)); break;
        case 'beginner': gamesPlayed = randomBetween(5, Math.floor(maxGames * 0.4)); break;
      }
      
      const stats = generateGameStats(user.skill, gamesPlayed);
      
      // Check if stats already exist
      const { data: existingStats } = await supabase
        .from('player_stats')
        .select('user_id')
        .eq('user_id', user.id)
        .single();

      if (existingStats) {
        console.log(`⚠️  Stats for ${user.username} already exist, skipping...`);
        continue;
      }

      const { error } = await supabase
        .from('player_stats')
        .insert({
          user_id: user.id,
          ...stats
          // Let database handle created_at and updated_at
        });

      if (error) {
        console.error(`❌ Error creating stats for ${user.username}:`, error);
      } else {
        console.log(`✅ Created stats for ${user.username}: ${stats.games_played} games, ${stats.games_won} wins`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
    } catch (error) {
      console.error(`❌ Error processing stats for ${user.username}:`, error);
    }
  }
}

/**
 * Create dummy game records
 */
async function createDummyGames(users) {
  console.log('🎮 Creating dummy game records...');
  
  const gamesData = [];
  const numGames = randomBetween(100, 200); // Create 100-200 games
  
  for (let i = 0; i < numGames; i++) {
    const player1 = randomChoice(users);
    let player2 = randomChoice(users);
    
    // Ensure different players
    while (player2.id === player1.id) {
      player2 = randomChoice(users);
    }
    
    // Determine winner based on ELO ratings (higher ELO has better chance)
    const eloDiff = player1.elo_rating - player2.elo_rating;
    const player1WinChance = 1 / (1 + Math.pow(10, -eloDiff / 400)); // Chess ELO formula
    
    const player1Wins = Math.random() < player1WinChance;
    const isDraw = Math.random() < 0.1; // 10% chance of draw
    
    let player1Score, player2Score, winnerId;
    
    if (isDraw) {
      const drawScore = randomBetween(0, 3);
      player1Score = player2Score = drawScore;
      winnerId = null;
    } else if (player1Wins) {
      player1Score = randomBetween(1, 5);
      player2Score = randomBetween(0, player1Score - 1);
      winnerId = player1.id;
    } else {
      player2Score = randomBetween(1, 5);
      player1Score = randomBetween(0, player2Score - 1);
      winnerId = player2.id;
    }
    
    const gameData = {
      id: crypto.randomUUID(),
      player1_id: player1.id,
      player2_id: player2.id,
      player1_score: player1Score,
      player2_score: player2Score,
      winner_id: winnerId,
      status: 'completed',
      game_mode: randomChoice(['ranked', 'casual']),
      duration_seconds: randomBetween(60, 600), // 1-10 minutes
      created_at: new Date(Date.now() - randomBetween(0, 90) * 24 * 60 * 60 * 1000).toISOString(), // Last 3 months
      completed_at: new Date(Date.now() - randomBetween(0, 90) * 24 * 60 * 60 * 1000).toISOString()
      // Remove updated_at as it doesn't exist in games table
    };
    
    gamesData.push(gameData);
  }
  
  // Insert games in batches
  const batchSize = 50;
  for (let i = 0; i < gamesData.length; i += batchSize) {
    const batch = gamesData.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('games')
      .upsert(batch);
    
    if (error) {
      console.error(`❌ Error inserting game batch ${i / batchSize + 1}:`, error);
    } else {
      console.log(`✅ Inserted game batch ${i / batchSize + 1}/${Math.ceil(gamesData.length / batchSize)}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`🎉 Created ${gamesData.length} game records`);
}

/**
 * Main seeding function
 */
async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...');
    console.log('==========================================');
    
    // Step 1: Create users
    const users = await createDummyUsers();
    
    if (users.length === 0) {
      console.log('❌ No users were created, aborting seeding');
      return;
    }
    
    // Step 2: Create player statistics
    await createPlayerStatistics(users);
    
    // Step 3: Create game records
    await createDummyGames(users);
    
    console.log('==========================================');
    console.log('🎉 Database seeding completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   👥 Users: ${users.length}`);
    console.log(`   📈 Statistics: ${users.length} player stat records`);
    console.log(`   🎮 Games: ~100-200 game records`);
    console.log('');
    console.log('🔧 Ready to test leaderboard endpoints!');
    
  } catch (error) {
    console.error('💥 Database seeding failed:', error);
    throw error;
  }
}

/**
 * Clear existing dummy data (optional cleanup function)
 */
async function clearDummyData() {
  console.log('🧹 Clearing existing dummy data...');
  
  try {
    // Delete in correct order due to foreign keys
    await supabase.from('games').delete().in('status', ['completed', 'abandoned']);
    await supabase.from('player_stats').delete().gt('games_played', -1); // All stats
    await supabase.from('users').delete().in('username', DUMMY_PLAYERS.map(p => p.username));
    
    console.log('✅ Dummy data cleared');
  } catch (error) {
    console.error('❌ Error clearing dummy data:', error);
  }
}

// Export functions
module.exports = {
  seedDatabase,
  clearDummyData,
  createDummyUsers,
  createPlayerStatistics,
  createDummyGames
};

// Run seeding if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--clear')) {
    clearDummyData().then(() => {
      console.log('Cleanup completed');
      process.exit(0);
    }).catch((error) => {
      console.error('Cleanup failed:', error);
      process.exit(1);
    });
  } else {
    seedDatabase().then(() => {
      console.log('Seeding completed');
      process.exit(0);
    }).catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
  }
}