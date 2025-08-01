/**
 * Server-Side Physics Engine - 240 FPS
 * Exact physics replication from single-player head-soccer-js
 */

const CONSTANTS = require('./gameConstants');

class ServerPhysicsEngine {
  constructor() {
    this.activeGames = new Map(); // roomId -> gameState
    this.playerInputs = new Map(); // playerId -> inputState
    this.physicsInterval = null;
    this.isRunning = false;
  }

  /**
   * Start the 240 FPS physics loop
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.physicsInterval = setInterval(() => {
      this.processPhysicsTick();
    }, CONSTANTS.TICK_MS);
    
    console.log(`Physics engine started at ${CONSTANTS.FRAME_RATE} FPS`);
  }

  /**
   * Stop the physics loop
   */
  stop() {
    if (this.physicsInterval) {
      clearInterval(this.physicsInterval);
      this.physicsInterval = null;
    }
    this.isRunning = false;
    console.log('Physics engine stopped');
  }

  /**
   * Create a new game state for a room
   */
  createGame(roomId, players) {
    const gameState = {
      roomId,
      players: players.map((player, index) => ({
        id: player.id,
        position: {
          x: index === 0 ? CONSTANTS.PLAYER.PLAYER_1_START_X : CONSTANTS.PLAYER.PLAYER_2_START_X,
          y: CONSTANTS.PLAYER.START_Y
        },
        velocity: { x: 0, y: 0 },
        onGround: false,
        facing: index === 0 ? 1 : -1, // 1 = right, -1 = left
        kicking: false,
        kickCooldown: 0,
        character: player.character || 'default',
        playerNumber: index + 1
      })),
      ball: {
        position: {
          x: CONSTANTS.BALL.START_X,
          y: CONSTANTS.BALL.START_Y
        },
        velocity: { x: 0, y: 0 },
        rotation: 0,
        rotationSpeed: 0,
        trail: []
      },
      score: { left: 0, right: 0 },
      gameTime: 0,
      gameStartTime: Date.now(),
      gameState: 'PLAYING',
      lastScoreTime: 0
    };

    this.activeGames.set(roomId, gameState);
    console.log(`Game created for room ${roomId} with ${players.length} players`);
    return gameState;
  }

  /**
   * Remove a game
   */
  destroyGame(roomId) {
    this.activeGames.delete(roomId);
    // Clean up player inputs for this room
    for (const [playerId, input] of this.playerInputs.entries()) {
      if (input.roomId === roomId) {
        this.playerInputs.delete(playerId);
      }
    }
    console.log(`Game destroyed for room ${roomId}`);
  }

  /**
   * Update player input
   */
  updatePlayerInput(playerId, roomId, input) {
    this.playerInputs.set(playerId, {
      ...input,
      playerId,
      roomId,
      timestamp: Date.now()
    });
  }

  /**
   * Main physics processing loop - runs at 240 FPS
   */
  processPhysicsTick() {
    const startTime = Date.now();

    for (const [roomId, gameState] of this.activeGames) {
      try {
        // Update game time
        gameState.gameTime = (Date.now() - gameState.gameStartTime) / 1000;

        // Update players based on inputs
        this.updatePlayers(gameState);

        // Update ball physics
        this.updateBall(gameState);

        // Check collisions
        this.checkCollisions(gameState);

        // Check goals
        this.checkGoals(gameState);

        // Check game end conditions
        this.checkGameEnd(gameState);

      } catch (error) {
        console.error(`Physics error in room ${roomId}:`, error);
      }
    }

    // Performance monitoring
    const executionTime = Date.now() - startTime;
    if (executionTime > CONSTANTS.TICK_MS) {
      console.warn(`Physics tick took ${executionTime}ms (budget: ${CONSTANTS.TICK_MS}ms)`);
    }
  }

