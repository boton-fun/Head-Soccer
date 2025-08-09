/**
 * Head Soccer Multiplayer Client
 * Real-time multiplayer game client with exact single-player physics feel
 */

class MultiplayerClient {
    constructor() {
        this.socket = null;
        this.gameState = null;
        this.canvas = null;
        this.ctx = null;
        this.roomCode = null;
        this.playerIndex = -1;
        this.lastFrameTime = 0;
        this.fps = 0;
        this.ping = 0;
        
        // Input state
        this.keys = {
            left: false,
            right: false,
            up: false,
            kick: false
        };
        
        // Character customization from URL
        this.characterData = null;
        
        // Asset cache - preloaded images
        this.sprites = {};
        this.assetsLoaded = false;
        this.assetsToLoad = 0;
        this.assetsLoadedCount = 0;
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.parseUrlParams();
        this.preloadAssets(() => {
            // Only start everything after assets are loaded
            this.connectToServer();
            this.setupInputHandlers();
            this.setupUI();
            this.startRenderLoop();
        });
    }
    
    setupCanvas() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Set canvas size to maintain aspect ratio
        this.canvas.width = 800;
        this.canvas.height = 450;
    }
    
    parseUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Debug: Log all URL parameters
        console.log('All URL parameters:');
        for (const [key, value] of urlParams.entries()) {
            console.log(`  ${key}: ${value}`);
        }
        
        // Get match data
        this.matchId = urlParams.get('matchId') || this.generateRoomCode();
        this.roomCode = this.matchId;
        document.getElementById('room-code-display').textContent = this.roomCode;
        
        // Parse player data
        this.player1Name = urlParams.get('player1') || 'Player 1';
        this.player2Name = urlParams.get('player2') || 'Player 2';
        this.isPlayer1 = urlParams.get('isPlayer1') === 'true';
        
        // Debug individual parameter values
        console.log('Raw URL parameters:');
        console.log('  player1:', urlParams.get('player1'));
        console.log('  player2:', urlParams.get('player2'));
        console.log('  player1Head:', urlParams.get('player1Head'));
        console.log('  player2Head:', urlParams.get('player2Head'));
        
        // Parse character selections (using the actual URL format)
        this.characterData = {
            player1: {
                name: this.player1Name,
                head: urlParams.get('player1Head') || 'Dad',
                cleat: urlParams.get('player1Cleat') || '1'
            },
            player2: {
                name: this.player2Name,
                head: urlParams.get('player2Head') || 'Mihir', 
                cleat: urlParams.get('player2Cleat') || '2'
            }
        };
        
        console.log('Character data:', this.characterData);
        console.log('Is Player 1:', this.isPlayer1);
    }
    
    preloadAssets(callback) {
        console.log('Preloading assets...');
        
        // List of assets to preload - using same names as 1P version
        const player1Head = this.characterData.player1.head || 'Dad'; // Default fallback
        const player2Head = this.characterData.player2.head || 'Mihir'; // Default fallback
        
        console.log('Loading player heads:', { player1Head, player2Head });
        
        const assetsToLoad = [
            { key: 'ball', path: '../../assets/Ball 01.png' },
            { key: 'goalSide', path: '../../assets/Goal - Side.png' },
            { key: 'player1Head', path: `../../assets/${player1Head}_Head.png` },
            { key: 'player2Head', path: `../../assets/${player2Head}_Head.png` }
        ];
        
        this.assetsToLoad = assetsToLoad.length;
        this.assetsLoadedCount = 0;
        
        // Load each asset
        assetsToLoad.forEach(asset => {
            const img = new Image();
            
            img.onload = () => {
                this.sprites[asset.key] = img;
                this.assetsLoadedCount++;
                console.log(`✅ Loaded: ${asset.key} (${this.assetsLoadedCount}/${this.assetsToLoad})`);
                
                // Check if all assets are loaded
                if (this.assetsLoadedCount === this.assetsToLoad) {
                    this.assetsLoaded = true;
                    console.log('🎯 All assets preloaded successfully!');
                    callback();
                }
            };
            
            img.onerror = () => {
                console.error(`❌ Failed to load: ${asset.key} from ${asset.path}`);
                // Create fallback sprite
                this.sprites[asset.key] = null;
                this.assetsLoadedCount++;
                
                // Continue even with failed assets
                if (this.assetsLoadedCount === this.assetsToLoad) {
                    this.assetsLoaded = true;
                    console.log('⚠️ Asset loading completed with some errors');
                    callback();
                }
            };
            
            img.src = asset.path;
            console.log(`📦 Loading: ${asset.key} from ${asset.path}`);
        });
    }
    
    generateRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    
    connectToServer() {
        const serverUrl = window.location.origin;
        this.socket = io(serverUrl);
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus('connected', 'Connected');
            
            // Join game with character data
            this.socket.emit('joinGame', {
                roomCode: this.roomCode,
                characterData: this.characterData,
                playerName: sessionStorage.getItem('playerName') || 'Player'
            });
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus('disconnected', 'Disconnected');
            this.showGameStatus('Connection Lost', 'Trying to reconnect...');
        });
        
        this.socket.on('gameState', (state) => {
            this.gameState = state;
            this.updateUI(state);
        });
        
        this.socket.on('gameStart', () => {
            console.log('🎮 Game started! Hiding waiting screen...');
            this.hideGameStatus();
        });
        
        this.socket.on('playerJoined', (data) => {
            console.log(`Player joined: ${data.playerName}`);
        });
        
        this.socket.on('playerDisconnected', (playerIndex) => {
            console.log(`Player ${playerIndex + 1} disconnected`);
            this.showGameStatus('Player Disconnected', 'Waiting for player to reconnect...');
        });
        
        this.socket.on('goal', (data) => {
            this.showGoalAnimation(data.scorer, data.playerName);
        });
        
        this.socket.on('gameOver', (result) => {
            this.showGameOverScreen(result);
        });
        
        this.socket.on('roomFull', () => {
            this.showGameStatus('Room Full', 'This room already has 2 players.');
        });
        
        // Ping measurement
        setInterval(() => {
            const start = Date.now();
            this.socket.emit('ping', start);
        }, 1000);
        
        this.socket.on('pong', (timestamp) => {
            this.ping = Date.now() - timestamp;
        });
    }
    
    setupInputHandlers() {
        document.addEventListener('keydown', (e) => {
            this.handleKeyDown(e);
        });
        
        document.addEventListener('keyup', (e) => {
            this.handleKeyUp(e);
        });
        
        // Debug toggle
        document.addEventListener('keydown', (e) => {
            if (e.key === 'd' || e.key === 'D') {
                const debugInfo = document.getElementById('debug-info');
                debugInfo.style.display = debugInfo.style.display === 'none' ? 'block' : 'none';
            }
        });
    }
    
    handleKeyDown(e) {
        let inputChanged = false;
        
        switch(e.code) {
            // Arrow Keys (Primary)
            case 'ArrowLeft':
                if (!this.keys.left) {
                    this.keys.left = true;
                    inputChanged = true;
                }
                e.preventDefault();
                break;
            case 'ArrowRight':
                if (!this.keys.right) {
                    this.keys.right = true;
                    inputChanged = true;
                }
                e.preventDefault();
                break;
            case 'ArrowUp':
                if (!this.keys.up) {
                    this.keys.up = true;
                    inputChanged = true;
                }
                e.preventDefault();
                break;
            case 'ArrowDown':
                if (!this.keys.kick) {
                    this.keys.kick = true;
                    inputChanged = true;
                }
                e.preventDefault();
                break;
                
            // WASD (Alternative)
            case 'KeyA':
                if (!this.keys.left) {
                    this.keys.left = true;
                    inputChanged = true;
                }
                break;
            case 'KeyD':
                if (!this.keys.right) {
                    this.keys.right = true;
                    inputChanged = true;
                }
                break;
            case 'KeyW':
                if (!this.keys.up) {
                    this.keys.up = true;
                    inputChanged = true;
                }
                break;
            case 'KeyS':
                if (!this.keys.kick) {
                    this.keys.kick = true;
                    inputChanged = true;
                }
                break;
        }
        
        if (inputChanged) {
            this.sendInput();
        }
    }
    
    handleKeyUp(e) {
        let inputChanged = false;
        
        switch(e.code) {
            // Arrow Keys
            case 'ArrowLeft':
                if (this.keys.left) {
                    this.keys.left = false;
                    inputChanged = true;
                }
                break;
            case 'ArrowRight':
                if (this.keys.right) {
                    this.keys.right = false;
                    inputChanged = true;
                }
                break;
            case 'ArrowUp':
                if (this.keys.up) {
                    this.keys.up = false;
                    inputChanged = true;
                }
                break;
            case 'ArrowDown':
                if (this.keys.kick) {
                    this.keys.kick = false;
                    inputChanged = true;
                }
                break;
                
            // WASD
            case 'KeyA':
                if (this.keys.left) {
                    this.keys.left = false;
                    inputChanged = true;
                }
                break;
            case 'KeyD':
                if (this.keys.right) {
                    this.keys.right = false;
                    inputChanged = true;
                }
                break;
            case 'KeyW':
                if (this.keys.up) {
                    this.keys.up = false;
                    inputChanged = true;
                }
                break;
            case 'KeyS':
                if (this.keys.kick) {
                    this.keys.kick = false;
                    inputChanged = true;
                }
                break;
        }
        
        if (inputChanged) {
            this.sendInput();
        }
    }
    
    sendInput() {
        if (this.socket && this.socket.connected) {
            this.socket.emit('input', {
                left: this.keys.left,
                right: this.keys.right,
                up: this.keys.up,
                kick: this.keys.kick,
                timestamp: Date.now()
            });
        }
    }
    
    setupUI() {
        // Set player names immediately
        document.getElementById('player1-name').textContent = this.player1Name;
        document.getElementById('player2-name').textContent = this.player2Name;
        
        this.showGameStatus('Waiting for players...', 'Share the room code with a friend!');
    }
    
    updateConnectionStatus(status, text) {
        const element = document.getElementById('connection-status');
        element.textContent = text;
        element.className = status;
    }
    
    showGameStatus(title, message) {
        const statusElement = document.getElementById('game-status');
        statusElement.querySelector('h2').textContent = title;
        statusElement.querySelector('p').textContent = message;
        statusElement.style.display = 'block';
    }
    
    hideGameStatus() {
        document.getElementById('game-status').style.display = 'none';
    }
    
    updateUI(state) {
        if (!state) return;
        
        // Update timer
        const minutes = Math.floor(state.time / 60);
        const seconds = state.time % 60;
        document.getElementById('timer-display').textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Update scores and player names  
        document.getElementById('player1-name').textContent = this.player1Name;
        document.getElementById('player2-name').textContent = this.player2Name;
        document.getElementById('player1-score').textContent = state.players[0].score;
        document.getElementById('player2-score').textContent = state.players[1].score;
        
        // Update debug info
        const playerCount = state.players.filter(p => p.id).length;
        document.getElementById('player-count').textContent = `${playerCount}/2`;
        document.getElementById('ball-pos').textContent = `${Math.round(state.ball.position.x)},${Math.round(state.ball.position.y)}`;
        document.getElementById('ping').textContent = this.ping;
    }
    
    showGoalAnimation(scorer, playerName) {
        // Simple goal notification
        const color = scorer === 0 ? '#2196F3' : '#F44336';
        this.showGameStatus('GOAL!', `${playerName} scored!`);
        
        // Hide after 2 seconds
        setTimeout(() => {
            if (this.gameState && this.gameState.gameStarted && !this.gameState.gameOver) {
                this.hideGameStatus();
            }
        }, 2000);
    }
    
    showGameOverScreen(result) {
        let title = 'Game Over';
        let message = '';
        
        if (result.winner === -1) {
            title = 'Draw!';
            message = `Final Score: ${result.scores[0]} - ${result.scores[1]}`;
        } else {
            title = `${result.winnerName} Wins!`;
            message = `Final Score: ${result.scores[0]} - ${result.scores[1]}`;
        }
        
        this.showGameStatus(title, message);
    }
    
    startRenderLoop() {
        const renderFrame = (timestamp) => {
            this.calculateFPS(timestamp);
            this.render();
            requestAnimationFrame(renderFrame);
        };
        requestAnimationFrame(renderFrame);
    }
    
    calculateFPS(timestamp) {
        if (this.lastFrameTime) {
            const deltaTime = timestamp - this.lastFrameTime;
            this.fps = Math.round(1000 / deltaTime);
            document.getElementById('fps').textContent = this.fps;
        }
        this.lastFrameTime = timestamp;
    }
    
    render() {
        this.clearCanvas();
        this.drawField();
        this.drawGoals();
        
        if (this.gameState) {
            // Draw live game state
            this.drawBall();
            this.drawPlayers();
        } else {
            // Draw static preview while waiting
            this.drawStaticBall();
            this.drawStaticPlayers();
        }
    }
    
    clearCanvas() {
        // Space-themed background
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#000011');
        gradient.addColorStop(1, '#001133');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    drawField() {
        const scaleX = this.canvas.width / 1600;  // Scale from 1600 to 800
        const scaleY = this.canvas.height / 900;  // Scale from 900 to 450
        
        // Draw ground platform
        const groundY = (900 - 20) * scaleY; // 880 scaled
        this.ctx.fillStyle = '#2a2a4a';
        this.ctx.fillRect(0, groundY, this.canvas.width, 20 * scaleY);
        
        // Glowing platform edge
        this.ctx.strokeStyle = '#66ccff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, groundY);
        this.ctx.lineTo(this.canvas.width, groundY);
        this.ctx.stroke();
        
        // Center line
        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 2;
        this.ctx.globalAlpha = 0.6;
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width / 2, 0);
        this.ctx.lineTo(this.canvas.width / 2, groundY);
        this.ctx.stroke();
        
        // Center circle (like in target image)
        const centerX = this.canvas.width / 2;
        const centerY = groundY - 100 * scaleY; // Above ground
        const circleRadius = 80 * Math.min(scaleX, scaleY);
        
        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
        this.ctx.stroke();
        
        this.ctx.globalAlpha = 1;
    }
    
    drawGoals() {
        const scaleX = this.canvas.width / 1600;
        const scaleY = this.canvas.height / 900;
        
        const goalWidth = 75 * scaleX;
        const goalHeight = 250 * scaleY;
        const goalY = (900 - 250 - 20) * scaleY; // 650 scaled
        
        // Use preloaded goal image
        const goalImg = this.sprites.goalSide;
        if (goalImg) {
            // Draw left goal
            this.ctx.drawImage(goalImg, 0, goalY, goalWidth, goalHeight);
            
            // Draw right goal (flipped)
            this.ctx.save();
            this.ctx.scale(-1, 1);
            this.ctx.drawImage(goalImg, -this.canvas.width, goalY, goalWidth, goalHeight);
            this.ctx.restore();
        } else {
            // Fallback to white rectangles
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.rect(0, goalY, goalWidth, goalHeight);
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.rect(this.canvas.width - goalWidth, goalY, goalWidth, goalHeight);
            this.ctx.stroke();
        }
    }
    
    drawBall() {
        const ball = this.gameState.ball;
        const scaleX = this.canvas.width / 1600;
        const scaleY = this.canvas.height / 900;
        
        const x = ball.position.x * scaleX;
        const y = ball.position.y * scaleY;
        const radius = 25 * Math.min(scaleX, scaleY);
        
        // Ball with glow effect
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = '#ffffff';
        this.ctx.fillStyle = 'white';
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
    }
    
    drawPlayers() {
        this.gameState.players.forEach((player, index) => {
            if (player.id) {
                this.drawPlayer(player, index);
            }
        });
    }
    
    drawPlayer(player, index) {
        const scaleX = this.canvas.width / 1600;
        const scaleY = this.canvas.height / 900;
        
        const x = player.position.x * scaleX;
        const y = player.position.y * scaleY;
        const width = 50 * scaleX;
        const height = 80 * scaleY;
        
        // Player color
        const color = index === 0 ? '#2196F3' : '#F44336';
        
        // Draw simple character (will be replaced with sprites later)
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x - width/2, y - height/2, width, height);
        
        // Player head
        this.ctx.beginPath();
        this.ctx.arc(x, y - height/3, width/3, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Highlight current player
        if (player.id === this.socket.id) {
            this.ctx.strokeStyle = '#00ff00';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x - width/2 - 2, y - height/2 - 2, width + 4, height + 4);
        }
        
        // Player name
        this.ctx.fillStyle = color;
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(player.name, x, y - height/2 - 10);
        
        // Kick indicator
        if (player.isKicking) {
            this.ctx.strokeStyle = '#ffff00';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.arc(x, y, width/2 + 10, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }
    
    drawStaticBall() {
        // Draw ball in center using preloaded Ball 01.png asset
        const scaleX = this.canvas.width / 1600;
        const scaleY = this.canvas.height / 900;
        const x = this.canvas.width / 2;
        const groundY = (900 - 20) * scaleY;
        const ballRadius = 25 * Math.min(scaleX, scaleY);
        const y = groundY - ballRadius;
        
        // Use preloaded ball image
        const ballImg = this.sprites.ball;
        if (ballImg) {
            this.ctx.drawImage(ballImg, x - ballRadius, y - ballRadius, ballRadius * 2, ballRadius * 2);
        } else {
            // Fallback to white circle
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = '#ffffff';
            this.ctx.fillStyle = 'white';
            this.ctx.beginPath();
            this.ctx.arc(x, y, ballRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }
    }
    
    drawStaticPlayers() {
        const scaleX = this.canvas.width / 1600;
        const scaleY = this.canvas.height / 900;
        
        // Player positions
        const player1X = 400 * scaleX;
        const player2X = 1200 * scaleX; 
        const groundY = (900 - 20) * scaleY;
        const playerY = groundY - 40 * scaleY; // On ground
        
        // Draw Player 1
        this.drawStaticPlayer(
            player1X, 
            playerY, 
            this.characterData.player1.head, 
            this.characterData.player1.name,
            '#2196F3'
        );
        
        // Draw Player 2  
        this.drawStaticPlayer(
            player2X, 
            playerY,
            this.characterData.player2.head,
            this.characterData.player2.name, 
            '#F44336'
        );
    }
    
    drawStaticPlayer(x, y, headName, playerName, color) {
        const scaleX = this.canvas.width / 1600;
        const scaleY = this.canvas.height / 900;
        const headSize = 60 * Math.min(scaleX, scaleY);
        
        // Use preloaded character head
        const playerIndex = playerName === this.characterData.player1.name ? 1 : 2;
        const headImg = this.sprites[`player${playerIndex}Head`];
        
        if (headImg) {
            this.ctx.drawImage(headImg, x - headSize/2, y - headSize/2, headSize, headSize);
        } else {
            // Fallback to colored circle
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(x, y, headSize/2, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Draw player name
        this.ctx.fillStyle = color;
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(playerName, x, y + headSize/2 + 20);
    }
}

// Initialize the multiplayer client when page loads
let multiplayerClient;
document.addEventListener('DOMContentLoaded', () => {
    multiplayerClient = new MultiplayerClient();
});