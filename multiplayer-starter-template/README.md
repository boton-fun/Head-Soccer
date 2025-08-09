# Multiplayer Game Starter Template

This template provides a complete, working multiplayer game foundation that you can customize for your specific game mechanics and physics.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Serve the client:**
   ```bash
   npm run client
   ```

4. **Open the game:**
   Open `http://localhost:8080` in two browser tabs to test multiplayer

## Project Structure

```
multiplayer-starter-template/
├── server.js              # Complete multiplayer server
├── client/
│   ├── index.html         # Game UI and screens
│   └── client.js          # Client-side game logic
├── package.json           # Dependencies and scripts
└── README.md             # This file
```

## Key Features Included

### ✅ **Working Features**
- Real-time multiplayer synchronization
- Matchmaking system (automatic and private rooms)
- Input handling and validation
- Game state management
- Connection/disconnection handling
- Debug mode (press 'D')
- Responsive UI with multiple screens

### 🎮 **Game Mechanics Ready to Customize**
- Player movement (WASD / Arrow keys)
- Action system (Space key)
- Collision detection framework
- Scoring system
- Timer system
- Win/lose conditions

## Customization Guide

### 1. **Modify Game State Structure**

In `server.js`, update the `createGameState()` function:

```javascript
function createGameState() {
  return {
    players: [
      {
        // Add your player properties
        health: 100,
        ammo: 30,
        powerups: [],
        // etc.
      }
    ],
    // Add your game-specific objects
    bullets: [],
    obstacles: [],
    items: [],
    // etc.
  };
}
```

### 2. **Implement Your Physics**

In `server.js`, customize the `updatePhysics()` function:

```javascript
function updatePhysics(state, deltaTime) {
  // Your physics calculations here
  // Examples:
  // - Gravity: player.velocity.y += gravity * deltaTime
  // - Friction: player.velocity.x *= friction
  // - Collisions: checkCollisions(state)
}
```

### 3. **Add Your Input Handling**

In `server.js`, modify the `processInputs()` function:

```javascript
function processInputs(game) {
  // Handle different input types
  if (input.keys.shoot) {
    createBullet(player);
  }
  if (input.mouse.clicked) {
    shootAt(player, input.mouse.x, input.mouse.y);
  }
}
```

### 4. **Customize Rendering**

In `client/client.js`, update the `renderGame()` function:

```javascript
function renderGame() {
  // Draw your game objects
  // Examples:
  // - drawBackground()
  // - drawPlayers()
  // - drawProjectiles()
  // - drawUI()
}
```

### 5. **Add Game-Specific Events**

Add new socket events in both client and server:

```javascript
// Server
socket.on('playerShoot', (data) => {
  // Handle shooting
});

// Client
socket.emit('playerShoot', { direction: angle });
```

## Common Game Types & Customizations

### 🏃 **Top-Down Shooter**
- Add bullet physics in `updatePhysics()`
- Implement line-of-sight in collision detection
- Add weapon switching and ammo system

### 🏎️ **Racing Game**
- Modify movement to use acceleration/deceleration
- Add car physics (drift, handling)
- Implement track boundaries and checkpoints

### ⚔️ **Fighting Game**
- Add character animations and states
- Implement combo system and special moves
- Add health bars and damage calculation

### 🏐 **Sports Game**
- Add ball physics and player interactions
- Implement team-based scoring
- Add power-ups and special abilities

## Performance Optimization

### Server Optimization
```javascript
// Reduce tick rate for less demanding games
const TICK_RATE = 30; // Instead of 60

// Implement delta compression
function sendOnlyChanges(oldState, newState) {
  // Send only what changed
}

// Use object pooling for projectiles
const bulletPool = [];
```

### Client Optimization
```javascript
// Interpolation for smoother gameplay
function interpolatePosition(current, target, alpha) {
  return {
    x: current.x + (target.x - current.x) * alpha,
    y: current.y + (target.y - current.y) * alpha
  };
}
```

## Testing Your Multiplayer Game

1. **Local Testing:** Open multiple browser tabs
2. **Network Testing:** Test with friends on different devices
3. **Latency Testing:** Use browser dev tools to simulate network conditions
4. **Load Testing:** Use tools like Artillery.io for stress testing

## Common Issues & Solutions

### ❌ **"Game feels laggy"**
- ✅ Reduce tick rate if game is simple
- ✅ Implement client-side prediction
- ✅ Add interpolation between states

### ❌ **"Players see different things"**
- ✅ Ensure all game logic runs on server
- ✅ Validate all inputs server-side
- ✅ Use fixed timestep for physics

### ❌ **"Server crashes with many players"**
- ✅ Add error handling around all socket events
- ✅ Implement player limits per room
- ✅ Add memory leak detection

## Next Steps

1. **Add your specific game mechanics** using the framework provided
2. **Test thoroughly** with multiple players
3. **Optimize performance** based on your game's needs
4. **Deploy to production** (see deployment guide in main documentation)

## Need Help?

- Check the main `MULTIPLAYER_IMPLEMENTATION_GUIDE.md` for detailed explanations
- Look at the working Head Soccer example for reference
- Test each component individually before combining

This template gives you a solid foundation - now make it your own! 🚀