/**
 * Game Statistics API Routes
 * Handles player statistics, game history, and performance metrics
 */

const express = require('express');
const { authenticateToken } = require('./auth');
const { rateLimiters, handleValidationErrors } = require('../middleware');
const { body, query, param } = require('express-validator');
const { users, stats, games, supabase } = require('../database/supabase');

const router = express.Router();

/**
 * GET /api/stats/player/:userId
 * Get comprehensive player statistics
 */
router.get('/player/:userId', 
  rateLimiters.read,
  param('userId').isUUID().withMessage('Invalid user ID format'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { userId } = req.params;

      // Get basic user info
      const userResult = await users.findById(userId);
      if (!userResult.success || !userResult.data) {
        return res.status(404).json({
          success: false,
          error: 'Player not found'
        });
      }

      // Get player statistics
      const statsResult = await stats.findByUserId(userId);
      const playerStats = statsResult.success ? statsResult.data : null;

      // Get recent games count
      const { data: recentGames, error: gamesError } = await supabase
        .from('games')
        .select('id')
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
        .eq('status', 'completed');

      const recentGamesCount = gamesError ? 0 : recentGames?.length || 0;

      // Calculate advanced metrics
      let winRate = 0;
      let goalRatio = 0;
      let averageGameDuration = 0;

      if (playerStats) {
        const totalGames = playerStats.games_played;
        winRate = totalGames > 0 ? (playerStats.games_won / totalGames * 100) : 0;
        goalRatio = playerStats.goals_conceded > 0 ? 
          (playerStats.goals_scored / playerStats.goals_conceded) : 
          playerStats.goals_scored;
        averageGameDuration = totalGames > 0 ? 
          (playerStats.total_play_time_seconds / totalGames) : 0;
      }

      const response = {
        success: true,
        data: {
          player: {
            id: userResult.data.id,
            username: userResult.data.username,
            display_name: userResult.data.display_name,
            elo_rating: userResult.data.elo_rating,
            character_id: userResult.data.character_id,
            created_at: userResult.data.created_at
          },
          statistics: playerStats ? {
            // Basic stats
            games_played: playerStats.games_played,
            games_won: playerStats.games_won,
            games_lost: playerStats.games_lost,
            games_drawn: playerStats.games_drawn,
            goals_scored: playerStats.goals_scored,
            goals_conceded: playerStats.goals_conceded,
            win_streak: playerStats.win_streak,
            best_win_streak: playerStats.best_win_streak,
            total_play_time_seconds: playerStats.total_play_time_seconds,
            
            // Advanced metrics
            win_rate: Math.round(winRate * 100) / 100,
            goal_ratio: Math.round(goalRatio * 100) / 100,
            average_game_duration: Math.round(averageGameDuration),
            recent_games_30d: recentGamesCount,
            goals_per_game: playerStats.games_played > 0 ? 
              Math.round((playerStats.goals_scored / playerStats.games_played) * 100) / 100 : 0,
            
            // Performance indicators
            consistency_score: calculateConsistencyScore(playerStats),
            activity_level: calculateActivityLevel(recentGamesCount, playerStats.games_played),
            skill_trend: calculateSkillTrend(userResult.data.elo_rating)
          } : null
        }
      };

      res.json(response);

    } catch (error) {
      console.error('Error fetching player statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve player statistics'
      });
    }
  }
);

/**
 * GET /api/stats/me
 * Get current authenticated user's statistics
 */
