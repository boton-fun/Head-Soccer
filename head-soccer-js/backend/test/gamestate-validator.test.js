/**
 * Unit tests for GameStateValidator class
 */

const GameStateValidator = require('../modules/GameStateValidator');

// Simple test runner
function runTests() {
  let passedTests = 0;
  let failedTests = 0;
  
  function test(description, testFn) {
    try {
      testFn();
      console.log(`✅ ${description}`);
      passedTests++;
    } catch (error) {
      console.log(`❌ ${description}`);
      console.log(`   Error: ${error.message}`);
      failedTests++;
    }
  }
  
  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }
  
  console.log('\n🧪 Running GameStateValidator Tests...\n');
  
  // Test 1: Validator creation
  test('Should create GameStateValidator with default values', () => {
    const validator = new GameStateValidator();
    assert(validator.maxPlayerSpeed === 500);
    assert(validator.maxBallSpeed === 800);
    assert(validator.maxInputRate === 60);
    assert(validator.maxTimeDrift === 1000);
    assert(validator.fieldBounds.width === 800);
    assert(validator.fieldBounds.height === 400);
  });
  
  // Test 2: Validator creation with options
  test('Should create GameStateValidator with custom options', () => {
    const validator = new GameStateValidator({
      maxPlayerSpeed: 300,
      maxBallSpeed: 600,
      fieldWidth: 1000,
      fieldHeight: 500
    });
    assert(validator.maxPlayerSpeed === 300);
    assert(validator.maxBallSpeed === 600);
    assert(validator.fieldBounds.width === 1000);
    assert(validator.fieldBounds.height === 500);
  });
  
  // Test 3: Valid movement validation
  test('Should validate correct player movement', () => {
    const validator = new GameStateValidator();
    const movement = {
      position: { x: 400, y: 200 },
      timestamp: Date.now()
    };
    const previousState = {
      position: { x: 390, y: 195 },
      timestamp: Date.now() - 100
    };
    
    const result = validator.validatePlayerMovement('player1', movement, previousState);
    assert(result.valid === true);
    assert(result.reason === 'Movement validated');
  });
  
  // Test 4: Invalid movement data structure
  test('Should reject invalid movement data structure', () => {
    const validator = new GameStateValidator();
    const invalidMovement = {
      position: { x: 'invalid', y: 200 }
    };
    
    const result = validator.validatePlayerMovement('player1', invalidMovement, {});
    assert(result.valid === false);
    assert(result.reason === 'Invalid movement data structure');
  });
  
  // Test 5: Position bounds validation
  test('Should reject out-of-bounds positions', () => {
    const validator = new GameStateValidator();
    const movement = {
      position: { x: 1000, y: 200 }, // Out of bounds
      timestamp: Date.now()
    };
    
    const result = validator.validatePlayerMovement('player1', movement, {});
    assert(result.valid === false);
    assert(result.reason === 'position out of right boundary');
    assert(result.correctedPosition.x <= 820); // Within corrected bounds
  });
  
  // Test 6: Movement speed validation
  test('Should reject impossibly fast movement', () => {
    const validator = new GameStateValidator();
    const now = Date.now();
    const movement = {
      position: { x: 600, y: 200 },
      timestamp: now
    };
    const previousState = {
      position: { x: 100, y: 200 }, // 500 pixels away
      timestamp: now - 50 // 50ms ago = 10,000 pixels/second
    };
    
    const result = validator.validatePlayerMovement('player1', movement, previousState);
    assert(result.valid === false);
    assert(result.reason.includes('movement speed'));
  });
  
  // Test 7: Input rate limiting
  test('Should enforce input rate limits', () => {
    const validator = new GameStateValidator({ maxInputRate: 5 });
    const movement = {
      position: { x: 400, y: 200 },
      timestamp: Date.now()
    };
    
    // Send 6 inputs rapidly
    for (let i = 0; i < 6; i++) {
      const result = validator.validatePlayerMovement('player1', movement, {});
      if (i < 5) {
        assert(result.valid === true, `Input ${i + 1} should be valid`);
      } else {
        assert(result.valid === false, 'Input 6 should be rate limited');
        assert(result.reason.includes('input rate'));
      }
    }
  });
  
  // Test 8: Ball physics validation
  test('Should validate ball physics correctly', () => {
    const validator = new GameStateValidator();
    const ballState = {
      position: { x: 400, y: 200 },
      velocity: { x: 100, y: 50 },
      timestamp: Date.now()
    };
    const previousBallState = {
      position: { x: 390, y: 195 },
      velocity: { x: 95, y: 48 },
      timestamp: Date.now() - 100
    };
    
    const result = validator.validateBallPhysics(ballState, previousBallState);
    assert(result.valid === true);
    assert(result.reason === 'Ball physics validated');
  });
  
  // Test 9: Ball speed limits
  test('Should enforce ball speed limits', () => {
    const validator = new GameStateValidator();
    const ballState = {
      position: { x: 400, y: 200 },
      velocity: { x: 1000, y: 500 }, // Very fast velocity
      timestamp: Date.now()
    };
    
    const result = validator.validateBallPhysics(ballState, {});
    assert(result.valid === false);
    assert(result.reason === 'Ball velocity exceeds maximum');
    
    // Check velocity was corrected
    const correctedSpeed = Math.sqrt(
      result.correctedState.velocity.x ** 2 + 
      result.correctedState.velocity.y ** 2
    );
    assert(correctedSpeed <= validator.maxBallSpeed + 0.001); // Account for floating point precision
  });
  
  // Test 10: Goal line validation
  test('Should validate goal line crossing', () => {
    const validator = new GameStateValidator();
    const goalData = {
      ballPosition: { x: 15, y: 230 }, // Inside left goal
      previousBallPosition: { x: 25, y: 230 }, // Outside goal
      playerId: 'player1',
      timestamp: Date.now()
    };
    const gameState = {
      players: {
        player1: { position: 'right' }
      }
    };
    
    const result = validator.validateGoal(goalData, gameState);
    assert(result.valid === true);
    assert(result.goalInfo.side === 'left');
    assert(result.goalInfo.playerId === 'player1');
  });
  
  // Test 11: Goal bounds validation
  test('Should reject goals outside post bounds', () => {
    const validator = new GameStateValidator();
    const goalData = {
      ballPosition: { x: 15, y: 100 }, // Above goal posts
      previousBallPosition: { x: 25, y: 100 },
      playerId: 'player1',
      timestamp: Date.now()
    };
    const gameState = {
      players: {
        player1: { position: 'right' }
      }
    };
    
    const result = validator.validateGoal(goalData, gameState);
    assert(result.valid === false);
    assert(result.reason === 'ball outside goal post bounds');
  });
  
  // Test 12: Own goal detection
  test('Should detect own goals', () => {
    const validator = new GameStateValidator();
    const goalData = {
      ballPosition: { x: 15, y: 230 },
      previousBallPosition: { x: 25, y: 230 },
      playerId: 'player1',
      timestamp: Date.now()
    };
    const gameState = {
      players: {
        player1: { position: 'left' } // Same side as goal
      }
    };
    
    const result = validator.validateGoal(goalData, gameState);
    assert(result.valid === true);
    assert(result.goalInfo.isOwnGoal === true);
  });
  
  // Test 13: Complete game state validation
  test('Should validate complete game state', () => {
    const validator = new GameStateValidator();
    const gameState = {
      players: {
        player1: { position: { x: 200, y: 200 } },
        player2: { position: { x: 600, y: 200 } }
      },
      ball: {
        position: { x: 400, y: 200 },
        velocity: { x: 0, y: 0 },
        timestamp: Date.now()
      },
      score: { left: 1, right: 0 },
      gameTime: 120
    };
    const previousState = {
      players: {
        player1: { position: { x: 195, y: 195 } },
        player2: { position: { x: 595, y: 195 } }
      },
      ball: {
        position: { x: 395, y: 195 },
        velocity: { x: 5, y: 5 },
        timestamp: Date.now() - 100
      },
      score: { left: 0, right: 0 },
      gameTime: 119
    };
    
    const result = validator.validateGameState(gameState, previousState);
    assert(result.valid === true);
    assert(result.issues.length === 0);
  });
  
  // Test 14: Score regression detection
  test('Should detect score regression', () => {
    const validator = new GameStateValidator();
    const gameState = {
      score: { left: 0, right: 1 }, // Score decreased
      gameTime: 120
    };
    const previousState = {
      score: { left: 1, right: 1 },
      gameTime: 119
    };
    
    const result = validator.validateGameState(gameState, previousState);
    assert(result.valid === false);
    assert(result.issues.some(issue => issue.type === 'score_inconsistency'));
  });
  
  // Test 15: Time regression detection
  test('Should detect time regression', () => {
    const validator = new GameStateValidator();
    const gameState = {
      gameTime: 118 // Time went backwards
    };
    const previousState = {
      gameTime: 120
    };
    
    const result = validator.validateGameState(gameState, previousState);
    assert(result.valid === false);
    assert(result.issues.some(issue => issue.type === 'time_regression'));
  });
  
  // Test 16: Timestamp drift validation
  test('Should validate timestamp drift', () => {
    const validator = new GameStateValidator({ maxTimeDrift: 500 });
    const now = Date.now();
    const movement = {
      position: { x: 400, y: 200 },
      timestamp: now + 1000 // 1 second in future
    };
    
    const result = validator.validatePlayerMovement('player1', movement, {});
    assert(result.valid === false);
    assert(result.reason.includes('timestamp drift'));
  });
  
  // Test 17: Position correction
  test('Should correct out-of-bounds positions', () => {
    const validator = new GameStateValidator();
    const outOfBounds = { x: 1000, y: -50 };
    const corrected = validator.correctPosition(outOfBounds);
    
    assert(corrected.x <= validator.fieldBounds.width + validator.fieldBounds.margin);
    assert(corrected.y >= -validator.fieldBounds.margin);
  });
  
  // Test 18: Velocity limiting
  test('Should limit excessive velocities', () => {
    const validator = new GameStateValidator();
    const excessiveVelocity = { x: 1000, y: 1000 };
    const limited = validator.limitVelocity(excessiveVelocity, 500);
    
    const speed = Math.sqrt(limited.x ** 2 + limited.y ** 2);
    assert(speed <= 500);
  });
  
  // Test 19: Cheat pattern detection
  test('Should detect suspicious input patterns', () => {
    const validator = new GameStateValidator({ maxInputRate: 10 });
    
    // Simulate very high input rate
    for (let i = 0; i < 15; i++) {
      validator.logPlayerInput('player1', Date.now());
    }
    
    const detection = validator.detectCheatPatterns('player1', {});
    assert(detection.suspicious === true);
    assert(detection.alerts.length > 0);
  });
  
  // Test 20: Validation statistics
  test('Should provide validation statistics', () => {
    const validator = new GameStateValidator();
    validator.logPlayerInput('player1', Date.now());
    validator.logPlayerInput('player2', Date.now());
    
    const stats = validator.getValidationStats();
    assert(stats.trackedPlayers === 2);
    assert(typeof stats.validationThresholds === 'object');
    assert(stats.validationThresholds.maxPlayerSpeed === 500);
  });
  
  // Test 21: Validator reset
  test('Should reset validator state', () => {
    const validator = new GameStateValidator();
    validator.logPlayerInput('player1', Date.now());
    validator.addStateToHistory({ gameTime: 120 });
    
    validator.reset();
    
    const stats = validator.getValidationStats();
    assert(stats.trackedPlayers === 0);
    assert(stats.stateHistorySize === 0);
  });
  
  // Test 22: Error handling in movement validation
  test('Should handle movement validation errors gracefully', () => {
    const validator = new GameStateValidator();
    
    // Pass invalid data that could cause errors
    const result = validator.validatePlayerMovement('player1', null, {});
    assert(result.valid === false);
    assert(result.reason === 'Invalid movement data structure');
  });
  
  // Test 23: Error handling in ball validation
  test('Should handle ball validation errors gracefully', () => {
    const validator = new GameStateValidator();
    
    // Pass invalid ball data
    const result = validator.validateBallPhysics(null, {});
    assert(result.valid === false);
    assert(result.reason === 'Invalid ball data structure');
  });
  
  // Test 24: Error handling in goal validation
  test('Should handle goal validation errors gracefully', () => {
    const validator = new GameStateValidator();
    
    // Pass invalid goal data
    const result = validator.validateGoal({}, {});
    assert(result.valid === false);
    assert(result.goalInfo === null);
  });
  
  // Test 25: Position interpolation
  test('Should interpolate positions correctly', () => {
    const validator = new GameStateValidator();
    const pos1 = { x: 100, y: 100 };
    const pos2 = { x: 200, y: 200 };
    
    const interpolated = validator.interpolatePosition(pos1, pos2, 0.5);
    assert(interpolated.x === 150);
    assert(interpolated.y === 150);
  });
  
  // Test results
  console.log('\n📊 GameStateValidator Test Results:');
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Total: ${passedTests + failedTests}`);
  
  return failedTests === 0;
}

// Run tests if called directly
if (require.main === module) {
  const success = runTests();
  process.exit(success ? 0 : 1);
}

module.exports = { runTests };