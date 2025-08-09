// ==========================================
// MULTIPLAYER GAME CLIENT TEMPLATE
// ==========================================

// ==========================================
// SOCKET CONNECTION
// ==========================================

const socket = io('http://localhost:3000');

// ==========================================
// GAME STATE
// ==========================================

let gameState = null;
let playerNumber = null;
let gameId = null;
let connected = false;

// ==========================================
// UI ELEMENTS
// ==========================================

const screens = {
    menu: document.getElementById('menuScreen'),
    waiting: document.getElementById('waitingScreen'),
    game: document.getElementById('gameScreen'),
    gameOver: document.getElementById('gameOverScreen')
};

const elements = {
    // Menu
    findMatchBtn: document.getElementById('findMatchBtn'),
    createPrivateBtn: document.getElementById('createPrivateBtn'),
    joinPrivateBtn: document.getElementById('joinPrivateBtn'),
    roomCodeInput: document.getElementById('roomCodeInput'),
    
    // Waiting
    waitingMessage: document.getElementById('waitingMessage'),
    cancelBtn: document.getElementById('cancelBtn'),
    
    // Game
    canvas: document.getElementById('gameCanvas'),
    player1Score: document.getElementById('player1Score'),
    player2Score: document.getElementById('player2Score'),
    timeLeft: document.getElementById('timeLeft'),
    
    // Game Over
    gameResult: document.getElementById('gameResult'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    mainMenuBtn: document.getElementById('mainMenuBtn'),
    
    // Status
    connectionStatus: document.getElementById('connectionStatus')
};

const ctx = elements.canvas.getContext('2d');

// ==========================================
// SCREEN MANAGEMENT
// ==========================================

function showScreen(screenName) {
    Object.values(screens).forEach(screen => {
        screen.classList.remove('active');
    });
    screens[screenName].classList.add('active');
}

// ==========================================
// SOCKET EVENT HANDLERS
// ==========================================

socket.on('connect', () => {
    console.log('Connected to server');
    connected = true;
    elements.connectionStatus.textContent = 'Connected';
    elements.connectionStatus.className = 'connected';
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    connected = false;
    elements.connectionStatus.textContent = 'Disconnected';
    elements.connectionStatus.className = 'disconnected';
    showScreen('menu');
});

socket.on('waitingForMatch', () => {
    showScreen('waiting');
    elements.waitingMessage.textContent = 'Searching for opponent...';
});

socket.on('roomCreated', (roomId) => {
    showScreen('waiting');
    elements.waitingMessage.innerHTML = `Room Code: <strong>${roomId}</strong><br>Share this code with your friend!`;
});

socket.on('matchFound', (data) => {
    gameId = data.gameId;
    playerNumber = data.playerNumber;
    console.log(`Match found! You are Player ${playerNumber}`);
    
    // Send ready signal
    socket.emit('playerReady');
});

socket.on('gameStart', () => {
    console.log('Game starting!');
    showScreen('game');
    startGameLoop();
});

socket.on('gameState', (state) => {
    gameState = state;
    updateUI();
});

socket.on('gameOver', (result) => {
    showScreen('gameOver');
    
    if (result.winner === socket.id) {
        elements.gameResult.innerHTML = '<h2>You Won! 🎉</h2>';
    } else if (result.winner === 'draw') {
        elements.gameResult.innerHTML = '<h2>It\'s a Draw!</h2>';
    } else {
        elements.gameResult.innerHTML = '<h2>You Lost 😔</h2>';
    }
    
    // Show scores
    const scores = result.scores.map(s => `Player: ${s.score}`).join(' | ');
    elements.gameResult.innerHTML += `<p>${scores}</p>`;
});

socket.on('playerDisconnected', () => {
    alert('Opponent disconnected');
    showScreen('menu');
});

socket.on('error', (message) => {
    alert(`Error: ${message}`);
});

// ==========================================
// UI EVENT HANDLERS
// ==========================================

elements.findMatchBtn.addEventListener('click', () => {
    socket.emit('findMatch');
});

elements.createPrivateBtn.addEventListener('click', () => {
    socket.emit('createPrivateRoom');
});

elements.joinPrivateBtn.addEventListener('click', () => {
    const code = elements.roomCodeInput.value.trim();
    if (code) {
        socket.emit('joinPrivateRoom', code);
    }
});

elements.cancelBtn.addEventListener('click', () => {
    location.reload(); // Simple way to reset everything
});

elements.playAgainBtn.addEventListener('click', () => {
    socket.emit('findMatch');
});

elements.mainMenuBtn.addEventListener('click', () => {
    showScreen('menu');
});

// ==========================================
// INPUT HANDLING
// ==========================================

const inputState = {
    keys: {
        left: false,
        right: false,
        up: false,
        down: false,
        action: false
    },
    mouse: {
        x: 0,
        y: 0,
        clicked: false
    }
};

// Keyboard input
const keyMap = {
    'ArrowLeft': 'left',
    'a': 'left',
    'A': 'left',
    'ArrowRight': 'right',
    'd': 'right',
    'D': 'right',
    'ArrowUp': 'up',
    'w': 'up',
    'W': 'up',
    'ArrowDown': 'down',
    's': 'down',
    'S': 'down',
    ' ': 'action',
    'Enter': 'action'
};

document.addEventListener('keydown', (e) => {
    if (!gameState || !gameState.gameStarted) return;
    
    const key = keyMap[e.key];
    if (key && !inputState.keys[key]) {
        inputState.keys[key] = true;
        sendInput();
    }
});

document.addEventListener('keyup', (e) => {
    if (!gameState || !gameState.gameStarted) return;
    
    const key = keyMap[e.key];
    if (key && inputState.keys[key]) {
        inputState.keys[key] = false;
        sendInput();
    }
});

// Mouse input (optional)
elements.canvas.addEventListener('mousemove', (e) => {
    const rect = elements.canvas.getBoundingClientRect();
    inputState.mouse.x = e.clientX - rect.left;
    inputState.mouse.y = e.clientY - rect.top;
});

elements.canvas.addEventListener('mousedown', (e) => {
    inputState.mouse.clicked = true;
    sendInput();
});

elements.canvas.addEventListener('mouseup', (e) => {
    inputState.mouse.clicked = false;
    sendInput();
});

// Send input to server
function sendInput() {
    socket.emit('input', {
        keys: { ...inputState.keys },
        mouse: { ...inputState.mouse },
        timestamp: Date.now()
    });
}

// ==========================================
// GAME RENDERING
// ==========================================

function startGameLoop() {
    requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp) {
    if (!gameState || !gameState.gameStarted) return;
    
    // Clear canvas
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);
    
    // Render game state
    renderGame();
    
    // Continue loop
    requestAnimationFrame(gameLoop);
}

