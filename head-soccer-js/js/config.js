// Head Soccer Game Configuration
// Exact values from Python main.py

const CONFIG = {
    // AI Configuration - from Python lines 1326-1328
    AI_ENABLED: true,
    AI_DIFFICULTY: "medium", // "easy", "medium", "hard"
    
    // Physics constants - from Python lines 1349-1354
    GRAVITY: { x: 0, y: 900 },
    FPS: 60,
    DT: 1/60,
    PHYSICS_STEPS_PER_FRAME: 1,
    
    // Game dimensions - from Python lines 1363-1364
    WIDTH: 1600,
    HEIGHT: 900,
    
    // Player constants - from Python lines 1443-1445
    HEAD_SIZE: 75,
    HEAD_MASS: 200,
    LEG_WIDTH: 60,        // Python line 1464
    LEG_HEIGHT: 10,       // Python line 1465
    LEG_MASS: 10,         // Python line 1466
    MAX_PLAYER_SPEED: 500, // Python line 1445
    
    // Motor constants - from Python lines 1469-1471
    MOTOR_MAX_FORCE: Infinity,
    MOTOR_MAX_RATE: 15,
    MOTOR_P_GAIN: 40,
    
    // Ball constants - from Python lines 1431-1433
    BALL_SIZE: 45,
    BALL_MASS: 20,
    MAX_INITIAL_BALL_VEL: 275,
    
    // Goal dimensions - from Python lines 1408-1409
    GOAL_HEIGHT: 250,
    GOAL_WIDTH: 75,
    
    // Player positions - from Python lines 1439-1441
    PLAYER_START_X: 400,  // WIDTH / 4
    PLAYER_START_Y: 600,
    BALL_START_X: 800,    // WIDTH / 2
    BALL_START_Y: 220,
    
    // Kick angles - from Python lines 1440-1441
    PLAYER_1_MAX_KICK: -10,
    PLAYER_1_MIN_KICK: -80,
    PLAYER_2_MAX_KICK: -170,
    PLAYER_2_MIN_KICK: -100,
    
    // Powers - exact from Python line 1331
    POWERS: {
        'Nuwan': { 
            Name: 'Dash', 
            Wait: 10, 
            Duration: false, 
            Color: [214, 195, 73], 
            ReadyColor: [220, 220, 220] 
        },
        'Mihir': { 
            Name: 'Back', 
            Wait: 22, 
            Duration: false, 
            Color: [100, 190, 100], 
            ReadyColor: [220, 220, 220] 
        },
        'Dad': { 
            Name: 'Freeze Player', 
            Wait: 14, 
            Duration: 5, 
            Color: [114, 155, 207], 
            ReadyColor: [200, 200, 200] 
        }
    },
    
    // Head scaling - exact from Python line 1449
    HEAD_SCALE: {
        'Nuwan': [1, 1],
        'Mihir': [1.05, 1.12],
        'Dad': [0.97, 1]
    },
    
    // Character info - from Python lines 1449-1503
    HEADS: ['Nuwan', 'Mihir', 'Dad'],
    CHARACTER_HEADS: ['Nuwan', 'Mihir', 'Dad'],
    CLEAT_TYPES: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    NUM_HEADS: 3,
    NUM_CLEATS: 9,
    CLEAT_SIZE: 50,
    
    // Game settings - from Python lines 1529-1530
    END_SCORE: 7,
    END_TIME: 300, // 5 minutes (5 * 60)
    
    // UI constants - Progress bars from Python lines 1425-1429
    PROGRESS_BAR: {
        X: 30,
        Y: 30,
        WIDTH: 150,
        HEIGHT: 25,
        OUTLINE_SIZE: 5,
        ROUNDING: 10,
        OUTLINE_COLOR: [100, 100, 100]
    },
    
    // Colors - from Python lines 1380-1394
    BACKGROUND_COLOR: [33, 33, 33],
    OFF_WHITE: [230, 230, 230],
    HEAD_OUTLINE_COLOR: [230, 230, 230],
    HEAD_OUTLINE_WIDTH: 5,
    GOAL_TEXT_COLOR: [230, 230, 230],
    SCORE_TEXT_COLOR: [230, 230, 230],
    SCORE_OUTLINE_SIZE: 5,
    OVERTIME_TEXT_COLOR: [230, 230, 230],
    GAMETIME_TEXT_COLOR: [230, 230, 230],
    
    // Particle system - from Python lines 1517-1519
    NUM_PARTICLES: 80,
    CONNECTION_DISTANCE: 100,
    PARTICLE_COUNT: 80,
    MAX_DISTANCE: 100,
    MOUSE_TRAIL_LENGTH: 10,
    
    // Selection wheel - from Python lines 1505-1515
    SELECTION_WHEEL: {
        POS_INFO: [500, 500, 200], // [x, y, y diff to cleat wheel]
        OUTLINE_SIZE: [400, 150],
        OUTLINE_ROUNDING: 60,
        SMOOTHING: 5
    },
    
    // Double tap settings - from Python lines 1339-1341
    DTAP_TIME: 0.3,
    BOOST_FORCE: 30000000,
    
    // Border curve points - from Python lines 1413-1419
    BORDER_CURVES: {
        LEFT: [[1, 900 * 4/7], [1600/35, 900 * 12/50], [1600/7, 900/18], [1600 * 7/20, 1]],
        RIGHT: [[1600 * 13/20, 1], [1600 * 6/7, 900/18], [1600 * 34/35, 900 * 12/50], [1600 - 1, 900 * 4/7]],
        FLOOR: [[1600 - 1, 900 * 88/90], [1, 900 * 88/90]]
    },
    
    // Sound volume settings - from Python
    SOUND_VOLUMES: {
        KICK: 1.0,
        COUNTDOWN: 0.75,
        SELECTION: 0.75,
        START_GAME: 0.75,
        BACKGROUND_CROWD: 0.1,
        GOAL: 0.85,
        CHEER_BASE: 0.2,
        CHEER_VARIATION: 0.1
    },
    
    // Asset file lists
    ASSET_FILES: {
        IMAGES: [
            'Soccer Ball.png',
            'Ball 01.png',
            'Goal - Text.png',
            'Goal - Side.png',
            'Nuwan_Head.png', 'Mihir_Head.png', 'Dad_Head.png',
            'Cleat 1.png', 'Cleat 2.png', 'Cleat 3.png', 'Cleat 4.png', 'Cleat 5.png',
            'Cleat 6.png', 'Cleat 7.png', 'Cleat 8.png', 'Cleat 9.png',
            'Earth_Ring.gif', 'Fire.gif', 'Fireball.gif', 'Freeze.gif', 'Proto_Star.gif', 'Tenticle.gif'
        ],
        SOUNDS: [
            'kick_ball.wav', 'Countdown.mp3', 'Small_pop.wav', 'Start_Game.wav',
            'background_crowd.wav', 'All Stars.mp3',
            'Cheer 1.wav', 'Cheer 2.wav', 'Cheer 3.wav', 'Cheer 4.wav',
            'Goal 1.mp3', 'Goal 2.mp3', 'Goal 3.mp3', 'Goal 4.mp3', 'Goal 5.mp3'
        ],
        FONTS: [
            'Font.TTF', 'Font 2.TTF', 'Squarely-R.ttf', 'Squarely.ttf'
        ]
    }
};

// Make CONFIG globally available
window.CONFIG = CONFIG;

// Utility functions are now defined in utils.js

// Global game state variables
let gameState = 'loading';
let scored = false;
let overtime = false;
let timeLeft = CONFIG.END_TIME;

// Player info - from Python lines 1499-1503
let p1Info = { head: 'Mihir', cleat: 8 };
let p2Info = { head: 'Nuwan', cleat: 3 };

// Sound effect counters - from Python lines 1496-1497
let goalSfx = 1;
let cheerSfx = 1;