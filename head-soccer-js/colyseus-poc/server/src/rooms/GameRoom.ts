import { Room, Client } from "colyseus";
import { GameState, Player, Ball } from "./schema/GameState";
import { PHYSICS, checkCollision } from "./GamePhysics";

export class GameRoom extends Room<GameState> {
  maxClients = 2;
  fixedTimeStep = 1000 / 60; // 60 FPS physics
  
  onCreate(options: any) {
    console.log("GameRoom created!", options);
    
    // Initialize game state
    this.setState(new GameState());
    
    // Set up physics simulation at 60 FPS
    this.setSimulationInterval((deltaTime) => this.update(deltaTime), this.fixedTimeStep);
    
    // Handle player inputs
    this.onMessage("input", (client, input) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.inputLeft = input.left || false;
        player.inputRight = input.right || false;
        player.inputJump = input.jump || false;
        player.inputKick = input.kick || false;
      }
    });
    
    // Handle game start
    this.onMessage("start_game", () => {
      if (this.state.players.size === 2 && !this.state.gameStarted) {
        this.state.gameStarted = true;
        console.log("Game started!");
      }
    });
  }
  
  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined!", options);
    
    // Create new player
    const player = new Player();
    player.id = client.sessionId;
    player.name = options.name || `Player ${this.state.players.size + 1}`;
    player.playerNumber = this.state.players.size + 1;
    
    // Set starting position based on player number
    if (player.playerNumber === 1) {
      player.x = 200; // Left side
    } else {
      player.x = PHYSICS.FIELD.WIDTH - 200 - PHYSICS.PLAYER.WIDTH; // Right side
    }
    player.y = PHYSICS.FIELD.GROUND_Y - PHYSICS.PLAYER.HEIGHT;
    
    // Add player to game state
    this.state.players.set(client.sessionId, player);
    
    // Start game when both players join
    if (this.state.players.size === 2) {
      this.broadcast("both_players_ready");
    }
  }
  
  onLeave(client: Client, consented: boolean) {
    console.log(client.sessionId, "left!");
    this.state.players.delete(client.sessionId);
  }
  
  update(deltaTime: number) {
    if (!this.state.gameStarted || this.state.gameEnded) return;
    
    const dt = deltaTime / 1000; // Convert to seconds
    
    // Update each player
    this.state.players.forEach(player => {
      this.updatePlayer(player, dt);
    });
    
    // Update ball physics
    this.updateBall(dt);
    
    // Check collisions
    this.checkCollisions();
    
    // Update game timer
    if (this.state.gameTime > 0) {
      this.state.gameTime -= dt;
      if (this.state.gameTime <= 0) {
        this.endGame();
      }
    }
  }
  
  updatePlayer(player: Player, dt: number) {
    // Horizontal movement
    if (player.inputLeft) {
      player.velocityX = -PHYSICS.PLAYER.MOVE_SPEED;
    } else if (player.inputRight) {
      player.velocityX = PHYSICS.PLAYER.MOVE_SPEED;
    } else {
      player.velocityX *= 0.8; // Friction
    }
    
    // Jump
    if (player.inputJump && player.onGround) {
      player.velocityY = PHYSICS.PLAYER.JUMP_FORCE;
      player.onGround = false;
    }
    
    // Apply gravity
    if (!player.onGround) {
      player.velocityY += PHYSICS.PLAYER.GRAVITY;
      player.velocityY = Math.min(player.velocityY, PHYSICS.PLAYER.MAX_FALL_SPEED);
    }
    
    // Update position
    player.x += player.velocityX;
    player.y += player.velocityY;
    
    // Ground collision
    if (player.y >= PHYSICS.FIELD.GROUND_Y - PHYSICS.PLAYER.HEIGHT) {
      player.y = PHYSICS.FIELD.GROUND_Y - PHYSICS.PLAYER.HEIGHT;
      player.velocityY = 0;
      player.onGround = true;
    }
    
    // Wall boundaries
    player.x = Math.max(0, Math.min(player.x, PHYSICS.FIELD.WIDTH - PHYSICS.PLAYER.WIDTH));
    
    // Update kick state
    player.isKicking = player.inputKick;
  }
  
  updateBall(dt: number) {
    const ball = this.state.ball;
    
    // Apply gravity
    ball.velocityY += PHYSICS.BALL.GRAVITY;
    
    // Apply damping
    ball.velocityX *= PHYSICS.BALL.DAMPING;
    ball.velocityY *= PHYSICS.BALL.DAMPING;
    
    // Update position
    ball.x += ball.velocityX;
    ball.y += ball.velocityY;
    
    // Ground bounce
    if (ball.y + ball.radius * 2 >= PHYSICS.FIELD.GROUND_Y) {
      ball.y = PHYSICS.FIELD.GROUND_Y - ball.radius * 2;
      ball.velocityY *= -PHYSICS.BALL.BOUNCE;
    }
    
    // Wall bounce
    if (ball.x <= 0 || ball.x + ball.radius * 2 >= PHYSICS.FIELD.WIDTH) {
      ball.x = ball.x <= 0 ? 0 : PHYSICS.FIELD.WIDTH - ball.radius * 2;
      ball.velocityX *= -PHYSICS.BALL.BOUNCE;
    }
    
    // Ceiling bounce
    if (ball.y <= 0) {
      ball.y = 0;
      ball.velocityY *= -PHYSICS.BALL.BOUNCE;
    }
  }
  
  checkCollisions() {
    const ball = this.state.ball;
    
    this.state.players.forEach(player => {
      // Ball-player collision
      const playerObj = {
        x: player.x,
        y: player.y,
        width: PHYSICS.PLAYER.WIDTH,
        height: PHYSICS.PLAYER.HEIGHT
      };
      
      const ballObj = {
        x: ball.x,
        y: ball.y,
        radius: ball.radius
      };
      
      if (checkCollision(ballObj, playerObj)) {
        // Calculate kick force
        const dx = (ball.x + ball.radius) - (player.x + PHYSICS.PLAYER.WIDTH / 2);
        const dy = (ball.y + ball.radius) - (player.y + PHYSICS.PLAYER.HEIGHT / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 0) {
          const normalX = dx / dist;
          const normalY = dy / dist;
          
          if (player.isKicking) {
            // Strong kick
            const force = PHYSICS.BALL.KICK_FORCE_MAX;
            ball.velocityX = normalX * force;
            ball.velocityY = normalY * force - 5; // Add upward force
          } else {
            // Soft push
            const force = 8;
            ball.velocityX = normalX * force + player.velocityX * 0.5;
            ball.velocityY = normalY * force + player.velocityY * 0.3;
          }
        }
      }
    });
    
    // Check for goals
    this.checkGoals();
  }
  
  checkGoals() {
    const ball = this.state.ball;
    const ballCenterX = ball.x + ball.radius;
    const ballCenterY = ball.y + ball.radius;
    
    // Left goal
    if (ballCenterX < 100 && ballCenterY > PHYSICS.FIELD.GROUND_Y - PHYSICS.FIELD.GOAL_HEIGHT) {
      // Player 2 scores
      this.state.players.forEach(player => {
        if (player.playerNumber === 2) {
          player.score++;
          console.log("Player 2 scores! Score:", player.score);
        }
      });
      this.resetBall();
    }
    
    // Right goal
    if (ballCenterX > PHYSICS.FIELD.WIDTH - 100 && 
        ballCenterY > PHYSICS.FIELD.GROUND_Y - PHYSICS.FIELD.GOAL_HEIGHT) {
      // Player 1 scores
      this.state.players.forEach(player => {
        if (player.playerNumber === 1) {
          player.score++;
          console.log("Player 1 scores! Score:", player.score);
        }
      });
      this.resetBall();
    }
  }
  
  resetBall() {
    this.state.ball.x = PHYSICS.FIELD.WIDTH / 2 - this.state.ball.radius;
    this.state.ball.y = 300;
    this.state.ball.velocityX = 0;
    this.state.ball.velocityY = 0;
  }
  
  endGame() {
    this.state.gameEnded = true;
    
    // Determine winner
    let maxScore = -1;
    let winnerId = "";
    
    this.state.players.forEach(player => {
      if (player.score > maxScore) {
        maxScore = player.score;
        winnerId = player.id;
      }
    });
    
    this.state.winnerId = winnerId;
    this.broadcast("game_ended", { winnerId });
  }
}