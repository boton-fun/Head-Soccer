// Player.js - Player character with physics and controls
class Player {
    constructor(x, y, playerNumber, character = 'default') {
        this.x = x;
        this.y = y;
        this.playerNumber = playerNumber;
        this.character = character;
        
        // Physical properties
        this.width = 60;
        this.height = 100;
        this.radius = 30;
        
        // Movement
        this.vx = 0;
        this.vy = 0;
        this.speed = 300;
        this.jumpPower = -600;
        this.onGround = false;
        
        // Physics
        this.gravity = 800;
        this.friction = 0.85;
        this.airResistance = 0.98;
        
        // Controls
        this.keys = this.getControlScheme();
        this.pressedKeys = new Set();
        
        // Visual
        this.facing = 1; // 1 for right, -1 for left
        this.animationFrame = 0;
        this.animationSpeed = 0.2;
        
        // Kicking
        this.kickCooldown = 0;
        this.kickCooldownMax = 500; // ms
        this.kickRange = 80;
        this.kickPower = 800;
        
        // Initialize controls
        this.setupControls();
        
        console.log(`Player ${playerNumber} created at (${x}, ${y})`);
    }
    
    getControlScheme() {
        if (this.playerNumber === 1) {
            return {
                left: 'KeyA',
                right: 'KeyD', 
                up: 'KeyW',
                kick: 'KeyS'
            };
        } else {
            return {
                left: 'ArrowLeft',
                right: 'ArrowRight',
                up: 'ArrowUp', 
                kick: 'ArrowDown'
            };
        }
    }
    
    setupControls() {
        document.addEventListener('keydown', (e) => {
            this.pressedKeys.add(e.code);
        });
        
        document.addEventListener('keyup', (e) => {
            this.pressedKeys.delete(e.code);
        });
    }
    
    update() {
        // Skip physics in 240 FPS multiplayer mode - server handles it
        if (window.isMultiplayer240FPS) {
            // Only update visual elements
            this.updateAnimation();
            this.updateKickCooldownVisual();
            return;
        }
        
        // Original single-player physics
        // Handle input
        this.handleInput();
        
        // Apply gravity
        this.vy += this.gravity * CONFIG.DT;
        
        // Apply air resistance
        this.vx *= this.airResistance;
        
        // Update position
        this.x += this.vx * CONFIG.DT;
        this.y += this.vy * CONFIG.DT;
        
        // Handle collisions
        this.handleCollisions();
        
        // Update animation
        this.updateAnimation();
        
        // Update kick cooldown
        if (this.kickCooldown > 0) {
            this.kickCooldown -= CONFIG.DT * 1000;
        }
        
        // Check for ball collision/kicking
        this.checkBallInteraction();
    }
    
    updateKickCooldownVisual() {
        // Update kick cooldown for visual effects only
        if (this.kickCooldown > 0) {
            this.kickCooldown -= CONFIG.DT * 1000;
        }
    }
    
    handleInput() {
        let moving = false;
        
        // Horizontal movement
        if (this.pressedKeys.has(this.keys.left)) {
            this.vx -= this.speed * CONFIG.DT;
            this.facing = -1;
            moving = true;
        }
        
        if (this.pressedKeys.has(this.keys.right)) {
            this.vx += this.speed * CONFIG.DT;
            this.facing = 1;
            moving = true;
        }
        
        // Apply friction when not moving
        if (!moving) {
            this.vx *= this.friction;
        }
        
        // Jumping
        if (this.pressedKeys.has(this.keys.up) && this.onGround) {
            this.vy = this.jumpPower;
            this.onGround = false;
            
            // Play jump sound
            if (window.assetLoader) {
                assetLoader.playSound('jump');
            }
        }
        
        // Kicking
        if (this.pressedKeys.has(this.keys.kick) && this.kickCooldown <= 0) {
            this.performKick();
        }
    }
    