  /**
   * Update all players in the game
   */
  updatePlayers(gameState) {
    for (const player of gameState.players) {
      const input = this.playerInputs.get(player.id);
      
      // Update kick cooldown
      if (player.kickCooldown > 0) {
        player.kickCooldown -= CONSTANTS.TICK_MS;
      }

      // Process input
      if (input) {
        this.processPlayerInput(player, input);
      }

      // Apply physics
      this.applyPlayerPhysics(player);

      // Handle collisions with world
      this.handlePlayerWorldCollisions(player);
    }
  }

  /**
   * Process input for a single player
   */
  processPlayerInput(player, input) {
    // Horizontal movement
    if (input.left && !input.right) {
      player.velocity.x -= CONSTANTS.PLAYER.MOVE_SPEED * CONSTANTS.DT;
      player.facing = -1;
    } else if (input.right && !input.left) {
      player.velocity.x += CONSTANTS.PLAYER.MOVE_SPEED * CONSTANTS.DT;
      player.facing = 1;
    } else {
      // Apply friction when not moving
      player.velocity.x *= CONSTANTS.PLAYER.FRICTION;
    }

    // Jumping
    if (input.up && player.onGround) {
      player.velocity.y = CONSTANTS.PLAYER.JUMP_POWER;
      player.onGround = false;
    }

    // Kicking
    if (input.kick && player.kickCooldown <= 0) {
      player.kicking = true;
      player.kickCooldown = CONSTANTS.PLAYER.KICK_COOLDOWN;
    } else if (!input.kick) {
      player.kicking = false;
    }
  }

  /**
   * Apply physics to a player
   */
  applyPlayerPhysics(player) {
    // Apply gravity
    player.velocity.y += CONSTANTS.PLAYER.GRAVITY * CONSTANTS.DT;

    // Apply air resistance
    player.velocity.x *= CONSTANTS.PLAYER.AIR_RESISTANCE;

    // Update position
    player.position.x += player.velocity.x * CONSTANTS.DT;
    player.position.y += player.velocity.y * CONSTANTS.DT;
  }

  /**
   * Handle player collisions with world boundaries
   */
  handlePlayerWorldCollisions(player) {
    // Ground collision
    if (player.position.y + CONSTANTS.PLAYER.RADIUS > CONSTANTS.FIELD.FLOOR_Y) {
      player.position.y = CONSTANTS.FIELD.FLOOR_Y - CONSTANTS.PLAYER.RADIUS;
      player.velocity.y = 0;
      player.onGround = true;
    } else {
      player.onGround = false;
    }

    // Ceiling collision
    if (player.position.y - CONSTANTS.PLAYER.RADIUS < 0) {
      player.position.y = CONSTANTS.PLAYER.RADIUS;
      player.velocity.y = 0;
    }

    // Side boundaries
    if (player.position.x - CONSTANTS.PLAYER.RADIUS < 0) {
      player.position.x = CONSTANTS.PLAYER.RADIUS;
      player.velocity.x = 0;
    }

    if (player.position.x + CONSTANTS.PLAYER.RADIUS > CONSTANTS.FIELD.WIDTH) {
      player.position.x = CONSTANTS.FIELD.WIDTH - CONSTANTS.PLAYER.RADIUS;
      player.velocity.x = 0;
    }
  }

  /**
   * Update ball physics
   */
  updateBall(gameState) {
    const ball = gameState.ball;

    // Apply gravity
    ball.velocity.y += CONSTANTS.BALL.GRAVITY * CONSTANTS.DT;

    // Apply air resistance
    ball.velocity.x *= CONSTANTS.BALL.AIR_RESISTANCE;
    ball.velocity.y *= CONSTANTS.BALL.AIR_RESISTANCE;

    // Update position
    ball.position.x += ball.velocity.x * CONSTANTS.DT;
    ball.position.y += ball.velocity.y * CONSTANTS.DT;

    // Update rotation based on horizontal velocity
    ball.rotationSpeed = ball.velocity.x * 0.01;
    ball.rotation += ball.rotationSpeed;

    // Add to trail
    ball.trail.push({ x: ball.position.x, y: ball.position.y });
    if (ball.trail.length > 10) {
      ball.trail.shift();
    }

    // Handle boundary collisions
    this.handleBallWorldCollisions(ball);
  }