router.get('/me', 
  authenticateToken,
  rateLimiters.read,
  async (req, res) => {
    try {
      const userId = req.user.userId;

      // Get basic user info
      const userResult = await users.findById(userId);
      if (!userResult.success || !userResult.data) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Get player statistics
      const statsResult = await stats.findByUserId(userId);
      const playerStats = statsResult.success ? statsResult.data : null;

      // Get recent games count
      const { data: recentGames, error: gamesError } = await supabase
        .from('games')
        .select('id')
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
        .eq('status', 'completed');

      const recentGamesCount = gamesError ? 0 : recentGames?.length || 0;

      // Calculate advanced metrics
      let winRate = 0;
      let goalRatio = 0;
      let averageGameDuration = 0;

      if (playerStats) {
        const totalGames = playerStats.games_played;
        winRate = totalGames > 0 ? (playerStats.games_won / totalGames * 100) : 0;
        goalRatio = playerStats.goals_conceded > 0 ? 
          (playerStats.goals_scored / playerStats.goals_conceded) : 
          playerStats.goals_scored;
        averageGameDuration = totalGames > 0 ? 
          (playerStats.total_play_time_seconds / totalGames) : 0;
      }

      const response = {
        success: true,
        data: {
          player: {
            id: userResult.data.id,
            username: userResult.data.username,
            display_name: userResult.data.display_name,
            elo_rating: userResult.data.elo_rating,
            character_id: userResult.data.character_id,
            created_at: userResult.data.created_at
          },
          statistics: playerStats ? {
            // Basic stats
            games_played: playerStats.games_played,
            games_won: playerStats.games_won,
            games_lost: playerStats.games_lost,
            games_drawn: playerStats.games_drawn,
            goals_scored: playerStats.goals_scored,
            goals_conceded: playerStats.goals_conceded,
            win_streak: playerStats.win_streak,
            best_win_streak: playerStats.best_win_streak,
            total_play_time_seconds: playerStats.total_play_time_seconds,
            
            // Advanced metrics
            win_rate: Math.round(winRate * 100) / 100,
            goal_ratio: Math.round(goalRatio * 100) / 100,
            average_game_duration: Math.round(averageGameDuration),
            recent_games_30d: recentGamesCount,
            goals_per_game: playerStats.games_played > 0 ? 
              Math.round((playerStats.goals_scored / playerStats.games_played) * 100) / 100 : 0,
            
            // Performance indicators
            consistency_score: calculateConsistencyScore(playerStats),
            activity_level: calculateActivityLevel(recentGamesCount, playerStats.games_played),
            skill_trend: calculateSkillTrend(userResult.data.elo_rating)
          } : null
        }
      };

      res.json(response);

    } catch (error) {
      console.error('Error fetching user statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve your statistics'
      });
    }
  }
);

/**
 * GET /api/stats/history/:userId
 * Get detailed game history for a player with filtering and pagination
 */
router.get('/history/:userId',
  rateLimiters.read,
  param('userId').isUUID().withMessage('Invalid user ID format'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('status').optional().isIn(['completed', 'abandoned', 'all']).withMessage('Invalid status filter'),
  query('opponent').optional().isUUID().withMessage('Invalid opponent ID format'),
  query('from_date').optional().isISO8601().withMessage('Invalid from_date format'),
  query('to_date').optional().isISO8601().withMessage('Invalid to_date format'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { 
        page = 1, 
        limit = 20, 
        status = 'completed',
        opponent,
        from_date,
        to_date 
      } = req.query;

      const offset = (page - 1) * limit;

      // Build query
      let query = supabase
        .from('games')
        .select(`
          *,
          player1:users!games_player1_id_fkey(id, username, display_name, elo_rating),
          player2:users!games_player2_id_fkey(id, username, display_name, elo_rating),
          winner:users!games_winner_id_fkey(id, username, display_name)
        `)
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Apply filters
      if (status !== 'all') {
        query = query.eq('status', status);
      }

      if (opponent) {
        query = query.or(`player1_id.eq.${opponent},player2_id.eq.${opponent}`);
      }

      if (from_date) {
        query = query.gte('created_at', from_date);
      }

      if (to_date) {
        query = query.lte('created_at', to_date);
      }

      const { data: games, error, count } = await query;

      if (error) throw error;

      // Transform games data to include player perspective
      const transformedGames = games.map(game => {
        const isPlayer1 = game.player1_id === userId;
        const opponent = isPlayer1 ? game.player2 : game.player1;
        const playerScore = isPlayer1 ? game.player1_score : game.player2_score;
        const opponentScore = isPlayer1 ? game.player2_score : game.player1_score;
        
        let result = 'draw';
        if (game.status === 'completed' && playerScore !== opponentScore) {
          result = playerScore > opponentScore ? 'win' : 'loss';
        }

        return {
          id: game.id,
          opponent: {
            id: opponent.id,
            username: opponent.username,
            display_name: opponent.display_name,
            elo_rating: opponent.elo_rating
          },
          result,
          player_score: playerScore,
          opponent_score: opponentScore,
          duration_seconds: game.duration_seconds,
          status: game.status,
          created_at: game.created_at,
          completed_at: game.completed_at,
          game_mode: game.game_mode || 'classic'
        };
      });

      res.json({
        success: true,
        data: {
          games: transformedGames,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            total_pages: Math.ceil(count / limit),
            has_next: offset + limit < count,
            has_previous: page > 1
          },
          filters: {
            status,
            opponent,
            from_date,
            to_date
          }
        }
      });

    } catch (error) {
      console.error('Error fetching game history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve game history'
      });
    }
  }
);

