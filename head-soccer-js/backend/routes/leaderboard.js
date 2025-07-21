/**
 * Leaderboard API Routes
 * Handles global rankings, seasonal leaderboards, and competitive statistics
 */

const express = require('express');
const { authenticateToken } = require('./auth');
const { rateLimiters, handleValidationErrors } = require('../middleware');
const { query, param } = require('express-validator');
const { supabase } = require('../database/supabase');
const cacheService = require('../utils/cache-service');

const router = express.Router();

/**
 * GET /api/leaderboard
 * Get global leaderboard with filtering and pagination
 */
router.get('/',
  rateLimiters.read,
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100').toInt(),
  query('period').optional().isIn(['all', 'daily', 'weekly', 'monthly']).withMessage('Invalid period filter'),
  query('sortBy').optional().isIn(['elo_rating', 'games_won', 'win_rate', 'goals_scored']).withMessage('Invalid sort field'),
  query('game_mode').optional().isIn(['ranked', 'casual', 'tournament']).withMessage('Invalid game mode filter'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 50,
        period = 'all',
        sortBy = 'elo_rating',
        game_mode
      } = req.query;

      const offset = (page - 1) * limit;
      const cacheKey = `leaderboard:${period}:${sortBy}:${game_mode || 'all'}:${page}:${limit}`;

      // Try to get cached result
      const cachedResult = await cacheService.get(cacheKey);
      if (cachedResult) {
        return res.json(cachedResult);
      }

      // Calculate date filter for period
      let dateFilter = null;
      const now = new Date();
      switch (period) {
        case 'daily':
          dateFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'weekly':
          dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      // Get users with stats - use a simpler approach to avoid complex joins
      const { data: players, error, count } = await supabase
        .from('users')
        .select(`
          id,
          username,
          display_name,
          elo_rating,
          character_id,
          created_at
        `)
        .order('elo_rating', { ascending: false })
        .range(offset, offset + limit * 2 - 1); // Get more than needed to filter later

      if (error) throw error;

      // Get stats for these players
      const playerIds = players.map(p => p.id);
      let playerStats = [];
      
      if (playerIds.length > 0) {
        const { data: statsData, error: statsError } = await supabase
          .from('player_stats')
          .select('*')
          .in('user_id', playerIds)
          .gt('games_played', 0); // Only players with games

        if (!statsError && statsData) {
          playerStats = statsData;
        }
      }

      // If no players have stats, return empty leaderboard
      if (playerStats.length === 0) {
        const response = {
          success: true,
          data: {
            leaderboard: [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              total_pages: 0,
              has_next: false,
              has_previous: false
            },
            filters: {
              period,
              sort_by: sortBy,
              game_mode: game_mode || 'all'
            },
            generated_at: new Date().toISOString()
          }
        };

        // Cache the empty result for 2 minutes
        await cacheService.set(cacheKey, response, 120);
        return res.json(response);
      }

      // Apply date filters for period-based rankings
      if (dateFilter && playerStats.length > 0) {
        playerStats = playerStats.filter(stat => 
          new Date(stat.updated_at) >= dateFilter
        );
      }

      // Combine player data with their stats
      const playersWithStats = [];
      for (const player of players) {
        const stats = playerStats.find(s => s.user_id === player.id);
        if (stats) {
          playersWithStats.push({ ...player, player_stats: stats });
        }
      }

      // Calculate win rates and additional metrics
      const enrichedPlayers = playersWithStats.map((player, index) => {
        const stats = player.player_stats;
        const winRate = stats.games_played > 0 ? (stats.games_won / stats.games_played * 100) : 0;
        const goalRatio = stats.goals_conceded > 0 ? (stats.goals_scored / stats.goals_conceded) : stats.goals_scored;
        const goalsPerGame = stats.games_played > 0 ? (stats.goals_scored / stats.games_played) : 0;

        return {
          rank: offset + index + 1,
          player: {
            id: player.id,
            username: player.username,
            display_name: player.display_name,
            elo_rating: player.elo_rating,
            character_id: player.character_id,
            created_at: player.created_at
          },
          statistics: {
            games_played: stats.games_played,
            games_won: stats.games_won,
            games_lost: stats.games_lost,
            games_drawn: stats.games_drawn,
            win_rate: Math.round(winRate * 100) / 100,
            goals_scored: stats.goals_scored,
            goals_conceded: stats.goals_conceded,
            goal_ratio: Math.round(goalRatio * 100) / 100,
            goals_per_game: Math.round(goalsPerGame * 100) / 100,
            win_streak: stats.win_streak,
            best_win_streak: stats.best_win_streak,
            total_play_time_hours: Math.round(stats.total_play_time_seconds / 3600 * 100) / 100
          }
        };
      });

      // Sort by specified criteria
      const getSortValue = (stats, player, sortBy) => {
        switch (sortBy) {
          case 'elo_rating':
            return player.elo_rating;
          case 'games_won':
            return stats.games_won;
          case 'win_rate':
            return stats.games_played > 0 ? (stats.games_won / stats.games_played) : 0;
          case 'goals_scored':
            return stats.goals_scored;
          default:
            return player.elo_rating;
        }
      };

      enrichedPlayers.sort((a, b) => {
        const aValue = getSortValue(a.statistics, a.player, sortBy);
        const bValue = getSortValue(b.statistics, b.player, sortBy);
        return bValue - aValue;
      });

      // Add ranks and slice to limit
      const finalPlayers = enrichedPlayers.slice(0, limit).map((player, index) => ({
        ...player,
        rank: offset + index + 1
      }));

      // Get total count for pagination (count of players with games)
      const totalCount = playerStats.length;

      const response = {
        success: true,
        data: {
          leaderboard: finalPlayers,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalCount || 0,
            total_pages: Math.ceil((totalCount || 0) / limit),
            has_next: offset + limit < (totalCount || 0),
            has_previous: page > 1
          },
          filters: {
            period,
            sort_by: sortBy,
            game_mode: game_mode || 'all'
          },
          generated_at: new Date().toISOString()
        }
      };

      // Cache the result for 5 minutes
      await cacheService.set(cacheKey, response, 300);

      res.json(response);

    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve leaderboard'
      });
    }
  }
);

