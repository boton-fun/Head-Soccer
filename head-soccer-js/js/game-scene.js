/**
 * Game Scene - JavaScript physics replication
 * Replicates the exact physics from the JavaScript src/ implementation
 */

class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        
        // Game objects
        this.player1 = null;
        this.player2 = null;
        this.ball = null;
        this.boundaries = [];
        
        // Input states
        this.cursors = null;
        this.keys = null;
        
        // Debug elements
        this.fpsText = null;
        
        // Visual elements
        this.ballSprite = null;
        this.player1Sprite = null;
        this.player2Sprite = null;
        
        // Game state - fullscreen
        this.gameWidth = window.innerWidth;
        this.gameHeight = window.innerHeight;
        this.bottomGap = 40; // Reduced to give more playground space
        
        // Initialize character selections with defaults
        this.player1Head = 'Mihir';
        this.player2Head = 'Nuwan';
        this.player1Cleat = 8;
        this.player2Cleat = 3;
        
        // Goal state tracking to prevent multiple goals
        this.goalCooldown = 0;
        this.goalCooldownDuration = 120; // 2 seconds at 60fps
    }
    
    preload() {
        console.log('Preloading assets...');
        
        // Load ball image
        this.load.image('ball', 'assets/Ball 01.png');
        this.load.image('goalSide', 'assets/Goal - Side.png');
        
        // Load character heads with error handling
        this.load.image('NuwanHead', 'assets/Nuwan_Head.png');
        this.load.image('MihirHead', 'assets/Mihir_Head.png');
        this.load.image('DadHead', 'assets/Dad_Head.png');
        
        // Add error listeners for missing assets
        this.load.on('loaderror', (file) => {
            console.warn('Failed to load asset:', file.src);
        });
        
        // Load cleats
        for (let i = 1; i <= 9; i++) {
            this.load.image(`cleat${i}`, `assets/Cleat ${i}.png`);
        }
        
        console.log('Loading ball, goal, character, and cleat assets');
    }
    
    create() {
        console.log('=== JAVASCRIPT PHYSICS REPLICATION ===');
        console.log('Ball Gravity:', PHYSICS_CONSTANTS.BALL.GRAVITY);
        console.log('Player Gravity:', PHYSICS_CONSTANTS.PLAYER.GRAVITY);
        console.log('Field:', this.gameWidth, 'x', this.gameHeight);
        
        // Load character selections
        this.loadCharacterSelections();
        
        // Create visual field background
        this.createFieldVisuals();
        
        // Create players
        this.createPlayers();
        
        // Initialize kick animation states
        this.player1KickAnimation = { active: false, timer: 0, maxDuration: 10 };
        this.player2KickAnimation = { active: false, timer: 0, maxDuration: 10 };
        
        // Track previous kick states to detect button press
        this.player1PrevKick = false;
        this.player2PrevKick = false;
        
        // Track kick input for network updates (persistent until sent)
        this.player1KickPressed = false;
        this.player2KickPressed = false;
        
        // Phase 2: Client-Side Prediction System
        this.inputBuffer = []; // Store inputs with timestamps for prediction
        this.maxInputHistory = 60; // 1 second at 60fps
        this.serverReconciliation = false; // Enable/disable server reconciliation
        this.lastServerUpdate = 0; // Timestamp of last server update
        
        // Phase 3: Interpolation System for Remote Players
        this.remotePlayerBuffers = {
            player1: [], // Position buffer for player 1
            player2: []  // Position buffer for player 2
        };
        this.maxPositionHistory = 5; // Store last 5 position updates
        this.interpolationDelay = 100; // 100ms behind latest update
        this.extrapolationLimit = 200; // Max 200ms extrapolation
        
        // Track last collision frame to prevent multiple rapid collisions
        this.lastCollisionFrame = { player1: -100, player2: -100 };
        this.frameCount = 0;
        
        // Create ball
        this.createBall();
        
        // Create goal areas
        this.createGoalAreas();
        
        // Set up input
        this.setupInput();
        
        // Create debug text
        this.createDebugText();
        
        // Initialize score
        this.initializeScore();
        
        // Initialize goal cooldown to prevent multiple goal triggers
        this.goalCooldown = 0;
        
        // Initialize game state
        this.gameState = 'playing'; // 'playing', 'paused', 'ended'
        this.isPaused = false;
        
        // AI system for Player 1
        this.aiEnabled = true;
        this.initializeAI();
        
        // Make this scene globally accessible for timer communication
        window.gameScene = this;
        
        // Movement sync throttling for multiplayer
        this.lastMovementSent = 0;
        this.movementSendInterval = 50; // Send updates every 50ms (20 times per second)
        
        // Ball sync throttling for multiplayer - FAST sync for real-time feel
        this.lastBallSent = 0;
        this.ballSendInterval = 16; // Send ball updates every 16ms (60 times per second - matches game FPS)
        this.ballAuthority = false; // Will be set based on player role
        
        // Phase 3.5: Unified ground calculation
        this.GROUND_Y = null; // Will be calculated after field dimensions are set
        
        console.log('Game scene created successfully');
    }
    
    // Phase 3.5: Unified ground calculation helper
    getGroundY() {
        return this.GROUND_Y;
    }
    
    // Phase 3.5: Check if player is remote (not controlled by this client)
    isRemotePlayer(playerNumber) {
        if (!this.isMultiplayer) return false;
        return (this.playerNumber === 1 && playerNumber === 2) || 
               (this.playerNumber === 2 && playerNumber === 1);
    }
    
    createFieldVisuals() {
        // Create space-themed field graphics
        const graphics = this.add.graphics();
        
        // Space background gradient
        graphics.fillGradientStyle(0x000011, 0x000011, 0x001133, 0x001133, 1);
        graphics.fillRect(0, 0, this.gameWidth, this.gameHeight);
        
        // Add stars
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * this.gameWidth;
            const y = Math.random() * this.gameHeight;
            const size = Math.random() * 2 + 0.5;
            const brightness = Math.random() * 0.8 + 0.2;
            
            graphics.fillStyle(0xffffff, brightness);
            graphics.fillCircle(x, y, size);
        }
        
        // Space platform/ground
        // Phase 3.5: Calculate unified ground position
        this.GROUND_Y = this.gameHeight - this.bottomGap - PHYSICS_CONSTANTS.PLAYER.HEIGHT;
        const groundY = this.gameHeight - this.bottomGap;
        graphics.fillGradientStyle(0x2a2a4a, 0x2a2a4a, 0x1a1a3a, 0x1a1a3a, 1);
        graphics.fillRect(0, groundY, this.gameWidth, this.bottomGap);
        
        // Glowing platform edge
        graphics.lineStyle(3, 0x66ccff, 0.8);
        graphics.beginPath();
        graphics.moveTo(0, groundY);
        graphics.lineTo(this.gameWidth, groundY);
        graphics.strokePath();
        
        // Energy center line
        graphics.lineStyle(4, 0x00ffff, 0.6);
        graphics.beginPath();
        graphics.moveTo(this.gameWidth / 2, 0);
        graphics.lineTo(this.gameWidth / 2, groundY);
        graphics.strokePath();
        
        // Add pulsing center circle
        const centerX = this.gameWidth / 2;
        const centerY = groundY / 2;
        graphics.lineStyle(3, 0x00ffff, 0.4);
        graphics.strokeCircle(centerX, centerY, 50);
        graphics.strokeCircle(centerX, centerY, 80);
        
        // Add goal images
        const goalHeight = 180; // Reduced height to fit screen better
        const goalWidth = 80;   // Reduced width to fit screen better
        
        // Left goal (Goal - Side.png)
        this.leftGoalSprite = this.add.image(goalWidth/2, groundY - goalHeight/2, 'goalSide');
        this.leftGoalSprite.setScale(0.5); // Smaller scale to fit screen better
        this.leftGoalSprite.setDepth(5);
        
        // Right goal (flipped Goal - Side.png)
        this.rightGoalSprite = this.add.image(this.gameWidth - goalWidth/2, groundY - goalHeight/2, 'goalSide');
        this.rightGoalSprite.setScale(0.5); // Smaller scale to fit screen better
        this.rightGoalSprite.setFlipX(true); // Flip horizontally for right goal
        this.rightGoalSprite.setDepth(5);
        
        console.log('Space field visuals created');
    }
    
    initializeAI() {
        // Simple AI state and parameters
        this.ai = {
            // Reaction parameters
            reactionTime: 200, // ms delay for more realistic reactions
            lastReactionTime: 0,
            
            // Behavior parameters
            aggressiveness: 0.7, // How likely to go for ball vs defensive play
            kickTiming: 0.8, // How good at timing kicks (0-1)
            
            // Current AI decisions
            targetX: 200,
            shouldJump: false,
            shouldKick: false,
            
            // AI states
            state: 'defending', // 'defending', 'attacking', 'chasing'
            lastStateChange: 0,
            
            // Performance tracking
            ballDistance: Infinity,
            lastBallX: 0,
            ballVelocityPrediction: { x: 0, y: 0 }
        };
        
        console.log('Simple AI initialized for Player 1');
    }
    
    loadCharacterSelections() {
        console.log('📋 loadCharacterSelections() CALLED at timestamp:', Date.now());
        console.log('📋 Current URL:', window.location.href);
        
        // Check if this is a multiplayer game by looking at the page URL
        const isMultiplayerPage = window.location.href.includes('gameplay-multiplayer.html');
        console.log('📋 isMultiplayerPage detected:', isMultiplayerPage);
        
        // Skip localStorage loading if this will be a multiplayer game
        // (multiplayer selections will be set via setMultiplayerMode)
        if (isMultiplayerPage) {
            console.log('🎮 Multiplayer page detected - skipping localStorage character loading');
            // Don't override any values that may have been set by setMultiplayerMode
            console.log('🎯 Current character values when skipping localStorage:', {
                player1Head: this.player1Head,
                player2Head: this.player2Head,
                player1Cleat: this.player1Cleat,
                player2Cleat: this.player2Cleat
            });
            return;
        }
        
        // Load character selections from localStorage or use defaults (single-player only)
        const savedSettings = localStorage.getItem('headSoccerSettings');
        
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            this.player1Head = settings.player1Head || 'Mihir';
            this.player2Head = settings.player2Head || 'Nuwan'; 
            this.player1Cleat = settings.player1Cleat || 8;
            this.player2Cleat = settings.player2Cleat || 3;
        } else {
            // Default selections
            this.player1Head = 'Mihir';
            this.player2Head = 'Nuwan';
            this.player1Cleat = 8;
            this.player2Cleat = 3;
        }
        
        console.log('Character selections loaded from localStorage:', {
            player1: { head: this.player1Head, cleat: this.player1Cleat },
            player2: { head: this.player2Head, cleat: this.player2Cleat }
        });
    }
    
    createPlayers() {
        console.log('🏗️ createPlayers() CALLED at timestamp:', Date.now());
        console.log('🏗️ createPlayers() called with character heads:', {
            player1Head: this.player1Head,
            player2Head: this.player2Head,
            isMultiplayer: this.isMultiplayer,
            multiplayerGameExists: !!this.multiplayerGame
        });
        
        const playerStartX = this.gameWidth * 0.2; // Adjusted for fullscreen
        const playerY = this.getGroundY(); // Phase 3.5: Use unified ground calculation
        
        // Create Player 1 (left side, blue)
        this.player1 = {
            x: playerStartX,
            y: playerY,
            width: PHYSICS_CONSTANTS.PLAYER.WIDTH,
            height: PHYSICS_CONSTANTS.PLAYER.HEIGHT,
            velocity: { x: 0, y: 0 },
            onGround: false,
            color: 0x0088ff,
            kickCooldown: 0
        };
        
        // Create Player 2 (right side, red)
        this.player2 = {
            x: this.gameWidth - playerStartX - PHYSICS_CONSTANTS.PLAYER.WIDTH,
            y: playerY,
            width: PHYSICS_CONSTANTS.PLAYER.WIDTH,
            height: PHYSICS_CONSTANTS.PLAYER.HEIGHT,
            velocity: { x: 0, y: 0 },
            onGround: false,
            color: 0xff0000,
            kickCooldown: 0
        };
        
        // Create player sprites using actual character heads
        // Player 1 Head
        const player1HeadKey = this.player1Head + 'Head';
        
        console.log('🎭 Creating Player 1 sprite:', {
            player1Head: this.player1Head,
            player1HeadKey: player1HeadKey,
            textureExists: this.textures.exists(player1HeadKey),
            availableTextures: this.textures.list
        });
        
        // Check if the texture exists before trying to use it
        if (this.textures.exists(player1HeadKey)) {
            console.log('✅ Loading Player 1 head:', player1HeadKey);
            this.player1Sprite = this.add.image(
                this.player1.x + this.player1.width / 2,
                this.player1.y + this.player1.height / 4, // Moved up from height/2
                player1HeadKey
            );
        } else {
            console.warn('Player 1 head texture not found:', player1HeadKey, 'Using fallback');
            // Fallback to a colored circle if image fails
            this.player1Sprite = this.add.circle(
                this.player1.x + this.player1.width / 2,
                this.player1.y + this.player1.height / 4, // Moved up from height/2
                25,
                0x0088ff
            );
        }
        
        // Apply head scaling from config
        if (this.player1Sprite.texture) {
            // Define head scaling locally to avoid CONFIG dependency
            const headScales = {
                'Nuwan': [1, 1],
                'Mihir': [1.05, 1.12],
                'Dad': [0.97, 1]
            };
            const player1Scale = headScales[this.player1Head] || [1, 1];
            const headSize = 80; // Base head size for the game (increased from 50)
            this.player1Sprite.setScale(
                (headSize / this.player1Sprite.width) * player1Scale[0],
                (headSize / this.player1Sprite.height) * player1Scale[1]
            );
        }
        this.player1Sprite.setDepth(10);
        
        // Player 2 Head
        const player2HeadKey = this.player2Head + 'Head';
        
        console.log('🎭 Creating Player 2 sprite:', {
            player2Head: this.player2Head,
            player2HeadKey: player2HeadKey,
            textureExists: this.textures.exists(player2HeadKey),
            availableTextures: this.textures.list
        });
        
        // Check if the texture exists before trying to use it
        if (this.textures.exists(player2HeadKey)) {
            console.log('✅ Loading Player 2 head:', player2HeadKey);
            this.player2Sprite = this.add.image(
                this.player2.x + this.player2.width / 2,
                this.player2.y + this.player2.height / 4, // Moved up from height/2
                player2HeadKey
            );
        } else {
            console.warn('Player 2 head texture not found:', player2HeadKey, 'Using fallback');
            // Fallback to a colored circle if image fails
            this.player2Sprite = this.add.circle(
                this.player2.x + this.player2.width / 2,
                this.player2.y + this.player2.height / 4, // Moved up from height/2
                25,
                0xff4444
            );
        }
        
        // Apply head scaling from config
        if (this.player2Sprite.texture) {
            // Define head scaling locally to avoid CONFIG dependency
            const headScales = {
                'Nuwan': [1, 1],
                'Mihir': [1.05, 1.12],
                'Dad': [0.97, 1]
            };
            const player2Scale = headScales[this.player2Head] || [1, 1];
            const headSize = 80; // Base head size for the game (increased from 50)
            this.player2Sprite.setScale(
                (headSize / this.player2Sprite.width) * player2Scale[0],
                (headSize / this.player2Sprite.height) * player2Scale[1]
            );
        }
        this.player2Sprite.setDepth(10);
        
        // Create player cleats
        const player1CleatKey = `cleat${this.player1Cleat}`;
        if (this.textures.exists(player1CleatKey)) {
            console.log('Loading Player 1 cleat:', player1CleatKey);
            this.player1Foot = this.add.image(
                this.player1.x + this.player1.width / 2,
                this.player1.y + this.player1.height - 5, // Moved above bottom line
                player1CleatKey
            );
            const cleatSize = 40; // Base cleat size (increased from 25)
            this.player1Foot.setScale(cleatSize / this.player1Foot.width);
            this.player1Foot.setDepth(8);
        } else {
            console.warn('Player 1 cleat texture not found:', player1CleatKey, 'Using fallback');
            // Fallback to a colored rectangle if image fails
            this.player1Foot = this.add.rectangle(
                this.player1.x + this.player1.width / 2,
                this.player1.y + this.player1.height - 5, // Moved above bottom line
                30, // Increased width
                15, // Increased height
                0x000000
            );
            this.player1Foot.setDepth(8);
        }
        
        const player2CleatKey = `cleat${this.player2Cleat}`;
        if (this.textures.exists(player2CleatKey)) {
            console.log('Loading Player 2 cleat:', player2CleatKey);
            this.player2Foot = this.add.image(
                this.player2.x + this.player2.width / 2,
                this.player2.y + this.player2.height - 5, // Moved above bottom line
                player2CleatKey
            );
            const cleatSize = 40; // Base cleat size (increased from 25)
            this.player2Foot.setScale(cleatSize / this.player2Foot.width);
            this.player2Foot.setDepth(8);
        } else {
            console.warn('Player 2 cleat texture not found:', player2CleatKey, 'Using fallback');
            // Fallback to a colored rectangle if image fails
            this.player2Foot = this.add.rectangle(
                this.player2.x + this.player2.width / 2,
                this.player2.y + this.player2.height - 5, // Moved above bottom line
                30, // Increased width
                15, // Increased height
                0x000000
            );
            this.player2Foot.setDepth(8);
        }
        
        console.log('Players created at Y:', playerY);
    }
    
    createBall() {
        const ballStartX = this.gameWidth * 0.5; // Center for fullscreen
        const ballStartY = this.gameHeight * 0.3; // Adjusted for fullscreen
        const ballRadius = PHYSICS_CONSTANTS.BALL.RADIUS;
        
        // Create ball object
        this.ball = {
            x: ballStartX - ballRadius,
            y: ballStartY - ballRadius,
            width: ballRadius * 2,
            height: ballRadius * 2,
            velocity: { x: 0, y: 0 },
            radius: ballRadius
        };
        
        // Create ball sprite using the Ball 01.png image
        this.ballSprite = this.add.image(ballStartX, ballStartY, 'ball');
        this.ballSprite.setScale(0.25); // Increased size for better visibility
        this.ballSprite.setDepth(10); // Bring to front
        
        console.log('Ball created at:', ballStartX, ballStartY);
    }
    
    createGoalAreas() {
        const groundY = this.gameHeight - this.bottomGap;
        const goalWidth = 80;  // Reduced for better screen fit
        const goalHeight = 180; // Reduced for better screen fit
        
        // Left goal area (Player 2 scores here)
        this.leftGoal = {
            x: 0,
            y: groundY - goalHeight,
            width: goalWidth,
            height: goalHeight,
            team: 'player2' // Player 2 scores when ball enters left goal
        };
        
        // Right goal area (Player 1 scores here)
        this.rightGoal = {
            x: this.gameWidth - goalWidth,
            y: groundY - goalHeight,
            width: goalWidth,
            height: goalHeight,
            team: 'player1' // Player 1 scores when ball enters right goal
        };
        
        // Goal area visual indicators removed for cleaner appearance
        
        console.log('Goal areas created - Left:', this.leftGoal, 'Right:', this.rightGoal);
    }
    
    setupInput() {
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys({
            'W': Phaser.Input.Keyboard.KeyCodes.W,
            'A': Phaser.Input.Keyboard.KeyCodes.A,
            'S': Phaser.Input.Keyboard.KeyCodes.S,
            'D': Phaser.Input.Keyboard.KeyCodes.D,
            'R': Phaser.Input.Keyboard.KeyCodes.R,
            'P': Phaser.Input.Keyboard.KeyCodes.P
        });
    }
    
    createDebugText() {
        // Create FPS counter
        this.fpsText = this.add.text(10, 10, 'FPS: 0', {
            font: '16px Arial',
            fill: '#00ff00'
        });
    }
    
    update(time, delta) {
        this.frameCount++;
        
        // Phase 3.5: Delta time normalization
        const targetDelta = 1000 / 60; // 16.67ms for 60fps
        const deltaRatio = Math.min(delta / targetDelta, 2); // Cap at 2x to prevent huge jumps
        
        // Update FPS counter
        document.getElementById('fps').textContent = Math.round(this.game.loop.actualFps);
        
        // Update debug positions
        if (this.player1) {
            document.getElementById('p1pos').textContent = 
                `${Math.round(this.player1.x)},${Math.round(this.player1.y)}`;
        }
        if (this.player2) {
            document.getElementById('p2pos').textContent = 
                `${Math.round(this.player2.x)},${Math.round(this.player2.y)}`;
        }
        if (this.ball) {
            document.getElementById('ballpos').textContent = 
                `${Math.round(this.ball.x)},${Math.round(this.ball.y)}`;
        }
        
        // Handle pause toggle
        if (Phaser.Input.Keyboard.JustDown(this.keys.P)) {
            this.togglePause();
        }
        
        // Only update game if not paused and game is playing
        if (!this.isPaused && this.gameState === 'playing') {
            // Update AI for Player 1
            if (this.aiEnabled) {
                this.updateAI(time);
            }
            
            // Update player physics
            this.updatePlayer(this.player1, this.player1Sprite, 'left', deltaRatio);
            this.updatePlayer(this.player2, this.player2Sprite, 'right', deltaRatio);
            
            // Send movement updates in multiplayer mode
            if (this.isMultiplayer && this.multiplayerGame) {
                this.sendMovementUpdates();
                // DISABLED: Ball sync removed for single-player physics replication
                // this.sendBallUpdates();
                
                // Phase 3: Update remote player interpolation
                this.updateRemotePlayerInterpolation();
            }
            
            // Update ball physics
            this.updateBall();
            
            // Check collisions
            this.checkCollisions();
            
            // Check for goals
            this.checkGoals();
        }
        
        // Handle full game reset (works even when paused)
        if (Phaser.Input.Keyboard.JustDown(this.keys.R)) {
            this.resetGame();
        }
    }
    
    updatePlayer(player, sprite, side, deltaRatio = 1) {
        if (!player) return;
        
        // Phase 3.5: Check if this is a remote player
        const playerNumber = side === 'left' ? 1 : 2;
        const isRemote = this.isRemotePlayer(playerNumber);
        
        // Skip physics for remote players - they are controlled by interpolation
        if (isRemote) {
            // Only update sprite position for remote players
            sprite.x = player.x + player.width / 2;
            sprite.y = player.y + player.height / 4;
            
            // Update foot position
            if (side === 'left' && this.player1Foot) {
                this.updateCleatPosition(this.player1Foot, player, this.player1KickAnimation, 'left');
            } else if (side === 'right' && this.player2Foot) {
                this.updateCleatPosition(this.player2Foot, player, this.player2KickAnimation, 'right');
            }
            return; // Exit early for remote players
        }
        
        // Get input based on player side
        let moveLeft, moveRight, jump, kick;
        
        if (this.isMultiplayer) {
            // In multiplayer mode, each player controls their own character
            const isLocalPlayer = this.multiplayerGame ? 
                (side === 'left' && this.multiplayerGame.matchData.isPlayer1) ||
                (side === 'right' && !this.multiplayerGame.matchData.isPlayer1) : false;
            
            if (isLocalPlayer) {
                // This client controls this player directly
                moveLeft = this.cursors.left.isDown;
                moveRight = this.cursors.right.isDown;
                jump = this.cursors.up.isDown;
                kick = this.cursors.down.isDown;
            } else {
                // Other player controlled by network input
                if (this.opponentInput && this.opponentInput.side === side) {
                    moveLeft = this.opponentInput.moveLeft;
                    moveRight = this.opponentInput.moveRight;
                    jump = this.opponentInput.jump;
                    kick = this.opponentInput.kick;
                    // Clear opponent input after use to prevent sticking
                    this.opponentInput = null;
                } else {
                    moveLeft = false;
                    moveRight = false;
                    jump = false;
                    kick = false;
                }
            }
        } else {
            // Single player mode - original controls
            if (side === 'left') {
                // Player 1 controls (AI or WASD)
                if (this.aiEnabled) {
                    // Use AI decisions with movement threshold
                    const playerCenterX = player.x + player.width / 2;
                    const distanceToTarget = Math.abs(this.ai.targetX - playerCenterX);
                    const movementThreshold = 10; // Minimum distance before moving
                    
                    moveLeft = this.ai.targetX < playerCenterX - movementThreshold;
                    moveRight = this.ai.targetX > playerCenterX + movementThreshold;
                    jump = this.ai.shouldJump;
                    kick = this.ai.shouldKick;
                } else {
                    // Human controls (WASD)
                    moveLeft = this.keys.A.isDown;
                    moveRight = this.keys.D.isDown;
                    jump = this.keys.W.isDown;
                    kick = this.keys.S.isDown;
                }
            } else {
                // Player 2 controls (Arrows)
                moveLeft = this.cursors.left.isDown;
                moveRight = this.cursors.right.isDown;
                jump = this.cursors.up.isDown;
                kick = this.cursors.down.isDown;
            }
        }
        
        // Store kick state on player for collision detection
        player.isKicking = kick;
        
        // Phase 2: Client-Side Prediction - Capture input for local player
        if (this.isMultiplayer && this.multiplayerGame) {
            const isLocalPlayer = (side === 'left' && this.multiplayerGame.matchData.isPlayer1) ||
                                (side === 'right' && !this.multiplayerGame.matchData.isPlayer1);
            
            if (isLocalPlayer) {
                // Capture input with timestamp for prediction
                const inputData = {
                    timestamp: Date.now(),
                    frameNumber: this.frameCount,
                    moveLeft,
                    moveRight,
                    jump,
                    kick,
                    side,
                    // Store current state before applying input
                    stateBefore: {
                        x: player.x,
                        y: player.y,
                        velocityX: player.velocity.x,
                        velocityY: player.velocity.y,
                        onGround: player.onGround
                    }
                };
                
                // Add to input buffer
                this.addInputToBuffer(inputData);
                
                // Send input data to server (if any input is active)
                if (moveLeft || moveRight || jump || kick) {
                    this.multiplayerGame.sendPlayerInput({
                        moveLeft,
                        moveRight,
                        jump,
                        kick,
                        side,
                        timestamp: inputData.timestamp,
                        frameNumber: inputData.frameNumber
                    });
                }
            }
        }
        
        // Trigger kick animation on button press (not collision)
        if (side === 'left') {
            if (kick && !this.player1PrevKick) {
                // Kick button just pressed
                this.triggerKickAnimation('left');
                this.player1KickPressed = true; // Mark for network update
            }
            this.player1PrevKick = kick;
        } else {
            if (kick && !this.player2PrevKick) {
                // Kick button just pressed
                this.triggerKickAnimation('right');
                this.player2KickPressed = true; // Mark for network update
            }
            this.player2PrevKick = kick;
        }
        
        // Apply gravity (from Character.js)
        // Phase 3.5: Use delta ratio for consistent physics across browsers
        player.velocity.y += PHYSICS_CONSTANTS.PLAYER.GRAVITY;
        
        // Horizontal movement (from Character.js)
        if (moveLeft) {
            player.velocity.x = -PHYSICS_CONSTANTS.PLAYER.MOVE_SPEED;
        } else if (moveRight) {
            player.velocity.x = PHYSICS_CONSTANTS.PLAYER.MOVE_SPEED;
        } else {
            // Apply friction
            player.velocity.x *= PHYSICS_CONSTANTS.PLAYER.FRICTION;
        }
        
        // Check if on ground
        // Phase 3.5: Use unified ground calculation
        player.onGround = player.y >= this.getGroundY() - PHYSICS_CONSTANTS.PLAYER.GROUND_THRESHOLD;
        
        // Jump (from Character.js)
        if (jump && player.onGround) {
            player.velocity.y = -PHYSICS_CONSTANTS.PLAYER.JUMP_HEIGHT;
            player.onGround = false;
        }
        
        // Apply velocity
        player.x += player.velocity.x;
        player.y += player.velocity.y;
        
        // Constrain to game area
        this.constrainPlayerToGameArea(player);
        
        // Update sprite position
        sprite.x = player.x + player.width / 2;
        sprite.y = player.y + player.height / 4; // Moved up from height/2
        
        // Update foot position with kick animation
        if (side === 'left' && this.player1Foot) {
            this.updateCleatPosition(this.player1Foot, player, this.player1KickAnimation, 'left');
        } else if (side === 'right' && this.player2Foot) {
            this.updateCleatPosition(this.player2Foot, player, this.player2KickAnimation, 'right');
        }
        
        // Update kick cooldown
        if (player.kickCooldown > 0) {
            player.kickCooldown--;
        }
    }
    
    updateBall() {
        if (!this.ball) return;
        
        // REPLICATE SINGLE-PLAYER PHYSICS: Manual gravity exactly like gameplay.html
        // Apply gravity (from Ball.js) - NO network interference
        this.ball.velocity.y += PHYSICS_CONSTANTS.BALL.GRAVITY;
        
        // Apply velocity - Direct control like single-player
        this.ball.x += this.ball.velocity.x;
        this.ball.y += this.ball.velocity.y;
        
        // Update ball rotation based on velocity
        // Ball rotates as it moves (angle in degrees)
        const rotationSpeed = (this.ball.velocity.x / this.ball.radius) * 180 / Math.PI;
        this.ball.angle = (this.ball.angle || 0) + rotationSpeed;
        
        // Constrain to game area
        this.constrainBallToGameArea();
        
        // Update sprite position and rotation
        this.ballSprite.x = this.ball.x + this.ball.radius;
        this.ballSprite.y = this.ball.y + this.ball.radius;
        this.ballSprite.angle = this.ball.angle;
    }
    
    constrainPlayerToGameArea(player) {
        // Horizontal bounds
        if (player.x < 0) {
            player.x = 0;
            player.velocity.x = 0;
        } else if (player.x + player.width > this.gameWidth) {
            player.x = this.gameWidth - player.width;
            player.velocity.x = 0;
        }
        
        // Ground collision
        // Phase 3.5: Use unified ground calculation with snap tolerance
        const groundY = this.getGroundY();
        
        // If within 10 pixels of ground and moving down, snap to ground
        if (Math.abs(player.y - groundY) < 10 && player.velocity.y > 0) {
            player.y = groundY;
            player.velocity.y = 0;
            player.onGround = true;
        } else if (player.y > groundY) {
            // Force to ground if below it
            player.y = groundY;
            player.velocity.y = 0;
            player.onGround = true;
        }
    }
    
    constrainBallToGameArea() {
        const groundY = this.gameHeight - this.bottomGap;
        const ballBottom = this.ball.y + this.ball.height;
        const ballRight = this.ball.x + this.ball.width;
        
        // Ground collision (from Ball.js)
        if (ballBottom > groundY) {
            this.ball.y = groundY - this.ball.height;
            this.ball.velocity.y *= -PHYSICS_CONSTANTS.BALL.BOUNCE;
        }
        
        // Wall collisions
        if (this.ball.x < 0 || ballRight > this.gameWidth) {
            this.ball.x = this.ball.x < 0 ? 0 : this.gameWidth - this.ball.width;
            this.ball.velocity.x *= -PHYSICS_CONSTANTS.BALL.BOUNCE;
        }
    }
    
    checkCollisions() {
        // Check ball-player collisions
        if (PHYSICS_CONSTANTS.UTILS.isCollide(this.ball, this.player1)) {
            this.handleBallPlayerCollision(this.player1, 'left');
        }
        
        if (PHYSICS_CONSTANTS.UTILS.isCollide(this.ball, this.player2)) {
            this.handleBallPlayerCollision(this.player2, 'right');
        }
    }
    
    handleBallPlayerCollision(player, side) {
        const playerKey = side === 'left' ? 'player1' : 'player2';
        const framesSinceLastCollision = this.frameCount - this.lastCollisionFrame[playerKey];
        
        // Prevent multiple collisions in consecutive frames
        if (framesSinceLastCollision < 3) {
            console.log(`${side} player collision ignored - too soon (${framesSinceLastCollision} frames ago)`);
            return;
        }
        
        console.log(`Ball collision with ${side} player - isKicking: ${player.isKicking}, cooldown: ${player.kickCooldown}`);
        
        if (player.kickCooldown > 0) {
            console.log(`${side} player kick blocked by cooldown:`, player.kickCooldown);
            return;
        }
        
        // Update last collision frame
        this.lastCollisionFrame[playerKey] = this.frameCount;
        
        // Calculate direction - always away from player
        const directionX = this.ball.x - player.x;
        const directionY = this.ball.y - player.y;
        
        // Normalize the direction
        const magnitude = Math.sqrt(directionX * directionX + directionY * directionY);
        const normalizedX = directionX / magnitude;
        const normalizedY = directionY / magnitude;
        
        // Calculate player momentum impact
        const playerSpeedX = Math.abs(player.velocity.x);
        const playerSpeedY = Math.abs(player.velocity.y);
        const isJumping = player.velocity.y < -2; // Player moving upward significantly
        const isMovingFast = playerSpeedX > 3; // Player moving horizontally fast
        
        if (player.isKicking) {
            // ACTIVE KICK - Ball flies high
            const forceMagnitude = PHYSICS_CONSTANTS.UTILS.random(
                PHYSICS_CONSTANTS.KICK.FORCE_MIN, 
                PHYSICS_CONSTANTS.KICK.FORCE_MAX
            );
            
            // Apply strong force with very high upward component
            this.ball.velocity.x = normalizedX * forceMagnitude * 0.8;
            this.ball.velocity.y = Math.min(normalizedY * forceMagnitude, -forceMagnitude * 0.9);
            
            // Add player momentum to kick
            this.ball.velocity.x += player.velocity.x * 0.5;
            this.ball.velocity.y += player.velocity.y * 0.3;
            
            console.log(`Ball KICKED by ${side} player with force ${forceMagnitude.toFixed(1)} - velocity:`, {x: this.ball.velocity.x.toFixed(1), y: this.ball.velocity.y.toFixed(1)});
        } else if (isJumping || isMovingFast) {
            // DYNAMIC COLLISION - Player has momentum
            const momentumForce = Math.min(playerSpeedX + playerSpeedY, 15);
            const baseForce = Math.max(7, momentumForce);
            
            // Transfer player momentum to ball
            this.ball.velocity.x = normalizedX * baseForce + player.velocity.x * 0.7;
            
            if (isJumping) {
                // Jumping collision - transfer vertical momentum
                this.ball.velocity.y = Math.min(normalizedY * baseForce + player.velocity.y * 0.6, -8);
            } else {
                // Fast horizontal movement
                this.ball.velocity.y = Math.min(this.ball.velocity.y, -4);
            }
            
            console.log(`Ball hit by ${side} player with momentum (jumping: ${isJumping}, fast: ${isMovingFast}):`, this.ball.velocity);
        } else {
            // PASSIVE COLLISION - Ball rolls forward with moderate pace
            const pushForce = 7;
            
            this.ball.velocity.x = normalizedX * pushForce;
            this.ball.velocity.y = Math.min(this.ball.velocity.y, -2);
            
            console.log(`Ball PASSIVELY pushed by ${side} player collision - velocity:`, {x: this.ball.velocity.x.toFixed(1), y: this.ball.velocity.y.toFixed(1)});
        }
        
        // Ensure ball moves forward based on which player touched it
        if (side === 'left') {
            this.ball.velocity.x = Math.abs(this.ball.velocity.x);
        } else {
            this.ball.velocity.x = -Math.abs(this.ball.velocity.x);
        }
        
        // Set cooldown
        player.kickCooldown = PHYSICS_CONSTANTS.KICK.COOLDOWN;
    }
    
    triggerKickAnimation(side) {
        if (side === 'left') {
            this.player1KickAnimation.active = true;
            this.player1KickAnimation.timer = 0;
        } else {
            this.player2KickAnimation.active = true;
            this.player2KickAnimation.timer = 0;
        }
    }
    
    updateCleatPosition(cleat, player, kickAnimation, side) {
        // Base cleat position
        let cleatX = player.x + player.width / 2;
        let cleatY = player.y + player.height - 5; // Moved above bottom line
        
        // Handle kick animation
        if (kickAnimation.active) {
            kickAnimation.timer++;
            
            // Animation progress (0 to 1)
            const progress = kickAnimation.timer / kickAnimation.maxDuration;
            
            if (progress >= 1) {
                // Animation finished
                kickAnimation.active = false;
                kickAnimation.timer = 0;
            } else {
                // Apply kick animation offset
                // Cleat moves forward during kick
                const kickOffset = Math.sin(progress * Math.PI) * 20; // Max 20 pixels forward
                
                if (side === 'left') {
                    cleatX += kickOffset; // Move right (forward for left player)
                } else {
                    cleatX -= kickOffset; // Move left (forward for right player)
                }
                
                // Slight upward movement during kick
                cleatY -= Math.sin(progress * Math.PI) * 8; // Max 8 pixels up
            }
        }
        
        // Update cleat position
        cleat.x = cleatX;
        cleat.y = cleatY;
    }
    
    checkGoals() {
        if (!this.ball) return;
        
        // Update goal cooldown
        if (this.goalCooldown > 0) {
            this.goalCooldown--;
            return; // Skip goal detection during cooldown
        }
        
        // Check left goal (Player 2 scores)
        if (PHYSICS_CONSTANTS.UTILS.isCollide(this.ball, this.leftGoal)) {
            this.handleGoal('player2');
            this.goalCooldown = this.goalCooldownDuration; // Start cooldown
            return;
        }
        
        // Check right goal (Player 1 scores)  
        if (PHYSICS_CONSTANTS.UTILS.isCollide(this.ball, this.rightGoal)) {
            this.handleGoal('player1');
            this.goalCooldown = this.goalCooldownDuration; // Start cooldown
            return;
        }
    }
    
    handleGoal(scoringPlayer) {
        console.log(`GOAL! ${scoringPlayer} scored!`);
        
        // Initialize score tracking if not exists
        if (!this.score) {
            this.score = { player1: 0, player2: 0 };
        }
        
        if (this.isMultiplayer && this.multiplayerGame) {
            // MULTIPLAYER: Send goal event to server, let server handle score updates
            console.log('🎯 MULTIPLAYER: Sending goal event to server for', scoringPlayer);
            
            // Calculate what the new score should be (don't update locally yet)
            const newScores = {
                player1: this.score.player1 + (scoringPlayer === 'player1' ? 1 : 0),
                player2: this.score.player2 + (scoringPlayer === 'player2' ? 1 : 0)
            };
            
            // Send goal event to server - server will broadcast back with score update
            this.multiplayerGame.sendGoalScored(scoringPlayer, newScores.player1, newScores.player2);
            
            // Don't update score locally - wait for server response
            // Don't reset positions locally - wait for server response
            console.log('🎯 Goal event sent to server, waiting for synchronized response');
            
        } else {
            // SINGLE PLAYER: Handle everything locally
            console.log('🎯 SINGLE PLAYER: Handling goal locally');
            
            // Update score locally
            this.score[scoringPlayer]++;
            this.updateScoreDisplay();
            
            // Reset positions immediately
            this.resetPositions();
            
            // Log the goal
            console.log(`Score: Player 1: ${this.score.player1} - Player 2: ${this.score.player2}`);
        }
        
        // Trigger goal celebration (both modes)
        this.celebrateGoal(scoringPlayer);
    }
    
    initializeScore() {
        // Initialize score object
        this.score = { player1: 0, player2: 0 };
        
        // Update the display
        this.updateScoreDisplay();
        
        console.log('Score initialized to 0-0');
    }
    
    updateScoreDisplay() {
        // Update the new score display elements
        const player1ScoreElement = document.getElementById('player1-score');
        const player2ScoreElement = document.getElementById('player2-score');
        
        if (player1ScoreElement && this.score) {
            player1ScoreElement.textContent = this.score.player1;
        }
        if (player2ScoreElement && this.score) {
            player2ScoreElement.textContent = this.score.player2;
        }
    }
    
    celebrateGoal(scoringPlayer) {
        console.log(`🎉 ${scoringPlayer.toUpperCase()} SCORES! 🎉`);
        
        // Play goal sound
        if (window.soundManager) {
            soundManager.playGoalSound();
        }
        
        // Display goal text image
        this.showGoalText();
    }
    
    showGoalText() {
        // Create goal text as HTML overlay since Phaser has CORS issues with local files
        const goalTextDiv = document.createElement('div');
        goalTextDiv.style.position = 'absolute';
        goalTextDiv.style.top = '50%';
        goalTextDiv.style.left = '50%';
        goalTextDiv.style.transform = 'translate(-50%, -50%)';
        goalTextDiv.style.zIndex = '1000';
        goalTextDiv.style.pointerEvents = 'none';
        
        // Create the image element
        const goalImg = document.createElement('img');
        goalImg.src = 'assets/Goal - Text.png';
        goalImg.style.width = '600px';
        goalImg.style.height = 'auto';
        goalImg.style.animation = 'goalBounce 0.8s ease-out';
        
        goalTextDiv.appendChild(goalImg);
        document.body.appendChild(goalTextDiv);
        
        // Add CSS animation if not already added
        if (!document.getElementById('goal-animation-style')) {
            const style = document.createElement('style');
            style.id = 'goal-animation-style';
            style.textContent = `
                @keyframes goalBounce {
                    0% { transform: scale(0.5); opacity: 0; }
                    50% { transform: scale(1.2); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Remove the text after 2 seconds
        setTimeout(() => {
            if (goalTextDiv && goalTextDiv.parentNode) {
                goalTextDiv.parentNode.removeChild(goalTextDiv);
            }
        }, 2000);
    }
    
    
    // Called by HTML timer when time expires
    onTimeExpired() {
        if (this.gameState === 'playing') {
            // Determine winner by score
            if (this.score.player1 > this.score.player2) {
                this.endGame('player1');
            } else if (this.score.player2 > this.score.player1) {
                this.endGame('player2');
            } else {
                this.endGame('tie');
            }
        }
    }
    
    endGame(result) {
        console.log('Game ended:', result);
        this.gameState = 'ended';
        
        // Stop player movement
        if (this.player1) this.player1.velocity = { x: 0, y: 0 };
        if (this.player2) this.player2.velocity = { x: 0, y: 0 };
        
        // Send game end to multiplayer system for synchronization (if not already sent)
        if (this.isMultiplayer && this.multiplayerGame && !this.gameEndSent) {
            this.gameEndSent = true; // Prevent multiple sends
            this.multiplayerGame.sendGameEnd(result);
        }
        
        // Show game over screen
        this.showGameOverScreen(result);
    }
    
    showGameOverScreen(result) {
        // Create game over overlay
        const gameOverDiv = document.createElement('div');
        gameOverDiv.style.position = 'absolute';
        gameOverDiv.style.top = '0';
        gameOverDiv.style.left = '0';
        gameOverDiv.style.width = '100%';
        gameOverDiv.style.height = '100%';
        gameOverDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        gameOverDiv.style.display = 'flex';
        gameOverDiv.style.flexDirection = 'column';
        gameOverDiv.style.justifyContent = 'center';
        gameOverDiv.style.alignItems = 'center';
        gameOverDiv.style.zIndex = '2000';
        gameOverDiv.style.color = 'white';
        gameOverDiv.style.fontFamily = 'Arial, sans-serif';
        gameOverDiv.id = 'game-over-screen';
        
        // Game over title
        const title = document.createElement('h1');
        title.textContent = 'GAME OVER';
        title.style.fontSize = '48px';
        title.style.marginBottom = '20px';
        title.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
        
        // Winner announcement
        const winner = document.createElement('h2');
        if (result === 'tie') {
            winner.textContent = "IT'S A TIE!";
            winner.style.color = '#ffff00';
        } else {
            // Get actual player names for multiplayer or use defaults for single player
            let playerName;
            if (this.isMultiplayer && this.multiplayerGame) {
                // Use actual multiplayer usernames
                playerName = result === 'player1' ? 
                    this.multiplayerGame.matchData.player1Name : 
                    this.multiplayerGame.matchData.player2Name;
            } else {
                // Fallback for single player
                playerName = result === 'player1' ? 'Player 1' : 'Player 2';
            }
            winner.textContent = `${playerName} WINS!`;
            winner.style.color = result === 'player1' ? '#0088ff' : '#ff0000';
        }
        winner.style.fontSize = '36px';
        winner.style.marginBottom = '20px';
        winner.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
        
        // Final score
        const finalScore = document.createElement('p');
        finalScore.textContent = `Final Score: ${this.score.player1} - ${this.score.player2}`;
        finalScore.style.fontSize = '24px';
        finalScore.style.marginBottom = '30px';
        
        // Buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '20px';
        
        // In multiplayer mode, only show main menu button
        if (this.isMultiplayer) {
            const menuBtn = document.createElement('button');
            menuBtn.textContent = 'Main Menu';
            menuBtn.style.padding = '15px 30px';
            menuBtn.style.fontSize = '18px';
            menuBtn.style.backgroundColor = '#2196F3';
            menuBtn.style.color = 'white';
            menuBtn.style.border = 'none';
            menuBtn.style.borderRadius = '5px';
            menuBtn.style.cursor = 'pointer';
            menuBtn.onclick = () => {
                // In multiplayer, use the global returnToMenu function to notify server
                if (window.returnToMenu) {
                    window.returnToMenu();
                } else {
                    window.location.href = 'multiplayer-selection.html';
                }
            };
            
            buttonContainer.appendChild(menuBtn);
        } else {
            // Single player mode - show both play again and main menu
            const playAgainBtn = document.createElement('button');
            playAgainBtn.textContent = 'Play Again';
            playAgainBtn.style.padding = '15px 30px';
            playAgainBtn.style.fontSize = '18px';
            playAgainBtn.style.backgroundColor = '#4CAF50';
            playAgainBtn.style.color = 'white';
            playAgainBtn.style.border = 'none';
            playAgainBtn.style.borderRadius = '5px';
            playAgainBtn.style.cursor = 'pointer';
            playAgainBtn.onclick = () => {
                document.body.removeChild(gameOverDiv);
                this.resetGame();
            };
            
            const menuBtn = document.createElement('button');
            menuBtn.textContent = 'Main Menu';
            menuBtn.style.padding = '15px 30px';
            menuBtn.style.fontSize = '18px';
            menuBtn.style.backgroundColor = '#2196F3';
            menuBtn.style.color = 'white';
            menuBtn.style.border = 'none';
            menuBtn.style.borderRadius = '5px';
            menuBtn.style.cursor = 'pointer';
            menuBtn.onclick = () => {
                window.location.href = 'main-menu.html';
            };
            
            buttonContainer.appendChild(playAgainBtn);
            buttonContainer.appendChild(menuBtn);
        }
        
        gameOverDiv.appendChild(title);
        gameOverDiv.appendChild(winner);
        gameOverDiv.appendChild(finalScore);
        gameOverDiv.appendChild(buttonContainer);
        
        document.body.appendChild(gameOverDiv);
    }
    
    togglePause() {
        if (this.gameState !== 'playing' && this.gameState !== 'paused') {
            return; // Can't pause if game is ended
        }
        
        this.isPaused = !this.isPaused;
        
        if (this.isPaused) {
            this.gameState = 'paused';
            this.pauseTimer();
            this.showPauseScreen();
            console.log('Game paused');
        } else {
            this.gameState = 'playing';
            this.resumeTimer();
            this.hidePauseScreen();
            console.log('Game resumed');
        }
        
        // Update pause button if function exists
        if (window.updatePauseButton) {
            setTimeout(window.updatePauseButton, 50); // Small delay to ensure state is updated
        }
    }

    // Force pause for multiplayer synchronization (without showing local pause screen)
    forcePause() {
        if (this.gameState !== 'playing') {
            return;
        }
        
        this.isPaused = true;
        this.gameState = 'paused';
        this.pauseTimer();
        console.log('Game force paused by server');
        
        // Update pause button
        if (window.updatePauseButton) {
            setTimeout(window.updatePauseButton, 50);
        }
    }

    // Force resume for multiplayer synchronization
    forceResume() {
        if (this.gameState !== 'paused') {
            return;
        }
        
        this.isPaused = false;
        this.gameState = 'playing';
        this.resumeTimer();
        console.log('Game force resumed by server');
        
        // Update pause button
        if (window.updatePauseButton) {
            setTimeout(window.updatePauseButton, 50);
        }
    }
    
    pauseTimer() {
        // Notify HTML timer to pause
        if (window.pauseGameTimer) {
            window.pauseGameTimer();
        }
    }
    
    resumeTimer() {
        // Notify HTML timer to resume
        if (window.resumeGameTimer) {
            window.resumeGameTimer();
        }
    }
    
    resetTimer() {
        // Reset timer to initial value
        if (window.resetGameTimer) {
            window.resetGameTimer();
        }
    }
    
    showPauseScreen() {
        // Create pause overlay
        const pauseDiv = document.createElement('div');
        pauseDiv.style.position = 'absolute';
        pauseDiv.style.top = '0';
        pauseDiv.style.left = '0';
        pauseDiv.style.width = '100%';
        pauseDiv.style.height = '100%';
        pauseDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        pauseDiv.style.display = 'flex';
        pauseDiv.style.flexDirection = 'column';
        pauseDiv.style.justifyContent = 'center';
        pauseDiv.style.alignItems = 'center';
        pauseDiv.style.zIndex = '1500';
        pauseDiv.style.color = 'white';
        pauseDiv.style.fontFamily = 'Arial, sans-serif';
        pauseDiv.id = 'pause-screen';
        
        // Pause title
        const title = document.createElement('h1');
        title.textContent = 'PAUSED';
        title.style.fontSize = '48px';
        title.style.marginBottom = '30px';
        title.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
        
        // Instructions
        const instruction = document.createElement('p');
        instruction.textContent = 'Press P to resume or use buttons below';
        instruction.style.fontSize = '18px';
        instruction.style.marginBottom = '30px';
        instruction.style.textAlign = 'center';
        
        // Buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '20px';
        
        const resumeBtn = document.createElement('button');
        resumeBtn.textContent = 'Resume';
        resumeBtn.style.padding = '15px 30px';
        resumeBtn.style.fontSize = '18px';
        resumeBtn.style.backgroundColor = '#4CAF50';
        resumeBtn.style.color = 'white';
        resumeBtn.style.border = 'none';
        resumeBtn.style.borderRadius = '5px';
        resumeBtn.style.cursor = 'pointer';
        resumeBtn.onclick = () => {
            this.togglePause();
        };
        
        buttonContainer.appendChild(resumeBtn);
        
        // In multiplayer mode, don't show restart option
        if (!this.isMultiplayer) {
            const restartBtn = document.createElement('button');
            restartBtn.textContent = 'Restart';
            restartBtn.style.padding = '15px 30px';
            restartBtn.style.fontSize = '18px';
            restartBtn.style.backgroundColor = '#FF9800';
            restartBtn.style.color = 'white';
            restartBtn.style.border = 'none';
            restartBtn.style.borderRadius = '5px';
            restartBtn.style.cursor = 'pointer';
            restartBtn.onclick = () => {
                this.hidePauseScreen();
                this.resetGame();
            };
            
            buttonContainer.appendChild(restartBtn);
        }
        
        const menuBtn = document.createElement('button');
        menuBtn.textContent = 'Main Menu';
        menuBtn.style.padding = '15px 30px';
        menuBtn.style.fontSize = '18px';
        menuBtn.style.backgroundColor = '#2196F3';
        menuBtn.style.color = 'white';
        menuBtn.style.border = 'none';
        menuBtn.style.borderRadius = '5px';
        menuBtn.style.cursor = 'pointer';
        menuBtn.onclick = () => {
            if (this.isMultiplayer) {
                // In multiplayer, use the global returnToMenu function to notify server
                if (window.returnToMenu) {
                    window.returnToMenu();
                } else {
                    window.location.href = 'multiplayer-selection.html';
                }
            } else {
                window.location.href = 'main-menu.html';
            }
        };
        
        buttonContainer.appendChild(menuBtn);
        
        pauseDiv.appendChild(title);
        pauseDiv.appendChild(instruction);
        pauseDiv.appendChild(buttonContainer);
        
        document.body.appendChild(pauseDiv);
    }
    
    hidePauseScreen() {
        const pauseScreen = document.getElementById('pause-screen');
        if (pauseScreen) {
            document.body.removeChild(pauseScreen);
        }
    }
    
    resetGame() {
        // Reset game state
        this.gameState = 'playing';
        this.isPaused = false;
        
        // Reset score
        this.initializeScore();
        
        // Reset positions
        this.resetPositions();
        
        // Remove any existing overlays
        this.hidePauseScreen();
        const existingGameOver = document.getElementById('game-over-screen');
        if (existingGameOver) {
            document.body.removeChild(existingGameOver);
        }
        
        // Reset frame tracking for collision detection
        this.frameCount = 0;
        this.lastCollisionFrame = { player1: -100, player2: -100 };
        this.player1PrevKick = false;
        this.player2PrevKick = false;
        
        // Reset kick animations
        this.player1KickAnimation = { active: false, timer: 0, maxDuration: 10 };
        this.player2KickAnimation = { active: false, timer: 0, maxDuration: 10 };
        
        // Reset and resume timer
        this.resetTimer();
        this.resumeTimer();
        
        // Update pause button
        if (window.updatePauseButton) {
            setTimeout(window.updatePauseButton, 100);
        }
        
        console.log('Game reset - score and positions');
    }
    
    resetPositions() {
        const playerStartX = this.gameWidth * 0.2; // Adjusted for fullscreen
        const playerY = this.getGroundY(); // Phase 3.5: Use unified ground calculation
        
        // Reset players
        if (this.player1) {
            this.player1.x = playerStartX;
            this.player1.y = playerY;
            this.player1.velocity = { x: 0, y: 0 };
            this.player1.onGround = false;
            this.player1.kickCooldown = 0;
            
            // Reset sprite position
            if (this.player1Sprite) {
                this.player1Sprite.x = this.player1.x + this.player1.width / 2;
                this.player1Sprite.y = this.player1.y + this.player1.height / 4; // Moved up from height/2
            }
            if (this.player1Foot) {
                // Reset kick animation
                this.player1KickAnimation.active = false;
                this.player1KickAnimation.timer = 0;
                this.updateCleatPosition(this.player1Foot, this.player1, this.player1KickAnimation, 'left');
            }
            // Reset kick state tracking
            this.player1PrevKick = false;
        }
        
        if (this.player2) {
            this.player2.x = this.gameWidth - playerStartX - PHYSICS_CONSTANTS.PLAYER.WIDTH;
            this.player2.y = playerY;
            this.player2.velocity = { x: 0, y: 0 };
            this.player2.onGround = false;
            this.player2.kickCooldown = 0;
            
            // Reset sprite position
            if (this.player2Sprite) {
                this.player2Sprite.x = this.player2.x + this.player2.width / 2;
                this.player2Sprite.y = this.player2.y + this.player2.height / 4; // Moved up from height/2
            }
            if (this.player2Foot) {
                // Reset kick animation
                this.player2KickAnimation.active = false;
                this.player2KickAnimation.timer = 0;
                this.updateCleatPosition(this.player2Foot, this.player2, this.player2KickAnimation, 'right');
            }
            // Reset kick state tracking
            this.player2PrevKick = false;
        }
        
        // Reset ball
        if (this.ball) {
            const ballStartX = this.gameWidth * 0.5; // Center for fullscreen
            const ballStartY = this.gameHeight * 0.3; // Adjusted for fullscreen
            const ballRadius = PHYSICS_CONSTANTS.BALL.RADIUS;
            
            this.ball.x = ballStartX - ballRadius;
            this.ball.y = ballStartY - ballRadius;
            this.ball.velocity = { x: 0, y: 0 };
        }
        
        // Reset goal cooldown to allow new goals after reset
        this.goalCooldown = 0;
        
        console.log('Positions reset');
    }
    
    setMultiplayerMode(multiplayerGame) {
        console.log('🎮 setMultiplayerMode() CALLED at timestamp:', Date.now());
        console.log('Setting multiplayer mode with data:', multiplayerGame.matchData);
        
        // Store the multiplayer game reference for later use
        this.multiplayerGame = multiplayerGame;
        
        // Disable AI for multiplayer mode
        this.aiEnabled = false;
        console.log('AI disabled for multiplayer mode');
        
        // Set multiplayer flag
        this.isMultiplayer = true;
        
        // Map character indices to names if needed
        const characterNames = ['Nuwan', 'Mihir', 'Dad'];
        
        // Override character selections with multiplayer data
        if (multiplayerGame.matchData.player1Head && multiplayerGame.matchData.player1Head !== 'Unknown') {
            const player1Head = multiplayerGame.matchData.player1Head;
            // Check if it's a numeric index or already a name
            if (!isNaN(player1Head) && player1Head >= 0 && player1Head < characterNames.length) {
                this.player1Head = characterNames[parseInt(player1Head)];
                console.log(`Mapped player1 head index ${player1Head} to ${this.player1Head}`);
            } else if (typeof player1Head === 'string' && characterNames.includes(player1Head)) {
                this.player1Head = player1Head;
                console.log(`Using player1 head name: ${this.player1Head}`);
            } else {
                console.warn(`Invalid player1Head value: ${player1Head}, using default`);
            }
        }
        
        if (multiplayerGame.matchData.player2Head && multiplayerGame.matchData.player2Head !== 'Unknown') {
            const player2Head = multiplayerGame.matchData.player2Head;
            // Check if it's a numeric index or already a name
            if (!isNaN(player2Head) && player2Head >= 0 && player2Head < characterNames.length) {
                this.player2Head = characterNames[parseInt(player2Head)];
                console.log(`Mapped player2 head index ${player2Head} to ${this.player2Head}`);
            } else if (typeof player2Head === 'string' && characterNames.includes(player2Head)) {
                this.player2Head = player2Head;
                console.log(`Using player2 head name: ${this.player2Head}`);
                console.log(`🔍 IMMEDIATE CHECK - this.player2Head is now: "${this.player2Head}"`);
            } else {
                console.warn(`Invalid player2Head value: ${player2Head}, using default`);
            }
        }
        
        // Apply cleat selections (convert from 0-based to 1-based indexing)
        if (multiplayerGame.matchData.player1Cleat !== undefined && multiplayerGame.matchData.player1Cleat !== 'Basic') {
            const player1Cleat = multiplayerGame.matchData.player1Cleat;
            if (!isNaN(player1Cleat)) {
                this.player1Cleat = parseInt(player1Cleat) + 1; // Convert 0-based to 1-based
                console.log(`Applied player1 cleat: ${this.player1Cleat} (from index ${player1Cleat})`);
            }
        }
        
        if (multiplayerGame.matchData.player2Cleat !== undefined && multiplayerGame.matchData.player2Cleat !== 'Basic') {
            const player2Cleat = multiplayerGame.matchData.player2Cleat;
            if (!isNaN(player2Cleat)) {
                this.player2Cleat = parseInt(player2Cleat) + 1; // Convert 0-based to 1-based
                console.log(`Applied player2 cleat: ${this.player2Cleat} (from index ${player2Cleat})`);
            }
        }

        console.log('✅ Multiplayer character selections applied:', {
            player1Head: this.player1Head,
            player2Head: this.player2Head,
            player1Cleat: this.player1Cleat,
            player2Cleat: this.player2Cleat
        });
        
        // IMMEDIATE verification - check if properties were actually set
        console.log('🔍 Immediate verification after setMultiplayerMode:', {
            'this.player1Head': this.player1Head,
            'this.player2Head': this.player2Head,
            'createPlayers already called': !!(this.player1 && this.player2),
            'sprites already created': !!(this.player1Sprite && this.player2Sprite)
        });
        
        // Always recreate sprites to apply the new character selections
        console.log('📊 setMultiplayerMode sprite recreation check:', {
            player1Exists: !!this.player1,
            player2Exists: !!this.player2,
            player1SpriteExists: !!this.player1Sprite,
            player2SpriteExists: !!this.player2Sprite
        });
        
        if (this.player1 && this.player2) {
            console.log('🔄 Recreating player sprites with new character selections');
            this.recreatePlayerSprites();
        } else {
            console.log('⏳ Players not yet created, character selections will be applied during createPlayers');
            
            // Force sprite recreation after a short delay to ensure players are created
            setTimeout(() => {
                console.log('🕐 Delayed sprite recreation check at timestamp:', Date.now());
                console.log('🕐 Current character heads during delay:', {
                    player1Head: this.player1Head,
                    player2Head: this.player2Head
                });
                console.log('🕐 Player existence check:', {
                    player1Exists: !!this.player1,
                    player2Exists: !!this.player2,
                    player1SpriteExists: !!this.player1Sprite,
                    player2SpriteExists: !!this.player2Sprite
                });
                
                if (this.player1 && this.player2) {
                    console.log('🔄 Delayed recreation of player sprites with multiplayer selections');
                    this.recreatePlayerSprites();
                } else {
                    console.error('❌ Players still not created after delay - sprites will use defaults');
                }
            }, 100);
        }
    }
    
    recreatePlayerSprites() {
        // Remove existing sprites
        if (this.player1Sprite) {
            this.player1Sprite.destroy();
        }
        if (this.player2Sprite) {
            this.player2Sprite.destroy();
        }
        if (this.player1Foot) {
            this.player1Foot.destroy();
        }
        if (this.player2Foot) {
            this.player2Foot.destroy();
        }
        
        // Recreate Player 1 Head
        const player1HeadKey = this.player1Head + 'Head';
        
        if (this.textures.exists(player1HeadKey)) {
            console.log('Recreating Player 1 head:', player1HeadKey);
            this.player1Sprite = this.add.image(
                this.player1.x + this.player1.width / 2,
                this.player1.y + this.player1.height / 4,
                player1HeadKey
            );
            
            const headScales = {
                'Nuwan': [1, 1],
                'Mihir': [1.05, 1.12],
                'Dad': [0.97, 1]
            };
            const player1Scale = headScales[this.player1Head] || [1, 1];
            const headSize = 80;
            this.player1Sprite.setScale(
                (headSize / this.player1Sprite.width) * player1Scale[0],
                (headSize / this.player1Sprite.height) * player1Scale[1]
            );
        } else {
            this.player1Sprite = this.add.circle(
                this.player1.x + this.player1.width / 2,
                this.player1.y + this.player1.height / 4,
                25,
                0x0088ff
            );
        }
        this.player1Sprite.setDepth(10);
        
        // Recreate Player 2 Head
        const player2HeadKey = this.player2Head + 'Head';
        
        if (this.textures.exists(player2HeadKey)) {
            console.log('Recreating Player 2 head:', player2HeadKey);
            this.player2Sprite = this.add.image(
                this.player2.x + this.player2.width / 2,
                this.player2.y + this.player2.height / 4,
                player2HeadKey
            );
            
            const headScales = {
                'Nuwan': [1, 1],
                'Mihir': [1.05, 1.12],
                'Dad': [0.97, 1]
            };
            const player2Scale = headScales[this.player2Head] || [1, 1];
            const headSize = 80;
            this.player2Sprite.setScale(
                (headSize / this.player2Sprite.width) * player2Scale[0],
                (headSize / this.player2Sprite.height) * player2Scale[1]
            );
        } else {
            this.player2Sprite = this.add.circle(
                this.player2.x + this.player2.width / 2,
                this.player2.y + this.player2.height / 4,
                25,
                0xff4444
            );
        }
        this.player2Sprite.setDepth(10);
        
        // Recreate cleats
        const player1CleatKey = `cleat${this.player1Cleat}`;
        if (this.textures.exists(player1CleatKey)) {
            this.player1Foot = this.add.image(
                this.player1.x + this.player1.width / 2,
                this.player1.y + this.player1.height - 5,
                player1CleatKey
            );
            const cleatSize = 40;
            this.player1Foot.setScale(cleatSize / this.player1Foot.width);
            this.player1Foot.setDepth(8);
        } else {
            this.player1Foot = this.add.rectangle(
                this.player1.x + this.player1.width / 2,
                this.player1.y + this.player1.height - 5,
                30,
                15,
                0x000000
            );
            this.player1Foot.setDepth(8);
        }
        
        const player2CleatKey = `cleat${this.player2Cleat}`;
        if (this.textures.exists(player2CleatKey)) {
            this.player2Foot = this.add.image(
                this.player2.x + this.player2.width / 2,
                this.player2.y + this.player2.height - 5,
                player2CleatKey
            );
            const cleatSize = 40;
            this.player2Foot.setScale(cleatSize / this.player2Foot.width);
            this.player2Foot.setDepth(8);
        } else {
            this.player2Foot = this.add.rectangle(
                this.player2.x + this.player2.width / 2,
                this.player2.y + this.player2.height - 5,
                30,
                15,
                0x000000
            );
            this.player2Foot.setDepth(8);
        }
        
        console.log('Player sprites recreated with multiplayer character selections');
    }
    
    handleOpponentInput(inputData) {
        // Handle input from opponent player via network
        if (!this.isMultiplayer || !inputData) return;
        
        console.log('Received opponent input:', inputData);
        
        // Store opponent input to be used in next update cycle
        this.opponentInput = {
            moveLeft: inputData.input.moveLeft,
            moveRight: inputData.input.moveRight,
            jump: inputData.input.jump,
            kick: inputData.input.kick,
            side: inputData.input.side,
            timestamp: inputData.timestamp
        };
    }
    
    handleGoalScored(goalData) {
        // Handle synchronized goal events from multiplayer server
        if (!this.isMultiplayer || !goalData) return;
        
        console.log('🎯 Received goal event from server:', goalData);
        
        // Update score from server (authoritative)
        if (goalData.scores) {
            this.score = {
                player1: goalData.scores.player1,
                player2: goalData.scores.player2
            };
            this.updateScoreDisplay();
            console.log('🎯 Score updated from server:', this.score);
        }
        
        // Reset positions for both players simultaneously
        this.resetPositions();
        
        // Trigger goal celebration if scoring player is specified
        if (goalData.scoringPlayer) {
            this.celebrateGoal(goalData.scoringPlayer);
        }
        
        console.log('🎯 Goal synchronized - positions reset for both players');
    }
    
    handleServerUpdate(gameStateData) {
        // Handle game state updates from server
        if (!this.isMultiplayer || !gameStateData) return;
        
        console.log('Received server game state update:', gameStateData);
        
        // Sync positions, scores, etc. based on server state
        // This ensures both clients stay synchronized
    }

    updateAI(currentTime) {
        if (!this.ball || !this.player1) return;
        
        // Update AI reaction timing
        if (currentTime - this.ai.lastReactionTime < this.ai.reactionTime) {
            return; // Still in reaction delay
        }
        
        // Calculate ball distance and position
        const ballCenterX = this.ball.x + this.ball.radius;
        const ballCenterY = this.ball.y + this.ball.radius;
        const playerCenterX = this.player1.x + this.player1.width / 2;
        const playerCenterY = this.player1.y + this.player1.height / 2;
        
        this.ai.ballDistance = Math.sqrt(
            Math.pow(ballCenterX - playerCenterX, 2) + 
            Math.pow(ballCenterY - playerCenterY, 2)
        );
        
        // Predict ball movement
        const ballNextX = ballCenterX + this.ball.velocity.x * 10; // Predict 10 frames ahead
        const ballNextY = ballCenterY + this.ball.velocity.y * 10;
        
        // Determine AI state based on ball position and game situation
        this.updateAIState(ballCenterX, ballCenterY, ballNextX, ballNextY);
        
        // Make movement decisions based on state
        this.makeAIDecisions(ballCenterX, ballCenterY, ballNextX, ballNextY, playerCenterX, playerCenterY);
        
        // Update reaction timing
        this.ai.lastReactionTime = currentTime;
    }
    
    updateAIState(ballX, ballY, ballNextX, ballNextY) {
        const centerX = this.gameWidth / 2;
        const playerX = this.player1.x + this.player1.width / 2;
        
        // Determine if ball is on AI's side or moving toward AI
        const ballOnAISide = ballX < centerX;
        const ballMovingTowardAI = this.ball.velocity.x < 0;
        const ballCloseToAI = this.ai.ballDistance < 150;
        
        // State machine for AI behavior
        if (ballCloseToAI && (ballOnAISide || ballMovingTowardAI)) {
            this.ai.state = 'attacking';
        } else if (ballOnAISide && ballY > this.gameHeight * 0.6) {
            this.ai.state = 'defending';
        } else if (ballMovingTowardAI || (ballX < centerX + 100)) {
            this.ai.state = 'chasing';
        } else {
            this.ai.state = 'defending';
        }
    }
    
    makeAIDecisions(ballX, ballY, ballNextX, ballNextY, playerX, playerY) {
        // Reset decisions
        this.ai.shouldJump = false;
        this.ai.shouldKick = false;
        
        switch (this.ai.state) {
            case 'attacking':
                this.makeAttackingDecisions(ballX, ballY, ballNextX, ballNextY, playerX, playerY);
                break;
            case 'defending':
                this.makeDefendingDecisions(ballX, ballY, playerX);
                break;
            case 'chasing':
                this.makeChasingDecisions(ballX, ballY, ballNextX, ballNextY, playerX, playerY);
                break;
        }
        
        // Add some randomness to make AI less predictable
        if (Math.random() < 0.1) {
            this.ai.targetX += (Math.random() - 0.5) * 50;
        }
        
        // Constrain target to valid field area
        this.ai.targetX = Math.max(50, Math.min(this.gameWidth / 2 - 50, this.ai.targetX));
    }
    
    makeAttackingDecisions(ballX, ballY, ballNextX, ballNextY, playerX, playerY) {
        // Aggressive behavior - go for the ball and try to score
        const goalX = this.gameWidth - 80; // Right goal position
        
        if (this.ai.ballDistance < 80) {
            // Close to ball - try to kick toward goal
            this.ai.targetX = ballX;
            
            // Check if should kick
            if (this.ai.ballDistance < 60 && Math.random() < this.ai.kickTiming) {
                this.ai.shouldKick = true;
            }
            
            // Jump if ball is above player
            if (ballY < playerY - 20 && this.player1.onGround) {
                this.ai.shouldJump = true;
            }
        } else {
            // Move toward predicted ball position
            this.ai.targetX = ballNextX;
        }
        
        // If ball is high and coming down, position underneath
        if (this.ball.velocity.y > 5 && ballY < this.gameHeight * 0.7) {
            this.ai.targetX = ballNextX;
            if (Math.abs(playerX - ballNextX) < 30 && this.player1.onGround) {
                this.ai.shouldJump = true;
            }
        }
    }
    
    makeDefendingDecisions(ballX, ballY, playerX) {
        // Defensive behavior - stay near goal and intercept
        const goalX = 80; // Left goal position
        const defensiveX = goalX + 100; // Position in front of goal
        
        // Stay between ball and goal
        if (ballX > playerX) {
            this.ai.targetX = Math.min(defensiveX, ballX - 50);
        } else {
            this.ai.targetX = defensiveX;
        }
        
        // Jump if ball is coming toward goal area and is high
        if (ballX < this.gameWidth * 0.3 && ballY < this.gameHeight * 0.6 && this.player1.onGround) {
            this.ai.shouldJump = Math.random() < 0.3;
        }
        
        // Kick if ball is very close to goal
        if (this.ai.ballDistance < 70 && ballX < this.gameWidth * 0.25) {
            this.ai.shouldKick = Math.random() < 0.8;
        }
    }
    
    makeChasingDecisions(ballX, ballY, ballNextX, ballNextY, playerX, playerY) {
        // Chasing behavior - move toward ball with moderate aggression
        
        // Predict where ball will be and move there
        if (Math.abs(this.ball.velocity.x) > 2) {
            this.ai.targetX = ballNextX;
        } else {
            this.ai.targetX = ballX;
        }
        
        // Jump if ball is above and player is close
        if (this.ai.ballDistance < 100 && ballY < playerY - 15 && this.player1.onGround) {
            this.ai.shouldJump = Math.random() < 0.4;
        }
        
        // Kick if close enough and ball is moving away or stationary
        if (this.ai.ballDistance < 70) {
            const ballMovingAway = (ballX > playerX && this.ball.velocity.x > 0) || 
                                 (ballX < playerX && this.ball.velocity.x < 0);
            if (!ballMovingAway || Math.abs(this.ball.velocity.x) < 3) {
                this.ai.shouldKick = Math.random() < 0.6;
            }
        }
    }
    
    // ===== MULTIPLAYER MOVEMENT SYNCHRONIZATION =====
    
    sendMovementUpdates() {
        const now = Date.now();
        
        // Throttle movement updates to reduce network spam
        if (now - this.lastMovementSent < this.movementSendInterval) {
            return;
        }
        
        this.lastMovementSent = now;
        
        // Determine which player is controlled by this client
        let localPlayer, localSprite, playerNumber;
        if (this.multiplayerGame.matchData.isPlayer1) {
            localPlayer = this.player1; // Player 1 controls player 1 (left side)
            localSprite = this.player1Sprite;
            playerNumber = 1;
        } else {
            localPlayer = this.player2; // Player 2 controls player 2 (right side) 
            localSprite = this.player2Sprite;
            playerNumber = 2;
        }
        
        if (!localPlayer || !localSprite) return;
        
        // Store last position to avoid sending duplicates
        if (!this.lastSentPosition) {
            this.lastSentPosition = { x: 0, y: 0 };
        }
        
        // Only send if position actually changed
        const positionChanged = Math.abs(localPlayer.x - this.lastSentPosition.x) > 1 || 
                               Math.abs(localPlayer.y - this.lastSentPosition.y) > 1 ||
                               Math.abs(localPlayer.velocity.x) > 0.1 ||
                               Math.abs(localPlayer.velocity.y) > 0.1;
        
        if (!positionChanged) return;
        
        // Update last sent position
        this.lastSentPosition.x = localPlayer.x;
        this.lastSentPosition.y = localPlayer.y;
        
        // Send movement data to server
        // Get current input state (use persistent kick detection)
        const currentInput = {
            left: this.cursors.left.isDown,
            right: this.cursors.right.isDown,
            jump: this.cursors.up.isDown,
            kick: this.cursors.down.isDown || (playerNumber === 1 ? this.player1KickPressed : this.player2KickPressed)
        };
        
        // Clear persistent kick state after capturing it
        if (playerNumber === 1) {
            this.player1KickPressed = false;
        } else {
            this.player2KickPressed = false;
        }
        
        // Determine physics state
        const physicsState = {
            onGround: localPlayer.onGround,
            touchingWall: localPlayer.x <= 0 || localPlayer.x + localPlayer.width >= this.gameWidth,
            gravityApplied: true, // Always true in our physics
            jumpFrame: this.cursors.up.isDown && localPlayer.onGround,
            isKicking: localPlayer.isKicking || false
        };
        
        console.log(`🏃 Sending enhanced movement for player ${playerNumber}:`, {
            position: { x: localPlayer.x, y: localPlayer.y },
            velocity: { x: localPlayer.velocity.x, y: localPlayer.velocity.y },
            physicsState: physicsState
        });
        
        this.multiplayerGame.sendMovementUpdate({
            playerNumber: playerNumber,
            position: {
                x: localPlayer.x,
                y: localPlayer.y
            },
            velocity: {
                x: localPlayer.velocity.x,
                y: localPlayer.velocity.y
            },
            acceleration: {
                x: 0, // We don't use horizontal acceleration
                y: PHYSICS_CONSTANTS.PLAYER.GRAVITY
            },
            onGround: localPlayer.onGround,
            physicsState: physicsState,
            input: currentInput,
            timestamp: now
        });
    }
    
    sendBallUpdates() {
        const now = Date.now();
        
        // REAL-TIME SYNC: Both players send updates, but Player 1 has priority for conflicts
        
        // Throttle ball updates
        if (now - this.lastBallSent < this.ballSendInterval) {
            return;
        }
        
        this.lastBallSent = now;
        
        if (!this.ball) return;
        
        // Store last ball position to avoid sending duplicates
        if (!this.lastSentBallPosition) {
            this.lastSentBallPosition = { x: 0, y: 0 };
        }
        
        // Only send if ball position actually changed
        const ballPositionChanged = Math.abs(this.ball.x - this.lastSentBallPosition.x) > 0.5 || 
                                   Math.abs(this.ball.y - this.lastSentBallPosition.y) > 0.5 ||
                                   Math.abs(this.ball.velocity.x) > 0.1 ||
                                   Math.abs(this.ball.velocity.y) > 0.1;
        
        if (!ballPositionChanged) return;
        
        // Update last sent position
        this.lastSentBallPosition.x = this.ball.x;
        this.lastSentBallPosition.y = this.ball.y;
        
        // Send ball data to server
        console.log('⚽ BALL DEBUG: Sending ball update:', {
            position: { x: this.ball.x, y: this.ball.y },
            velocity: { x: this.ball.velocity.x, y: this.ball.velocity.y },
            angle: this.ball.angle
        });
        
        this.multiplayerGame.sendBallUpdate({
            position: {
                x: this.ball.x,
                y: this.ball.y
            },
            velocity: {
                x: this.ball.velocity.x,
                y: this.ball.velocity.y
            },
            angle: this.ball.angle || 0,
            timestamp: now
        });
    }
    
    handleOpponentBall(ballData) {
        // DISABLED: No ball sync - using pure single-player physics like gameplay.html
        // Each player runs independent physics for perfect responsiveness
        console.log('⚽ BALL SYNC: Disabled - using single-player physics mode');
        return;
        
        // Update ball sprite position
        if (this.ballSprite) {
            this.ballSprite.x = this.ball.x;
            this.ballSprite.y = this.ball.y;
            this.ballSprite.rotation = (this.ball.angle || 0) * Math.PI / 180;
        }
        
        console.log('✅ BALL DEBUG: Updated ball position to:', {
            x: this.ball.x,
            y: this.ball.y,
            velocity: this.ball.velocity
        });
    }
    
    handleOpponentMovement(movementData) {
        console.log(`🏃 PHASE3 DEBUG: handleOpponentMovement called for player ${movementData.playerNumber}:`, movementData);
        
        // Phase 3: Add position data to interpolation buffer instead of direct update
        const playerKey = `player${movementData.playerNumber}`;
        console.log(`🔍 PHASE3 DEBUG: Using playerKey: ${playerKey}`);
        console.log(`🔍 PHASE3 DEBUG: remotePlayerBuffers exists:`, !!this.remotePlayerBuffers);
        console.log(`🔍 PHASE3 DEBUG: Buffer for ${playerKey} exists:`, !!this.remotePlayerBuffers[playerKey]);
        
        const positionData = {
            timestamp: movementData.timestamp || Date.now(),
            position: { ...movementData.position },
            velocity: { ...movementData.velocity },
            onGround: movementData.onGround,
            physicsState: movementData.physicsState || {}
        };
        
        console.log(`🔍 PHASE3 DEBUG: Created positionData:`, positionData);
        
        // Add to position buffer
        this.addPositionToBuffer(playerKey, positionData);
        
        console.log(`📥 PHASE3 DEBUG: After addPositionToBuffer - Buffer size: ${this.remotePlayerBuffers[playerKey]?.length || 'UNDEFINED'}`);
    }
    
    // ===== PHASE 2: CLIENT-SIDE PREDICTION SYSTEM =====
    
    addInputToBuffer(inputData) {
        // Add input to buffer
        this.inputBuffer.push(inputData);
        
        // Maintain circular buffer size
        if (this.inputBuffer.length > this.maxInputHistory) {
            this.inputBuffer.shift();
        }
        
        console.log(`📥 Input added to buffer. Frame: ${inputData.frameNumber}, Buffer size: ${this.inputBuffer.length}`);
    }
    
    predictNextPosition(player, input, deltaTime) {
        // Create predicted state based on current input
        const predicted = {
            x: player.x,
            y: player.y,
            velocityX: player.velocity.x,
            velocityY: player.velocity.y,
            onGround: player.onGround
        };
        
        // Apply physics prediction (simplified version of updatePlayer physics)
        // Gravity
        predicted.velocityY += PHYSICS_CONSTANTS.PLAYER.GRAVITY * deltaTime;
        
        // Horizontal movement
        if (input.moveLeft) {
            predicted.velocityX = -PHYSICS_CONSTANTS.PLAYER.MOVE_SPEED;
        } else if (input.moveRight) {
            predicted.velocityX = PHYSICS_CONSTANTS.PLAYER.MOVE_SPEED;
        } else {
            // Apply friction
            predicted.velocityX *= PHYSICS_CONSTANTS.PLAYER.FRICTION;
        }
        
        // Jump
        if (input.jump && predicted.onGround) {
            predicted.velocityY = -PHYSICS_CONSTANTS.PLAYER.JUMP_FORCE;
            predicted.onGround = false;
        }
        
        // Update position
        predicted.x += predicted.velocityX * deltaTime;
        predicted.y += predicted.velocityY * deltaTime;
        
        // Basic collision prediction (simplified)
        if (predicted.x < 0) {
            predicted.x = 0;
            predicted.velocityX = 0;
        }
        if (predicted.x + player.width > this.gameWidth) {
            predicted.x = this.gameWidth - player.width;
            predicted.velocityX = 0;
        }
        
        // Ground collision
        const groundY = this.gameHeight - this.bottomGap - player.height;
        if (predicted.y >= groundY) {
            predicted.y = groundY;
            predicted.velocityY = 0;
            predicted.onGround = true;
        }
        
        return predicted;
    }
    
    handleServerReconciliation(serverState) {
        if (!this.serverReconciliation) return;
        
        const serverTimestamp = serverState.timestamp;
        const serverFrameNumber = serverState.frameNumber;
        
        console.log(`🔄 Server reconciliation - Frame: ${serverFrameNumber}, Timestamp: ${serverTimestamp}`);
        
        // Find the input that corresponds to this server state
        const matchingInput = this.inputBuffer.find(input => input.frameNumber === serverFrameNumber);
        
        if (!matchingInput) {
            console.log(`⚠️ No matching input found for server frame ${serverFrameNumber}`);
            return;
        }
        
        // Check if there's a significant difference between client prediction and server state
        const positionDiff = Math.sqrt(
            Math.pow(matchingInput.stateBefore.x - serverState.x, 2) +
            Math.pow(matchingInput.stateBefore.y - serverState.y, 2)
        );
        
        const RECONCILIATION_THRESHOLD = 50; // pixels
        
        if (positionDiff > RECONCILIATION_THRESHOLD) {
            console.log(`🚨 Reconciliation needed! Diff: ${positionDiff.toFixed(1)}px`);
            
            // Find the local player
            const localPlayer = this.multiplayerGame.matchData.isPlayer1 ? this.player1 : this.player2;
            
            // Rollback to server state
            localPlayer.x = serverState.x;
            localPlayer.y = serverState.y;
            localPlayer.velocity.x = serverState.velocityX;
            localPlayer.velocity.y = serverState.velocityY;
            localPlayer.onGround = serverState.onGround;
            
            // Replay inputs from the reconciliation point
            this.replayInputsFromFrame(serverFrameNumber);
            
            console.log(`✅ Reconciliation complete. New position: (${localPlayer.x.toFixed(1)}, ${localPlayer.y.toFixed(1)})`);
        } else {
            console.log(`✅ No reconciliation needed. Diff: ${positionDiff.toFixed(1)}px`);
        }
        
        this.lastServerUpdate = Date.now();
    }
    
    replayInputsFromFrame(fromFrame) {
        // Find all inputs after the reconciliation frame
        const inputsToReplay = this.inputBuffer.filter(input => input.frameNumber > fromFrame);
        
        if (inputsToReplay.length === 0) return;
        
        console.log(`🎬 Replaying ${inputsToReplay.length} inputs from frame ${fromFrame}`);
        
        const localPlayer = this.multiplayerGame.matchData.isPlayer1 ? this.player1 : this.player2;
        const deltaTime = 1/60; // Assume 60fps
        
        // Replay each input
        for (const input of inputsToReplay) {
            const predicted = this.predictNextPosition(localPlayer, input, deltaTime);
            
            // Apply predicted state
            localPlayer.x = predicted.x;
            localPlayer.y = predicted.y;
            localPlayer.velocity.x = predicted.velocityX;
            localPlayer.velocity.y = predicted.velocityY;
            localPlayer.onGround = predicted.onGround;
        }
        
        console.log(`🎬 Replay complete. Final position: (${localPlayer.x.toFixed(1)}, ${localPlayer.y.toFixed(1)})`);
    }
    
    // ===== PHASE 3: INTERPOLATION SYSTEM FOR REMOTE PLAYERS =====
    
    addPositionToBuffer(playerKey, positionData) {
        // Ensure buffer exists for this player
        if (!this.remotePlayerBuffers[playerKey]) {
            console.log(`🔧 PHASE3 FIX: Creating buffer for ${playerKey}`);
            this.remotePlayerBuffers[playerKey] = [];
        }
        
        // Add position to buffer
        this.remotePlayerBuffers[playerKey].push(positionData);
        
        // Maintain circular buffer size
        if (this.remotePlayerBuffers[playerKey].length > this.maxPositionHistory) {
            this.remotePlayerBuffers[playerKey].shift();
        }
        
        // Sort by timestamp to handle out-of-order packets
        this.remotePlayerBuffers[playerKey].sort((a, b) => a.timestamp - b.timestamp);
        
        console.log(`📥 Position added to ${playerKey} buffer. Size: ${this.remotePlayerBuffers[playerKey].length}`);
    }
    
    updateRemotePlayerInterpolation() {
        // Update both remote players using interpolation
        const now = Date.now();
        const renderTime = now - this.interpolationDelay; // 100ms behind
        
        console.log(`🔄 PHASE3 DEBUG: updateRemotePlayerInterpolation called. Now: ${now}, RenderTime: ${renderTime}`);
        console.log(`🔍 PHASE3 DEBUG: multiplayerGame exists:`, !!this.multiplayerGame);
        console.log(`🔍 PHASE3 DEBUG: isPlayer1:`, this.multiplayerGame?.matchData?.isPlayer1);
        
        // Update player 1 if it's the remote player
        if (this.multiplayerGame && !this.multiplayerGame.matchData.isPlayer1) {
            console.log(`🎯 PHASE3 DEBUG: Player 1 is REMOTE - interpolating`);
            this.interpolateRemotePlayer('player1', this.player1, this.player1Sprite, renderTime);
        } else {
            console.log(`🎯 PHASE3 DEBUG: Player 1 is LOCAL - skipping interpolation`);
        }
        
        // Update player 2 if it's the remote player  
        if (this.multiplayerGame && this.multiplayerGame.matchData.isPlayer1) {
            console.log(`🎯 PHASE3 DEBUG: Player 2 is REMOTE - interpolating`);
            this.interpolateRemotePlayer('player2', this.player2, this.player2Sprite, renderTime);
        } else {
            console.log(`🎯 PHASE3 DEBUG: Player 2 is LOCAL - skipping interpolation`);
        }
    }
    
    interpolateRemotePlayer(playerKey, playerObject, playerSprite, renderTime) {
        const buffer = this.remotePlayerBuffers[playerKey];
        
        console.log(`🎮 PHASE3 DEBUG: interpolateRemotePlayer called for ${playerKey}`);
        console.log(`🔍 PHASE3 DEBUG: Buffer length: ${buffer?.length || 'UNDEFINED'}`);
        console.log(`🔍 PHASE3 DEBUG: PlayerObject exists:`, !!playerObject);
        console.log(`🔍 PHASE3 DEBUG: PlayerSprite exists:`, !!playerSprite);
        
        if (!buffer || buffer.length === 0) {
            console.log(`❌ PHASE3 DEBUG: No buffer data for ${playerKey} - returning early`);
            return;
        }
        
        console.log(`🔍 PHASE3 DEBUG: Buffer contents:`, buffer);
        
        // Find the two positions around our render time
        const result = this.findInterpolationTargets(buffer, renderTime);
        console.log(`🔍 PHASE3 DEBUG: Interpolation result:`, result);
        
        if (result.interpolate) {
            // Interpolate between two positions
            const interpolatedPosition = this.lerp(result.before, result.after, result.factor);
            console.log(`🔄 PHASE3 DEBUG: Interpolating ${playerKey} at factor ${result.factor.toFixed(3)}`);
            console.log(`🔍 PHASE3 DEBUG: Interpolated position:`, interpolatedPosition);
            this.applyInterpolatedPosition(playerObject, playerSprite, interpolatedPosition);
        } else if (result.extrapolate) {
            // Extrapolate from latest position
            const extrapolatedPosition = this.extrapolatePosition(result.latest, renderTime);
            console.log(`📈 PHASE3 DEBUG: Extrapolating ${playerKey} by ${renderTime - result.latest.timestamp}ms`);
            console.log(`🔍 PHASE3 DEBUG: Extrapolated position:`, extrapolatedPosition);
            this.applyInterpolatedPosition(playerObject, playerSprite, extrapolatedPosition);
        } else {
            // Use latest available position
            console.log(`📍 PHASE3 DEBUG: Using latest ${playerKey} position (no interpolation)`);
            console.log(`🔍 PHASE3 DEBUG: Latest position:`, result.latest);
            this.applyInterpolatedPosition(playerObject, playerSprite, result.latest);
        }
    }
    
    findInterpolationTargets(buffer, renderTime) {
        // Find positions before and after render time
        let before = null;
        let after = null;
        
        for (let i = 0; i < buffer.length; i++) {
            const pos = buffer[i];
            
            if (pos.timestamp <= renderTime) {
                before = pos;
            } else if (pos.timestamp > renderTime && !after) {
                after = pos;
                break;
            }
        }
        
        const latest = buffer[buffer.length - 1];
        
        if (before && after) {
            // Perfect interpolation case
            const factor = (renderTime - before.timestamp) / (after.timestamp - before.timestamp);
            return { interpolate: true, before, after, factor: Math.max(0, Math.min(1, factor)) };
        } else if (latest && (renderTime - latest.timestamp) <= this.extrapolationLimit) {
            // Extrapolation case (within limit)
            return { extrapolate: true, latest };
        } else {
            // Fallback to latest position
            return { latest: latest || buffer[0] };
        }
    }
    
    lerp(pos1, pos2, factor) {
        // Linear interpolation between two positions
        return {
            timestamp: pos1.timestamp + (pos2.timestamp - pos1.timestamp) * factor,
            position: {
                x: pos1.position.x + (pos2.position.x - pos1.position.x) * factor,
                y: pos1.position.y + (pos2.position.y - pos1.position.y) * factor
            },
            velocity: {
                x: pos1.velocity.x + (pos2.velocity.x - pos1.velocity.x) * factor,
                y: pos1.velocity.y + (pos2.velocity.y - pos1.velocity.y) * factor
            },
            onGround: factor < 0.5 ? pos1.onGround : pos2.onGround, // Snap to nearest
            physicsState: factor < 0.5 ? pos1.physicsState : pos2.physicsState
        };
    }
    
    extrapolatePosition(latestPos, renderTime) {
        // Extrapolate position using velocity
        const deltaTime = (renderTime - latestPos.timestamp) / 1000; // Convert to seconds
        const decayFactor = Math.max(0, 1 - deltaTime / (this.extrapolationLimit / 1000)); // Decay over time
        
        return {
            timestamp: renderTime,
            position: {
                x: latestPos.position.x + latestPos.velocity.x * deltaTime * decayFactor,
                y: latestPos.position.y + latestPos.velocity.y * deltaTime * decayFactor
            },
            velocity: {
                x: latestPos.velocity.x * decayFactor,
                y: latestPos.velocity.y * decayFactor
            },
            onGround: latestPos.onGround,
            physicsState: latestPos.physicsState
        };
    }
    
    applyInterpolatedPosition(playerObject, playerSprite, interpolatedData) {
        if (!playerObject || !playerSprite || !interpolatedData) return;
        
        // Apply interpolated position with ground state handling
        playerObject.x = interpolatedData.position.x;
        playerObject.y = interpolatedData.position.y;
        playerObject.velocity.x = interpolatedData.velocity.x;
        playerObject.velocity.y = interpolatedData.velocity.y;
        playerObject.onGround = interpolatedData.onGround;
        
        // Special ground state handling (Phase 3.4)
        if (interpolatedData.onGround) {
            // Phase 3.5: Use unified ground calculation with snap tolerance
            const groundY = this.getGroundY();
            // Snap to ground if within 10 pixels (increased tolerance)
            if (Math.abs(playerObject.y - groundY) <= 10) {
                playerObject.y = groundY;
                playerObject.velocity.y = 0;
            }
        }
        
        // Update sprite to match
        playerSprite.x = playerObject.x;
        playerSprite.y = playerObject.y;
    }
}