// Ball.js - Soccer ball physics and rendering
class Ball {
    constructor(x, y, radius = 25) {
        this.radius = radius;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        
        // Physics properties
        this.restitution = 0.8;
        this.friction = 0.95;
        this.airResistance = 0.999;
        this.gravity = 800;
        
        // Visual properties
        this.rotation = 0;
        this.rotationSpeed = 0;
        
        // Trail effect
        this.trail = [];
        this.maxTrailLength = 10;
        
        console.log(`Ball created at (${x}, ${y})`);
    }
    
    update() {
        // Apply gravity
        this.vy += this.gravity * CONFIG.DT;
        
        // Apply air resistance
        this.vx *= this.airResistance;
        this.vy *= this.airResistance;
        
        // Update position
        this.x += this.vx * CONFIG.DT;
        this.y += this.vy * CONFIG.DT;
        
        // Update rotation based on horizontal velocity
        this.rotationSpeed = this.vx * 0.01;
        this.rotation += this.rotationSpeed;
        
        // Add to trail
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
        
        // Boundary collisions
        this.handleBoundaryCollisions();
    }
    
    handleBoundaryCollisions() {
        // Floor collision
        if (this.y + this.radius > CONFIG.HEIGHT) {
            this.y = CONFIG.HEIGHT - this.radius;
            this.vy *= -this.restitution;
            this.vx *= this.friction;
            
            // Play bounce sound
            if (window.assetLoader) {
                assetLoader.playSound('bounce');
            }
        }
        
        // Ceiling collision
        if (this.y - this.radius < 0) {
            this.y = this.radius;
            this.vy *= -this.restitution;
        }
        
        // Side walls
        if (this.x - this.radius < 0) {
            this.x = this.radius;
            this.vx *= -this.restitution;
        }
        
        if (this.x + this.radius > CONFIG.WIDTH) {
            this.x = CONFIG.WIDTH - this.radius;
            this.vx *= -this.restitution;
        }
        
        // Goal detection
        this.checkGoals();
    }
    
    checkGoals() {
        // Left goal
        if (this.x - this.radius < CONFIG.GOAL_WIDTH && 
            this.y + this.radius > CONFIG.HEIGHT - CONFIG.GOAL_HEIGHT) {
            this.onGoalScored('right');
        }
        
        // Right goal
        if (this.x + this.radius > CONFIG.WIDTH - CONFIG.GOAL_WIDTH && 
            this.y + this.radius > CONFIG.HEIGHT - CONFIG.GOAL_HEIGHT) {
            this.onGoalScored('left');
        }
    }
    
    onGoalScored(scoringSide) {
        if (!window.scored) {
            window.scored = true;
            console.log(`Goal scored by ${scoringSide} side!`);
            
            // Play goal sound
            if (window.assetLoader) {
                assetLoader.playGoalSound();
            }
            
            // Reset ball after short delay
            setTimeout(() => {
                this.reset();
                window.scored = false;
            }, 2000);
        }
    }
    
    reset() {
        this.x = CONFIG.BALL_START_X;
        this.y = CONFIG.BALL_START_Y;
        this.vx = 0;
        this.vy = 0;
        this.rotation = 0;
        this.rotationSpeed = 0;
        this.trail = [];
        console.log('Ball reset to center');
    }
    
    kick(forceX, forceY) {
        this.vx += forceX;
        this.vy += forceY;
        
        // Play kick sound
        if (window.assetLoader) {
            assetLoader.playSound('kick');
        }
        
        console.log(`Ball kicked with force (${forceX}, ${forceY})`);
    }
    
    draw(ctx) {
        ctx.save();
        
        // Draw trail
        this.drawTrail(ctx);
        
        // Draw ball shadow
        this.drawShadow(ctx);
        
        // Draw ball
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        // Ball gradient
        const gradient = ctx.createRadialGradient(-8, -8, 0, 0, 0, this.radius);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.3, '#f0f0f0');
        gradient.addColorStop(1, '#cccccc');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Ball pattern (soccer ball style)
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 2;
        
        // Pentagon pattern
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (i * Math.PI * 2) / 5;
            const x = Math.cos(angle) * this.radius * 0.6;
            const y = Math.sin(angle) * this.radius * 0.6;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        
        // Cross lines
        ctx.beginPath();
        ctx.moveTo(-this.radius * 0.8, 0);
        ctx.lineTo(this.radius * 0.8, 0);
        ctx.moveTo(0, -this.radius * 0.8);
        ctx.lineTo(0, this.radius * 0.8);
        ctx.stroke();
        
        ctx.restore();
    }
    
    drawTrail(ctx) {
        if (this.trail.length < 2) return;
        
        ctx.save();
        for (let i = 0; i < this.trail.length; i++) {
            const alpha = i / this.trail.length;
            ctx.globalAlpha = alpha * 0.3;
            ctx.fillStyle = '#ffffff';
            const size = (this.radius * alpha) * 0.5;
            ctx.beginPath();
            ctx.arc(this.trail[i].x, this.trail[i].y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    
    drawShadow(ctx) {
        const shadowY = CONFIG.HEIGHT - 10;
        const shadowDistance = shadowY - this.y;
        const shadowScale = Math.max(0.2, 1 - shadowDistance / 200);
        
        ctx.save();
        ctx.globalAlpha = 0.3 * shadowScale;
        ctx.fillStyle = '#000000';
        ctx.scale(1, 0.3);
        ctx.beginPath();
        ctx.arc(this.x, shadowY * 3.3, this.radius * shadowScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    
    getPosition() {
        return { x: this.x, y: this.y };
    }
    
    getVelocity() {
        return { x: this.vx, y: this.vy };
    }
    
    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }
    
    setVelocity(vx, vy) {
        this.vx = vx;
        this.vy = vy;
    }
    
    destroy() {
        this.trail = [];
        console.log('Ball destroyed');
    }
}