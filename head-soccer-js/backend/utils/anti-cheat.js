/**
 * Anti-Cheat Validation Service
 * Provides comprehensive validation for game results to prevent cheating
 */

const { supabase } = require('../database/supabase');

class AntiCheatValidator {
  constructor() {
    this.suspiciousThresholds = {
      maxGoalsPerMinute: 2.0,      // Maximum goals per minute (realistic: 0.5-1.0)
      minGameDuration: 30,         // Minimum game duration in seconds
      maxGameDuration: 1800,       // Maximum game duration (30 minutes)
      maxScoreDifference: 20,      // Maximum score difference in a single game
      maxConsecutiveWins: 50,      // Flag for review after 50 consecutive wins
      minPlayTime: 15,             // Minimum seconds between moves
      maxScorePerGame: 25          // Maximum realistic score per player
    };

    this.recentSubmissions = new Map(); // Track recent submissions per user
  }

  /**
   * Comprehensive game result validation
   */
  async validateGameResult(gameData, userData) {
    const {
      game_id,
      player_score,
      opponent_score,
      duration_seconds,
      result,
      goals_scored,
      goals_conceded,
      userId,
      opponent_id
    } = gameData;

    const validationResult = {
      isValid: true,
      suspiciousLevel: 0, // 0 = clean, 1-3 = suspicious, 4+ = likely cheat
      flags: [],
      warnings: []
    };

    try {
      // 1. Basic data consistency validation
      await this.validateDataConsistency(gameData, validationResult);

      // 2. Time-based validation
      await this.validateTiming(gameData, validationResult);

      // 3. Score validation
      await this.validateScores(gameData, validationResult);

      // 4. Player behavior validation
      await this.validatePlayerBehavior(userData, validationResult);

      // 5. Rate limiting validation
      await this.validateSubmissionRate(userId, validationResult);

      // 6. Historical pattern validation
      await this.validateHistoricalPatterns(userId, gameData, validationResult);

      // 7. Cross-validation with opponent (if available)
      await this.validateCrossReference(gameData, validationResult);

      // Calculate final suspicious level
      validationResult.suspiciousLevel = this.calculateSuspiciousLevel(validationResult.flags);

      // Determine if result should be accepted
      validationResult.isValid = validationResult.suspiciousLevel < 4;

    } catch (error) {
      console.error('Anti-cheat validation error:', error);
      validationResult.isValid = false;
      validationResult.flags.push('VALIDATION_ERROR');
      validationResult.warnings.push('Unable to complete anti-cheat validation');
    }

    return validationResult;
  }

  /**
   * Validate data consistency
   */
  async validateDataConsistency(gameData, result) {
    const { player_score, opponent_score, goals_scored, goals_conceded, result: gameResult } = gameData;

    // Score-result consistency
    if (gameResult === 'win' && player_score <= opponent_score) {
      result.flags.push('RESULT_SCORE_MISMATCH');
      result.warnings.push('Game result does not match score');
    }

    if (gameResult === 'loss' && player_score >= opponent_score) {
      result.flags.push('RESULT_SCORE_MISMATCH');
      result.warnings.push('Game result does not match score');
    }

    if (gameResult === 'draw' && player_score !== opponent_score) {
      result.flags.push('RESULT_SCORE_MISMATCH');
      result.warnings.push('Draw result with different scores');
    }

    // Goals consistency (if provided separately)
    if (goals_scored !== undefined && goals_scored !== player_score) {
      result.flags.push('GOALS_SCORE_MISMATCH');
      result.warnings.push('Goals scored does not match player score');
    }

    if (goals_conceded !== undefined && goals_conceded !== opponent_score) {
      result.flags.push('GOALS_CONCEDED_MISMATCH');
      result.warnings.push('Goals conceded does not match opponent score');
    }
  }

