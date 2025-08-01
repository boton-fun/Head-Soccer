# Head Soccer Multiplayer Architecture Documentation

## Overview
This document outlines the files and systems responsible for multiplayer gameplay, physics, and synchronization in the Head Soccer game.

## Architecture Components

### Backend (Server-side)

#### 1. GameRoom Module (`backend/modules/GameRoom.js`)
**Purpose**: Core game room management
- **Responsibilities**:
  - Manages game rooms with unique IDs
  - Handles player management (add/remove players)
  - Tracks player positions (left/right)
  - Manages game scoring and win conditions
  - Controls match lifecycle (WAITING → READY → PLAYING → FINISHED)
  - Handles pause/resume functionality
  - Logs game events and statistics

#### 2. Gameplay Events Handler (`backend/websocket/gameplayEvents.js`)
**Purpose**: Real-time gameplay event processing
- **Key Features**:
  - Processes player movement with lag compensation
  - Handles ball physics updates
  - Validates and processes goal attempts
  - Manages game pause/resume requests
  - Implements server-authoritative physics tick (60 Hz)
  - Tracks player latencies for lag compensation
  - Handles game end scenarios (score limit, time limit, disconnection)

#### 3. Socket Handler (`backend/websocket/socketHandler.js`)
**Purpose**: Main WebSocket event routing and validation
- **Event Categories**:
  - Authentication events
  - Matchmaking events
  - Character selection events
  - Gameplay events (movement, ball updates, goals)
  - Game control events (pause, resume, forfeit)
  - Room management events
- **Features**:
  - Input validation and sanitization
  - Rate limiting per event type
  - Event prioritization (CRITICAL → HIGH → MEDIUM → LOW)
  - Player sequence tracking for ordered updates

#### 4. Game State Validator (`backend/modules/GameStateValidator.js`)
**Purpose**: Server-side validation and anti-cheat
- **Validation Types**:
  - Player movement speed limits (max 500 px/s)
  - Ball physics validation (max 800 px/s)
  - Position boundary checks
  - Goal line crossing validation
  - Input rate limiting (max 60/s for general, 120/s for movement)
  - Timestamp drift detection
  - Score progression validation

### Frontend (Client-side)

#### 5. Ball Class (`js/classes/Ball.js`)
**Purpose**: Ball physics and rendering
- **Physics Properties**:
  - Gravity: 800
  - Restitution: 0.8
  - Friction: 0.95
  - Air resistance: 0.999
- **Features**:
  - Collision detection with boundaries and goals
  - Visual effects (trail, shadow, rotation)
  - Goal detection and scoring

#### 6. Player Class (`js/classes/Player.js`)
**Purpose**: Player character implementation
- **Physics Properties**:
  - Movement speed: 300 px/s
  - Jump power: -600
  - Gravity: 800
  - Kick range: 80px
  - Kick power: 800
- **Features**:
  - Keyboard input handling (WASD for P1, Arrows for P2)
  - Ball collision and kicking
  - Animation and visual effects

#### 7. Physics Engine (`js/physics.js`)
**Purpose**: Physics calculations using Matter.js
- **Components**:
  - Physics engine wrapper
  - Boundary creation
  - Body management (circles, rectangles)
  - Collision detection helpers
  - Physics utilities (distance, angle, vectors)
  - Particle system for visual effects

#### 8. Game State Manager (`js/gameStateManager.js`)
**Purpose**: Client-side state management (currently placeholder)

## Synchronization Events

### Player Movement
- **Event**: `movement_update`
- **Data**: position, velocity, direction, sequence number
- **Flow**: Client → Server (validation) → Broadcast to other clients

### Ball Updates
- **Event**: `ball_update`
- **Data**: position, velocity, spin, lastTouchedBy
- **Authority**: Last player to touch the ball
- **Priority**: HIGH

### Score Synchronization
- **Event**: `score_update`
- **Data**: matchId, current score, scorer info
- **Validation**: Server validates before broadcasting

### Goal Events
- **Event**: `goal_scored`
- **Data**: scorer, position, velocity, goalType
- **Features**: 3-second cooldown, ball reset

### Timer Synchronization
- **Event**: `timer_update` / `timer_sync`
- **Purpose**: Keep game timers synchronized across clients

### Game State Sync
- **Event**: `game_state_sync`
- **Purpose**: Full state synchronization (on join/reconnect)

### Collision Events
- **Event**: `collisionEvent`
- **Purpose**: Validate player-ball collisions server-side

## Multiplayer Flow

### 1. Connection & Authentication
```
Client → authenticate → Server
Server → player_authenticated → Client
```

### 2. Matchmaking
```
Client → join_matchmaking → Server
Server → match_found → Both Clients
```

### 3. Game Loop
```
Client A → movement_update → Server
Server (validates) → movement_update → Client B

Client A → ball_update (if authority) → Server  
Server (validates) → ball_update → All Clients
```

### 4. Goal Scoring
```
Client → goal_attempt → Server
Server (validates) → goal_scored → All Clients
Server → reset ball after cooldown
```

## Performance Optimizations

### Lag Compensation
- Server tracks player latencies
- Movement predictions based on velocity
- Position interpolation for smooth gameplay

### Update Frequencies
- Physics tick: 60 Hz (server)
- State broadcast: 20 Hz (reduced from physics rate)
- Input rate limits prevent flooding

### Message Prioritization
1. **CRITICAL**: Goals, game state changes
2. **HIGH**: Ball updates, collisions
3. **MEDIUM**: Player movements
4. **LOW**: Non-gameplay data

## Anti-Cheat Measures

### Server-Side Validation
- Maximum speed limits enforced
- Position bounds checking
- Timestamp validation (max 1000ms drift)
- Input rate limiting
- Score progression validation

### Pattern Detection
- Impossible movement detection
- Input rate anomaly detection
- Bot-like pattern recognition
- Timing inconsistency checks

## Room Management

### Room States
- `WAITING`: Waiting for players
- `READY`: All players ready
- `PLAYING`: Game in progress
- `PAUSED`: Game paused
- `FINISHED`: Game completed
- `ABANDONED`: All players left

### Player Management
- Maximum 2 players per room
- Position assignment (left/right)
- Reconnection support
- Disconnect grace period (10 seconds)

## Configuration Parameters

### Physics Constants
- Field dimensions: 800x400
- Goal dimensions: 20x120
- Physics tick rate: 60 Hz
- Interpolation delay: 100ms

### Validation Limits
- Max player speed: 500 px/s
- Max ball speed: 800 px/s
- Max input rate: 60-120 per second
- Max timestamp drift: 1000ms

### Game Rules
- Score limit: 5 (ranked), 3 (casual)
- Time limit: 10 minutes
- Goal cooldown: 3 seconds
- Pause timeout: 30 seconds

## Future Improvements

### Planned Features
1. Spectator mode support
2. Replay system
3. Advanced lag compensation
4. Client-side prediction
5. Delta compression for state updates
6. WebRTC for peer-to-peer optimization

### Known Limitations
1. No client-side prediction (may feel laggy on high latency)
2. Basic interpolation only
3. Limited to 2 players per room
4. No reconnection state persistence