/**
 * GET /api/leaderboard/top/:count
 * Get top N players by ELO rating
 */
router.get('/top/:count',
  rateLimiters.read,
  param('count').isInt({ min: 1, max: 100 }).withMessage('Count must be between 1 and 100').toInt(),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { count } = req.params;
      const cacheKey = `leaderboard:top:${count}`;

      // Try to get cached result
      const cachedResult = await cacheService.get(cacheKey);
      if (cachedResult) {
        return res.json(cachedResult);
      }

      // Get top users by ELO
      const { data: players, error } = await supabase
        .from('users')
        .select(`
          id,
          username,
          display_name,
          elo_rating,
          character_id
        `)
        .order('elo_rating', { ascending: false })
        .limit(count * 2); // Get more than needed in case some don't have stats

      if (error) throw error;

      // Get stats for these players
      const playerIds = players.map(p => p.id);
      let playerStats = [];
      
      if (playerIds.length > 0) {
        const { data: statsData, error: statsError } = await supabase
          .from('player_stats')
          .select('*')
          .in('user_id', playerIds)
          .gt('games_played', 0); // Only players with games

        if (!statsError && statsData) {
          playerStats = statsData;
        }
      }

      // If no player stats found, return empty result
      if (playerStats.length === 0) {
        const response = {
          success: true,
          data: {
            top_players: [],
            count: 0,
            generated_at: new Date().toISOString()
          }
        };

        // Cache for 2 minutes
        await cacheService.set(cacheKey, response, 120);
        return res.json(response);
      }

      // Combine player data with their stats and filter to only those with games
      const playersWithStats = [];
      for (const player of players) {
        const stats = playerStats.find(s => s.user_id === player.id);
        if (stats) {
          playersWithStats.push({ ...player, stats });
        }
      }

      // Take only the requested count and create response
      const topPlayers = playersWithStats.slice(0, count).map((player, index) => ({
        rank: index + 1,
        player: {
          id: player.id,
          username: player.username,
          display_name: player.display_name,
          elo_rating: player.elo_rating,
          character_id: player.character_id
        },
        stats: {
          games_played: player.stats.games_played,
          games_won: player.stats.games_won,
          goals_scored: player.stats.goals_scored
        }
      }));

      const response = {
        success: true,
        data: {
          top_players: topPlayers,
          count: topPlayers.length,
          generated_at: new Date().toISOString()
        }
      };

      // Cache for 2 minutes
      await cacheService.set(cacheKey, response, 120);

      res.json(response);

    } catch (error) {
      console.error('Error fetching top players:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve top players'
      });
    }
  }
);