  /**
   * Handle ball collisions with world boundaries
   */
  handleBallWorldCollisions(ball) {
    // Floor collision
    if (ball.position.y + CONSTANTS.BALL.RADIUS > CONSTANTS.FIELD.FLOOR_Y) {
      ball.position.y = CONSTANTS.FIELD.FLOOR_Y - CONSTANTS.BALL.RADIUS;
      ball.velocity.y *= -CONSTANTS.BALL.RESTITUTION;
      ball.velocity.x *= CONSTANTS.BALL.FRICTION;
    }

    // Ceiling collision
    if (ball.position.y - CONSTANTS.BALL.RADIUS < 0) {
      ball.position.y = CONSTANTS.BALL.RADIUS;
      ball.velocity.y *= -CONSTANTS.BALL.RESTITUTION;
    }

    // Side walls (not goals)
    if (ball.position.x - CONSTANTS.BALL.RADIUS < 0 && 
        (ball.position.y < CONSTANTS.GOAL.Y_THRESHOLD)) {
      ball.position.x = CONSTANTS.BALL.RADIUS;
      ball.velocity.x *= -CONSTANTS.BALL.RESTITUTION;
    }

    if (ball.position.x + CONSTANTS.BALL.RADIUS > CONSTANTS.FIELD.WIDTH && 
        (ball.position.y < CONSTANTS.GOAL.Y_THRESHOLD)) {
      ball.position.x = CONSTANTS.FIELD.WIDTH - CONSTANTS.BALL.RADIUS;
      ball.velocity.x *= -CONSTANTS.BALL.RESTITUTION;
    }
  }

  /**
   * Check collisions between players and ball
   */
  checkCollisions(gameState) {
    const ball = gameState.ball;

    // Player-player collisions
    if (gameState.players.length >= 2) {
      const player1 = gameState.players[0];
      const player2 = gameState.players[1];
      
      if (this.checkCircleCollision(player1, player2, CONSTANTS.PLAYER.RADIUS * 2)) {
        this.resolvePlayerCollision(player1, player2);
      }
    }

    // Player-ball collisions and kicking
    for (const player of gameState.players) {
      const distance = this.getDistance(player.position, ball.position);
      
      // Ball collision
      if (distance < CONSTANTS.PLAYER.RADIUS + CONSTANTS.BALL.RADIUS) {
        this.resolvePlayerBallCollision(player, ball);
      }

      // Kicking
      if (player.kicking && distance <= CONSTANTS.PLAYER.KICK_RANGE) {
        this.performKick(player, ball);
      }
    }
  }

  /**
   * Check circle collision between two objects
   */
  checkCircleCollision(obj1, obj2, minDistance) {
    const distance = this.getDistance(obj1.position, obj2.position);
    return distance < minDistance;
  }

