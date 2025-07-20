/**
 * Example usage of the GameStateValidator class in the multiplayer system
 */

const GameStateValidator = require('../modules/GameStateValidator');

// Demonstrate comprehensive game state validation scenarios
async function demonstrateValidationUsage() {
  console.log('🛡️ Head Soccer Multiplayer - GameStateValidator Demo\n');
  
  // 1. Create validator with custom settings
  console.log('1️⃣ Creating game state validator...');
  const validator = new GameStateValidator({
    maxPlayerSpeed: 400,     // Slightly slower max speed
    maxBallSpeed: 600,       // Reduced ball speed
    maxInputRate: 30,        // 30 inputs per second max
    maxTimeDrift: 500,       // 500ms max time drift
    fieldWidth: 800,
    fieldHeight: 400
  });
  
  console.log(`✅ Validator created with custom settings`);
  console.log(`   Max Player Speed: ${validator.maxPlayerSpeed} px/s`);
  console.log(`   Max Ball Speed: ${validator.maxBallSpeed} px/s`);
  console.log(`   Max Input Rate: ${validator.maxInputRate} inputs/s`);
  console.log(`   Field Size: ${validator.fieldBounds.width}x${validator.fieldBounds.height}\n`);
  
  // 2. Validate player movements
  console.log('2️⃣ Validating player movements...');
  
  // Valid movement
  const validMovement = {
    position: { x: 200, y: 200 },
    timestamp: Date.now()
  };
  const previousState = {
    position: { x: 190, y: 195 },
    timestamp: Date.now() - 100
  };
  
  let result = validator.validatePlayerMovement('player1', validMovement, previousState);
  console.log(`Valid movement: ${result.valid ? '✅' : '❌'} (${result.reason})`);
  
  // Invalid movement - too fast
  const fastMovement = {
    position: { x: 400, y: 200 },
    timestamp: Date.now()
  };
  const recentState = {
    position: { x: 100, y: 200 },
    timestamp: Date.now() - 50  // 300px in 50ms = 6000px/s
  };
  
  result = validator.validatePlayerMovement('player1', fastMovement, recentState);
  console.log(`Too fast movement: ${result.valid ? '✅' : '❌'} (${result.reason})`);
  
  // Out of bounds movement
  const outOfBounds = {
    position: { x: 1000, y: 200 },  // Outside field
    timestamp: Date.now()
  };
  
  result = validator.validatePlayerMovement('player1', outOfBounds, validMovement);
  console.log(`Out of bounds: ${result.valid ? '✅' : '❌'} (${result.reason})`);
  console.log(`   Corrected position: (${result.correctedPosition.x}, ${result.correctedPosition.y})\n`);
  
  // 3. Test input rate limiting
  console.log('3️⃣ Testing input rate limiting...');
  
  validator.reset(); // Clear previous inputs
  let rateLimitHit = false;
  
  for (let i = 0; i < 35; i++) {
    const movement = {
      position: { x: 200 + i, y: 200 },
      timestamp: Date.now()
    };
    
    result = validator.validatePlayerMovement('player2', movement, {});
    if (!result.valid && result.reason.includes('input rate')) {
      console.log(`⚠️ Rate limit hit at input ${i + 1}: ${result.reason}`);
      rateLimitHit = true;
      break;
    }
  }
  
  if (!rateLimitHit) {
    console.log('✅ All inputs within rate limit');
  }
  console.log();
  
  // 4. Ball physics validation
  console.log('4️⃣ Validating ball physics...');
  
  // Valid ball state
  const validBall = {
    position: { x: 400, y: 200 },
    velocity: { x: 50, y: 30 },
    timestamp: Date.now()
  };
  const previousBall = {
    position: { x: 395, y: 197 },
    velocity: { x: 48, y: 28 },
    timestamp: Date.now() - 100
  };
  
  result = validator.validateBallPhysics(validBall, previousBall);
  console.log(`Valid ball physics: ${result.valid ? '✅' : '❌'} (${result.reason})`);
  
  // Invalid ball - too fast
  const fastBall = {
    position: { x: 400, y: 200 },
    velocity: { x: 800, y: 400 }, // Very fast velocity
    timestamp: Date.now()
  };
  
  result = validator.validateBallPhysics(fastBall, validBall);
  console.log(`Too fast ball: ${result.valid ? '✅' : '❌'} (${result.reason})`);
  
  if (!result.valid) {
    const correctedSpeed = Math.sqrt(
      result.correctedState.velocity.x ** 2 + 
      result.correctedState.velocity.y ** 2
    );
    console.log(`   Corrected velocity magnitude: ${correctedSpeed.toFixed(2)} px/s`);
  }
  console.log();
  
  // 5. Goal validation scenarios
  console.log('5️⃣ Goal validation scenarios...');
  
  // Valid goal
  const validGoal = {
    ballPosition: { x: 15, y: 230 },      // Inside left goal
    previousBallPosition: { x: 25, y: 230 }, // Outside goal
    playerId: 'player1',
    timestamp: Date.now()
  };
  const gameState = {
    players: {
      player1: { position: 'right' }  // Scoring on opponent's goal
    }
  };
  
  result = validator.validateGoal(validGoal, gameState);
  console.log(`Valid goal: ${result.valid ? '✅' : '❌'} (${result.reason})`);
  if (result.valid) {
    console.log(`   Goal side: ${result.goalInfo.side}`);
    console.log(`   Scorer: ${result.goalInfo.playerId}`);
    console.log(`   Own goal: ${result.goalInfo.isOwnGoal ? 'Yes' : 'No'}`);
  }
  
  // Own goal scenario
  const ownGoal = {
    ballPosition: { x: 785, y: 230 },     // Inside right goal
    previousBallPosition: { x: 775, y: 230 },
    playerId: 'player2',
    timestamp: Date.now()
  };
  const ownGoalState = {
    players: {
      player2: { position: 'right' }  // Scoring on own goal
    }
  };
  
  result = validator.validateGoal(ownGoal, ownGoalState);
  console.log(`Own goal scenario: ${result.valid ? '✅' : '❌'} (${result.reason})`);
  if (result.valid) {
    console.log(`   Own goal detected: ${result.goalInfo.isOwnGoal ? 'Yes' : 'No'}`);
  }
  
  // Invalid goal - outside posts
  const missedGoal = {
    ballPosition: { x: 15, y: 100 },      // Above goal posts
    previousBallPosition: { x: 25, y: 100 },
    playerId: 'player1',
    timestamp: Date.now()
  };
  
  result = validator.validateGoal(missedGoal, gameState);
  console.log(`Ball above posts: ${result.valid ? '✅' : '❌'} (${result.reason})\n`);
  
  // 6. Complete game state validation
  console.log('6️⃣ Complete game state validation...');
  
  const completeGameState = {
    players: {
      player1: { position: { x: 200, y: 200 } },
      player2: { position: { x: 600, y: 200 } }
    },
    ball: {
      position: { x: 400, y: 200 },
      velocity: { x: 0, y: 0 },
      timestamp: Date.now()
    },
    score: { left: 2, right: 1 },
    gameTime: 180
  };
  
  const previousGameState = {
    players: {
      player1: { position: { x: 195, y: 195 } },
      player2: { position: { x: 595, y: 195 } }
    },
    ball: {
      position: { x: 395, y: 195 },
      velocity: { x: 5, y: 5 },
      timestamp: Date.now() - 100
    },
    score: { left: 1, right: 1 },
    gameTime: 179
  };
  
  result = validator.validateGameState(completeGameState, previousGameState);
  console.log(`Game state validation: ${result.valid ? '✅' : '❌'}`);
  console.log(`Issues found: ${result.issues.length}`);
  
  if (result.issues.length > 0) {
    result.issues.forEach((issue, index) => {
      console.log(`   Issue ${index + 1}: ${issue.type} - ${issue.issue}`);
    });
  }
  console.log();
  
  // 7. Anti-cheat detection scenarios
  console.log('7️⃣ Anti-cheat detection scenarios...');
  
  // Simulate suspicious input patterns
  validator.reset();
  
  // High frequency inputs (potential bot)
  for (let i = 0; i < 25; i++) {
    validator.logPlayerInput('suspicious_player', Date.now());
  }
  
  const cheatDetection = validator.detectCheatPatterns('suspicious_player', {
    movement: { position: { x: 200, y: 200 }, timestamp: Date.now() }
  });
  
  console.log(`Cheat detection: ${cheatDetection.suspicious ? '⚠️ SUSPICIOUS' : '✅ Clean'}`);
  console.log(`Severity: ${cheatDetection.severity}`);
  console.log(`Alerts: ${cheatDetection.alerts.length}`);
  
  cheatDetection.alerts.forEach((alert, index) => {
    console.log(`   Alert ${index + 1}: ${alert.type} - ${alert.message || 'Pattern detected'} (${alert.severity})`);
  });
  console.log();
  
  // 8. Error handling demonstration
  console.log('8️⃣ Error handling demonstration...');
  
  // Invalid movement data
  result = validator.validatePlayerMovement('player1', null, {});
  console.log(`Null movement data: ${result.valid ? '✅' : '❌'} (${result.reason})`);
  
  // Invalid ball data
  result = validator.validateBallPhysics({ invalid: 'data' }, {});
  console.log(`Invalid ball data: ${result.valid ? '✅' : '❌'} (${result.reason})`);
  
  // Invalid goal data
  result = validator.validateGoal({}, {});
  console.log(`Empty goal data: ${result.valid ? '✅' : '❌'} (${result.reason})\n`);
  
  // 9. Validation statistics
  console.log('9️⃣ Validation statistics...');
  
  const stats = validator.getValidationStats();
  console.log(`Tracked players: ${stats.trackedPlayers}`);
  console.log(`State history size: ${stats.stateHistorySize}`);
  console.log(`Validation thresholds:`);
  console.log(`   Max player speed: ${stats.validationThresholds.maxPlayerSpeed} px/s`);
  console.log(`   Max ball speed: ${stats.validationThresholds.maxBallSpeed} px/s`);
  console.log(`   Max input rate: ${stats.validationThresholds.maxInputRate} inputs/s`);
  console.log(`   Max time drift: ${stats.validationThresholds.maxTimeDrift}ms\n`);
  
  console.log('🛡️ GameStateValidator demonstration completed successfully!');
}