/**
 * GET /api/leaderboard/player/:userId/rank
 * Get a specific player's rank and nearby players
 */
router.get('/player/:userId/rank',
  rateLimiters.read,
  param('userId').isUUID().withMessage('Invalid user ID format'),
  query('context').optional().isInt({ min: 1, max: 20 }).withMessage('Context must be between 1 and 20').toInt(),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { context = 5 } = req.query;

      // Get the player's current ELO rating
      const { data: player, error: playerError } = await supabase
        .from('users')
        .select('elo_rating, username, display_name, player_stats!inner(games_played)')
        .eq('id', userId)
        .single();

      if (playerError || !player) {
        return res.status(404).json({
          success: false,
          error: 'Player not found'
        });
      }

      if (player.player_stats.games_played === 0) {
        return res.json({
          success: true,
          data: {
            player_rank: null,
            message: 'Player has not played any games yet',
            context_players: []
          }
        });
      }

      // Get player's rank by counting players with higher ELO
      const { count: playersAbove } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gt('elo_rating', player.elo_rating)
        .not('player_stats.games_played', 'eq', 0);

      const playerRank = (playersAbove || 0) + 1;

      // Get context players (players around this rank)
      const startRank = Math.max(1, playerRank - context);
      const endRank = playerRank + context;
      const offset = startRank - 1;
      const limit = endRank - startRank + 1;

      const { data: contextPlayers, error: contextError } = await supabase
        .from('users')
        .select(`
          id,
          username,
          display_name,
          elo_rating,
          character_id,
          player_stats!inner (games_played, games_won, goals_scored)
        `)
        .not('player_stats.games_played', 'eq', 0)
        .order('elo_rating', { ascending: false })
        .range(offset, offset + limit - 1);

      if (contextError) throw contextError;

      const enrichedContext = contextPlayers.map((p, index) => ({
        rank: startRank + index,
        player: {
          id: p.id,
          username: p.username,
          display_name: p.display_name,
          elo_rating: p.elo_rating,
          character_id: p.character_id
        },
        stats: {
          games_played: p.player_stats.games_played,
          games_won: p.player_stats.games_won,
          goals_scored: p.player_stats.goals_scored
        },
        is_current_player: p.id === userId
      }));

      res.json({
        success: true,
        data: {
          player_rank: playerRank,
          player: {
            id: userId,
            username: player.username,
            display_name: player.display_name,
            elo_rating: player.elo_rating
          },
          context_players: enrichedContext,
          context_range: {
            start_rank: startRank,
            end_rank: Math.min(endRank, startRank + enrichedContext.length - 1)
          }
        }
      });

    } catch (error) {
      console.error('Error fetching player rank:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve player rank'
      });
    }
  }
);

/**
 * GET /api/leaderboard/seasons
 * Get seasonal leaderboard data
 */