/**
 * GET /api/stats/compare/:userId1/:userId2
 * Compare statistics between two players
 */
router.get('/compare/:userId1/:userId2',
  rateLimiters.read,
  param('userId1').isUUID().withMessage('Invalid user ID 1 format'),
  param('userId2').isUUID().withMessage('Invalid user ID 2 format'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { userId1, userId2 } = req.params;

      // Get both players' data
      const [player1Result, player2Result] = await Promise.all([
        getPlayerComparisonData(userId1),
        getPlayerComparisonData(userId2)
      ]);

      if (!player1Result.success || !player2Result.success) {
        return res.status(404).json({
          success: false,
          error: 'One or both players not found'
        });
      }

      // Get head-to-head record
      const { data: headToHeadGames } = await supabase
        .from('games')
        .select('*')
        .or(`and(player1_id.eq.${userId1},player2_id.eq.${userId2}),and(player1_id.eq.${userId2},player2_id.eq.${userId1})`)
        .eq('status', 'completed');

      const headToHead = calculateHeadToHead(userId1, userId2, headToHeadGames || []);

      res.json({
        success: true,
        data: {
          player1: player1Result.data,
          player2: player2Result.data,
          head_to_head: headToHead,
          comparison: {
            elo_difference: player1Result.data.elo_rating - player2Result.data.elo_rating,
            win_rate_difference: player1Result.data.win_rate - player2Result.data.win_rate,
            goal_ratio_difference: player1Result.data.goal_ratio - player2Result.data.goal_ratio,
            experience_difference: player1Result.data.games_played - player2Result.data.games_played
          }
        }
      });

    } catch (error) {
      console.error('Error comparing players:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to compare players'
      });
    }
  }
);

/**
 * GET /api/stats/summary
 * Get overall game statistics summary
 */
