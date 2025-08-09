// Multiplayer Game Server Template
// This is a minimal, working multiplayer server you can build upon

const io = require("socket.io")(3000, {
  cors: {
    origin: ["http://localhost:8080", "http://127.0.0.1:8080"],
  },
});

// ==========================================
// GAME STATE MANAGEMENT
// ==========================================

// Store active games and player mappings
const games = {};      // gameId -> game state
const players = {};    // socketId -> gameId
let gameIdCounter = 1;

// ==========================================
// GAME STATE STRUCTURE
// ==========================================

function createGameState() {
  return {
    players: [
      {
        id: null,
        position: { x: 100, y: 300 },
        velocity: { x: 0, y: 0 },
        score: 0,
        ready: false,
        // Add your player properties here
      },
      {
        id: null,
        position: { x: 700, y: 300 },
        velocity: { x: 0, y: 0 },
        score: 0,
        ready: false,
        // Add your player properties here
      }
    ],
    gameObjects: [],  // Balls, items, obstacles, etc.
    gameStarted: false,
    gameOver: false,
    time: 0,
    // Add your game-specific state here
  };
}

// ==========================================
// SOCKET CONNECTION HANDLING
// ==========================================

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // ======== MATCHMAKING ========
  socket.on("findMatch", () => {
    handleMatchmaking(socket);
  });

  socket.on("createPrivateRoom", () => {
    const gameId = createPrivateGame(socket.id);
    socket.emit("roomCreated", gameId);
  });

  socket.on("joinPrivateRoom", (gameId) => {
    joinPrivateGame(socket.id, gameId);
  });

  // ======== GAME INPUTS ========
  socket.on("input", (inputData) => {
    handlePlayerInput(socket.id, inputData);
  });

  socket.on("playerReady", () => {
    handlePlayerReady(socket.id);
  });

  // ======== DISCONNECTION ========
  socket.on("disconnect", () => {
    handleDisconnect(socket.id);
  });
});

// ==========================================
// MATCHMAKING SYSTEM
// ==========================================

const matchmakingQueue = [];

function handleMatchmaking(socket) {
  // Check if already in game
  if (players[socket.id]) {
    socket.emit("error", "Already in a game");
    return;
  }

  // Add to queue if not already there
  if (!matchmakingQueue.includes(socket.id)) {
    matchmakingQueue.push(socket.id);
  }

  // Check if we can create a match
  if (matchmakingQueue.length >= 2) {
    const player1Id = matchmakingQueue.shift();
    const player2Id = matchmakingQueue.shift();
    
    createGame(player1Id, player2Id);
  } else {
    socket.emit("waitingForMatch");
  }
}

// ==========================================
// GAME CREATION
// ==========================================

function createGame(player1Id, player2Id) {
  const gameId = `game_${gameIdCounter++}`;
  
  // Create game state
  const gameState = createGameState();
  gameState.players[0].id = player1Id;
  gameState.players[1].id = player2Id;
  
  games[gameId] = {
    id: gameId,
    state: gameState,
    interval: null,
    lastUpdate: Date.now(),
    inputs: {}
  };
  
  // Map players to game
  players[player1Id] = gameId;
  players[player2Id] = gameId;
  
  // Join socket rooms
  const socket1 = io.sockets.sockets.get(player1Id);
  const socket2 = io.sockets.sockets.get(player2Id);
  
  if (socket1) socket1.join(gameId);
  if (socket2) socket2.join(gameId);
  
  // Notify players
  io.to(gameId).emit("matchFound", {
    gameId: gameId,
    playerNumber: socket1 ? 1 : 2  // Assign player numbers
  });
  
  return gameId;
}

function createPrivateGame(playerId) {
  const gameId = `private_${gameIdCounter++}`;
  
  const gameState = createGameState();
  gameState.players[0].id = playerId;
  
  games[gameId] = {
    id: gameId,
    state: gameState,
    interval: null,
    lastUpdate: Date.now(),
    inputs: {},
    private: true
  };
  
  players[playerId] = gameId;
  
  const socket = io.sockets.sockets.get(playerId);
  if (socket) socket.join(gameId);
  
  return gameId;
}

function joinPrivateGame(playerId, gameId) {
  const game = games[gameId];
  
  if (!game || !game.private) {
    io.to(playerId).emit("error", "Game not found");
    return;
  }
  
  if (game.state.players[1].id) {
    io.to(playerId).emit("error", "Game is full");
    return;
  }
  
  game.state.players[1].id = playerId;
  players[playerId] = gameId;
  
  const socket = io.sockets.sockets.get(playerId);
  if (socket) socket.join(gameId);
  
  io.to(gameId).emit("playerJoined");
}

// ==========================================
// INPUT HANDLING
// ==========================================

function handlePlayerInput(playerId, inputData) {
  const gameId = players[playerId];
  if (!gameId || !games[gameId]) return;
  
  const game = games[gameId];
  
  // Store input for next update
  if (!game.inputs[playerId]) {
    game.inputs[playerId] = [];
  }
  game.inputs[playerId].push(inputData);
}

function handlePlayerReady(playerId) {
  const gameId = players[playerId];
  if (!gameId || !games[gameId]) return;
  
  const game = games[gameId];
  const player = game.state.players.find(p => p.id === playerId);
  
  if (player) {
    player.ready = true;
    
    // Check if both players are ready
    if (game.state.players.every(p => p.ready && p.id)) {
      startGame(gameId);
    }
  }
}

// ==========================================
// GAME LOOP
// ==========================================