  /**
   * Validate timing aspects
   */
  async validateTiming(gameData, result) {
    const { duration_seconds, player_score, opponent_score } = gameData;

    // Check minimum duration
    if (duration_seconds < this.suspiciousThresholds.minGameDuration) {
      result.flags.push('GAME_TOO_SHORT');
      result.warnings.push(`Game duration too short: ${duration_seconds}s`);
    }

    // Check maximum duration
    if (duration_seconds > this.suspiciousThresholds.maxGameDuration) {
      result.flags.push('GAME_TOO_LONG');
      result.warnings.push(`Game duration too long: ${duration_seconds}s`);
    }

    // Check goals per minute ratio
    const totalGoals = player_score + opponent_score;
    const goalsPerMinute = totalGoals / (duration_seconds / 60);
    
    if (goalsPerMinute > this.suspiciousThresholds.maxGoalsPerMinute) {
      result.flags.push('UNREALISTIC_SCORING_RATE');
      result.warnings.push(`Unrealistic scoring rate: ${goalsPerMinute.toFixed(2)} goals/min`);
    }

    // Check for impossibly fast games with high scores
    if (duration_seconds < 120 && totalGoals > 10) {
      result.flags.push('IMPOSSIBLE_SCORE_TIME_RATIO');
      result.warnings.push('Impossible score achieved in given time');
    }
  }

  /**
   * Validate score realism
   */
  async validateScores(gameData, result) {
    const { player_score, opponent_score } = gameData;

    // Check maximum individual scores
    if (player_score > this.suspiciousThresholds.maxScorePerGame) {
      result.flags.push('PLAYER_SCORE_TOO_HIGH');
      result.warnings.push(`Player score too high: ${player_score}`);
    }

    if (opponent_score > this.suspiciousThresholds.maxScorePerGame) {
      result.flags.push('OPPONENT_SCORE_TOO_HIGH');
      result.warnings.push(`Opponent score too high: ${opponent_score}`);
    }

    // Check score difference
    const scoreDifference = Math.abs(player_score - opponent_score);
    if (scoreDifference > this.suspiciousThresholds.maxScoreDifference) {
      result.flags.push('EXCESSIVE_SCORE_DIFFERENCE');
      result.warnings.push(`Score difference too large: ${scoreDifference}`);
    }

    // Check for perfect games (might be suspicious if frequent)
    if (opponent_score === 0 && player_score > 10) {
      result.flags.push('PERFECT_GAME_HIGH_SCORE');
      result.warnings.push('Perfect game with very high score');
    }
  }

  /**
   * Validate player behavior patterns
   */
  async validatePlayerBehavior(userData, result) {
    // This would be enhanced with actual user data
    const { elo_rating } = userData;

    // Check for ELO manipulation patterns
    if (elo_rating && elo_rating > 2500) {
      result.flags.push('UNUSUALLY_HIGH_ELO');
      result.warnings.push('Unusually high ELO rating');
    }

    // Additional behavior analysis could be added here
    // - Win rate patterns
    // - Playing time patterns
    // - Score distribution analysis
  }

  /**
   * Validate submission rate (prevent rapid-fire submissions)
   */
  async validateSubmissionRate(userId, result) {
    const now = Date.now();
    const userKey = `user_${userId}`;
    
    if (this.recentSubmissions.has(userKey)) {
      const lastSubmission = this.recentSubmissions.get(userKey);
      const timeDiff = now - lastSubmission;
      
      // Minimum 10 seconds between submissions
      if (timeDiff < 10000) {
        result.flags.push('RAPID_SUBMISSION');
        result.warnings.push('Submitting results too quickly');
      }
    }

    // Update last submission time
    this.recentSubmissions.set(userKey, now);

    // Clean up old entries (older than 1 hour)
    this.cleanupRecentSubmissions();
  }

  /**
   * Validate against historical patterns
   */
  async validateHistoricalPatterns(userId, gameData, result) {
    try {
      // Get recent games for pattern analysis
      const { data: recentGames, error } = await supabase
        .from('games')
        .select('*')
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .eq('status', 'completed')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .order('created_at', { ascending: false })
        .limit(20);

      if (error || !recentGames) return;

      // Check for suspicious patterns
      const consecutiveWins = this.countConsecutiveWins(userId, recentGames);
      if (consecutiveWins > this.suspiciousThresholds.maxConsecutiveWins) {
        result.flags.push('EXCESSIVE_WIN_STREAK');
        result.warnings.push(`${consecutiveWins} consecutive wins`);
      }

      // Check for identical scores pattern
      const identicalScores = this.findIdenticalScorePatterns(userId, recentGames);
      if (identicalScores > 3) {
        result.flags.push('IDENTICAL_SCORE_PATTERN');
        result.warnings.push('Repeated identical score patterns');
      }

      // Check for unrealistic improvement
      if (recentGames.length >= 10) {
        const improvement = this.calculatePerformanceImprovement(userId, recentGames);
        if (improvement > 200) { // ELO improvement
          result.flags.push('UNREALISTIC_IMPROVEMENT');
          result.warnings.push('Unrealistic performance improvement');
        }
      }

    } catch (error) {
      console.error('Error in historical pattern validation:', error);
    }
  }

