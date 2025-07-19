// Head Soccer Game - Main Entry Point
class HeadSoccerGame {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.lastTime = 0;
        this.accumulator = 0;
        this.gameRunning = false;
        
        // Game objects
        this.ball = null;
        this.particleSystem = null;
        
        // Mouse position for particles
        this.mouseX = 0;
        this.mouseY = 0;
        
        this.init();
    }
    
    async init() {
        console.log('Initializing Head Soccer Game...');
        
        // Get canvas and context
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        if (!this.canvas || !this.ctx) {
            console.error('Failed to get canvas or context');
            return;
        }
        
        // Set up canvas
        this.canvas.width = CONFIG.WIDTH;
        this.canvas.height = CONFIG.HEIGHT;
        
        console.log(`Canvas size: ${this.canvas.width}x${this.canvas.height}`);
        
        // Initialize global instances
        window.assetLoader = assetLoader = new AssetLoader();
        window.physicsEngine = physicsEngine = new PhysicsEngine();
        
        // Set up mouse tracking for particles
        this.setupMouseTracking();
        
        // Load all assets
        console.log('Loading assets...');
        const assetsLoaded = await assetLoader.loadAllAssets();
        
        if (!assetsLoaded) {
            console.error('Failed to load assets');
            return;
        }
        
        // Verify assets
        if (!assetLoader.verifyAssets()) {
            console.error('Asset verification failed');
            return;
        }
        
        console.log('Assets loaded successfully!');
        
        // Initialize game objects
        this.initializeGameObjects();
        
        // Start game loop
        this.startGameLoop();
    }
    
    initializeGameObjects() {
        console.log('Initializing game objects...');
        
        // Create ball
        this.ball = new Ball(CONFIG.BALL_START_X, CONFIG.BALL_START_Y);
        window.ball = this.ball; // Make globally accessible
        
        // Create players
        this.player1 = new Player(CONFIG.WIDTH * 0.25, CONFIG.HEIGHT - 150, 1);
        this.player2 = new Player(CONFIG.WIDTH * 0.75, CONFIG.HEIGHT - 150, 2);
        window.player1 = this.player1; // Make globally accessible
        window.player2 = this.player2;
        
        // Create particle system
        this.particleSystem = new ParticleSystem(CONFIG.WIDTH, CONFIG.HEIGHT);
        
        // Start background music
        if (assetLoader && assetLoader.startBackgroundCrowd) {
            assetLoader.startBackgroundCrowd();
        }
        
        console.log('Game objects initialized!');
    }
    
    setupMouseTracking() {
        this.canvas.addEventListener('mousemove', (event) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            
            this.mouseX = (event.clientX - rect.left) * scaleX;
            this.mouseY = (event.clientY - rect.top) * scaleY;
        });
        
        // Default mouse position to center
        this.mouseX = CONFIG.WIDTH / 2;
        this.mouseY = CONFIG.HEIGHT / 2;
    }
    
    startGameLoop() {
        console.log('Starting game loop...');
        this.gameRunning = true;
        this.gameLoop();
    }
    
    gameLoop(currentTime = 0) {
        if (!this.gameRunning) return;
        
        // Calculate delta time
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        
        // Fixed timestep physics (exact from Python)
        this.accumulator += deltaTime;
        while (this.accumulator >= CONFIG.DT) {
            this.update(CONFIG.DT);
            this.accumulator -= CONFIG.DT;
        }
        
        // Render
        this.render();
        
        // Continue loop
        requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    update(dt) {
        // Update physics engine
        if (physicsEngine) {
            physicsEngine.update(dt);
        }
        
        // Update ball
        if (this.ball) {
            this.ball.update();
        }
        
        // Update players
        if (this.player1) {
            this.player1.update();
        }
        if (this.player2) {
            this.player2.update();
        }
        
        // Update particle system
        if (this.particleSystem) {
            this.particleSystem.update(this.mouseX, this.mouseY);
        }
    }
    
    render() {
        // Clear canvas with background color
        this.ctx.fillStyle = Utils.colorToCSS(CONFIG.BACKGROUND_COLOR);
        this.ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
        
        // Draw particle system background
        if (this.particleSystem) {
            this.particleSystem.draw(this.ctx);
        }
        
        // Draw borders (simple visualization)
        this.drawBorders();
        
        // Draw ball
        if (this.ball) {
            this.ball.draw(this.ctx);
        }
        
        // Draw players
        if (this.player1) {
            this.player1.draw(this.ctx);
        }
        if (this.player2) {
            this.player2.draw(this.ctx);
        }
        
        // Draw debug info
        this.drawDebugInfo();
        
        // Uncomment for physics debug visualization
        // physicsEngine.debugDraw(this.ctx);
    }
    
    drawBorders() {
        this.ctx.save();
        
        // Draw goal areas
        this.ctx.strokeStyle = Utils.colorToCSS([155, 155, 155]);
        this.ctx.lineWidth = 10;
        
        // Left goal
        this.ctx.beginPath();
        this.ctx.moveTo(0, CONFIG.HEIGHT - CONFIG.GOAL_HEIGHT);
        this.ctx.lineTo(CONFIG.GOAL_WIDTH, CONFIG.HEIGHT - CONFIG.GOAL_HEIGHT);
        this.ctx.stroke();
        
        // Right goal
        this.ctx.beginPath();
        this.ctx.moveTo(CONFIG.WIDTH - CONFIG.GOAL_WIDTH, CONFIG.HEIGHT - CONFIG.GOAL_HEIGHT);
        this.ctx.lineTo(CONFIG.WIDTH, CONFIG.HEIGHT - CONFIG.GOAL_HEIGHT);
        this.ctx.stroke();
        
        // Goal posts
        this.ctx.fillStyle = Utils.colorToCSS([155, 155, 155]);
        this.ctx.beginPath();
        this.ctx.arc(CONFIG.GOAL_WIDTH, CONFIG.HEIGHT - CONFIG.GOAL_HEIGHT + 1, 4, 0, 2 * Math.PI);
        this.ctx.fill();
        
        this.ctx.beginPath();
        this.ctx.arc(CONFIG.WIDTH - CONFIG.GOAL_WIDTH, CONFIG.HEIGHT - CONFIG.GOAL_HEIGHT + 1, 4, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Draw simplified borders
        this.ctx.fillStyle = Utils.colorToCSS([55, 55, 55]);
        
        // Left curve (simplified)
        this.ctx.fillRect(0, 0, CONFIG.WIDTH / 4, CONFIG.HEIGHT / 3);
        
        // Right curve (simplified)
        this.ctx.fillRect(CONFIG.WIDTH * 3/4, 0, CONFIG.WIDTH / 4, CONFIG.HEIGHT / 3);
        
        // Floor
        this.ctx.fillRect(0, CONFIG.HEIGHT * 0.98, CONFIG.WIDTH, CONFIG.HEIGHT * 0.02);
        
        this.ctx.restore();
    }
    
    drawDebugInfo() {
        this.ctx.save();
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px Arial';
        
        let y = 30;
        const lineHeight = 20;
        
        // Asset loading info
        const progress = assetLoader.getProgress();
        this.ctx.fillText(`Assets: ${progress.loaded}/${progress.total} (${Math.floor(progress.percentage)}%)`, 10, y);
        y += lineHeight;
        
        // Ball info
        if (this.ball) {
            const ballPos = this.ball.getPosition();
            const ballVel = this.ball.getVelocity();
            this.ctx.fillText(`Ball: (${Math.floor(ballPos.x)}, ${Math.floor(ballPos.y)})`, 10, y);
            y += lineHeight;
            this.ctx.fillText(`Ball Vel: (${Math.floor(ballVel.x)}, ${Math.floor(ballVel.y)})`, 10, y);
            y += lineHeight;
        }
        
        // Physics info
        const bodies = physicsEngine.getAllBodies();
        this.ctx.fillText(`Physics Bodies: ${bodies.length}`, 10, y);
        y += lineHeight;
        
        // Particle info
        if (this.particleSystem) {
            this.ctx.fillText(`Particles: ${this.particleSystem.particles.length}`, 10, y);
            y += lineHeight;
        }
        
        // Mouse position
        this.ctx.fillText(`Mouse: (${Math.floor(this.mouseX)}, ${Math.floor(this.mouseY)})`, 10, y);
        
        this.ctx.restore();
    }
    
    // Cleanup when page unloads
    destroy() {
        this.gameRunning = false;
        
        if (this.ball) {
            this.ball.destroy();
        }
        
        if (this.player1) {
            this.player1.destroy();
        }
        
        if (this.player2) {
            this.player2.destroy();
        }
        
        if (physicsEngine) {
            physicsEngine.destroy();
        }
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, starting Head Soccer...');
    
    // Create global game instance
    window.game = new HeadSoccerGame();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (window.game) {
            window.game.destroy();
        }
    });
});

// Global variables for compatibility (declared in config.js)
// let scored = false;  // Already declared in config.js
let player1 = null;
let player2 = null;