    performKick() {
        if (!window.ball) return;
        
        const ballPos = window.ball.getPosition();
        const dx = ballPos.x - this.x;
        const dy = ballPos.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance <= this.kickRange) {
            // Calculate kick direction
            const angle = Math.atan2(dy, dx);
            const kickX = Math.cos(angle) * this.kickPower * this.facing;
            const kickY = Math.sin(angle) * this.kickPower - 200; // Add some upward force
            
            // Apply kick to ball
            window.ball.kick(kickX, kickY);
            
            // Set cooldown
            this.kickCooldown = this.kickCooldownMax;
            
            console.log(`Player ${this.playerNumber} kicked the ball!`);
        }
    }
    
    checkBallInteraction() {
        if (!window.ball) return;
        
        const ballPos = window.ball.getPosition();
        const dx = ballPos.x - this.x;
        const dy = ballPos.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = this.radius + window.ball.radius;
        
        if (distance < minDistance) {
            // Simple collision response
            const overlap = minDistance - distance;
            const angle = Math.atan2(dy, dx);
            
            // Push ball away
            const pushX = Math.cos(angle) * overlap * 0.5;
            const pushY = Math.sin(angle) * overlap * 0.5;
            
            window.ball.setPosition(ballPos.x + pushX, ballPos.y + pushY);
            
            // Transfer some velocity
            const ballVel = window.ball.getVelocity();
            window.ball.setVelocity(
                ballVel.x + this.vx * 0.3,
                ballVel.y + this.vy * 0.3
            );
        }
    }
    
    handleCollisions() {
        // Ground collision
        if (this.y + this.radius > CONFIG.HEIGHT) {
            this.y = CONFIG.HEIGHT - this.radius;
            this.vy = 0;
            this.onGround = true;
        } else {
            this.onGround = false;
        }
        
        // Ceiling collision
        if (this.y - this.radius < 0) {
            this.y = this.radius;
            this.vy = 0;
        }
        
        // Side boundaries
        if (this.x - this.radius < 0) {
            this.x = this.radius;
            this.vx = 0;
        }
        
        if (this.x + this.radius > CONFIG.WIDTH) {
            this.x = CONFIG.WIDTH - this.radius;
            this.vx = 0;
        }
    }
    
    updateAnimation() {
        // Simple animation based on movement
        if (Math.abs(this.vx) > 50) {
            this.animationFrame += this.animationSpeed;
        }
        
        if (this.animationFrame >= 4) {
            this.animationFrame = 0;
        }
    }
    
    draw(ctx) {
        ctx.save();
        
        // Draw shadow
        this.drawShadow(ctx);
        
        // Move to player position
        ctx.translate(this.x, this.y);
        
        // Flip horizontally based on facing direction
        if (this.facing < 0) {
            ctx.scale(-1, 1);
        }
        
        // Draw player body
        this.drawBody(ctx);
        
        // Draw kick indicator
        if (this.kickCooldown > 0) {
            this.drawKickCooldown(ctx);
        }
        
        ctx.restore();
    }
    
    drawBody(ctx) {
        // Player color based on player number
        const colors = {
            1: { primary: '#2196F3', secondary: '#1976D2' },
            2: { primary: '#F44336', secondary: '#D32F2F' }
        };
        
        const color = colors[this.playerNumber] || colors[1];
        
        // Body (circle for simplicity)
        const gradient = ctx.createRadialGradient(-5, -5, 0, 0, 0, this.radius);
        gradient.addColorStop(0, color.primary);
        gradient.addColorStop(1, color.secondary);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Outline
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Face features
        ctx.fillStyle = '#ffffff';
        
        // Eyes
        ctx.beginPath();
        ctx.arc(-8, -8, 3, 0, Math.PI * 2);
        ctx.arc(8, -8, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Pupils
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(-8, -8, 1, 0, Math.PI * 2);
        ctx.arc(8, -8, 1, 0, Math.PI * 2);
        ctx.fill();
        
        // Mouth
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 5, 8, 0, Math.PI);
        ctx.stroke();
        
        // Player number
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.playerNumber.toString(), 0, 25);
    }
    
    drawShadow(ctx) {
        const shadowY = CONFIG.HEIGHT - 5;
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#000000';
        ctx.scale(1, 0.3);
        ctx.beginPath();
        ctx.arc(this.x, shadowY * 3.3, this.radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    
    drawKickCooldown(ctx) {
        const progress = 1 - (this.kickCooldown / this.kickCooldownMax);
        const radius = this.radius + 10;
        const angle = progress * Math.PI * 2;
        
        ctx.save();
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + angle);
        ctx.stroke();
        ctx.restore();
    }
    
    getPosition() {
        return { x: this.x, y: this.y };
    }
    
    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }
    
    reset() {
        // Reset to starting position based on player number
        if (this.playerNumber === 1) {
            this.x = CONFIG.WIDTH * 0.25;
        } else {
            this.x = CONFIG.WIDTH * 0.75;
        }
        this.y = CONFIG.HEIGHT - this.radius - 50;
        this.vx = 0;
        this.vy = 0;
        this.kickCooldown = 0;
        
        console.log(`Player ${this.playerNumber} reset to starting position`);
    }
    
    destroy() {
        // Remove event listeners if needed
        console.log(`Player ${this.playerNumber} destroyed`);
    }
}