  /**
   * Get distance between two points
   */
  getDistance(pos1, pos2) {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Resolve collision between two players
   */
  resolvePlayerCollision(player1, player2) {
    const dx = player1.position.x - player2.position.x;
    const dy = player1.position.y - player2.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return; // Prevent division by zero
    
    const minDistance = CONSTANTS.PLAYER.RADIUS * 2;
    const overlap = minDistance - distance;
    
    // Separate players
    const separationX = (dx / distance) * (overlap / 2);
    const separationY = (dy / distance) * (overlap / 2);
    
    player1.position.x += separationX;
    player1.position.y += separationY;
    player2.position.x -= separationX;
    player2.position.y -= separationY;
    
    // Exchange velocities (simplified)
    const temp = { ...player1.velocity };
    player1.velocity.x = player2.velocity.x * 0.5;
    player1.velocity.y = player2.velocity.y * 0.5;
    player2.velocity.x = temp.x * 0.5;
    player2.velocity.y = temp.y * 0.5;
  }

  /**
   * Resolve collision between player and ball
   */
  resolvePlayerBallCollision(player, ball) {
    const dx = ball.position.x - player.position.x;
    const dy = ball.position.y - player.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return;
    
    const minDistance = CONSTANTS.PLAYER.RADIUS + CONSTANTS.BALL.RADIUS;
    const overlap = minDistance - distance;
    
    // Push ball away from player
    const pushX = (dx / distance) * overlap;
    const pushY = (dy / distance) * overlap;
    
    ball.position.x += pushX;
    ball.position.y += pushY;
    
    // Transfer some velocity
    ball.velocity.x += player.velocity.x * 0.3;
    ball.velocity.y += player.velocity.y * 0.3;
  }

  /**
   * Perform kick action
   */
  performKick(player, ball) {
    const dx = ball.position.x - player.position.x;
    const dy = ball.position.y - player.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return;
    
    // Calculate kick direction
    const angle = Math.atan2(dy, dx);
    const kickX = Math.cos(angle) * CONSTANTS.PLAYER.KICK_POWER * player.facing;
    const kickY = Math.sin(angle) * CONSTANTS.PLAYER.KICK_POWER - 200; // Add upward force
    
    // Apply kick to ball
    ball.velocity.x += kickX * CONSTANTS.DT;
    ball.velocity.y += kickY * CONSTANTS.DT;
  }

  /**
   * Check for goals
   */
  checkGoals(gameState) {
    const ball = gameState.ball;
    const now = Date.now();
    
    // Prevent multiple goals within 3 seconds
    if (now - gameState.lastScoreTime < 3000) {
      return;
    }

    // Left goal (right player scores)
    if (ball.position.x - CONSTANTS.BALL.RADIUS < CONSTANTS.GOAL.LEFT_X && 
        ball.position.y + CONSTANTS.BALL.RADIUS > CONSTANTS.GOAL.Y_THRESHOLD) {
      gameState.score.right++;
      gameState.lastScoreTime = now;
      this.resetBall(gameState);
      console.log(`Goal scored! Right player. Score: ${gameState.score.left}-${gameState.score.right}`);
    }
    
    // Right goal (left player scores)
    if (ball.position.x + CONSTANTS.BALL.RADIUS > CONSTANTS.GOAL.RIGHT_X && 
        ball.position.y + CONSTANTS.BALL.RADIUS > CONSTANTS.GOAL.Y_THRESHOLD) {
      gameState.score.left++;
      gameState.lastScoreTime = now;
      this.resetBall(gameState);
      console.log(`Goal scored! Left player. Score: ${gameState.score.left}-${gameState.score.right}`);
    }
  }

  /**
   * Reset ball to center
   */
  resetBall(gameState) {
    gameState.ball.position.x = CONSTANTS.BALL.START_X;
    gameState.ball.position.y = CONSTANTS.BALL.START_Y;
    gameState.ball.velocity.x = 0;
    gameState.ball.velocity.y = 0;
    gameState.ball.rotation = 0;
    gameState.ball.rotationSpeed = 0;
    gameState.ball.trail = [];
  }

  /**
   * Check game end conditions
   */
  checkGameEnd(gameState) {
    // Score limit
    if (gameState.score.left >= CONSTANTS.GAME.SCORE_LIMIT || 
        gameState.score.right >= CONSTANTS.GAME.SCORE_LIMIT) {
      gameState.gameState = 'FINISHED';
      return true;
    }
    
    // Time limit
    if (gameState.gameTime >= CONSTANTS.GAME.TIME_LIMIT) {
      gameState.gameState = 'FINISHED';
      return true;
    }
    
    return false;
  }

  /**
   * Get current game state for a room
   */
  getGameState(roomId) {
    return this.activeGames.get(roomId);
  }

  /**
   * Get all active games
   */
  getAllGames() {
    return this.activeGames;
  }

  /**
   * Get performance stats
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      activeGames: this.activeGames.size,
      frameRate: CONSTANTS.FRAME_RATE,
      tickMs: CONSTANTS.TICK_MS
    };
  }
}

module.exports = ServerPhysicsEngine;