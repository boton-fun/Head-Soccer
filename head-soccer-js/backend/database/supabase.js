const { createClient } = require('@supabase/supabase-js');
const config = require('../utils/config');

// Initialize Supabase client
const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// User operations
const users = {
  // Create a new user profile
  async create(userData) {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single();
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error creating user:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Get user by ID
  async getById(userId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*, player_stats(*)')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching user:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Get user by username
  async getByUsername(username) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*, player_stats(*)')
        .eq('username', username)
        .single();
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: 'User not found' };
      }
      return { success: false, error: error.message };
    }
  },

  // Update user profile
  async update(userId, updates) {
    try {
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error updating user:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Check if username is available
  async isUsernameAvailable(username) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single();
      
      if (error && error.code === 'PGRST116') {
        return { success: true, available: true };
      }
      
      return { success: true, available: false };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Find user by username (for login)
  async findByUsername(username) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username.toLowerCase())
        .single();
      
      if (error && error.code === 'PGRST116') {
        return { success: true, data: null };
      }
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error finding user by username:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Find user by ID (for profile)
  async findById(userId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error && error.code === 'PGRST116') {
        return { success: true, data: null };
      }
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error finding user by ID:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Update last login timestamp
  async updateLastLogin(userId) {
    try {
      const { error } = await supabase
        .from('users')
        .update({ 
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error updating last login:', error.message);
      return { success: false, error: error.message };
    }
  }
};

// Game operations
const games = {
  // Create a new game
  async create(gameData) {
    try {
      const { data, error } = await supabase
        .from('games')
        .insert(gameData)
        .select()
        .single();
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error creating game:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Update game (score, status, etc.)
  async update(gameId, updates) {
    try {
      const { data, error } = await supabase
        .from('games')
        .update(updates)
        .eq('id', gameId)
        .select()
        .single();
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error updating game:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Complete a game
  async complete(gameId, winnerId, player1Score, player2Score) {
    try {
      const updates = {
        status: 'completed',
        winner_id: winnerId,
        player1_score: player1Score,
        player2_score: player2Score,
        completed_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('games')
        .update(updates)
        .eq('id', gameId)
        .select()
        .single();
      
      if (error) throw error;
      
      // Update player statistics
      await this.updatePlayerStats(data);
      
      return { success: true, data };
    } catch (error) {
      console.error('Error completing game:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Update player statistics after game completion
  async updatePlayerStats(game) {
    try {
      const isDraw = game.player1_score === game.player2_score;
      
      // Update player 1 stats
      await stats.updateAfterGame(
        game.player1_id,
        game.winner_id === game.player1_id,
        isDraw,
        game.player1_score,
        game.player2_score,
        game.duration_seconds
      );
      
      // Update player 2 stats
      await stats.updateAfterGame(
        game.player2_id,
        game.winner_id === game.player2_id,
        isDraw,
        game.player2_score,
        game.player1_score,
        game.duration_seconds
      );
      
      // Update ELO ratings
      await this.updateEloRatings(game);
      
    } catch (error) {
      console.error('Error updating player stats:', error.message);
    }
  },

  // Update ELO ratings after game
  async updateEloRatings(game) {
    try {
      // Get current ratings
      const { data: player1 } = await users.getById(game.player1_id);
      const { data: player2 } = await users.getById(game.player2_id);
      
      if (!player1 || !player2) return;
      
      // Calculate new ELO ratings
      const K = 32; // K-factor
      const expectedScore1 = 1 / (1 + Math.pow(10, (player2.elo_rating - player1.elo_rating) / 400));
      const expectedScore2 = 1 - expectedScore1;
      
      let actualScore1, actualScore2;
      if (game.winner_id === game.player1_id) {
        actualScore1 = 1;
        actualScore2 = 0;
      } else if (game.winner_id === game.player2_id) {
        actualScore1 = 0;
        actualScore2 = 1;
      } else {
        actualScore1 = 0.5;
        actualScore2 = 0.5;
      }
      
      const newRating1 = Math.round(player1.elo_rating + K * (actualScore1 - expectedScore1));
      const newRating2 = Math.round(player2.elo_rating + K * (actualScore2 - expectedScore2));
      
      // Update ratings
      await users.update(game.player1_id, { elo_rating: newRating1 });
      await users.update(game.player2_id, { elo_rating: newRating2 });
      
    } catch (error) {
      console.error('Error updating ELO ratings:', error.message);
    }
  },

  // Get active games
  async getActiveGames() {
    try {
      const { data, error } = await supabase
        .from('games')
        .select(`
          *,
          player1:player1_id(username, display_name, avatar_url),
          player2:player2_id(username, display_name, avatar_url)
        `)
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching active games:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Get user's game history
  async getUserGames(userId, limit = 20) {
    try {
      const { data, error } = await supabase
        .from('games')
        .select(`
          *,
          player1:player1_id(username, display_name, avatar_url),
          player2:player2_id(username, display_name, avatar_url)
        `)
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching user games:', error.message);
      return { success: false, error: error.message };
    }
  }
};

// Player statistics operations
const stats = {
  // Update stats after a game
  async updateAfterGame(userId, won, drew, goalsScored, goalsConceded, duration) {
    try {
      // Get current stats
      const { data: currentStats, error: fetchError } = await supabase
        .from('player_stats')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (fetchError) throw fetchError;
      
      // Calculate updates
      const updates = {
        games_played: currentStats.games_played + 1,
        games_won: currentStats.games_won + (won ? 1 : 0),
        games_lost: currentStats.games_lost + (!won && !drew ? 1 : 0),
        games_drawn: currentStats.games_drawn + (drew ? 1 : 0),
        goals_scored: currentStats.goals_scored + goalsScored,
        goals_conceded: currentStats.goals_conceded + goalsConceded,
        win_streak: won ? currentStats.win_streak + 1 : 0,
        best_win_streak: won && currentStats.win_streak + 1 > currentStats.best_win_streak 
          ? currentStats.win_streak + 1 
          : currentStats.best_win_streak,
        total_play_time_seconds: currentStats.total_play_time_seconds + (duration || 0),
        last_played_at: new Date().toISOString()
      };
      
      const { error: updateError } = await supabase
        .from('player_stats')
        .update(updates)
        .eq('user_id', userId);
      
      if (updateError) throw updateError;
      return { success: true };
    } catch (error) {
      console.error('Error updating player stats:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Get leaderboard
  async getLeaderboard(limit = 100) {
    try {
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .limit(limit);
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching leaderboard:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Find user statistics by user ID
  async findByUserId(userId) {
    try {
      const { data, error } = await supabase
        .from('player_stats')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error && error.code === 'PGRST116') {
        return { success: true, data: null };
      }
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error finding stats by user ID:', error.message);
      return { success: false, error: error.message };
    }
  }
};

module.exports = {
  supabase,
  users,
  games,
  stats
};