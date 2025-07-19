/**
 * Physics constants replicating the JavaScript src/ implementation
 * Exact values from Ball.js, Character.js, and Game.js
 */

window.PHYSICS_CONSTANTS = {
    // Core physics - JavaScript implementation
    GRAVITY: 0.5, // From Ball.js and Character.js - frame-based gravity
    FPS: 60, // Target FPS
    
    // Field dimensions
    FIELD: {
        WIDTH: 1600,
        HEIGHT: 900,
        BOTTOM_GAP: 20, // From JavaScript implementation
        GOAL_WIDTH: 75,
        GOAL_HEIGHT: 250,
        PLAYER_START_X_RATIO: 0.25,
        PLAYER_START_Y: 750,
        BALL_START_X_RATIO: 0.5,
        BALL_START_Y: 400
    },
    
    // Ball physics - JavaScript implementation values
    BALL: {
        RADIUS: 25, // From Ball.js
        GRAVITY: 0.5, // From Ball.js - frame-based gravity
        BOUNCE: 0.95, // Very high bounce coefficient for dramatic bounces
        FRICTION_AIR: 0, // No air resistance in original implementation
        INITIAL_VEL_X: 0, // Start stationary
        INITIAL_VEL_Y: 0
    },
    
    // Player physics - JavaScript implementation values
    PLAYER: {
        WIDTH: 50, // Character width
        HEIGHT: 80, // Character height
        GRAVITY: 0.5, // From Character.js
        MOVE_SPEED: 5, // From Character.js - horizontal movement (FIXED from 8)
        JUMP_HEIGHT: 15, // From Character.js - jump velocity (FIXED from 16)
        GROUND_THRESHOLD: 5, // Distance from ground to allow jumping
        FRICTION: 0.85 // Ground friction
    },
    
    // Kick physics - JavaScript implementation
    KICK: {
        FORCE_MIN: 18, // Much higher for dramatic kicks
        FORCE_MAX: 25, // Very high for spectacular shots
        COOLDOWN: 10 // Frames (reduced from 30 for better responsiveness)
    },
    
    // Goal detection
    GOAL: {
        LEFT_X: 75, // goal_width
        RIGHT_X: 1525, // width - goal_width
        Y_THRESHOLD: 650 // height - goal_height
    },
    
    // Collision detection
    COLLISION: {
        BALL_CHARACTER_THRESHOLD: 5, // Minimum distance for collision
        BOUNCE_MULTIPLIER: 1.1 // Velocity enhancement on bounce
    }
};

// Utility functions for physics calculations
window.PHYSICS_CONSTANTS.UTILS = {
    // Random number generation
    random: (min, max) => Math.random() * (max - min) + min,
    
    // AABB collision detection (from JavaScript utility.js)
    isCollide: (objectA, objectB) => {
        return objectA.x + objectA.width >= objectB.x &&
               objectA.x <= objectB.x + objectB.width &&
               objectA.y + objectA.height >= objectB.y &&
               objectA.y <= objectB.y + objectB.height;
    },
    
    // Collision side detection
    collidedSide: (target, obstacle) => {
        const delta = {
            x: target.x + target.width / 2 - (obstacle.x + obstacle.width / 2),
            y: target.y + target.height / 2 - (obstacle.y + obstacle.height / 2)
        };
        
        const minDistance = {
            x: target.width / 2 + obstacle.width / 2,
            y: target.height / 2 + obstacle.height / 2
        };
        
        const depth = {
            x: delta.x > 0 ? minDistance.x - delta.x : -minDistance.x - delta.x,
            y: delta.y > 0 ? minDistance.y - delta.y : -minDistance.y - delta.y
        };
        
        if (Math.abs(depth.x) < Math.abs(depth.y)) {
            return delta.x > 0 ? "left" : "right";
        } else {
            return delta.y > 0 ? "top" : "bottom";
        }
    }
};

// Freeze constants to prevent modification
Object.freeze(window.PHYSICS_CONSTANTS.FIELD);
Object.freeze(window.PHYSICS_CONSTANTS.BALL);
Object.freeze(window.PHYSICS_CONSTANTS.PLAYER);
Object.freeze(window.PHYSICS_CONSTANTS.KICK);
Object.freeze(window.PHYSICS_CONSTANTS.GOAL);
Object.freeze(window.PHYSICS_CONSTANTS.COLLISION);
Object.freeze(window.PHYSICS_CONSTANTS.UTILS);
Object.freeze(window.PHYSICS_CONSTANTS);