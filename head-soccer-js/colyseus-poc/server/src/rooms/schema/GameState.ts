import { Schema, type, MapSchema } from "@colyseus/schema";

// Player state that automatically syncs
export class Player extends Schema {
  @type("string") id: string;
  @type("string") name: string;
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") velocityX: number = 0;
  @type("number") velocityY: number = 0;
  @type("boolean") isKicking: boolean = false;
  @type("boolean") onGround: boolean = true;
  @type("number") score: number = 0;
  @type("number") playerNumber: number; // 1 or 2
  
  // Input state
  inputLeft: boolean = false;
  inputRight: boolean = false;
  inputJump: boolean = false;
  inputKick: boolean = false;
}

// Ball state
export class Ball extends Schema {
  @type("number") x: number = 800; // Center of 1600px field
  @type("number") y: number = 300;
  @type("number") velocityX: number = 0;
  @type("number") velocityY: number = 0;
  @type("number") radius: number = 15;
}

// Main game state
export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type(Ball) ball = new Ball();
  @type("number") gameTime: number = 120; // 2 minutes
  @type("boolean") isPaused: boolean = false;
  @type("boolean") gameStarted: boolean = false;
  @type("boolean") gameEnded: boolean = false;
  @type("string") winnerId: string = "";
}