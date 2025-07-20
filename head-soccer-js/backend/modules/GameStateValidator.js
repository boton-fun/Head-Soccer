/**
 * GameStateValidator - Server-side game state validation and anti-cheat system
 * Validates player inputs, game state consistency, and prevents cheating
 */

class GameStateValidator {
  constructor(options = {}) {
    // Validation thresholds
    this.maxPlayerSpeed = options.maxPlayerSpeed || 500;           // pixels per second
    this.maxBallSpeed = options.maxBallSpeed || 800;              // pixels per second
    this.maxGoalDistance = options.maxGoalDistance || 50;         // max distance from goal line
    this.maxInputRate = options.maxInputRate || 60;              // inputs per second
    this.maxTimeDrift = options.maxTimeDrift || 1000;            // milliseconds
    
    // Game boundaries
    this.fieldBounds = {
      width: options.fieldWidth || 800,
      height: options.fieldHeight || 400,
      margin: options.fieldMargin || 20
    };
    
    // Goal positions
    this.goals = {
      left: { x: 0, y: 200, width: 20, height: 120 },
      right: { x: 780, y: 200, width: 20, height: 120 }
    };
    
    // Player input tracking for rate limiting
    this.playerInputs = new Map();  // playerId -> input history
    
    // Game state history for consistency checks
    this.stateHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Player Input Validation
   */

  /**
   * Validate player movement input
   * @param {string} playerId - Player ID
   * @param {object} movement - Movement data
   * @param {object} previousState - Previous player state
   * @returns {object} { valid: boolean, reason: string, correctedPosition: object }
   */
  validatePlayerMovement(playerId, movement, previousState) {
    try {
      const now = Date.now();
      
      // Check input rate limiting
      const rateCheck = this.checkInputRate(playerId, now);
      if (!rateCheck.valid) {
        return rateCheck;
      }
      
      // Validate movement data structure
      if (!this.isValidMovementData(movement)) {
        return { 
          valid: false, 
          reason: 'Invalid movement data structure',
          correctedPosition: previousState.position 
        };
      }
      
      // Check position bounds
      const boundsCheck = this.validatePositionBounds(movement.position);
      if (!boundsCheck.valid) {
        return {
          valid: false,
          reason: boundsCheck.reason,
          correctedPosition: this.correctPosition(movement.position)
        };
      }
      
      // Check movement speed
      if (previousState && previousState.position) {
        const speedCheck = this.validateMovementSpeed(
          previousState.position, 
          movement.position, 
          movement.timestamp - previousState.timestamp
        );
        if (!speedCheck.valid) {
          return {
            valid: false,
            reason: speedCheck.reason,
            correctedPosition: this.interpolatePosition(previousState.position, movement.position)
          };
        }
      }
      
      // Check timestamp validity
      const timeCheck = this.validateTimestamp(movement.timestamp, now);
      if (!timeCheck.valid) {
        return {
          valid: false,
          reason: timeCheck.reason,
          correctedPosition: movement.position
        };
      }
      
      // Log valid input
      this.logPlayerInput(playerId, now);
      
      return { 
        valid: true, 
        reason: 'Movement validated',
        correctedPosition: movement.position 
      };
      
    } catch (error) {
      console.error('Movement validation error:', error);
      return { 
        valid: false, 
        reason: 'Validation error',
        correctedPosition: previousState?.position || { x: 400, y: 300 }
      };
    }
  }
  
  /**
   * Validate ball physics input
   * @param {object} ballState - Ball state data
   * @param {object} previousBallState - Previous ball state
   * @returns {object} { valid: boolean, reason: string, correctedState: object }
   */
  validateBallPhysics(ballState, previousBallState) {
    try {
      // Validate ball data structure
      if (!this.isValidBallData(ballState)) {
        return {
          valid: false,
          reason: 'Invalid ball data structure',
          correctedState: previousBallState
        };
      }
      
      // Check ball position bounds
      const boundsCheck = this.validatePositionBounds(ballState.position);
      if (!boundsCheck.valid) {
        return {
          valid: false,
          reason: `Ball ${boundsCheck.reason}`,
          correctedState: {
            ...ballState,
            position: this.correctPosition(ballState.position)
          }
        };
      }
      
      // Check ball speed
      if (previousBallState && previousBallState.position) {
        const speedCheck = this.validateBallSpeed(
          previousBallState.position,
          ballState.position,
          ballState.timestamp - previousBallState.timestamp
        );
        if (!speedCheck.valid) {
          return {
            valid: false,
            reason: speedCheck.reason,
            correctedState: {
              ...ballState,
              velocity: this.limitVelocity(ballState.velocity, this.maxBallSpeed)
            }
          };
        }
      }
      
      // Validate velocity limits
      if (ballState.velocity) {
        const velocityMagnitude = Math.sqrt(
          ballState.velocity.x ** 2 + ballState.velocity.y ** 2
        );
        if (velocityMagnitude > this.maxBallSpeed) {
          return {
            valid: false,
            reason: 'Ball velocity exceeds maximum',
            correctedState: {
              ...ballState,
              velocity: this.limitVelocity(ballState.velocity, this.maxBallSpeed)
            }
          };
        }
      }
      
      return {
        valid: true,
        reason: 'Ball physics validated',
        correctedState: ballState
      };
      
    } catch (error) {
      console.error('Ball validation error:', error);
      return {
        valid: false,
        reason: 'Ball validation error',
        correctedState: previousBallState || { position: { x: 400, y: 200 }, velocity: { x: 0, y: 0 } }
      };
    }
  }

  /**
   * Goal Validation
   */

  /**
   * Validate goal scoring
   * @param {object} goalData - Goal attempt data
   * @param {object} gameState - Current game state
   * @returns {object} { valid: boolean, reason: string, goalInfo: object }
   */
  validateGoal(goalData, gameState) {
    try {
      // Check if ball crossed goal line
      const goalLineCheck = this.validateGoalLine(goalData.ballPosition, goalData.previousBallPosition);
      if (!goalLineCheck.valid) {
        return {
          valid: false,
          reason: goalLineCheck.reason,
          goalInfo: null
        };
      }
      
      // Check goal bounds (ball must be within goal posts)
      const goalBoundsCheck = this.validateGoalBounds(goalData.ballPosition, goalLineCheck.side);
      if (!goalBoundsCheck.valid) {
        return {
          valid: false,
          reason: goalBoundsCheck.reason,
          goalInfo: null
        };
      }
      
      // Validate scoring player
      const playerCheck = this.validateScoringPlayer(goalData.playerId, goalLineCheck.side, gameState);
      if (!playerCheck.valid) {
        return {
          valid: false,
          reason: playerCheck.reason,
          goalInfo: null
        };
      }
      
      // Check for own goal
      const ownGoalCheck = this.checkOwnGoal(goalData.playerId, goalLineCheck.side, gameState);
      
      return {
        valid: true,
        reason: 'Goal validated',
        goalInfo: {
          side: goalLineCheck.side,
          playerId: goalData.playerId,
          isOwnGoal: ownGoalCheck.isOwnGoal,
          actualScorer: ownGoalCheck.actualScorer,
          ballPosition: goalData.ballPosition,
          timestamp: goalData.timestamp
        }
      };
      
    } catch (error) {
      console.error('Goal validation error:', error);
      return {
        valid: false,
        reason: 'Goal validation error',
        goalInfo: null
      };
    }
  }

  /**
   * Game State Consistency Validation
   */

  /**
   * Validate complete game state
   * @param {object} gameState - Complete game state
   * @param {object} previousState - Previous game state
   * @returns {object} { valid: boolean, issues: array, correctedState: object }
   */
  validateGameState(gameState, previousState) {
    const issues = [];
    const correctedState = { ...gameState };
    
    try {
      // Validate player states
      if (gameState.players) {
        for (const [playerId, playerState] of Object.entries(gameState.players)) {
          const previousPlayerState = previousState?.players?.[playerId];
          const playerValidation = this.validatePlayerState(playerState, previousPlayerState);
          
          if (!playerValidation.valid) {
            issues.push({
              type: 'player_state',
              playerId: playerId,
              issue: playerValidation.reason
            });
            correctedState.players[playerId] = playerValidation.correctedState;
          }
        }
      }
      
      // Validate ball state
      if (gameState.ball) {
        const ballValidation = this.validateBallPhysics(gameState.ball, previousState?.ball);
        if (!ballValidation.valid) {
          issues.push({
            type: 'ball_state',
            issue: ballValidation.reason
          });
          correctedState.ball = ballValidation.correctedState;
        }
      }
      
      // Validate game time progression
      if (previousState && gameState.gameTime < previousState.gameTime) {
        issues.push({
          type: 'time_regression',
          issue: 'Game time moved backwards'
        });
        correctedState.gameTime = previousState.gameTime;
      }
      
      // Validate score consistency
      if (previousState && gameState.score) {
        const scoreValidation = this.validateScoreProgression(gameState.score, previousState.score);
        if (!scoreValidation.valid) {
          issues.push({
            type: 'score_inconsistency',
            issue: scoreValidation.reason
          });
          correctedState.score = scoreValidation.correctedScore;
        }
      }
      
      // Store state in history
      this.addStateToHistory(correctedState);
      
      return {
        valid: issues.length === 0,
        issues: issues,
        correctedState: correctedState
      };
      
    } catch (error) {
      console.error('Game state validation error:', error);
      return {
        valid: false,
        issues: [{ type: 'validation_error', issue: error.message }],
        correctedState: previousState || gameState
      };
    }
  }

  /**
   * Anti-Cheat Detection
   */

  /**
   * Detect suspicious patterns
   * @param {string} playerId - Player ID
   * @param {object} gameData - Game data to analyze
   * @returns {object} { suspicious: boolean, alerts: array, severity: string }
   */
  detectCheatPatterns(playerId, gameData) {
    const alerts = [];
    let maxSeverity = 'low';
    
    try {
      // Check for impossible movements
      if (gameData.movement) {
        const movementAlert = this.detectImpossibleMovement(playerId, gameData.movement);
        if (movementAlert.detected) {
          alerts.push(movementAlert);
          maxSeverity = this.escalateSeverity(maxSeverity, movementAlert.severity);
        }
      }
      
      // Check input rate anomalies
      const inputRateAlert = this.detectInputRateAnomaly(playerId);
      if (inputRateAlert.detected) {
        alerts.push(inputRateAlert);
        maxSeverity = this.escalateSeverity(maxSeverity, inputRateAlert.severity);
      }
      
      // Check for pattern repetition (bot-like behavior)
      const patternAlert = this.detectPatternRepetition(playerId, gameData);
      if (patternAlert.detected) {
        alerts.push(patternAlert);
        maxSeverity = this.escalateSeverity(maxSeverity, patternAlert.severity);
      }
      
      // Check timing inconsistencies
      const timingAlert = this.detectTimingInconsistencies(gameData);
      if (timingAlert.detected) {
        alerts.push(timingAlert);
        maxSeverity = this.escalateSeverity(maxSeverity, timingAlert.severity);
      }
      
      return {
        suspicious: alerts.length > 0,
        alerts: alerts,
        severity: maxSeverity
      };
      
    } catch (error) {
      console.error('Cheat detection error:', error);
      return {
        suspicious: true,
        alerts: [{ type: 'detection_error', message: error.message, severity: 'medium' }],
        severity: 'medium'
      };
    }
  }

  /**
   * Helper Methods - Input Validation
   */

  isValidMovementData(movement) {
    return movement &&
           typeof movement === 'object' &&
           movement.position &&
           typeof movement.position.x === 'number' &&
           typeof movement.position.y === 'number' &&
           typeof movement.timestamp === 'number';
  }

  isValidBallData(ballState) {
    return ballState &&
           typeof ballState === 'object' &&
           ballState.position &&
           typeof ballState.position.x === 'number' &&
           typeof ballState.position.y === 'number' &&
           typeof ballState.timestamp === 'number';
  }

  validatePositionBounds(position) {
    if (position.x < -this.fieldBounds.margin) {
      return { valid: false, reason: 'position out of left boundary' };
    }
    if (position.x > this.fieldBounds.width + this.fieldBounds.margin) {
      return { valid: false, reason: 'position out of right boundary' };
    }
    if (position.y < -this.fieldBounds.margin) {
      return { valid: false, reason: 'position out of top boundary' };
    }
    if (position.y > this.fieldBounds.height + this.fieldBounds.margin) {
      return { valid: false, reason: 'position out of bottom boundary' };
    }
    return { valid: true, reason: 'position within bounds' };
  }

  validateMovementSpeed(previousPos, currentPos, timeDelta) {
    if (timeDelta <= 0) {
      return { valid: false, reason: 'invalid time delta' };
    }
    
    const distance = Math.sqrt(
      (currentPos.x - previousPos.x) ** 2 + 
      (currentPos.y - previousPos.y) ** 2
    );
    
    const speed = distance / (timeDelta / 1000); // pixels per second
    
    if (speed > this.maxPlayerSpeed) {
      return { 
        valid: false, 
        reason: `movement speed ${speed.toFixed(2)} exceeds maximum ${this.maxPlayerSpeed}` 
      };
    }
    
    return { valid: true, reason: 'movement speed valid' };
  }

  validateBallSpeed(previousPos, currentPos, timeDelta) {
    if (timeDelta <= 0) {
      return { valid: false, reason: 'invalid time delta for ball' };
    }
    
    const distance = Math.sqrt(
      (currentPos.x - previousPos.x) ** 2 + 
      (currentPos.y - previousPos.y) ** 2
    );
    
    const speed = distance / (timeDelta / 1000);
    
    if (speed > this.maxBallSpeed) {
      return { 
        valid: false, 
        reason: `ball speed ${speed.toFixed(2)} exceeds maximum ${this.maxBallSpeed}` 
      };
    }
    
    return { valid: true, reason: 'ball speed valid' };
  }

  validateTimestamp(timestamp, currentTime) {
    const timeDrift = Math.abs(timestamp - currentTime);
    
    if (timeDrift > this.maxTimeDrift) {
      return { 
        valid: false, 
        reason: `timestamp drift ${timeDrift}ms exceeds maximum ${this.maxTimeDrift}ms` 
      };
    }
    
    return { valid: true, reason: 'timestamp valid' };
  }

  /**
   * Helper Methods - Rate Limiting
   */

  checkInputRate(playerId, currentTime) {
    if (!this.playerInputs.has(playerId)) {
      this.playerInputs.set(playerId, []);
    }
    
    const inputs = this.playerInputs.get(playerId);
    
    // Remove old inputs (older than 1 second)
    const cutoffTime = currentTime - 1000;
    while (inputs.length > 0 && inputs[0] < cutoffTime) {
      inputs.shift();
    }
    
    if (inputs.length >= this.maxInputRate) {
      return { 
        valid: false, 
        reason: `input rate ${inputs.length}/s exceeds maximum ${this.maxInputRate}/s` 
      };
    }
    
    return { valid: true, reason: 'input rate valid' };
  }

  logPlayerInput(playerId, timestamp) {
    if (!this.playerInputs.has(playerId)) {
      this.playerInputs.set(playerId, []);
    }
    this.playerInputs.get(playerId).push(timestamp);
  }

  /**
   * Helper Methods - Position Correction
   */

  correctPosition(position) {
    return {
      x: Math.max(-this.fieldBounds.margin, 
          Math.min(this.fieldBounds.width + this.fieldBounds.margin, position.x)),
      y: Math.max(-this.fieldBounds.margin, 
          Math.min(this.fieldBounds.height + this.fieldBounds.margin, position.y))
    };
  }

  interpolatePosition(previousPos, targetPos, factor = 0.5) {
    return {
      x: previousPos.x + (targetPos.x - previousPos.x) * factor,
      y: previousPos.y + (targetPos.y - previousPos.y) * factor
    };
  }

  limitVelocity(velocity, maxSpeed) {
    const currentSpeed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
    if (currentSpeed <= maxSpeed) return velocity;
    
    const scale = maxSpeed / currentSpeed;
    return {
      x: velocity.x * scale,
      y: velocity.y * scale
    };
  }

  /**
   * Helper Methods - Goal Validation
   */

  validateGoalLine(ballPos, previousBallPos) {
    if (!previousBallPos || !previousBallPos.x || !ballPos || !ballPos.x) {
      return { valid: false, reason: 'invalid ball position data' };
    }
    
    // Check left goal
    if ((previousBallPos.x > this.goals.left.x + this.goals.left.width && 
         ballPos.x <= this.goals.left.x + this.goals.left.width)) {
      return { valid: true, side: 'left' };
    }
    
    // Check right goal
    if ((previousBallPos.x < this.goals.right.x && 
         ballPos.x >= this.goals.right.x)) {
      return { valid: true, side: 'right' };
    }
    
    return { valid: false, reason: 'ball did not cross goal line' };
  }

  validateGoalBounds(ballPos, side) {
    const goal = this.goals[side];
    
    if (ballPos.y < goal.y || ballPos.y > goal.y + goal.height) {
      return { valid: false, reason: 'ball outside goal post bounds' };
    }
    
    return { valid: true, reason: 'ball within goal bounds' };
  }

  validateScoringPlayer(playerId, goalSide, gameState) {
    if (!gameState.players || !gameState.players[playerId]) {
      return { valid: false, reason: 'invalid scoring player' };
    }
    
    return { valid: true, reason: 'scoring player validated' };
  }

  checkOwnGoal(playerId, goalSide, gameState) {
    const player = gameState.players[playerId];
    if (!player) {
      return { isOwnGoal: false, actualScorer: playerId };
    }
    
    // If player's position matches goal side, it's an own goal
    const isOwnGoal = player.position === goalSide;
    
    return {
      isOwnGoal: isOwnGoal,
      actualScorer: playerId
    };
  }

  /**
   * Helper Methods - State Management
   */

  addStateToHistory(state) {
    this.stateHistory.push({
      state: { ...state },
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }
  }

  validatePlayerState(playerState, previousPlayerState) {
    // Basic player state validation
    if (!playerState.position || typeof playerState.position.x !== 'number') {
      return {
        valid: false,
        reason: 'invalid player position',
        correctedState: previousPlayerState || { position: { x: 400, y: 300 } }
      };
    }
    
    return {
      valid: true,
      reason: 'player state valid',
      correctedState: playerState
    };
  }

  validateScoreProgression(currentScore, previousScore) {
    if (!previousScore) return { valid: true, correctedScore: currentScore };
    
    // Score should only increase
    if (currentScore.left < previousScore.left || currentScore.right < previousScore.right) {
      return {
        valid: false,
        reason: 'score regression detected',
        correctedScore: previousScore
      };
    }
    
    // Score should not increase by more than 1 at a time
    const leftDiff = currentScore.left - previousScore.left;
    const rightDiff = currentScore.right - previousScore.right;
    
    if (leftDiff > 1 || rightDiff > 1 || (leftDiff > 0 && rightDiff > 0)) {
      return {
        valid: false,
        reason: 'invalid score progression',
        correctedScore: previousScore
      };
    }
    
    return { valid: true, correctedScore: currentScore };
  }

  /**
   * Anti-Cheat Helper Methods
   */

  detectImpossibleMovement(playerId, movement) {
    // Implementation for impossible movement detection
    return { detected: false, severity: 'low', type: 'movement' };
  }

  detectInputRateAnomaly(playerId) {
    const inputs = this.playerInputs.get(playerId) || [];
    if (inputs.length > this.maxInputRate * 0.9) {
      return {
        detected: true,
        severity: 'medium',
        type: 'input_rate',
        message: `High input rate: ${inputs.length}/s`
      };
    }
    return { detected: false };
  }

  detectPatternRepetition(playerId, gameData) {
    // Implementation for pattern detection
    return { detected: false, severity: 'low', type: 'pattern' };
  }

  detectTimingInconsistencies(gameData) {
    // Implementation for timing analysis
    return { detected: false, severity: 'low', type: 'timing' };
  }

  escalateSeverity(current, new_severity) {
    const severityLevels = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
    return severityLevels[new_severity] > severityLevels[current] ? new_severity : current;
  }

  /**
   * Utility Methods
   */

  reset() {
    this.playerInputs.clear();
    this.stateHistory = [];
  }

  getValidationStats() {
    return {
      trackedPlayers: this.playerInputs.size,
      stateHistorySize: this.stateHistory.length,
      validationThresholds: {
        maxPlayerSpeed: this.maxPlayerSpeed,
        maxBallSpeed: this.maxBallSpeed,
        maxInputRate: this.maxInputRate,
        maxTimeDrift: this.maxTimeDrift
      }
    };
  }
}

module.exports = GameStateValidator;