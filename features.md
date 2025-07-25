# Head Soccer - Game Features Documentation

## Overview
Head Soccer is a multiplayer 2D physics-based soccer game featuring customizable characters, real-time online multiplayer, and engaging gameplay mechanics. Built with HTML5, JavaScript (Phaser 3), Node.js, and WebSocket technology.

## Core Game Features

### 1. Game Modes

#### Single Player Mode
- **VS AI**: Play against computer-controlled opponent
- **AI Difficulty**: Adaptive AI with reaction timing and movement strategies
- **AI Behaviors**: 
  - Defensive positioning near goal
  - Aggressive ball chasing
  - Smart jumping and kicking timing
  - Predictive ball trajectory following

#### Multiplayer Mode
- **Online Matchmaking**: Real-time player matching system
- **Challenge System**: Direct player-to-player challenges
- **Ranked Matches**: Competitive gameplay with ELO-based ranking
- **Casual Matches**: Unranked fun matches
- **Tournament Mode**: Structured competitive play

### 2. Gameplay Mechanics

#### Physics System
- **Realistic Ball Physics**: 
  - Gravity: 1200 units/s²
  - Bounce factor: 0.8
  - Air resistance simulation
  - Spin and rotation effects
  
- **Player Physics**:
  - Gravity: 800 units/s²
  - Jump height: -600 velocity
  - Movement speed: 300 units/s
  - Friction: 0.85
  - Ground detection with threshold

#### Controls
- **Player 1 (Single Player AI or Human)**:
  - Movement: A/D keys
  - Jump: W key
  - Kick: S key
  
- **Player 2 (Human)**:
  - Movement: Arrow Left/Right
  - Jump: Arrow Up
  - Kick: Arrow Down
  
- **Global Controls**:
  - Pause: P key
  - Reset: R key (single player only)

#### Kick Mechanics
- **Dynamic Kick Power**: Random force between 15-25 units
- **Directional Kicking**: Ball direction based on contact angle
- **Kick Cooldown**: 30 frames prevent spam
- **Momentum Transfer**: Player velocity affects ball trajectory
- **Visual Feedback**: Animated cleat movement during kicks

### 3. Character Customization

#### Available Characters
1. **Nuwan** - Balanced stats
2. **Mihir** - Slightly larger head (1.05x, 1.12x scale)
3. **Dad** - Unique proportions (0.97x, 1x scale)

#### Cleat Selection
- 9 different cleat designs
- Visual customization only
- Persistent selection across games

### 4. Match System

#### Game Rules
- **Match Duration**: 90 seconds (customizable)
- **Goal Scoring**: Ball must enter opponent's goal area
- **Win Conditions**:
  - Higher score when time expires
  - First to reach score limit (if configured)
  - Opponent forfeit

#### Goal Celebration
- Dynamic goal text animation
- Randomized goal sounds (5 variations)
- Crowd cheer effects (4 variations)
- Visual effects and particles

### 5. Multiplayer Features

#### Real-time Synchronization
- **WebSocket Communication**: Low-latency player updates
- **Movement Sync**: 20 updates per second (50ms intervals)
- **Ball Authority**: Player 1 controls ball physics
- **State Reconciliation**: Server-authoritative gameplay

#### Matchmaking System
- **Queue Management**: Automated player pairing
- **Skill-based Matching**: ELO rating consideration
- **Region Support**: Latency-optimized matching
- **Ready System**: Both players must confirm

#### Character Selection Room
- **Real-time Updates**: See opponent's selections
- **Ready States**: Synchronized ready status
- **Selection Broadcasting**: Instant character/cleat updates

### 6. User Interface

#### Menu System
- **Main Menu**: 
  - Animated particle background
  - Login/Register integration
  - Responsive design
  
- **Mode Selection**:
  - Single Player option
  - Multiplayer option
  - Visual mode indicators
  
- **Character Selection**:
  - Grid-based character display
  - Cleat carousel selection
  - Ready button system
  - Opponent status display

#### In-Game UI
- **Score Display**: Real-time score updates
- **Timer**: Countdown timer with pause support
- **Player Names**: Display usernames in multiplayer
- **FPS Counter**: Performance monitoring
- **Debug Panel**: Position and velocity info (dev mode)