router.get('/summary',
  rateLimiters.read,
  async (req, res) => {
    try {
      // Get overall statistics from database
      const [
        { data: totalUsers },
        { data: totalGames },
        { data: activeUsers },
        { data: recentGames }
      ] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('games').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        supabase.from('users').select('id', { count: 'exact', head: true })
          .gte('last_login_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.from('games').select('id', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      ]);

      // Get top players
      const { data: topPlayers } = await supabase
        .from('users')
        .select('username, display_name, elo_rating')
        .order('elo_rating', { ascending: false })
        .limit(5);

      // Calculate average game duration
      const { data: gameStats } = await supabase
        .from('games')
        .select('duration_seconds')
        .eq('status', 'completed')
        .not('duration_seconds', 'is', null);

      const averageDuration = gameStats?.length > 0 ? 
        Math.round(gameStats.reduce((sum, game) => sum + game.duration_seconds, 0) / gameStats.length) : 0;

      res.json({
        success: true,
        data: {
          totals: {
            registered_users: totalUsers?.length || 0,
            completed_games: totalGames?.length || 0,
            active_users_7d: activeUsers?.length || 0,
            games_today: recentGames?.length || 0
          },
          averages: {
            game_duration_seconds: averageDuration,
            games_per_day: Math.round((totalGames?.length || 0) / Math.max(1, Math.ceil((Date.now() - new Date('2024-01-01').getTime()) / (24 * 60 * 60 * 1000))))
          },
          top_players: topPlayers || [],
          generated_at: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error fetching statistics summary:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve statistics summary'
      });
    }
  }
);

/**
 * Helper Functions
 */

// Calculate consistency score based on win streak and games played
function calculateConsistencyScore(stats) {
  if (!stats || stats.games_played < 5) return 0;
  
  const winRate = stats.games_won / stats.games_played;
  const streakFactor = Math.min(stats.best_win_streak / stats.games_played, 0.5);
  const experienceFactor = Math.min(stats.games_played / 100, 1);
  
  return Math.round((winRate * 0.6 + streakFactor * 0.3 + experienceFactor * 0.1) * 100);
}

// Calculate activity level based on recent games
function calculateActivityLevel(recentGames, totalGames) {
  if (totalGames === 0) return 'inactive';
  if (recentGames === 0) return 'inactive';
  if (recentGames >= 20) return 'very_active';
  if (recentGames >= 10) return 'active';
  if (recentGames >= 3) return 'moderate';
  return 'low';
}

// Calculate skill trend based on ELO rating
function calculateSkillTrend(eloRating) {
  if (eloRating >= 1600) return 'expert';
  if (eloRating >= 1400) return 'advanced';
  if (eloRating >= 1200) return 'intermediate';
  if (eloRating >= 1000) return 'beginner';
  return 'novice';
}

// Get player data for comparison
async function getPlayerComparisonData(userId) {
  try {
    const userResult = await users.findById(userId);
    if (!userResult.success || !userResult.data) {
      return { success: false };
    }

    const statsResult = await stats.findByUserId(userId);
    const playerStats = statsResult.success ? statsResult.data : null;

    if (!playerStats) {
      return { success: false };
    }

    const winRate = playerStats.games_played > 0 ? 
      (playerStats.games_won / playerStats.games_played * 100) : 0;
    const goalRatio = playerStats.goals_conceded > 0 ? 
      (playerStats.goals_scored / playerStats.goals_conceded) : playerStats.goals_scored;

    return {
      success: true,
      data: {
        id: userResult.data.id,
        username: userResult.data.username,
        display_name: userResult.data.display_name,
        elo_rating: userResult.data.elo_rating,
        games_played: playerStats.games_played,
        games_won: playerStats.games_won,
        win_rate: Math.round(winRate * 100) / 100,
        goals_scored: playerStats.goals_scored,
        goals_conceded: playerStats.goals_conceded,
        goal_ratio: Math.round(goalRatio * 100) / 100,
        best_win_streak: playerStats.best_win_streak
      }
    };
  } catch (error) {
    return { success: false };
  }
}

// Calculate head-to-head record between two players
function calculateHeadToHead(userId1, userId2, games) {
  const record = {
    total_games: games.length,
    player1_wins: 0,
    player2_wins: 0,
    draws: 0,
    player1_goals: 0,
    player2_goals: 0
  };

  games.forEach(game => {
    const isPlayer1First = game.player1_id === userId1;
    const player1Score = isPlayer1First ? game.player1_score : game.player2_score;
    const player2Score = isPlayer1First ? game.player2_score : game.player1_score;

    record.player1_goals += player1Score;
    record.player2_goals += player2Score;

    if (player1Score > player2Score) {
      record.player1_wins++;
    } else if (player2Score > player1Score) {
      record.player2_wins++;
    } else {
      record.draws++;
    }
  });

  return record;
}

/**
 * POST /api/stats/submit-game-result
 * Submit game result and update player statistics
 */
router.post('/submit-game-result',
  authenticateToken,
  rateLimiters.game,
  body('game_id').isUUID().withMessage('Invalid game ID'),
  body('opponent_id').isUUID().withMessage('Invalid opponent ID'),
  body('result').isIn(['win', 'loss', 'draw']).withMessage('Invalid game result'),
  body('player_score').isInt({ min: 0, max: 50 }).withMessage('Player score must be between 0 and 50'),
  body('opponent_score').isInt({ min: 0, max: 50 }).withMessage('Opponent score must be between 0 and 50'),
  body('duration_seconds').isInt({ min: 0, max: 7200 }).withMessage('Duration must be between 0 and 7200 seconds'),
  body('goals_scored').optional().isInt({ min: 0 }).withMessage('Goals scored must be non-negative'),
  body('goals_conceded').optional().isInt({ min: 0 }).withMessage('Goals conceded must be non-negative'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const {
        game_id,
        opponent_id,
        result,
        player_score,
        opponent_score,
        duration_seconds,
        goals_scored = player_score,
        goals_conceded = opponent_score
      } = req.body;

      // Verify the game exists and user is a participant
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', game_id)
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .single();

      if (gameError || !game) {
        return res.status(404).json({
          success: false,
          error: 'Game not found or access denied'
        });
      }

      if (game.status !== 'in_progress') {
        return res.status(400).json({
          success: false,
          error: 'Game is not in progress'
        });
      }

      // Update game record
      const gameUpdateData = {
        status: 'completed',
        player1_score: game.player1_id === userId ? player_score : opponent_score,
        player2_score: game.player2_id === userId ? player_score : opponent_score,
        winner_id: result === 'win' ? userId : (result === 'loss' ? opponent_id : null),
        duration_seconds,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error: updateGameError } = await supabase
        .from('games')
        .update(gameUpdateData)
        .eq('id', game_id);

      if (updateGameError) throw updateGameError;

      // Get current player stats
      const statsResult = await stats.findByUserId(userId);
      let currentStats = statsResult.success ? statsResult.data : null;

      if (!currentStats) {
        // Create initial stats if they don't exist
        currentStats = {
          user_id: userId,
          games_played: 0,
          games_won: 0,
          games_lost: 0,
          games_drawn: 0,
          goals_scored: 0,
          goals_conceded: 0,
          win_streak: 0,
          best_win_streak: 0,
          total_play_time_seconds: 0
        };
      }

      // Update statistics
      const statsUpdate = {
        games_played: currentStats.games_played + 1,
        goals_scored: currentStats.goals_scored + goals_scored,
        goals_conceded: currentStats.goals_conceded + goals_conceded,
        total_play_time_seconds: currentStats.total_play_time_seconds + duration_seconds,
        updated_at: new Date().toISOString()
      };

      // Update win/loss/draw counts and streak
      if (result === 'win') {
        statsUpdate.games_won = currentStats.games_won + 1;
        statsUpdate.win_streak = currentStats.win_streak + 1;
        statsUpdate.best_win_streak = Math.max(currentStats.best_win_streak, statsUpdate.win_streak);
      } else if (result === 'loss') {
        statsUpdate.games_lost = currentStats.games_lost + 1;
        statsUpdate.win_streak = 0;
      } else {
        statsUpdate.games_drawn = currentStats.games_drawn + 1;
        statsUpdate.win_streak = 0;
      }

      // Update or create stats record
      let statsError;
      if (statsResult.success && currentStats.user_id) {
        const { error } = await supabase
          .from('player_stats')
          .update(statsUpdate)
          .eq('user_id', userId);
        statsError = error;
      } else {
        const { error } = await supabase
          .from('player_stats')
          .insert({ ...statsUpdate, user_id: userId, created_at: new Date().toISOString() });
        statsError = error;
      }

      if (statsError) {
        console.error('Error updating player stats:', statsError);
        // Continue without failing the request
      }

      // Calculate ELO rating changes (basic ELO system)
      const { data: opponent, error: opponentError } = await supabase
        .from('users')
        .select('elo_rating')
        .eq('id', opponent_id)
        .single();

      if (!opponentError && opponent) {
        const { data: currentUser } = await supabase
          .from('users')
          .select('elo_rating')
          .eq('id', userId)
          .single();

        if (currentUser) {
          const newEloRating = calculateEloRating(
            currentUser.elo_rating,
            opponent.elo_rating,
            result === 'win' ? 1 : (result === 'draw' ? 0.5 : 0)
          );

          // Update user's ELO rating
          await supabase
            .from('users')
            .update({ 
              elo_rating: newEloRating, 
              updated_at: new Date().toISOString() 
            })
            .eq('id', userId);
        }
      }

      res.json({
        success: true,
        message: 'Game result submitted successfully',
        data: {
          game_id,
          result,
          statistics_updated: true,
          final_score: {
            player: player_score,
            opponent: opponent_score
          }
        }
      });

    } catch (error) {
      console.error('Error submitting game result:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to submit game result'
      });
    }
  }
);

