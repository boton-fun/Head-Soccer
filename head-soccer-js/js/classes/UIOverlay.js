// UI Overlay Class - Exact UI from original page_2.png
class UIOverlay {
    constructor() {
        // Score display positioning - center top
        this.scoreX = CONFIG.WIDTH / 2;
        this.scoreY = 80;
        
        // Timer positioning - below score
        this.timerX = CONFIG.WIDTH / 2;
        this.timerY = 140;
        
        // Player info box positions - exact from original
        this.player1InfoX = 50;
        this.player1InfoY = 50;
        this.player2InfoX = CONFIG.WIDTH - 200;
        this.player2InfoY = 50;
        this.infoBoxWidth = 200;
        this.infoBoxHeight = 120;
        
        // Game state
        this.player1Score = 0;
        this.player2Score = 0;
        this.timeLeft = CONFIG.END_TIME; // 5 minutes
        this.overtime = false;
        this.gameActive = true;
        
        // Player info from character selection or defaults
        this.player1Info = this.loadPlayerInfo(1);
        this.player2Info = this.loadPlayerInfo(2);
    }
    
    loadPlayerInfo(playerNum) {
        // Try to load from localStorage (character selection)
        const savedSettings = localStorage.getItem('headSoccerSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            return {
                head: playerNum === 1 ? settings.player1Head : settings.player2Head,
                cleat: playerNum === 1 ? settings.player1Cleat : settings.player2Cleat,
                controlType: playerNum === 1 ? 'KEYBOARD' : 'AI', // Default for now
                difficulty: playerNum === 1 ? 'HUMAN' : 'MEDIUM'
            };
        }
        
        // Default values matching original
        return {
            head: playerNum === 1 ? 'Mihir' : 'Nuwan',
            cleat: playerNum === 1 ? 8 : 3,
            controlType: playerNum === 1 ? 'KEYBOARD' : 'AI',
            difficulty: playerNum === 1 ? 'HUMAN' : 'MEDIUM'
        };
    }
    
    update(deltaTime) {
        if (this.gameActive && !this.overtime) {
            this.timeLeft -= deltaTime;
            if (this.timeLeft <= 0) {
                this.timeLeft = 0;
                this.checkForOvertime();
            }
        }
    }
    
    checkForOvertime() {
        if (this.player1Score === this.player2Score) {
            this.overtime = true;
            // Overtime continues until someone scores
        } else {
            this.gameActive = false;
        }
    }
    
    draw(ctx) {
        // Draw score display - exact styling from original
        this.drawScore(ctx);
        
        // Draw timer
        this.drawTimer(ctx);
        
        // Draw player info boxes
        this.drawPlayerInfo(ctx, 1, this.player1InfoX, this.player1InfoY);
        this.drawPlayerInfo(ctx, 2, this.player2InfoX, this.player2InfoY);
        
        // Draw additional UI elements
        this.drawGameStatus(ctx);
    }
    
    drawScore(ctx) {
        ctx.save();
        
        // Score background - dark rounded rectangle
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        
        const scoreWidth = 200;
        const scoreHeight = 60;
        const scoreX = this.scoreX - scoreWidth / 2;
        const scoreY = this.scoreY - scoreHeight / 2;
        
        this.drawRoundedRect(ctx, scoreX, scoreY, scoreWidth, scoreHeight, 15);
        ctx.fill();
        ctx.stroke();
        
        // Score text - exact from original "0 - 0"
        ctx.font = 'bold 36px Font, Arial';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const scoreText = `${this.player1Score} - ${this.player2Score}`;
        ctx.strokeText(scoreText, this.scoreX, this.scoreY);
        ctx.fillText(scoreText, this.scoreX, this.scoreY);
        
        ctx.restore();
    }
    
    drawTimer(ctx) {
        ctx.save();
        
        // Format time as MM:SS like original
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = Math.floor(this.timeLeft % 60);
        const timeText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Timer styling
        ctx.font = 'bold 24px Font, Arial';
        ctx.fillStyle = this.overtime ? '#ff4444' : '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw timer text
        ctx.strokeText(timeText, this.timerX, this.timerY);
        ctx.fillText(timeText, this.timerX, this.timerY);
        
        // Draw "OVERTIME" if applicable
        if (this.overtime) {
            ctx.font = 'bold 18px Font, Arial';
            ctx.fillStyle = '#ff6666';
            ctx.fillText('OVERTIME', this.timerX, this.timerY + 25);
        }
        
        ctx.restore();
    }
    
    drawPlayerInfo(ctx, playerNum, x, y) {
        const playerInfo = playerNum === 1 ? this.player1Info : this.player2Info;
        
        ctx.save();
        
        // Player info background - exact from original
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        
        this.drawRoundedRect(ctx, x, y, this.infoBoxWidth, this.infoBoxHeight, 8);
        ctx.fill();
        ctx.stroke();
        
        // Player label and info - exact text from original
        ctx.font = 'bold 14px Font, Arial';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        const textX = x + 10;
        let textY = y + 10;
        
        // Player number and name
        ctx.fillText(`PLAYER ${playerNum} (${playerInfo.head.toUpperCase()})`, textX, textY);
        textY += 20;
        
        // Control type - exact from original
        ctx.font = '12px Font, Arial';
        ctx.fillStyle = '#ccc';
        ctx.fillText(`CONTROLLED BY: ${playerInfo.controlType}`, textX, textY);
        textY += 16;
        
        // Difficulty/Type
        if (playerInfo.difficulty !== 'HUMAN') {
            ctx.fillText(`DIFFICULTY: ${playerInfo.difficulty}`, textX, textY);
            textY += 16;
        }
        
        // Controls info - matching original layout
        if (playerNum === 1) {
            ctx.fillText('A/D - MOVE', textX, textY);
            textY += 14;
            ctx.fillText('W - JUMP', textX, textY);
            textY += 14;
            ctx.fillText('S - KICK', textX, textY);
        } else {
            ctx.fillText('←/→ - MOVE', textX, textY);
            textY += 14;
            ctx.fillText('↑ - JUMP', textX, textY);
            textY += 14;
            ctx.fillText('↓ - KICK', textX, textY);
        }
        
        ctx.restore();
    }
    
    drawGameStatus(ctx) {
        // Draw any additional status messages
        if (!this.gameActive && !this.overtime) {
            ctx.save();
            
            // Game over message
            const winner = this.player1Score > this.player2Score ? 'PLAYER 1' : 'PLAYER 2';
            const message = `${winner} WINS!`;
            
            ctx.font = 'bold 48px Font, Arial';
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            ctx.strokeText(message, CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2);
            ctx.fillText(message, CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2);
            
            ctx.restore();
        }
    }
    
    drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
    
    // Score updates from game logic
    updateScore(player1Score, player2Score) {
        this.player1Score = player1Score;
        this.player2Score = player2Score;
    }
    
    // Update game time
    updateTime(timeLeft) {
        this.timeLeft = timeLeft;
    }
    
    // Set overtime status
    setOvertime(overtime) {
        this.overtime = overtime;
    }
    
    // Set game active status
    setGameActive(active) {
        this.gameActive = active;
    }
    
    // Get current game state
    getGameState() {
        return {
            player1Score: this.player1Score,
            player2Score: this.player2Score,
            timeLeft: this.timeLeft,
            overtime: this.overtime,
            gameActive: this.gameActive
        };
    }
}