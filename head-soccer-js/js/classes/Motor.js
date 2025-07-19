// Motor.js - Physics motor for character movement
class Motor {
    constructor(body, maxForce = 1000) {
        this.body = body;
        this.maxForce = maxForce;
        this.targetVelocity = { x: 0, y: 0 };
        this.force = { x: 0, y: 0 };
    }
    
    setTargetVelocity(vx, vy) {
        this.targetVelocity.x = vx;
        this.targetVelocity.y = vy;
    }
    
    update() {
        if (!this.body) return;
        
        // Calculate force needed to reach target velocity
        const currentVel = this.body.velocity;
        const deltaVx = this.targetVelocity.x - currentVel.x;
        const deltaVy = this.targetVelocity.y - currentVel.y;
        
        // Apply proportional force (PID-like control)
        this.force.x = deltaVx * this.maxForce * 0.1;
        this.force.y = deltaVy * this.maxForce * 0.1;
        
        // Clamp force to maximum
        const forceMag = Math.sqrt(this.force.x * this.force.x + this.force.y * this.force.y);
        if (forceMag > this.maxForce) {
            this.force.x = (this.force.x / forceMag) * this.maxForce;
            this.force.y = (this.force.y / forceMag) * this.maxForce;
        }
        
        // Apply force to body
        Matter.Body.applyForce(this.body, this.body.position, this.force);
    }
    
    destroy() {
        this.body = null;
    }
}