function renderGame() {
    if (!gameState) return;
    
    // ======== CUSTOMIZE YOUR RENDERING HERE ========
    
    // Draw players
    gameState.players.forEach((player, index) => {
        if (!player.id) return;
        
        // Different colors for each player
        ctx.fillStyle = index === 0 ? '#ff6b6b' : '#4ecdc4';
        
        // Draw player as circle
        ctx.beginPath();
        ctx.arc(
            player.position.x,
            player.position.y,
            25,
            0,
            Math.PI * 2
        );
        ctx.fill();
        
        // Draw player number
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            `P${index + 1}`,
            player.position.x,
            player.position.y
        );
        
        // Highlight current player
        if (index === playerNumber - 1) {
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    });
    
    // Draw game objects
    gameState.gameObjects.forEach(obj => {
        ctx.fillStyle = '#95a5a6';
        ctx.fillRect(
            obj.position.x - 10,
            obj.position.y - 10,
            20,
            20
        );
    });
    
    // Draw game boundaries (optional)
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, elements.canvas.width - 2, elements.canvas.height - 2);
}

function updateUI() {
    if (!gameState) return;
    
    // Update scores
    elements.player1Score.textContent = gameState.players[0].score || 0;
    elements.player2Score.textContent = gameState.players[1].score || 0;
    
    // Update timer
    const timeRemaining = Math.max(0, 120 - Math.floor(gameState.time));
    elements.timeLeft.textContent = timeRemaining;
}

// ==========================================
// DEBUG MODE (Press 'D' to toggle)
// ==========================================

let debugMode = false;
let fps = 0;
let frameCount = 0;
let lastFpsUpdate = Date.now();
let stateUpdates = 0;
let lastStateUpdate = Date.now();

document.addEventListener('keydown', (e) => {
    if (e.key === 'd' || e.key === 'D') {
        debugMode = !debugMode;
        document.getElementById('debugInfo').classList.toggle('active');
    }
});

// Update debug info
setInterval(() => {
    if (!debugMode) return;
    
    // Calculate FPS
    const now = Date.now();
    const delta = now - lastFpsUpdate;
    fps = Math.round((frameCount * 1000) / delta);
    frameCount = 0;
    lastFpsUpdate = now;
    
    // Calculate state updates per second
    const stateDelta = now - lastStateUpdate;
    const updatesPerSecond = Math.round((stateUpdates * 1000) / stateDelta);
    stateUpdates = 0;
    lastStateUpdate = now;
    
    // Update debug display
    document.getElementById('fps').textContent = fps;
    document.getElementById('updates').textContent = updatesPerSecond;
}, 1000);

// Track frame count for FPS
function trackFrame() {
    if (debugMode) frameCount++;
}

// Track state updates
socket.on('gameState', () => {
    if (debugMode) stateUpdates++;
});

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function lerp(start, end, alpha) {
    return start + (end - start) * alpha;
}

function distance(p1, p2) {
    return Math.sqrt(
        Math.pow(p1.x - p2.x, 2) + 
        Math.pow(p1.y - p2.y, 2)
    );
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// ==========================================
// INITIALIZATION
// ==========================================

console.log('Multiplayer game client initialized');
console.log('Press D to toggle debug mode');
console.log('Controls: Arrow keys or WASD to move, Space for action');