// Real-time validation scenario
async function demonstrateRealTimeValidation() {
  console.log('\n\n⚡ Real-time Validation Demo\n');
  
  const validator = new GameStateValidator();
  
  console.log('Simulating real-time game validation...');
  
  // Simulate player states
  let player1State = { position: { x: 200, y: 200 }, timestamp: Date.now() };
  let player2State = { position: { x: 600, y: 200 }, timestamp: Date.now() };
  let ballState = { position: { x: 400, y: 200 }, velocity: { x: 50, y: 0 }, timestamp: Date.now() };
  
  // Simulate 10 game updates
  for (let frame = 1; frame <= 10; frame++) {
    console.log(`\nFrame ${frame}:`);
    
    const now = Date.now();
    
    // Update positions (simulate movement)
    const newPlayer1 = {
      position: { 
        x: player1State.position.x + (Math.random() - 0.5) * 20,
        y: player1State.position.y + (Math.random() - 0.5) * 20
      },
      timestamp: now
    };
    
    const newPlayer2 = {
      position: {
        x: player2State.position.x + (Math.random() - 0.5) * 20,
        y: player2State.position.y + (Math.random() - 0.5) * 20
      },
      timestamp: now
    };
    
    const newBall = {
      position: {
        x: ballState.position.x + ballState.velocity.x * 0.016, // 16ms frame
        y: ballState.position.y + ballState.velocity.y * 0.016
      },
      velocity: {
        x: ballState.velocity.x * 0.99, // Slight deceleration
        y: ballState.velocity.y * 0.99
      },
      timestamp: now
    };
    
    // Validate movements
    const p1Validation = validator.validatePlayerMovement('player1', newPlayer1, player1State);
    const p2Validation = validator.validatePlayerMovement('player2', newPlayer2, player2State);
    const ballValidation = validator.validateBallPhysics(newBall, ballState);
    
    console.log(`   Player1: ${p1Validation.valid ? '✅' : '❌'} ${!p1Validation.valid ? '(' + p1Validation.reason + ')' : ''}`);
    console.log(`   Player2: ${p2Validation.valid ? '✅' : '❌'} ${!p2Validation.valid ? '(' + p2Validation.reason + ')' : ''}`);
    console.log(`   Ball: ${ballValidation.valid ? '✅' : '❌'} ${!ballValidation.valid ? '(' + ballValidation.reason + ')' : ''}`);
    
    // Use corrected positions if validation failed
    player1State = p1Validation.valid ? newPlayer1 : { ...newPlayer1, position: p1Validation.correctedPosition };
    player2State = p2Validation.valid ? newPlayer2 : { ...newPlayer2, position: p2Validation.correctedPosition };
    ballState = ballValidation.valid ? newBall : ballValidation.correctedState;
    
    // Simulate potential goal
    if (frame === 7 && ballState.position.x < 20) {
      console.log(`   🥅 Checking potential goal...`);
      const goalData = {
        ballPosition: ballState.position,
        previousBallPosition: { x: ballState.position.x + 10, y: ballState.position.y },
        playerId: 'player2',
        timestamp: now
      };
      const gameState = {
        players: {
          player2: { position: 'right' }
        }
      };
      
      const goalResult = validator.validateGoal(goalData, gameState);
      console.log(`   Goal validation: ${goalResult.valid ? '⚽ GOAL!' : '❌ No goal'} (${goalResult.reason})`);
    }
    
    // Short delay for realistic timing
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  console.log('\n⚡ Real-time validation demo completed!');
}

// Performance testing
async function demonstratePerformanceTest() {
  console.log('\n\n📈 Performance Testing Demo\n');
  
  const validator = new GameStateValidator();
  const iterations = 1000;
  
  console.log(`Testing validation performance with ${iterations} iterations...`);
  
  // Prepare test data
  const testMovement = {
    position: { x: 400, y: 200 },
    timestamp: Date.now()
  };
  const testPreviousState = {
    position: { x: 395, y: 195 },
    timestamp: Date.now() - 100
  };
  
  // Performance test
  const startTime = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    validator.validatePlayerMovement(`player${i % 10}`, testMovement, testPreviousState);
  }
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  const validationsPerSecond = Math.round((iterations / duration) * 1000);
  
  console.log(`✅ Performance test completed:`);
  console.log(`   Total time: ${duration}ms`);
  console.log(`   Validations per second: ${validationsPerSecond.toLocaleString()}`);
  console.log(`   Average time per validation: ${(duration / iterations).toFixed(3)}ms`);
  
  const stats = validator.getValidationStats();
  console.log(`   Players tracked: ${stats.trackedPlayers}`);
}

// Run all demonstrations
async function runAllDemos() {
  await demonstrateValidationUsage();
  await demonstrateRealTimeValidation();
  await demonstratePerformanceTest();
}

// Run demo
runAllDemos().catch(console.error);