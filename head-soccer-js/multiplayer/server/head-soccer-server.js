/**
 * Head Soccer Multiplayer Server
 * Using exact physics values from single-player mode
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:8080", "http://localhost:3001", "http://127.0.0.1:8080"],
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, '../client')));

// Physics constants matching single-player exactly
const PHYSICS = {
  // Core
  GRAVITY: 0.5,           // Frame-based gravity
  FPS: 60,
  TICK_INTERVAL: 1000 / 60, // 16.67ms
  
  // Field
  FIELD_WIDTH: 1600,
  FIELD_HEIGHT: 900,
  BOTTOM_GAP: 20,
  GOAL_WIDTH: 75,
  GOAL_HEIGHT: 250,
  
  // Ball
  BALL_RADIUS: 25,
  BALL_BOUNCE: 0.95,      // Very high bounce coefficient
  BALL_FRICTION_AIR: 0,   // No air resistance
  
  // Player
  PLAYER_WIDTH: 50,
  PLAYER_HEIGHT: 80,
  PLAYER_SPEED: 5,        // Per frame movement
  PLAYER_JUMP: 15,        // Initial jump velocity
  PLAYER_FRICTION: 0.85,  // Ground friction
  
  // Kick
  KICK_FORCE_MIN: 18,
  KICK_FORCE_MAX: 25,
  KICK_COOLDOWN: 10,      // Frames
  
  // Starting positions (exact from single-player)
  PLAYER1_START_X: 400,   // 25% of field width
  PLAYER2_START_X: 1200,  // 75% of field width
  PLAYER_START_Y: 750,
  BALL_START_X: 800,      // Center
  BALL_START_Y: 400,
  
  // Collision
  COLLISION_THRESHOLD: 5,
  BOUNCE_MULTIPLIER: 1.1  // Ball speeds up on collision
};

// Game rooms storage
const games = new Map();

// Game state creation with exact single-player positions
function createGameState() {
  return {
    players: [
      {
        id: null,
        name: 'Player 1',
        position: { 
          x: PHYSICS.PLAYER1_START_X,
          y: PHYSICS.PLAYER_START_Y
        },
        velocity: { x: 0, y: 0 },
        score: 0,
        kickCooldown: 0,
        isGrounded: true,
        isKicking: false,
        // Character customization
        customization: {
          character: 'player1',
          head: 'head1',
          cleat: 'cleat1'
        }
      },
      {
        id: null,
        name: 'Player 2',
        position: { 
          x: PHYSICS.PLAYER2_START_X,
          y: PHYSICS.PLAYER_START_Y
        },
        velocity: { x: 0, y: 0 },
        score: 0,
        kickCooldown: 0,
        isGrounded: true,
        isKicking: false,
        // Character customization
        customization: {
          character: 'player2',
          head: 'head2',
          cleat: 'cleat2'
        }
      }
    ],
    ball: {
      position: { 
        x: PHYSICS.BALL_START_X,
        y: PHYSICS.BALL_START_Y
      },
      velocity: { x: 0, y: 0 }
    },
    time: 120, // 2 minutes
    gameStarted: false,
    gameOver: false,
    inputs: {} // Store player inputs
  };
}

// Physics update function (frame-based like single-player)
function updatePhysics(state) {
  // Don't update if game is over
  if (state.gameOver) return;

  // Update ball physics
  updateBall(state);
  
  // Update players
  state.players.forEach((player, index) => {
    if (player.id) {
      updatePlayer(player, state, index);
    }
  });
  
  // Check goals
  checkGoals(state);
  
  // Update timer
  if (state.gameStarted && state.time > 0) {
    // Timer decrements every 60 ticks (1 second)
    if (Date.now() % 1000 < 17) { // Approximate second boundary
      state.time--;
    }
    
    if (state.time <= 0) {
      endGame(state);
    }
  }
}

function updateBall(state) {
  const ball = state.ball;
  
  // Apply gravity (frame-based)
  ball.velocity.y += PHYSICS.GRAVITY;
  
  // Update position
  ball.position.x += ball.velocity.x;
  ball.position.y += ball.velocity.y;
  
  // Ground collision
  const groundY = PHYSICS.FIELD_HEIGHT - PHYSICS.BOTTOM_GAP - PHYSICS.BALL_RADIUS;
  if (ball.position.y > groundY) {
    ball.position.y = groundY;
    ball.velocity.y *= -PHYSICS.BALL_BOUNCE;
  }
  
  // Wall collisions
  if (ball.position.x < PHYSICS.BALL_RADIUS) {
    ball.position.x = PHYSICS.BALL_RADIUS;
    ball.velocity.x *= -PHYSICS.BALL_BOUNCE;
  }
  if (ball.position.x > PHYSICS.FIELD_WIDTH - PHYSICS.BALL_RADIUS) {
    ball.position.x = PHYSICS.FIELD_WIDTH - PHYSICS.BALL_RADIUS;
    ball.velocity.x *= -PHYSICS.BALL_BOUNCE;
  }
  
  // Check ball-player collisions
  state.players.forEach(player => {
    if (player.id) {
      checkBallPlayerCollision(player, ball);
    }
  });
}

function updatePlayer(player, state, playerIndex) {
  const input = state.inputs[player.id];
  if (!input) return;
  
  // Horizontal movement
  if (input.left) {
    player.velocity.x = -PHYSICS.PLAYER_SPEED;
  } else if (input.right) {
    player.velocity.x = PHYSICS.PLAYER_SPEED;
  } else {
    player.velocity.x *= PHYSICS.PLAYER_FRICTION;
  }
  
  // Apply gravity
  player.velocity.y += PHYSICS.GRAVITY;
  
  // Update position
  player.position.x += player.velocity.x;
  player.position.y += player.velocity.y;
  
  // Ground collision
  const groundY = PHYSICS.FIELD_HEIGHT - PHYSICS.BOTTOM_GAP - PHYSICS.PLAYER_HEIGHT;
  if (player.position.y > groundY) {
    player.position.y = groundY;
    player.velocity.y = 0;
    player.isGrounded = true;
  } else {
    player.isGrounded = false;
  }
  
  // Wall boundaries
  if (player.position.x < 0) player.position.x = 0;
  if (player.position.x > PHYSICS.FIELD_WIDTH - PHYSICS.PLAYER_WIDTH) {
    player.position.x = PHYSICS.FIELD_WIDTH - PHYSICS.PLAYER_WIDTH;
  }
  
  // Jump
  if (input.up && player.isGrounded) {
    player.velocity.y = -PHYSICS.PLAYER_JUMP;
    player.isGrounded = false;
  }
  
  // Kick
  player.isKicking = false;
  if (input.kick && player.kickCooldown === 0) {
    player.isKicking = true;
    player.kickCooldown = PHYSICS.KICK_COOLDOWN;
  }
  
  // Cooldown
  if (player.kickCooldown > 0) {
    player.kickCooldown--;
  }
}

function checkBallPlayerCollision(player, ball) {
  const distance = Math.sqrt(
    Math.pow(player.position.x + PHYSICS.PLAYER_WIDTH/2 - ball.position.x, 2) +
    Math.pow(player.position.y + PHYSICS.PLAYER_HEIGHT/2 - ball.position.y, 2)
  );
  
  if (distance < PHYSICS.PLAYER_WIDTH/2 + PHYSICS.BALL_RADIUS + PHYSICS.COLLISION_THRESHOLD) {
    // Calculate collision angle
    const angle = Math.atan2(
      ball.position.y - (player.position.y + PHYSICS.PLAYER_HEIGHT/2),
      ball.position.x - (player.position.x + PHYSICS.PLAYER_WIDTH/2)
    );
    
    // Determine kick force
    const force = player.isKicking ? PHYSICS.KICK_FORCE_MAX : PHYSICS.KICK_FORCE_MIN;
    
    // Apply force to ball
    ball.velocity.x = Math.cos(angle) * force * PHYSICS.BOUNCE_MULTIPLIER;
    ball.velocity.y = Math.sin(angle) * force * PHYSICS.BOUNCE_MULTIPLIER;
    
    // Move ball away from player to prevent sticking
    ball.position.x = player.position.x + PHYSICS.PLAYER_WIDTH/2 + Math.cos(angle) * (PHYSICS.PLAYER_WIDTH/2 + PHYSICS.BALL_RADIUS + 5);
    ball.position.y = player.position.y + PHYSICS.PLAYER_HEIGHT/2 + Math.sin(angle) * (PHYSICS.PLAYER_HEIGHT/2 + PHYSICS.BALL_RADIUS + 5);
  }
}

function checkGoals(state) {
  const ball = state.ball;
  const goalY = PHYSICS.FIELD_HEIGHT - PHYSICS.GOAL_HEIGHT;
  
  // Left goal (Player 2 scores)
  if (ball.position.x <= PHYSICS.GOAL_WIDTH && 
      ball.position.y >= goalY) {
    scoreGoal(state, 1); // Player 2 (index 1) scores
  }
  
  // Right goal (Player 1 scores)
  if (ball.position.x >= PHYSICS.FIELD_WIDTH - PHYSICS.GOAL_WIDTH && 
      ball.position.y >= goalY) {
    scoreGoal(state, 0); // Player 1 (index 0) scores
  }
}

function scoreGoal(state, scoringPlayerIndex) {
  state.players[scoringPlayerIndex].score++;
  
  // Reset positions
  resetPositions(state);
  
  // Check win condition (first to 5 or time expires)
  if (state.players[scoringPlayerIndex].score >= 5) {
    endGame(state);
  }
}

function resetPositions(state) {
  // Reset ball
  state.ball.position.x = PHYSICS.BALL_START_X;
  state.ball.position.y = PHYSICS.BALL_START_Y;
  state.ball.velocity.x = 0;
  state.ball.velocity.y = 0;
  
  // Reset players
  state.players[0].position.x = PHYSICS.PLAYER1_START_X;
  state.players[0].position.y = PHYSICS.PLAYER_START_Y;
  state.players[0].velocity.x = 0;
  state.players[0].velocity.y = 0;
  
  state.players[1].position.x = PHYSICS.PLAYER2_START_X;
  state.players[1].position.y = PHYSICS.PLAYER_START_Y;
  state.players[1].velocity.x = 0;
  state.players[1].velocity.y = 0;
}

function endGame(state) {
  state.gameOver = true;
  state.gameStarted = false;
}

// Start game function (from template)
function startGame(roomCode) {
  const game = games.get(roomCode);
  if (!game || game.interval) return;
  
  game.state.gameStarted = true;
  console.log(`🎮 Game started in room ${roomCode}`);
  
  // Emit gameStart event to hide waiting screen
  io.to(roomCode).emit('gameStart');
  
  // Start game loop at 60 FPS
  const TICK_INTERVAL = 1000 / PHYSICS.FPS; // 16.67ms
  
  game.interval = setInterval(() => {
    if (!game.state.gameOver) {
      updateGameState(game.state);
      io.to(roomCode).emit('gameState', game.state);
    } else {
      // Clean up game loop when game over
      clearInterval(game.interval);
      game.interval = null;
    }
  }, TICK_INTERVAL);
}

// Socket handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  socket.on('joinGame', (data) => {
    const { roomCode, characterData, playerName } = data;
    
    // Find or create room
    let game = games.get(roomCode);
    if (!game) {
      game = {
        id: roomCode,
        state: createGameState(),
        lastUpdate: Date.now()
      };
      games.set(roomCode, game);
    }
    
    // Assign player to empty slot
    const playerIndex = game.state.players.findIndex(p => !p.id);
    if (playerIndex !== -1) {
      const player = game.state.players[playerIndex];
      player.id = socket.id;
      player.name = playerName || `Player ${playerIndex + 1}`;
      
      // Apply character customization
      if (characterData && characterData[`player${playerIndex + 1}`]) {
        const customization = characterData[`player${playerIndex + 1}`];
        player.customization = {
          character: customization.character || 'player1',
          head: customization.head || 'head1',
          cleat: customization.cleat || 'cleat1'
        };
      }
      
      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.playerIndex = playerIndex;
      
      console.log(`Player ${playerName} joined room ${roomCode} as Player ${playerIndex + 1}`);
      
      // Send initial state
      io.to(roomCode).emit('gameState', game.state);
      io.to(roomCode).emit('playerJoined', { playerIndex, playerName });
      
      // Start game if both players connected
      if (game.state.players.every(p => p.id)) {
        startGame(roomCode);
      }
      
    } else {
      socket.emit('roomFull');
    }
  });
  
  socket.on('input', (inputData) => {
    if (socket.roomCode) {
      const game = games.get(socket.roomCode);
      if (game && game.state.players[socket.playerIndex]) {
        // Store input for processing
        game.state.inputs[socket.id] = {
          left: inputData.left || false,
          right: inputData.right || false,
          up: inputData.up || false,
          kick: inputData.kick || false
        };
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    if (socket.roomCode) {
      const game = games.get(socket.roomCode);
      if (game) {
        // Remove player
        const player = game.state.players[socket.playerIndex];
        if (player) {
          player.id = null;
          player.name = `Player ${socket.playerIndex + 1}`;
          // Keep customization for reconnection
        }
        
        // Remove input
        delete game.state.inputs[socket.id];
        
        // Pause game if player disconnected
        game.state.gameStarted = false;
        
        // Notify remaining players
        io.to(socket.roomCode).emit('playerDisconnected', socket.playerIndex);
        io.to(socket.roomCode).emit('gameState', game.state);
        
        // Clean up empty rooms
        if (game.state.players.every(p => !p.id)) {
          games.delete(socket.roomCode);
          console.log(`Room ${socket.roomCode} deleted - empty`);
        }
      }
    }
  });
});

// Game update loop - 60 FPS
setInterval(() => {
  games.forEach((game, roomCode) => {
    if (game.state.gameStarted) {
      updatePhysics(game.state);
      io.to(roomCode).emit('gameState', game.state);
      
      // Check for goal scored
      const prevScores = game.prevScores || [0, 0];
      const currentScores = [game.state.players[0].score, game.state.players[1].score];
      
      if (currentScores[0] > prevScores[0]) {
        io.to(roomCode).emit('goal', { scorer: 0, playerName: game.state.players[0].name });
      }
      if (currentScores[1] > prevScores[1]) {
        io.to(roomCode).emit('goal', { scorer: 1, playerName: game.state.players[1].name });
      }
      
      game.prevScores = currentScores;
      
      // Check game over
      if (game.state.gameOver) {
        const winner = game.state.players[0].score > game.state.players[1].score ? 0 : 
                      game.state.players[1].score > game.state.players[0].score ? 1 : -1;
        io.to(roomCode).emit('gameOver', { 
          winner, 
          scores: currentScores,
          winnerName: winner >= 0 ? game.state.players[winner].name : null
        });
      }
    }
  });
}, PHYSICS.TICK_INTERVAL);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    rooms: games.size,
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Head Soccer multiplayer server running on port ${PORT}`);
  console.log(`Game client: http://localhost:${PORT}`);
});