router.get('/seasons',
  rateLimiters.read,
  query('season').optional().matches(/^\d{4}-\d{2}$/).withMessage('Season must be in YYYY-MM format'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50').toInt(),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { season, limit = 10 } = req.query;
      
      // If no season specified, use current month
      const currentSeason = season || new Date().toISOString().substr(0, 7);
      const [year, month] = currentSeason.split('-');
      const seasonStart = new Date(year, month - 1, 1);
      const seasonEnd = new Date(year, month, 0); // Last day of the month

      const cacheKey = `leaderboard:season:${currentSeason}:${limit}`;
      
      // Try cache first
      const cachedResult = await cacheService.get(cacheKey);
      if (cachedResult) {
        return res.json(cachedResult);
      }

      // Get games from this season
      const { data: seasonGames, error: gamesError } = await supabase
        .from('games')
        .select('player1_id, player2_id, winner_id, player1_score, player2_score')
        .eq('status', 'completed')
        .gte('created_at', seasonStart.toISOString())
        .lte('created_at', seasonEnd.toISOString());

      if (gamesError) throw gamesError;

      // Calculate seasonal statistics
      const playerSeasonStats = {};
      
      seasonGames.forEach(game => {
        const player1Id = game.player1_id;
        const player2Id = game.player2_id;
        
        // Initialize stats if needed
        if (!playerSeasonStats[player1Id]) {
          playerSeasonStats[player1Id] = { games: 0, wins: 0, goals: 0 };
        }
        if (!playerSeasonStats[player2Id]) {
          playerSeasonStats[player2Id] = { games: 0, wins: 0, goals: 0 };
        }

        // Update games count
        playerSeasonStats[player1Id].games++;
        playerSeasonStats[player2Id].games++;

        // Update wins
        if (game.winner_id === player1Id) {
          playerSeasonStats[player1Id].wins++;
        } else if (game.winner_id === player2Id) {
          playerSeasonStats[player2Id].wins++;
        }

        // Update goals
        playerSeasonStats[player1Id].goals += game.player1_score;
        playerSeasonStats[player2Id].goals += game.player2_score;
      });

      // Get player info for top players
      const playerIds = Object.keys(playerSeasonStats);
      if (playerIds.length === 0) {
        return res.json({
          success: true,
          data: {
            season: currentSeason,
            leaderboard: [],
            total_players: 0
          }
        });
      }

      const { data: players, error: playersError } = await supabase
        .from('users')
        .select('id, username, display_name, elo_rating, character_id')
        .in('id', playerIds);

      if (playersError) throw playersError;

      // Combine player info with seasonal stats
      const seasonLeaderboard = players.map(player => {
        const stats = playerSeasonStats[player.id];
        const winRate = stats.games > 0 ? (stats.wins / stats.games * 100) : 0;
        
        return {
          player: {
            id: player.id,
            username: player.username,
            display_name: player.display_name,
            elo_rating: player.elo_rating,
            character_id: player.character_id
          },
          seasonal_stats: {
            games_played: stats.games,
            games_won: stats.wins,
            goals_scored: stats.goals,
            win_rate: Math.round(winRate * 100) / 100
          }
        };
      })
      .sort((a, b) => b.seasonal_stats.games_won - a.seasonal_stats.games_won) // Sort by wins
      .slice(0, limit)
      .map((player, index) => ({ ...player, rank: index + 1 }));

      const response = {
        success: true,
        data: {
          season: currentSeason,
          season_period: {
            start: seasonStart.toISOString(),
            end: seasonEnd.toISOString()
          },
          leaderboard: seasonLeaderboard,
          total_players: playerIds.length,
          generated_at: new Date().toISOString()
        }
      };

      // Cache for 30 minutes
      await cacheService.set(cacheKey, response, 1800);

      res.json(response);

    } catch (error) {
      console.error('Error fetching seasonal leaderboard:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve seasonal leaderboard'
      });
    }
  }
);

/**
 * GET /api/leaderboard/categories
 * Get leaderboards for different categories (goals, win streaks, etc.)
 */