function startGame(gameId) {
  const game = games[gameId];
  if (!game || game.interval) return;
  
  game.state.gameStarted = true;
  io.to(gameId).emit("gameStart");
  
  const TICK_RATE = 60; // 60 FPS
  const TICK_INTERVAL = 1000 / TICK_RATE;
  
  game.interval = setInterval(() => {
    // Process inputs
    processInputs(game);
    
    // Update physics
    updatePhysics(game.state, TICK_INTERVAL / 1000);
    
    // Check game over conditions
    checkGameOver(game);
    
    // Send state to players
    io.to(gameId).emit("gameState", game.state);
    
    // Clear processed inputs
    game.inputs = {};
    
    // Update time
    game.state.time += TICK_INTERVAL / 1000;
    
  }, TICK_INTERVAL);
}

function processInputs(game) {
  Object.keys(game.inputs).forEach(playerId => {
    const playerInputs = game.inputs[playerId];
    const player = game.state.players.find(p => p.id === playerId);
    
    if (!player || !playerInputs) return;
    
    // Process each input (you might want to only use the latest)
    const latestInput = playerInputs[playerInputs.length - 1];
    
    // ======== CUSTOMIZE YOUR INPUT HANDLING HERE ========
    if (latestInput.keys) {
      // Horizontal movement
      if (latestInput.keys.left) {
        player.velocity.x = -300;
      } else if (latestInput.keys.right) {
        player.velocity.x = 300;
      } else {
        player.velocity.x = 0;
      }
      
      // Vertical movement (for top-down games)
      if (latestInput.keys.up) {
        player.velocity.y = -300;
      } else if (latestInput.keys.down) {
        player.velocity.y = 300;
      } else {
        player.velocity.y = 0;
      }
      
      // Actions
      if (latestInput.keys.action) {
        performAction(game.state, player);
      }
    }
  });
}

function updatePhysics(state, deltaTime) {
  // ======== CUSTOMIZE YOUR PHYSICS HERE ========
  
  state.players.forEach(player => {
    if (!player.id) return;
    
    // Update positions based on velocity
    player.position.x += player.velocity.x * deltaTime;
    player.position.y += player.velocity.y * deltaTime;
    
    // Keep players in bounds (example: 800x600 canvas)
    player.position.x = Math.max(50, Math.min(750, player.position.x));
    player.position.y = Math.max(50, Math.min(550, player.position.y));
  });
  
  // Update game objects
  state.gameObjects.forEach(obj => {
    // Update your game objects here
  });
  
  // Check collisions
  checkCollisions(state);
}

function checkCollisions(state) {
  // ======== IMPLEMENT YOUR COLLISION DETECTION HERE ========
  
  // Example: Player-to-object collisions
  state.players.forEach(player => {
    state.gameObjects.forEach(obj => {
      const distance = Math.sqrt(
        Math.pow(player.position.x - obj.position.x, 2) +
        Math.pow(player.position.y - obj.position.y, 2)
      );
      
      if (distance < 50) { // Collision threshold
        // Handle collision
      }
    });
  });
}

function performAction(state, player) {
  // ======== IMPLEMENT YOUR GAME ACTIONS HERE ========
  
  // Example: Shoot projectile
  const projectile = {
    position: { ...player.position },
    velocity: { x: 500, y: 0 }, // Shoot right
    owner: player.id
  };
  
  state.gameObjects.push(projectile);
}

function checkGameOver(game) {
  // ======== IMPLEMENT YOUR WIN CONDITIONS HERE ========
  
  // Example: Time limit
  if (game.state.time >= 120) { // 2 minutes
    game.state.gameOver = true;
    
    // Determine winner
    const winner = game.state.players.reduce((prev, current) => 
      (prev.score > current.score) ? prev : current
    );
    
    io.to(game.id).emit("gameOver", {
      winner: winner.id,
      scores: game.state.players.map(p => ({
        id: p.id,
        score: p.score
      }))
    });
    
    // Clean up
    cleanupGame(game.id);
  }
}

// ==========================================
// CLEANUP
// ==========================================

function handleDisconnect(playerId) {
  console.log("Player disconnected:", playerId);
  
  const gameId = players[playerId];
  if (!gameId) return;
  
  const game = games[gameId];
  if (!game) return;
  
  // Notify other player
  io.to(gameId).emit("playerDisconnected");
  
  // Clean up game
  cleanupGame(gameId);
  
  // Remove from matchmaking queue
  const queueIndex = matchmakingQueue.indexOf(playerId);
  if (queueIndex > -1) {
    matchmakingQueue.splice(queueIndex, 1);
  }
}

function cleanupGame(gameId) {
  const game = games[gameId];
  if (!game) return;
  
  // Stop game loop
  if (game.interval) {
    clearInterval(game.interval);
  }
  
  // Remove player mappings
  game.state.players.forEach(player => {
    if (player.id) {
      delete players[player.id];
    }
  });
  
  // Delete game
  delete games[gameId];
}

// ==========================================
// SERVER START
// ==========================================

console.log("Multiplayer game server running on port 3000");
console.log("Ensure your client connects to http://localhost:3000");

// ==========================================
// PERFORMANCE MONITORING (Optional)
// ==========================================

setInterval(() => {
  const stats = {
    activeGames: Object.keys(games).length,
    connectedPlayers: io.sockets.sockets.size,
    inQueue: matchmakingQueue.length,
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + " MB"
  };
  console.log("Server stats:", stats);
}, 30000); // Log every 30 seconds