### 7. Audio System

#### Sound Effects
- **Kick Sounds**: Ball contact audio
- **Goal Sounds**: 5 randomized celebration tracks
- **Crowd Cheers**: 4 ambient crowd reactions
- **UI Sounds**: 
  - Menu hover effects
  - Selection confirmation
  - Countdown beeps
  - Game start fanfare

#### Background Audio
- **Crowd Ambience**: Looping stadium atmosphere
- **Volume Control**: Adjustable master volume
- **3D Positional Audio**: Spatial sound effects

### 8. Visual Effects

#### Particle System
- **Background Particles**: 
  - Space-themed floating orbs
  - Dynamic connections between particles
  - Mouse interaction effects
  - Color variations (blue, pink, yellow, green)

#### Field Design
- **Space Theme**: 
  - Gradient space background
  - Glowing platform edges
  - Energy field center line
  - Pulsing center circle
  - Star field generation

#### Animations
- **Ball Rotation**: Physics-based spinning
- **Kick Animation**: Cleat forward motion
- **Goal Celebration**: Bouncing text effect
- **Character Idle**: Subtle floating effect

### 9. Backend Features

#### Authentication System
- **User Registration**: Username/password with display names
- **Secure Login**: JWT token-based authentication
- **Session Management**: Persistent login states
- **Guest Mode**: Limited single-player access

#### Database Integration
- **Supabase Backend**: PostgreSQL database
- **Player Statistics**:
  - Games played/won/lost
  - Goals scored/conceded
  - Win rate tracking
  - Play time statistics
  - Peak rating

#### Leaderboards
- **Global Rankings**: Top players by rating
- **Seasonal Boards**: Time-limited competitions
- **Category Filters**:
  - By region
  - By game mode
  - By time period

### 10. Network Architecture

#### Server Infrastructure
- **Node.js Backend**: Express.js framework
- **Socket.IO**: Real-time bidirectional communication
- **Redis Caching**: Session and matchmaking data
- **Rate Limiting**: Anti-spam protection
- **Connection Management**: Reconnection support

#### Game Events
- **Event Validation**: Server-side input verification
- **Anti-Cheat**: Position and physics validation
- **Lag Compensation**: Client-side prediction
- **State Synchronization**: Authoritative server updates

### 11. Performance Optimization

#### Client-Side
- **Fixed Timestep**: Consistent 60 FPS physics
- **Asset Preloading**: Smooth gameplay start
- **Sprite Pooling**: Reduced memory allocation
- **Efficient Rendering**: Dirty rectangle updates

#### Server-Side
- **Connection Pooling**: Database optimization
- **Event Batching**: Reduced network overhead
- **Memory Management**: Automatic cleanup
- **Resource Monitoring**: Performance tracking

### 12. Additional Features

#### Pause System
- **Single Player**: Full pause functionality
- **Multiplayer**: Synchronized pause requests
- **Timer Management**: Accurate time tracking

#### Game End Handling
- **Result Screen**: Winner announcement
- **Statistics Display**: Match summary
- **Navigation Options**:
  - Play again
  - Return to menu
  - View leaderboard

#### Error Handling
- **Connection Loss**: Graceful disconnection
- **Reconnection**: Automatic rejoin attempts
- **Match Recovery**: State restoration
- **User Feedback**: Clear error messages

## Technical Specifications

### Frontend Technologies
- **Framework**: Phaser 3 game engine
- **Language**: JavaScript (ES6+)
- **Styling**: Custom CSS with animations
- **Build**: Vanilla JS (no bundler required)

### Backend Technologies
- **Runtime**: Node.js v18+
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Cache**: Redis
- **WebSocket**: Socket.IO

### Deployment
- **Frontend**: Vercel hosting
- **Backend**: Railway platform
- **Database**: Supabase cloud
- **CDN**: Automatic asset delivery

## Future Enhancements
- Power-ups and special abilities
- More character options
- Tournament brackets
- Spectator mode
- Replay system
- Mobile touch controls
- Custom field themes
- Team-based modes