  /**
   * Cross-validate with opponent data (when available)
   */
  async validateCrossReference(gameData, result) {
    // This would check if opponent submitted matching data
    // For now, just log that cross-validation is needed
    result.warnings.push('Cross-validation pending');
  }

  /**
   * Calculate overall suspicious level based on flags
   */
  calculateSuspiciousLevel(flags) {
    const flagSeverity = {
      'RESULT_SCORE_MISMATCH': 4,
      'GOALS_SCORE_MISMATCH': 3,
      'GAME_TOO_SHORT': 2,
      'UNREALISTIC_SCORING_RATE': 4,
      'IMPOSSIBLE_SCORE_TIME_RATIO': 5,
      'PLAYER_SCORE_TOO_HIGH': 3,
      'EXCESSIVE_SCORE_DIFFERENCE': 2,
      'RAPID_SUBMISSION': 3,
      'EXCESSIVE_WIN_STREAK': 4,
      'IDENTICAL_SCORE_PATTERN': 4,
      'UNREALISTIC_IMPROVEMENT': 4,
      'VALIDATION_ERROR': 5
    };

    let totalSeverity = 0;
    flags.forEach(flag => {
      totalSeverity += flagSeverity[flag] || 1;
    });

    return Math.min(totalSeverity, 10); // Cap at 10
  }

  /**
   * Helper function to count consecutive wins
   */
  countConsecutiveWins(userId, games) {
    let consecutiveWins = 0;
    
    for (const game of games) {
      if (game.winner_id === userId) {
        consecutiveWins++;
      } else if (game.winner_id !== null) { // Not a draw
        break;
      }
    }
    
    return consecutiveWins;
  }

  /**
   * Helper function to find identical score patterns
   */
  findIdenticalScorePatterns(userId, games) {
    const scorePatterns = {};
    let identicalCount = 0;
    
    games.forEach(game => {
      const isPlayer1 = game.player1_id === userId;
      const playerScore = isPlayer1 ? game.player1_score : game.player2_score;
      const opponentScore = isPlayer1 ? game.player2_score : game.player1_score;
      const pattern = `${playerScore}-${opponentScore}`;
      
      scorePatterns[pattern] = (scorePatterns[pattern] || 0) + 1;
      if (scorePatterns[pattern] > 2) {
        identicalCount++;
      }
    });
    
    return identicalCount;
  }

  /**
   * Helper function to calculate performance improvement
   */
  calculatePerformanceImprovement(userId, games) {
    if (games.length < 5) return 0;
    
    // Simple improvement calculation based on win rate in first vs last 5 games
    const recent5 = games.slice(0, 5);
    const older5 = games.slice(-5);
    
    const recentWinRate = recent5.filter(g => g.winner_id === userId).length / 5;
    const olderWinRate = older5.filter(g => g.winner_id === userId).length / 5;
    
    return (recentWinRate - olderWinRate) * 100;
  }

  /**
   * Clean up old submission tracking data
   */
  cleanupRecentSubmissions() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    
    for (const [key, timestamp] of this.recentSubmissions.entries()) {
      if (timestamp < oneHourAgo) {
        this.recentSubmissions.delete(key);
      }
    }
  }

  /**
   * Get validation statistics
   */
  getValidationStats() {
    return {
      thresholds: this.suspiciousThresholds,
      activeTrackingUsers: this.recentSubmissions.size,
      lastCleanup: new Date().toISOString()
    };
  }
}

module.exports = new AntiCheatValidator();