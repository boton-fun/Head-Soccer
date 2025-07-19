/**
 * Phaser Game Initialization
 * Sets up the Phaser 3 game with physics integration
 */

class PhaserGameManager {
    constructor() {
        this.game = null;
        this.scene = null;
        this.gameSettings = null;
        
        this.init();
    }
    
    init() {
        // Load game settings
        this.gameSettings = JSON.parse(sessionStorage.getItem('gameSettings') || '{}');
        console.log('Game settings loaded:', this.gameSettings);
        
        // Initialize Phaser
        this.createGame();
    }
    
    createGame() {
        const config = {
            type: Phaser.AUTO,
            width: PHYSICS_CONSTANTS.FIELD.WIDTH,
            height: PHYSICS_CONSTANTS.FIELD.HEIGHT,
            parent: 'game-container',
            physics: {
                default: 'arcade',
                arcade: {
                    gravity: { y: 0 }, // We handle gravity manually
                    debug: false
                }
            },
            scene: GameScene,
            fps: {
                target: PHYSICS_CONSTANTS.FPS,
                forceSetTimeOut: true
            },
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH
            }
        };
        
        this.game = new Phaser.Game(config);
        
        console.log('Phaser game initialized');
        
        // Set up game event listeners
        this.setupGameEvents();
    }
    
    setupGameEvents() {
        // Handle game events
        this.game.events.on('ready', () => {
            console.log('Game ready');
            this.scene = this.game.scene.getScene('GameScene');
        });
    }
    
    getGameSettings() {
        return this.gameSettings;
    }
    
    destroy() {
        if (this.game) {
            this.game.destroy(true);
            this.game = null;
        }
    }
}

// Export for use in gameplay.html
window.PhaserGameManager = PhaserGameManager;