/**
 * GET /api/stats/recent-activity/:userId
 * Get recent activity and achievements for a player
 */
router.get('/recent-activity/:userId',
  rateLimiters.read,
  param('userId').isUUID().withMessage('Invalid user ID format'),
  query('days').optional().isInt({ min: 1, max: 90 }).withMessage('Days must be between 1 and 90').toInt(),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { days = 7 } = req.query;

      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Get recent games
      const { data: recentGames, error: gamesError } = await supabase
        .from('games')
        .select(`
          *,
          opponent:users!games_player2_id_fkey(username, display_name, elo_rating),
          opponent2:users!games_player1_id_fkey(username, display_name, elo_rating)
        `)
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .eq('status', 'completed')
        .gte('completed_at', startDate.toISOString())
        .order('completed_at', { ascending: false })
        .limit(10);

      if (gamesError) throw gamesError;

      // Process games to show from player's perspective
      const processedGames = recentGames.map(game => {
        const isPlayer1 = game.player1_id === userId;
        const opponent = isPlayer1 ? game.opponent : game.opponent2;
        const playerScore = isPlayer1 ? game.player1_score : game.player2_score;
        const opponentScore = isPlayer1 ? game.player2_score : game.player1_score;
        
        let result = 'draw';
        if (playerScore > opponentScore) result = 'win';
        else if (opponentScore > playerScore) result = 'loss';

        return {
          game_id: game.id,
          opponent: {
            username: opponent?.username,
            display_name: opponent?.display_name,
            elo_rating: opponent?.elo_rating
          },
          result,
          score: {
            player: playerScore,
            opponent: opponentScore
          },
          duration_seconds: game.duration_seconds,
          completed_at: game.completed_at
        };
      });

      // Calculate activity statistics
      const totalGames = recentGames.length;
      const wins = processedGames.filter(g => g.result === 'win').length;
      const losses = processedGames.filter(g => g.result === 'loss').length;
      const draws = processedGames.filter(g => g.result === 'draw').length;
      const totalGoals = processedGames.reduce((sum, g) => sum + g.score.player, 0);
      const totalConceded = processedGames.reduce((sum, g) => sum + g.score.opponent, 0);

      // Check for achievements (simple examples)
      const achievements = [];
      
      // Win streak achievement
      let currentStreak = 0;
      let maxStreak = 0;
      for (const game of processedGames.reverse()) {
        if (game.result === 'win') {
          currentStreak++;
          maxStreak = Math.max(maxStreak, currentStreak);
        } else {
          currentStreak = 0;
        }
      }
      
      if (maxStreak >= 3) {
        achievements.push({
          type: 'win_streak',
          description: `${maxStreak} game win streak`,
          achieved_at: recentGames[0]?.completed_at
        });
      }

      // Goal scoring achievement
      if (totalGoals >= 10) {
        achievements.push({
          type: 'goal_scorer',
          description: `Scored ${totalGoals} goals in ${days} days`,
          achieved_at: new Date().toISOString()
        });
      }

      res.json({
        success: true,
        data: {
          period: {
            days,
            start_date: startDate.toISOString(),
            end_date: new Date().toISOString()
          },
          recent_games: processedGames,
          activity_summary: {
            total_games: totalGames,
            wins,
            losses,
            draws,
            win_rate: totalGames > 0 ? Math.round((wins / totalGames) * 100 * 100) / 100 : 0,
            total_goals_scored: totalGoals,
            total_goals_conceded: totalConceded,
            goal_difference: totalGoals - totalConceded
          },
          recent_achievements: achievements
        }
      });

    } catch (error) {
      console.error('Error fetching recent activity:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve recent activity'
      });
    }
  }
);

/**
 * Helper function to calculate ELO rating
 */
function calculateEloRating(playerRating, opponentRating, gameResult, kFactor = 32) {
  const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  const ratingChange = Math.round(kFactor * (gameResult - expectedScore));
  return Math.max(800, Math.min(3000, playerRating + ratingChange)); // Clamp between 800 and 3000
}

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'stats',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

module.exports = router;