router.get('/categories/:category',
  rateLimiters.read,
  param('category').isIn(['goals', 'win_streak', 'games_played', 'consistency']).withMessage('Invalid category'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50').toInt(),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { category } = req.params;
      const { limit = 10 } = req.query;

      const cacheKey = `leaderboard:category:${category}:${limit}`;
      
      // Try cache first
      const cachedResult = await cacheService.get(cacheKey);
      if (cachedResult) {
        return res.json(cachedResult);
      }

      // Get all users first
      const { data: users, error } = await supabase
        .from('users')
        .select(`
          id,
          username,
          display_name,
          elo_rating,
          character_id
        `)
        .order('elo_rating', { ascending: false })
        .limit(limit * 5); // Get more than needed to filter later

      if (error) throw error;

      // Get stats for these users
      const userIds = users.map(u => u.id);
      let allStats = [];
      
      if (userIds.length > 0) {
        const { data: statsData, error: statsError } = await supabase
          .from('player_stats')
          .select('*')
          .in('user_id', userIds)
          .gt('games_played', 0); // Only players with games

        if (!statsError && statsData) {
          allStats = statsData;
        }
      }

      // If no player stats found, return empty result
      if (allStats.length === 0) {
        const response = {
          success: true,
          data: {
            category,
            category_label: getCategoryLabel(category),
            leaderboard: [],
            total_results: 0,
            generated_at: new Date().toISOString()
          }
        };

        // Cache for 2 minutes
        await cacheService.set(cacheKey, response, 120);
        return res.json(response);
      }

      // Combine and sort by category
      const playersWithStats = [];
      for (const user of users) {
        const stats = allStats.find(s => s.user_id === user.id);
        if (stats) {
          playersWithStats.push({ ...user, stats });
        }
      }

      // Sort by category criteria
      playersWithStats.sort((a, b) => {
        switch (category) {
          case 'goals':
            return b.stats.goals_scored - a.stats.goals_scored;
          case 'win_streak':
            return b.stats.best_win_streak - a.stats.best_win_streak;
          case 'games_played':
            return b.stats.games_played - a.stats.games_played;
          case 'consistency':
            const aWinRate = a.stats.games_played > 0 ? (a.stats.games_won / a.stats.games_played) : 0;
            const bWinRate = b.stats.games_played > 0 ? (b.stats.games_won / b.stats.games_played) : 0;
            return bWinRate - aWinRate;
          default:
            return b.stats.goals_scored - a.stats.goals_scored;
        }
      });

      // Take only the requested limit
      const players = playersWithStats.slice(0, limit);

      const categoryLeaderboard = players.map((player, index) => {
        const stats = player.stats;
        let categoryValue, categoryLabel;

        switch (category) {
          case 'goals':
            categoryValue = stats.goals_scored;
            categoryLabel = 'Goals Scored';
            break;
          case 'win_streak':
            categoryValue = stats.best_win_streak;
            categoryLabel = 'Best Win Streak';
            break;
          case 'games_played':
            categoryValue = stats.games_played;
            categoryLabel = 'Games Played';
            break;
          case 'consistency':
            const winRate = stats.games_played > 0 ? (stats.games_won / stats.games_played * 100) : 0;
            categoryValue = Math.round(winRate * 100) / 100;
            categoryLabel = 'Win Rate %';
            break;
        }

        return {
          rank: index + 1,
          player: {
            id: player.id,
            username: player.username,
            display_name: player.display_name,
            elo_rating: player.elo_rating,
            character_id: player.character_id
          },
          category_value: categoryValue,
          supporting_stats: {
            games_played: stats.games_played,
            games_won: stats.games_won,
            goals_scored: stats.goals_scored,
            best_win_streak: stats.best_win_streak
          }
        };
      });

      // For consistency category, re-sort by actual win rate
      if (category === 'consistency') {
        categoryLeaderboard.sort((a, b) => b.category_value - a.category_value);
        categoryLeaderboard.forEach((player, index) => {
          player.rank = index + 1;
        });
      }

      const response = {
        success: true,
        data: {
          category,
          category_label: getCategoryLabel(category),
          leaderboard: categoryLeaderboard,
          total_results: categoryLeaderboard.length,
          generated_at: new Date().toISOString()
        }
      };

      // Cache for 10 minutes
      await cacheService.set(cacheKey, response, 600);

      res.json(response);

    } catch (error) {
      console.error(`Error fetching ${category} leaderboard:`, error);
      res.status(500).json({
        success: false,
        error: `Failed to retrieve ${category} leaderboard`
      });
    }
  }
);

/**
 * Helper function to get category labels
 */
function getCategoryLabel(category) {
  const labels = {
    goals: 'Top Goal Scorers',
    win_streak: 'Best Win Streaks',
    games_played: 'Most Active Players',
    consistency: 'Most Consistent Players'
  };
  return labels[category] || category;
}

/**
 * Test endpoint for debugging
 */
router.get('/debug', async (req, res) => {
  try {
    // Test basic database query
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username')
      .limit(3);

    if (error) throw error;

    res.json({
      success: true,
      debug: {
        users_found: users ? users.length : 0,
        users: users || [],
        cache_status: cacheService ? 'available' : 'not available'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'leaderboard',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

module.exports = router;