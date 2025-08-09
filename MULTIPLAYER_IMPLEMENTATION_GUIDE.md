# Multiplayer Game Implementation Guide
## Based on Head Soccer Architecture

## Table of Contents
1. [Overview](#overview)
2. [Architecture Components](#architecture-components)
3. [Server Implementation](#server-implementation)
4. [Client Implementation](#client-implementation)
5. [Physics Synchronization](#physics-synchronization)
6. [Optimization Techniques](#optimization-techniques)
7. [Common Patterns](#common-patterns)
8. [Troubleshooting](#troubleshooting)

## Overview

This guide explains how to implement real-time multiplayer functionality using Socket.io with an authoritative server architecture. The patterns here can be adapted for any type of 2D or 3D multiplayer game.

### Key Principles
- **Authoritative Server**: Server owns the game state truth
- **Client Prediction**: Smooth gameplay despite network latency
- **Input-Based Networking**: Clients send inputs, not positions
- **State Synchronization**: Regular state broadcasts to all clients

## Architecture Components

### 1. Technology Stack
```javascript
// Server
- Node.js
- Socket.io (WebSocket communication)
- Game state management
- Physics engine (your choice)

// Client  
- HTML5 Canvas or WebGL
- Socket.io client
- Rendering engine
- Input handling
```

### 2. Data Flow
```
Client 1 Input -> Server -> Physics Update -> Broadcast State -> All Clients Render
Client 2 Input -> Server -> Physics Update -> Broadcast State -> All Clients Render
```

## Server Implementation

### Basic Server Setup
```javascript
// server.js
const io = require("socket.io")(3000, {
  cors: {
    origin: ["http://localhost:8080"], // Your client URLs
  },
});

// Game state storage
let games = {};     // Active game states
let players = {};   // Player-to-game mapping
let queue = [];     // Matchmaking queue

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);
  
  // Handle player disconnect
  socket.on("disconnect", () => {
    handlePlayerDisconnect(socket.id);
  });
});
```

### Room/Game Management
```javascript
// Create a new game room
function createGame(player1Id, player2Id) {
  const gameId = generateGameId();
  
  // Initialize game state
  games[gameId] = {
    id: gameId,
    players: [player1Id, player2Id],
    state: initializeGameState(),
    started: false,
    lastUpdate: Date.now()
  };
  
  // Map players to game
  players[player1Id] = gameId;
  players[player2Id] = gameId;
  
  // Join socket rooms
  io.sockets.sockets.get(player1Id).join(gameId);
  io.sockets.sockets.get(player2Id).join(gameId);
  
  return gameId;
}

// Initialize your game state
function initializeGameState() {
  return {
    players: [
      { 
        position: { x: 100, y: 100 },
        velocity: { x: 0, y: 0 },
        score: 0,
        health: 100
      },
      { 
        position: { x: 700, y: 100 },
        velocity: { x: 0, y: 0 },
        score: 0,
        health: 100
      }
    ],
    gameObjects: [],  // Balls, bullets, items, etc.
    time: 0,
    winner: null
  };
}
```

### Input Handling
```javascript
socket.on("input", (inputData) => {
  const gameId = players[socket.id];
  if (!gameId || !games[gameId]) return;
  
  const game = games[gameId];
  const playerIndex = game.players.indexOf(socket.id);
  
  // Store input for next physics update
  if (!game.inputs) game.inputs = {};
  game.inputs[playerIndex] = inputData;
});

// Input data structure example
const inputData = {
  keys: {
    left: true,
    right: false,
    jump: false,
    action: false
  },
  mouse: {
    x: 450,
    y: 300,
    clicked: false
  },
  timestamp: Date.now()
};
```

### Game Loop
```javascript
function startGameLoop(gameId) {
  const TICK_RATE = 60; // 60 updates per second
  const TICK_INTERVAL = 1000 / TICK_RATE;
  
  const interval = setInterval(() => {
    const game = games[gameId];
    if (!game) {
      clearInterval(interval);
      return;
    }
    
    // Apply inputs
    processInputs(game);
    
    // Update physics
    updatePhysics(game.state, TICK_INTERVAL / 1000);
    
    // Check win conditions
    checkGameOver(game);
    
    // Broadcast state to all players
    io.to(gameId).emit("gameState", {
      state: game.state,
      timestamp: Date.now()
    });
    
    // Clear processed inputs
    game.inputs = {};
    
  }, TICK_INTERVAL);
  
  games[gameId].interval = interval;
}
```

### Physics Integration
```javascript
function updatePhysics(state, deltaTime) {
  // Update each player
  state.players.forEach(player => {
    // Apply velocity
    player.position.x += player.velocity.x * deltaTime;
    player.position.y += player.velocity.y * deltaTime;
    
    // Apply gravity (if needed)
    player.velocity.y += GRAVITY * deltaTime;
    
    // Check boundaries
    constrainToBounds(player);
    
    // Check collisions
    checkCollisions(state);
  });
  
  // Update game objects (balls, projectiles, etc.)
  state.gameObjects.forEach(obj => {
    updateGameObject(obj, deltaTime);
  });
}

function processInputs(game) {
  Object.keys(game.inputs || {}).forEach(playerIndex => {
    const input = game.inputs[playerIndex];
    const player = game.state.players[playerIndex];
    
    // Movement
    if (input.keys.left) player.velocity.x = -PLAYER_SPEED;
    else if (input.keys.right) player.velocity.x = PLAYER_SPEED;
    else player.velocity.x = 0;
    
    // Jumping
    if (input.keys.jump && player.grounded) {
      player.velocity.y = -JUMP_FORCE;
    }
    
    // Actions
    if (input.keys.action) {
      performAction(game.state, playerIndex);
    }
  });
}
```

## Client Implementation

### Client Setup
```javascript
// client.js
const socket = io('http://localhost:3000');

let gameState = null;
let localPlayerId = null;
let interpolationBuffer = [];

// Connection established
socket.on('connect', () => {
  console.log('Connected to server');
});

// Receive game updates
socket.on('gameState', (data) => {
  // Add to interpolation buffer
  interpolationBuffer.push(data);
  
  // Keep only recent states
  if (interpolationBuffer.length > 10) {
    interpolationBuffer.shift();
  }
  
  gameState = data.state;
});
```

### Input System
```javascript
// Capture inputs
const inputState = {
  keys: {
    left: false,
    right: false,
    jump: false,
    action: false
  },
  mouse: {
    x: 0,
    y: 0,
    clicked: false
  }
};

// Keyboard handling
document.addEventListener('keydown', (e) => {
  switch(e.key) {
    case 'ArrowLeft':
      inputState.keys.left = true;
      break;
    case 'ArrowRight':
      inputState.keys.right = true;
      break;
    case ' ':
      inputState.keys.jump = true;
      break;
  }
  sendInput();
});

document.addEventListener('keyup', (e) => {
  switch(e.key) {
    case 'ArrowLeft':
      inputState.keys.left = false;
      break;
    case 'ArrowRight':
      inputState.keys.right = false;
      break;
    case ' ':
      inputState.keys.jump = false;
      break;
  }
  sendInput();
});

// Send input to server
function sendInput() {
  socket.emit('input', {
    ...inputState,
    timestamp: Date.now()
  });
}
```

### Rendering
```javascript
// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function gameLoop() {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (gameState) {
    // Render game state
    renderGame(gameState);
  }
  
  requestAnimationFrame(gameLoop);
}

function renderGame(state) {
  // Draw players
  state.players.forEach((player, index) => {
    ctx.fillStyle = index === 0 ? 'red' : 'blue';
    ctx.fillRect(
      player.position.x - 25,
      player.position.y - 25,
      50,
      50
    );
  });
  
  // Draw game objects
  state.gameObjects.forEach(obj => {
    renderGameObject(obj);
  });
  
  // Draw UI
  renderUI(state);
}

// Start render loop
requestAnimationFrame(gameLoop);
```

## Physics Synchronization

### Different Physics Approaches

#### 1. Simple Position-Based
```javascript
// For slow-paced games
const state = {
  player: {
    x: 100,
    y: 100,
    rotation: 0
  }
};
```

#### 2. Velocity-Based
```javascript
// For physics-based games
const state = {
  player: {
    position: { x: 100, y: 100 },
    velocity: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0 }
  }
};
```

#### 3. Rigid Body Physics
```javascript
// For complex physics (using Matter.js or Box2D)
const state = {
  player: {
    body: physicsEngine.createBody({
      position: { x: 100, y: 100 },
      mass: 1,
      friction: 0.1,
      restitution: 0.8
    })
  }
};
```

### Lag Compensation
```javascript
// Client-side prediction
function predictMovement(player, input, deltaTime) {
  const predicted = { ...player };
  
  if (input.left) predicted.x -= SPEED * deltaTime;
  if (input.right) predicted.x += SPEED * deltaTime;
  
  return predicted;
}

// Interpolation between states
function interpolateState(previous, current, alpha) {
  return {
    x: previous.x + (current.x - previous.x) * alpha,
    y: previous.y + (current.y - previous.y) * alpha
  };
}
```

## Optimization Techniques

### 1. Delta Compression
```javascript
// Send only changed values
function createDelta(oldState, newState) {
  const delta = {};
  
  Object.keys(newState).forEach(key => {
    if (JSON.stringify(oldState[key]) !== JSON.stringify(newState[key])) {
      delta[key] = newState[key];
    }
  });
  
  return delta;
}
```

### 2. Area of Interest
```javascript
// Only send updates for nearby objects
function getVisibleObjects(player, allObjects, viewDistance) {
  return allObjects.filter(obj => {
    const distance = Math.sqrt(
      Math.pow(obj.x - player.x, 2) + 
      Math.pow(obj.y - player.y, 2)
    );
    return distance <= viewDistance;
  });
}
```

### 3. Adaptive Tick Rate
```javascript
// Reduce tick rate for inactive games
function adaptiveTickRate(game) {
  const timeSinceLastInput = Date.now() - game.lastInputTime;
  
  if (timeSinceLastInput > 5000) {
    return 10; // 10 FPS for idle games
  } else if (timeSinceLastInput > 1000) {
    return 30; // 30 FPS for semi-active
  } else {
    return 60; // 60 FPS for active games
  }
}
```

## Common Patterns

### Matchmaking
```javascript
// Simple queue-based matchmaking
function findMatch(playerId) {
  if (queue.length > 0) {
    const opponentId = queue.shift();
    const gameId = createGame(playerId, opponentId);
    
    io.to(playerId).emit('matchFound', { gameId, playerNumber: 1 });
    io.to(opponentId).emit('matchFound', { gameId, playerNumber: 2 });
  } else {
    queue.push(playerId);
    io.to(playerId).emit('waitingForMatch');
  }
}
```

### Reconnection Handling
```javascript
// Allow players to reconnect to ongoing games
function handleReconnect(playerId, gameId) {
  const game = games[gameId];
  if (!game) return false;
  
  // Restore player connection
  const playerIndex = game.disconnected.indexOf(playerId);
  if (playerIndex !== -1) {
    game.players[playerIndex] = playerId;
    game.disconnected.splice(playerIndex, 1);
    
    // Send current state
    io.to(playerId).emit('reconnected', game.state);
    return true;
  }
  
  return false;
}
```

### Anti-Cheat Measures
```javascript
// Server-side validation
function validateInput(input, player) {
  // Check input rate limiting
  const timeSinceLastInput = Date.now() - player.lastInputTime;
  if (timeSinceLastInput < 16) return false; // Max 60 inputs/second
  
  // Validate movement speed
  const distance = Math.sqrt(
    Math.pow(input.x - player.x, 2) + 
    Math.pow(input.y - player.y, 2)
  );
  if (distance > MAX_SPEED * 0.016) return false;
  
  // Validate actions
  if (input.action && Date.now() - player.lastAction < ACTION_COOLDOWN) {
    return false;
  }
  
  return true;
}
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Lag/Jitter
- **Problem**: Choppy movement, delayed responses
- **Solutions**:
  - Implement client-side prediction
  - Use interpolation between states
  - Reduce state size
  - Optimize network code

#### 2. Desync Issues
- **Problem**: Players see different game states
- **Solutions**:
  - Ensure deterministic physics
  - Use fixed timestep
  - Validate all inputs server-side
  - Implement state reconciliation

#### 3. High Bandwidth Usage
- **Problem**: Too much data being sent
- **Solutions**:
  - Implement delta compression
  - Reduce tick rate
  - Send only visible objects
  - Compress state data

#### 4. Scaling Issues
- **Problem**: Server can't handle many games
- **Solutions**:
  - Use worker threads for physics
  - Implement Redis for state storage
  - Deploy multiple server instances
  - Use regional servers

### Performance Monitoring
```javascript
// Track server performance
function monitorPerformance(game) {
  const metrics = {
    tickRate: game.actualTickRate,
    latency: calculateAverageLatency(game.players),
    cpuUsage: process.cpuUsage(),
    memoryUsage: process.memoryUsage(),
    activeGames: Object.keys(games).length,
    totalPlayers: Object.keys(players).length
  };
  
  console.log('Performance metrics:', metrics);
  
  // Alert if performance degrades
  if (metrics.tickRate < 50) {
    console.warn('Low tick rate detected:', metrics.tickRate);
  }
}
```

## Example Projects

### 1. Top-Down Shooter
```javascript
const gameState = {
  players: [{
    position: { x, y },
    rotation: 0,
    health: 100,
    ammo: 30
  }],
  bullets: [{
    position: { x, y },
    velocity: { x, y },
    owner: playerId,
    damage: 10
  }],
  pickups: []
};
```

### 2. Platformer
```javascript
const gameState = {
  players: [{
    position: { x, y },
    velocity: { x, y },
    grounded: false,
    facing: 'right'
  }],
  platforms: [{
    position: { x, y },
    width: 100,
    height: 20
  }],
  collectibles: []
};
```

### 3. Racing Game
```javascript
const gameState = {
  cars: [{
    position: { x, y },
    velocity: { x, y },
    rotation: 0,
    speed: 0,
    lap: 1
  }],
  track: {
    checkpoints: [],
    boundaries: []
  }
};
```

## Resources

### Libraries
- **Socket.io**: Real-time bidirectional communication
- **Matter.js**: 2D physics engine
- **Colyseus**: Multiplayer game framework
- **Mirror**: Unity networking library

### Further Reading
- [Gabriel Gambetta's Fast-Paced Multiplayer](https://www.gabrielgambetta.com/client-server-game-architecture.html)
- [Source Multiplayer Networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking)
- [Glenn Fiedler's Game Networking](https://gafferongames.com/)
- [Photon Engine Documentation](https://doc.photonengine.com/)

## Conclusion

This architecture provides a solid foundation for multiplayer games. Key takeaways:

1. **Keep server authoritative** - Never trust the client
2. **Optimize network traffic** - Send only what's necessary
3. **Handle edge cases** - Disconnections, lag, cheating
4. **Test with real latency** - Use network throttling tools
5. **Monitor performance** - Track metrics and optimize

Start simple and add complexity as needed. The patterns shown here can scale from small prototypes to production games with thousands of concurrent players.