// Shared physics constants (same as client)
export const PHYSICS = {
  PLAYER: {
    WIDTH: 60,
    HEIGHT: 80,
    MOVE_SPEED: 5,
    JUMP_FORCE: -15,
    GRAVITY: 0.8,
    MAX_FALL_SPEED: 20
  },
  BALL: {
    GRAVITY: 0.5,
    BOUNCE: 0.7,
    DAMPING: 0.99,
    KICK_FORCE_MIN: 15,
    KICK_FORCE_MAX: 25
  },
  FIELD: {
    WIDTH: 1600,
    HEIGHT: 900,
    GROUND_Y: 700, // Where players stand
    GOAL_WIDTH: 150,
    GOAL_HEIGHT: 200
  }
};

// Collision detection
export function checkCollision(
  obj1: { x: number, y: number, width?: number, height?: number, radius?: number },
  obj2: { x: number, y: number, width?: number, height?: number, radius?: number }
): boolean {
  // Circle vs Rectangle collision (ball vs player)
  if (obj1.radius && obj2.width) {
    const circleX = obj1.x + obj1.radius;
    const circleY = obj1.y + obj1.radius;
    const rectX = obj2.x + obj2.width / 2;
    const rectY = obj2.y + obj2.height / 2;
    
    const distX = Math.abs(circleX - rectX);
    const distY = Math.abs(circleY - rectY);
    
    if (distX > (obj2.width / 2 + obj1.radius)) return false;
    if (distY > (obj2.height / 2 + obj1.radius)) return false;
    
    if (distX <= obj2.width / 2) return true;
    if (distY <= obj2.height / 2) return true;
    
    const cornerDist = Math.pow(distX - obj2.width / 2, 2) + 
                      Math.pow(distY - obj2.height / 2, 2);
    
    return cornerDist <= Math.pow(obj1.radius, 2);
  }
  
  return false;
}