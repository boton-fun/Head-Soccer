# Comprehensive Multiplayer Head Soccer Implementation Plan

## 🎯 Project Overview
Build a real-time multiplayer backend for Head Soccer that integrates seamlessly after character selection, using the existing single-player physics and layout with Socket.IO-based networking.

## 📋 Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Physics Integration](#physics-integration)
3. [Implementation Phases](#implementation-phases)
4. [Technical Stack](#technical-stack)
5. [File Structure](#file-structure)
6. [Detailed Implementation Steps](#detailed-implementation-steps)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Plan](#deployment-plan)

## 🏗️ Architecture Overview

### System Flow
```
Character Selection → Matchmaking → Game Room → Gameplay → Results
                           ↓
                    Private/Public Rooms
```

### Core Components
1. **Multiplayer Server** (`head-soccer-server.js`)
   - Room management
   - Physics simulation (60 FPS)
   - State synchronization
   - Input validation

2. **Client Game** (`multiplayer-gameplay.html`)
   - Canvas rendering
   - Input capture
   - State interpolation
   - UI overlay

3. **Shared Physics** (Using existing constants)
   - Ball physics (gravity: 0.5, bounce: 0.95)
   - Player movement (speed: 5, jump: 15)
   - Collision detection
   - Goal scoring

## ⚛️ Physics Integration (EXACT 1P Values)

### From Single-Player physics-constants.js
```javascript
// Core Physics
GRAVITY: 0.5         // Frame-based gravity (same for ball and players)
FPS: 60             // 60 frames per second game loop

// Field Dimensions (pixels)
FIELD: {
    WIDTH: 1600,
    HEIGHT: 900,
    BOTTOM_GAP: 20,  // Ground thickness
    GOAL_WIDTH: 75,
    GOAL_HEIGHT: 250,
    PLAYER_START_X_RATIO: 0.25, // Player 1 at 25% (400px), Player 2 at 75% (1200px)
    PLAYER_START_Y: 750,
    BALL_START_X_RATIO: 0.5,    // Ball starts at center (800px)
    BALL_START_Y: 400
}

// Ball Physics
BALL: {
    RADIUS: 25,
    GRAVITY: 0.5,      // Same as global gravity
    BOUNCE: 0.95,      // Very high bounce for dramatic effect
    FRICTION_AIR: 0,   // No air resistance
    INITIAL_VEL_X: 0,
    INITIAL_VEL_Y: 0
}

// Player Physics
PLAYER: {
    WIDTH: 50,
    HEIGHT: 80,
    GRAVITY: 0.5,
    MOVE_SPEED: 5,     // Horizontal movement speed per frame
    JUMP_HEIGHT: 15,   // Initial upward velocity when jumping
    GROUND_THRESHOLD: 5,
    FRICTION: 0.85     // Ground friction applied to velocity
}

// Kick Mechanics
KICK: {
    FORCE_MIN: 18,     // Minimum kick force
    FORCE_MAX: 25,     // Maximum kick force (very powerful)
    COOLDOWN: 10       // Frames between kicks (1/6 second at 60fps)
}

// Goal Detection
GOAL: {
    LEFT_X: 75,        // Left goal right edge
    RIGHT_X: 1525,     // Right goal left edge (WIDTH - 75)
    Y_THRESHOLD: 650   // Top of goal area (HEIGHT - 250)
}

// Collision System
COLLISION: {
    BALL_CHARACTER_THRESHOLD: 5,  // Min distance for collision
    BOUNCE_MULTIPLIER: 1.1        // Ball speeds up 10% on player collision
}
```

## 🎮 Control Scheme (Online Multiplayer)

### Both Players Use Same Controls (Arrow Keys Preferred)
Since players are on different computers, both can use the same control scheme:

### Primary Controls (Arrow Keys) - Recommended for Both Players
- **←**: Move Left
- **→**: Move Right
- **↑**: Jump  
- **↓**: Kick

### Alternative Controls (WASD) - Also Available
- **A**: Move Left
- **D**: Move Right  
- **W**: Jump
- **S**: Kick

### Why Both Players Can Use Same Controls
- **Online Multiplayer**: Each player is on their own computer
- **No Control Conflicts**: Inputs are sent separately via network
- **Player Preference**: Each player can choose Arrow Keys or WASD
- **Consistency**: Most players prefer arrow keys for sports games

### Additional Controls
- **P**: Pause/Resume (optional)
- **R**: Reset Game (optional)
- **D**: Debug Mode (development only)

## 📈 Implementation Phases

### Phase 1: Server Foundation (Days 1-2)
- [x] Create `head-soccer-server.js` based on template
- [ ] Implement Head Soccer game state structure
- [ ] Add room management (2 players per room)
- [ ] Set up 60 FPS game loop

### Phase 2: Physics Implementation (Days 3-4)
- [ ] Port ball physics from single-player
- [ ] Implement player movement and jumping
- [ ] Add collision detection (ball-player, ball-goal)
- [ ] Implement kick mechanics

### Phase 3: Client Integration (Days 5-6)
- [ ] Create new `multiplayer-gameplay.html`
- [ ] Port rendering from single-player
- [ ] Implement input handling
- [ ] Add state interpolation

### Phase 4: Character Selection Integration (Day 7)
- [ ] Update character selection redirect
- [ ] Pass selected characters to server
- [ ] Display correct sprites/heads

### Phase 5: Polish & Testing (Days 8-9)
- [ ] Add countdown timer
- [ ] Implement pause/resume
- [ ] Handle disconnections
- [ ] Performance optimization

### Phase 6: Deployment (Day 10)
- [ ] Deploy server to Railway/Heroku
- [ ] Update client with production URLs
- [ ] Test with real latency

## 🛠️ Technical Stack

### Backend
- **Node.js** + **Socket.IO** (real-time communication)
- **Express** (HTTP server)
- **No database** (in-memory for MVP)

### Frontend
- **HTML5 Canvas** (same as single-player)
- **Socket.IO Client**
- **Vanilla JavaScript** (no framework needed)

### Deployment
- **Server**: Railway/Heroku/Render
- **Client**: Vercel (existing setup)

## 📁 File Structure

```
head-soccer-js/
├── multiplayer/
│   ├── server/
│   │   ├── head-soccer-server.js    # Main server
│   │   ├── physics.js               # Physics engine
│   │   ├── gameRoom.js              # Room management
│   │   └── package.json
│   │
│   └── client/
│       ├── multiplayer-gameplay.html # New gameplay page
│       ├── multiplayer-client.js     # Client logic
│       └── multiplayer-renderer.js   # Canvas rendering
│
├── character-selection-multiplayer.html (UPDATE)
└── js/physics-constants.js (REUSE)
```

## 📝 Detailed Implementation Steps

### Step 1: Create Server Foundation (Exact 1P Positions)
```javascript
// head-soccer-server.js
const io = require("socket.io")(3000, {
  cors: { origin: ["http://localhost:8080"] }
});

// Import or define physics constants (exact from physics-constants.js)
const PHYSICS_CONSTANTS = {
  FIELD: {
    WIDTH: 1600,
    HEIGHT: 900,
    BOTTOM_GAP: 20,
    PLAYER_START_X_RATIO: 0.25,  // P1 at 25%, P2 at 75%
    PLAYER_START_Y: 750,          // Exact Y position
    BALL_START_X_RATIO: 0.5,      // Center
    BALL_START_Y: 400
  },
  PLAYER: {
    WIDTH: 50,
    HEIGHT: 80
  },
  BALL: {
    RADIUS: 25
  }
};

// Game state structure with EXACT 1P starting positions
function createGameState() {
  const fieldWidth = PHYSICS_CONSTANTS.FIELD.WIDTH;
  const player1X = fieldWidth * PHYSICS_CONSTANTS.FIELD.PLAYER_START_X_RATIO; // 400
  const player2X = fieldWidth * (1 - PHYSICS_CONSTANTS.FIELD.PLAYER_START_X_RATIO); // 1200
  const ballX = fieldWidth * PHYSICS_CONSTANTS.FIELD.BALL_START_X_RATIO; // 800
  
  return {
    players: [
      {
        id: null,
        position: { 
          x: player1X,  // 400px (25% of 1600)
          y: PHYSICS_CONSTANTS.FIELD.PLAYER_START_Y  // 750px
        },
        velocity: { x: 0, y: 0 },
        score: 0,
        character: 'player1',
        kickCooldown: 0,
        isGrounded: true,
        isKicking: false
      },
      {
        id: null,
        position: { 
          x: player2X,  // 1200px (75% of 1600)
          y: PHYSICS_CONSTANTS.FIELD.PLAYER_START_Y  // 750px
        },
        velocity: { x: 0, y: 0 },
        score: 0,
        character: 'player2',
        kickCooldown: 0,
        isGrounded: true,
        isKicking: false
      }
    ],
    ball: {
      position: { 
        x: ballX,  // 800px (center)
        y: PHYSICS_CONSTANTS.FIELD.BALL_START_Y  // 400px
      },
      velocity: { x: 0, y: 0 },
      radius: PHYSICS_CONSTANTS.BALL.RADIUS  // 25px
    },
    time: 120, // 2 minutes (same as 1P)
    gameStarted: false,
    gameOver: false
  };
}
```

### Step 2: Implement Physics Engine (Exact 1P Physics)
```javascript
// physics.js - Using EXACT values from physics-constants.js
const PHYSICS = {
  // Core
  GRAVITY: 0.5,           // Frame-based gravity
  FPS: 60,
  
  // Field
  FIELD_WIDTH: 1600,
  FIELD_HEIGHT: 900,
  BOTTOM_GAP: 20,
  
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
  
  // Collision
  COLLISION_THRESHOLD: 5,
  BOUNCE_MULTIPLIER: 1.1  // Ball speeds up on collision
};

function updatePhysics(state, deltaTime) {
  // IMPORTANT: Use frame-based physics (no deltaTime multiplication)
  // This matches the 1P Phaser implementation exactly
  
  // Update ball (frame-based like 1P)
  state.ball.velocity.y += PHYSICS.GRAVITY;
  state.ball.position.x += state.ball.velocity.x;
  state.ball.position.y += state.ball.velocity.y;
  
  // Ball-ground collision (880 = FIELD_HEIGHT - BOTTOM_GAP)
  const groundY = PHYSICS.FIELD_HEIGHT - PHYSICS.BOTTOM_GAP - PHYSICS.BALL_RADIUS;
  if (state.ball.position.y > groundY) {
    state.ball.position.y = groundY;
    state.ball.velocity.y *= -PHYSICS.BALL_BOUNCE;
  }
  
  // Ball-wall collision
  if (state.ball.position.x < PHYSICS.BALL_RADIUS) {
    state.ball.position.x = PHYSICS.BALL_RADIUS;
    state.ball.velocity.x *= -PHYSICS.BALL_BOUNCE;
  }
  if (state.ball.position.x > PHYSICS.FIELD_WIDTH - PHYSICS.BALL_RADIUS) {
    state.ball.position.x = PHYSICS.FIELD_WIDTH - PHYSICS.BALL_RADIUS;
    state.ball.velocity.x *= -PHYSICS.BALL_BOUNCE;
  }
  
  // Check goals (exact thresholds from 1P)
  checkGoals(state);
  
  // Update players with exact 1P physics
  state.players.forEach(player => {
    updatePlayer(player);
    checkBallPlayerCollision(player, state.ball);
  });
}

function checkBallPlayerCollision(player, ball) {
  // Use exact collision detection from 1P
  const distance = Math.sqrt(
    Math.pow(player.position.x - ball.position.x, 2) +
    Math.pow(player.position.y - ball.position.y, 2)
  );
  
  if (distance < PHYSICS.PLAYER_WIDTH/2 + PHYSICS.BALL_RADIUS) {
    // Apply collision with bounce multiplier
    const angle = Math.atan2(
      ball.position.y - player.position.y,
      ball.position.x - player.position.x
    );
    
    const force = player.isKicking ? 
      PHYSICS.KICK_FORCE_MAX : 
      PHYSICS.KICK_FORCE_MIN;
    
    ball.velocity.x = Math.cos(angle) * force * PHYSICS.BOUNCE_MULTIPLIER;
    ball.velocity.y = Math.sin(angle) * force * PHYSICS.BOUNCE_MULTIPLIER;
  }
}
```

### Step 3: Handle Input Processing (1P Mode Controls)
```javascript
function processInputs(game) {
  Object.keys(game.inputs).forEach(playerId => {
    const input = game.inputs[playerId];
    const player = game.state.players.find(p => p.id === playerId);
    const playerIndex = game.state.players.indexOf(player);
    
    if (!player) return;
    
    // Player 1: WASD controls (left side)
    // Player 2: Arrow keys (right side)
    
    // Horizontal Movement
    if (input.keys.left) player.velocity.x = -PHYSICS.PLAYER_SPEED;
    else if (input.keys.right) player.velocity.x = PHYSICS.PLAYER_SPEED;
    else player.velocity.x = 0;
    
    // Jump (W for P1, Up Arrow for P2)
    if (input.keys.up && player.isGrounded) {
      player.velocity.y = -PHYSICS.JUMP_HEIGHT;
      player.isGrounded = false;
    }
    
    // Kick (S for P1, Down Arrow for P2)
    if (input.keys.kick && player.kickCooldown === 0) {
      performKick(player, game.state.ball);
      player.kickCooldown = 10;
    }
  });
}
```

### Step 4: Create Client UI & Renderer (Matching 1P UI)

#### HTML Structure (Same as Single-Player)
```html
<!-- multiplayer-gameplay.html -->
<div id="game-container">
  <!-- Animated space background -->
  <canvas id="backgroundCanvas"></canvas>
  
  <!-- Top UI Bar (Same as 1P) -->
  <div id="top-ui-bar">
    <div id="top-left-controls">
      <button id="back-button">Menu</button>
      <button id="pause-button">Pause</button>
    </div>
    
    <div id="top-right-info">
      <button id="controls-button">Controls</button>
    </div>
  </div>

  <!-- Centered Timer (Exact 1P Style) -->
  <div id="timer-container">
    <div id="timer-label">TIME</div>
    <div id="timer-display">2:00</div>
  </div>

  <!-- Score Display (Same Layout as 1P) -->
  <div id="score-container">
    <div id="player1-section" class="player-section">
      <div id="player1-name" class="player-name">Player 1</div>
      <div id="player1-score" class="player-score">0</div>
    </div>
    
    <div id="score-separator">VS</div>
    
    <div id="player2-section" class="player-section">
      <div id="player2-name" class="player-name">Player 2</div>
      <div id="player2-score" class="player-score">0</div>
    </div>
  </div>

  <!-- Game Canvas -->
  <canvas id="game-canvas" width="1600" height="900"></canvas>

  <!-- Debug Info (Hidden by default) -->
  <div id="debug-info">
    <div>FPS: <span id="fps">0</span></div>
    <div>Ping: <span id="ping">0</span>ms</div>
    <div>Players: <span id="player-count">0</span></div>
  </div>

  <!-- Controls Popup (Same as 1P) -->
  <div id="controls-popup">
    <div class="controls-content">
      <h2 class="controls-title">Game Controls</h2>
      <!-- Arrow keys controls display -->
    </div>
  </div>
</div>
```

#### CSS Styling (Matching 1P Theme)
```css
/* Space theme with gradient background */
#game-container {
  background: linear-gradient(135deg, #0c0c2e 0%, #1a0c3e 25%, #2d1b5e 50%);
}

/* Top UI Bar */
#top-ui-bar {
  height: 60px;
  background: linear-gradient(135deg, rgba(0,0,0,0.8), rgba(0,0,0,0.6));
  backdrop-filter: blur(10px);
  border-bottom: 2px solid rgba(255,255,255,0.1);
}

/* Timer (Exact 1P Style) */
#timer-display {
  font-size: 32px;
  color: #fff;
  font-weight: bold;
  font-family: 'Courier New', monospace;
  background: rgba(0,0,0,0.7);
  padding: 8px 16px;
  border-radius: 8px;
}

/* Score Display (1P Colors) */
#player1-score { color: #2196F3; }  /* Blue */
#player2-score { color: #F44336; }  /* Red */

/* Buttons (1P Gradient Style) */
#back-button {
  background: linear-gradient(135deg, #f44336, #d32f2f);
}
#pause-button {
  background: linear-gradient(135deg, #4CAF50, #388E3C);
}
#controls-button {
  background: linear-gradient(135deg, #FFC107, #FF9800);
}
```

#### JavaScript Renderer (With 1P Visual Style)
```javascript
// multiplayer-renderer.js
function renderGame(ctx, state) {
  // Space-themed background (matches 1P)
  const gradient = ctx.createLinearGradient(0, 0, 0, 900);
  gradient.addColorStop(0, '#000011');
  gradient.addColorStop(1, '#001133');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1600, 900);
  
  // Draw stars (like 1P)
  drawStars(ctx);
  
  // Draw ground platform (space platform style)
  const groundY = 880;
  ctx.fillStyle = '#2a2a4a';
  ctx.fillRect(0, groundY, 1600, 20);
  
  // Glowing platform edge
  ctx.strokeStyle = '#66ccff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(1600, groundY);
  ctx.stroke();
  
  // Energy center line
  ctx.strokeStyle = '#00ffff';
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(800, 0);
  ctx.lineTo(800, groundY);
  ctx.stroke();
  ctx.globalAlpha = 1;
  
  // Draw goals (with images if available)
  drawGoal(ctx, 0, 650);    // Left goal
  drawGoal(ctx, 1525, 650); // Right goal
  
  // Draw ball (white with glow effect)
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#00ffff';
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(state.ball.position.x, state.ball.position.y, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  
  // Draw players with character sprites
  state.players.forEach((player, index) => {
    drawPlayer(ctx, player, index);
  });
}
```

### Step 5: Character Selection Integration (CRITICAL)

#### A. Pass Character Data from Selection Page
```javascript
// In character-selection-multiplayer.html
function startMultiplayerGame() {
  // Collect all selected customizations for both players
  const player1Data = {
    character: document.getElementById('player1-character').value, // e.g., 'player1', 'player2', etc.
    head: document.getElementById('player1-head').value,           // e.g., 'head1', 'head2', etc.
    cleat: document.getElementById('player1-cleat').value          // e.g., 'cleat1', 'cleat2', etc.
  };
  
  const player2Data = {
    character: document.getElementById('player2-character').value,
    head: document.getElementById('player2-head').value,
    cleat: document.getElementById('player2-cleat').value
  };
  
  // Encode character data in URL parameters
  const params = new URLSearchParams();
  params.append('p1_char', player1Data.character);
  params.append('p1_head', player1Data.head);
  params.append('p1_cleat', player1Data.cleat);
  params.append('p2_char', player2Data.character);
  params.append('p2_head', player2Data.head);
  params.append('p2_cleat', player2Data.cleat);
  params.append('roomCode', roomCode); // If using private rooms
  
  // Redirect to multiplayer gameplay with character data
  window.location.href = `multiplayer/client/multiplayer-gameplay.html?${params.toString()}`;
}
```

#### B. Receive Character Data in Multiplayer Client
```javascript
// In multiplayer-gameplay.html (on load)
const urlParams = new URLSearchParams(window.location.search);

// Parse character selections from URL
const characterData = {
  player1: {
    character: urlParams.get('p1_char') || 'player1',  // Default characters
    head: urlParams.get('p1_head') || 'head1',
    cleat: urlParams.get('p1_cleat') || 'cleat1'
  },
  player2: {
    character: urlParams.get('p2_char') || 'player2',
    head: urlParams.get('p2_head') || 'head2',
    cleat: urlParams.get('p2_cleat') || 'cleat2'
  }
};

// Store for later use in rendering
window.selectedCharacters = characterData;

// Send character data to server when joining room
socket.emit('joinGame', {
  roomCode: urlParams.get('roomCode'),
  characterData: characterData,
  playerName: sessionStorage.getItem('playerName') || 'Guest'
});
```

#### C. Server Stores Character Data
```javascript
// In head-soccer-server.js
socket.on('joinGame', (data) => {
  const { roomCode, characterData, playerName } = data;
  
  // Find or create room
  let game = findOrCreateRoom(roomCode);
  
  // Assign player to slot with their character data
  const playerIndex = game.state.players.findIndex(p => !p.id);
  if (playerIndex !== -1) {
    game.state.players[playerIndex] = {
      ...game.state.players[playerIndex],
      id: socket.id,
      name: playerName,
      // Store character customization
      character: characterData[`player${playerIndex + 1}`].character,
      head: characterData[`player${playerIndex + 1}`].head,
      cleat: characterData[`player${playerIndex + 1}`].cleat,
      // Include in state for syncing to all clients
      customization: {
        character: characterData[`player${playerIndex + 1}`].character,
        head: characterData[`player${playerIndex + 1}`].head,
        cleat: characterData[`player${playerIndex + 1}`].cleat
      }
    };
  }
  
  // Broadcast updated state with character data
  io.to(roomCode).emit('gameState', game.state);
});
```

#### D. Render Characters with Selected Customizations
```javascript
// In multiplayer-renderer.js
function drawPlayer(ctx, player, index) {
  const x = player.position.x;
  const y = player.position.y;
  
  // Get character customization from server state
  const customization = player.customization || {
    character: 'player1',
    head: 'head1',
    cleat: 'cleat1'
  };
  
  // Load character sprites based on customization
  const sprites = {
    body: loadSprite(`assets/characters/${customization.character}.png`),
    head: loadSprite(`assets/heads/${customization.head}.png`),
    cleat: loadSprite(`assets/cleats/${customization.cleat}.png`)
  };
  
  // Draw character with selected parts
  // Body
  ctx.drawImage(sprites.body, x - 25, y - 40, 50, 80);
  
  // Head (overlay on top of body)
  ctx.drawImage(sprites.head, x - 30, y - 60, 60, 60);
  
  // Cleats (at feet)
  ctx.drawImage(sprites.cleat, x - 25, y + 30, 50, 20);
  
  // Draw player name above character
  ctx.fillStyle = index === 0 ? '#2196F3' : '#F44336';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(player.name || `Player ${index + 1}`, x, y - 70);
  
  // Add glow effect for active player
  if (player.id === socket.id) {
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 30, y - 60, 60, 100);
  }
}

// Sprite loading and caching
const spriteCache = {};
function loadSprite(path) {
  if (!spriteCache[path]) {
    const img = new Image();
    img.src = path;
    spriteCache[path] = img;
  }
  return spriteCache[path];
}

// Preload all character assets on game start
function preloadCharacterAssets() {
  const characters = ['player1', 'player2', 'player3', 'player4'];
  const heads = ['head1', 'head2', 'head3', 'head4', 'head5'];
  const cleats = ['cleat1', 'cleat2', 'cleat3', 'cleat4'];
  
  characters.forEach(char => loadSprite(`assets/characters/${char}.png`));
  heads.forEach(head => loadSprite(`assets/heads/${head}.png`));
  cleats.forEach(cleat => loadSprite(`assets/cleats/${cleat}.png`));
}
```

### Step 6: Client Input Handling (Both Players Can Use Arrow Keys)
```javascript
// Client-side input capture
const inputState = {
  keys: {
    left: false,
    right: false,
    up: false,    // Jump
    kick: false   // Kick (down arrow or S key)
  }
};

// Setup controls - Both Arrow Keys and WASD work for all players
function setupControls() {
  // Both control schemes active simultaneously
  document.addEventListener('keydown', (e) => {
    switch(e.key) {
      // Arrow Keys (Primary)
      case 'ArrowLeft': inputState.keys.left = true; break;
      case 'ArrowRight': inputState.keys.right = true; break;
      case 'ArrowUp': inputState.keys.up = true; break;
      case 'ArrowDown': inputState.keys.kick = true; break;
      
      // WASD (Alternative)
      case 'a':
      case 'A': inputState.keys.left = true; break;
      case 'd':
      case 'D': inputState.keys.right = true; break;
      case 'w':
      case 'W': inputState.keys.up = true; break;
      case 's':
      case 'S': inputState.keys.kick = true; break;
    }
    sendInput();
  });
  
  document.addEventListener('keyup', (e) => {
    switch(e.key) {
      // Arrow Keys (Primary)
      case 'ArrowLeft': inputState.keys.left = false; break;
      case 'ArrowRight': inputState.keys.right = false; break;
      case 'ArrowUp': inputState.keys.up = false; break;
      case 'ArrowDown': inputState.keys.kick = false; break;
      
      // WASD (Alternative)
      case 'a':
      case 'A': inputState.keys.left = false; break;
      case 'd':
      case 'D': inputState.keys.right = false; break;
      case 'w':
      case 'W': inputState.keys.up = false; break;
      case 's':
      case 'S': inputState.keys.kick = false; break;
    }
    sendInput();
  });
}

// Socket communication
socket.on('gameState', (state) => {
  gameState = state;
  renderGame(ctx, state);
});

socket.on('goal', (data) => {
  showGoalAnimation(data.scorer);
  playGoalSound();
});

socket.on('gameOver', (result) => {
  showGameOverScreen(result);
});

// Send inputs
function sendInput() {
  socket.emit('input', {
    keys: inputState.keys,
    timestamp: Date.now()
  });
}
```

## 🧪 Testing Strategy

### Local Testing
1. Run server: `node head-soccer-server.js`
2. Open two browser tabs
3. Test character selection → gameplay flow
4. Verify physics match single-player

### Network Testing
1. Add artificial latency (Chrome DevTools)
2. Test with 100ms, 200ms latency
3. Verify smooth gameplay

### Load Testing
1. Test with 10 concurrent games
2. Monitor server CPU/memory
3. Optimize if needed

## 🚀 Deployment Plan

### Server Deployment (Railway)
```yaml
# railway.json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node multiplayer/server/head-soccer-server.js",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### Environment Variables
```env
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://head-soccer.vercel.app
```

### Client Configuration
```javascript
// Update Socket.IO connection
const SOCKET_URL = process.env.NODE_ENV === 'production' 
  ? 'https://head-soccer-server.railway.app'
  : 'http://localhost:3000';
```

## 📊 Performance Targets

- **Server Tick Rate**: 60 FPS
- **Network Updates**: 30/sec to clients
- **Latency Tolerance**: Up to 150ms
- **Concurrent Games**: 50+ rooms
- **Players per Room**: 2

## 🎮 Game Features

### Core Gameplay
- ✅ 2-minute matches
- ✅ Real-time ball physics
- ✅ Jump and kick mechanics
- ✅ Goal scoring with animations
- ✅ Character customization display

### UI Elements (Exact 1P Match)
- ✅ **Top UI Bar**: Menu, Pause, Controls buttons
- ✅ **Timer Display**: Centered, "TIME" label, Courier font
- ✅ **Score Display**: Player names, VS separator, colored scores
- ✅ **Space Theme**: Gradient background, stars, glowing effects
- ✅ **Debug Mode**: FPS counter, ping display (press D)
- ✅ **Controls Popup**: Same layout as 1P
- ✅ **Button Styles**: Gradient backgrounds with hover effects

### Visual Features (From 1P)
- ✅ **Animated Background**: Moving stars
- ✅ **Glowing Elements**: Platform edges, center line
- ✅ **Color Scheme**: 
  - Player 1: Blue (#2196F3)
  - Player 2: Red (#F44336)
  - Energy effects: Cyan (#00ffff)
- ✅ **Goal Sprites**: Goal images if available
- ✅ **Character Heads**: Custom selected heads
- ✅ **Cleats Display**: Selected cleat sprites

### Future Enhancements
- [ ] Power-ups
- [ ] Tournament mode
- [ ] Spectator mode
- [ ] Replay system
- [ ] Leaderboards

## 🐛 Known Considerations

1. **Ball Sync**: Server authoritative, client interpolation
2. **Input Lag**: Client-side prediction for movement
3. **Collision**: Server validates all collisions
4. **Disconnections**: 10-second reconnection window

## ⚠️ CRITICAL: Frame-Based Physics (Not Time-Based)

The 1P mode uses **frame-based physics**, not delta-time physics. This means:

```javascript
// CORRECT (1P mode style - frame-based)
ball.velocity.y += 0.5;  // Add gravity each frame
ball.position.x += ball.velocity.x;  // Move by velocity each frame

// WRONG (don't use deltaTime)
ball.velocity.y += 0.5 * deltaTime;  // DON'T DO THIS
ball.position.x += ball.velocity.x * deltaTime;  // DON'T DO THIS
```

**Why This Matters:**
- 1P mode runs at 60 FPS with frame-based physics
- Multiplying by deltaTime would make physics feel different
- Server should run at steady 60 FPS (16.67ms tick rate)
- All physics values are tuned for frame-based updates

**Server Game Loop:**
```javascript
const TICK_RATE = 60;  // Must be 60 to match 1P
const TICK_INTERVAL = 1000 / TICK_RATE;  // 16.67ms

setInterval(() => {
  updatePhysics(gameState);  // No deltaTime needed
}, TICK_INTERVAL);
```

## 📚 Resources

- [Socket.IO Documentation](https://socket.io/docs/)
- [Game Networking Guide](https://www.gabrielgambetta.com/client-server-game-architecture.html)
- [Existing Physics Constants](./js/physics-constants.js)
- [Multiplayer Template](./multiplayer-starter-template/)

## ✅ Success Criteria

1. **Smooth Gameplay**: <100ms perceived latency
2. **Fair Physics**: Matches single-player feel
3. **Stable Connection**: <1% disconnect rate
4. **Quick Matchmaking**: <5 seconds average
5. **Character Integration**: Shows selected customizations

## 🚦 Next Steps

1. **Day 1**: Set up server foundation
2. **Day 2**: Implement physics
3. **Day 3**: Create client renderer
4. **Day 4**: Integrate character selection
5. **Day 5**: Test and optimize
6. **Day 6**: Deploy to production

---

## Implementation Checklist

### Server & Physics
- [ ] Server setup with Socket.IO
- [ ] Game state management
- [ ] Physics engine port (exact 1P values)
- [ ] Ball collision detection
- [ ] Goal scoring logic
- [ ] Frame-based physics (60 FPS)

### Controls
- [ ] Player movement (Arrow Keys for both players)
- [ ] Alternative WASD support (both players can use)
- [ ] Jump mechanics (Up Arrow/W)
- [ ] Kick mechanics (Down Arrow/S)
- [ ] Pause functionality (P key)
- [ ] Debug toggle (D key)

### UI Implementation (Match 1P Exactly)
- [ ] Top UI bar with gradient background
- [ ] Menu button (red gradient)
- [ ] Pause button (green gradient)
- [ ] Controls button (yellow gradient)
- [ ] Centered timer with "TIME" label
- [ ] Score display with VS separator
- [ ] Player 1 blue score (#2196F3)
- [ ] Player 2 red score (#F44336)
- [ ] Space-themed gradient background
- [ ] Animated star field
- [ ] Glowing platform edges
- [ ] Energy center line
- [ ] Controls popup overlay
- [ ] Debug info panel

### Game Features
- [ ] Client rendering with Canvas
- [ ] Input handling
- [ ] State synchronization
- [ ] Goal animations
- [ ] Timer countdown (2:00)
- [ ] Game over screen
- [ ] Disconnection handling

### Character Selection Integration (CRITICAL)
- [ ] Parse character data from URL parameters
- [ ] Send character customizations to server on join
- [ ] Store character data in server game state
- [ ] Render selected character bodies
- [ ] Render selected head sprites
- [ ] Render selected cleat sprites
- [ ] Display player names above characters
- [ ] Preload all character assets
- [ ] Handle missing/invalid character selections
- [ ] Character data synchronization between clients

### Deployment
- [ ] Deploy server
- [ ] Update client URLs
- [ ] Production testing
- [ ] Performance optimization

This plan provides a clear roadmap to implement multiplayer Head Soccer with the same physics and feel as the single-player version!