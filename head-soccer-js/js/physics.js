// Physics.js - Physics engine wrapper and utilities
class PhysicsEngine {
    constructor() {
        this.engine = null;
        this.world = null;
        this.render = null;
        this.bodies = [];
        
        this.init();
    }
    
    init() {
        // Create Matter.js engine
        this.engine = Matter.Engine.create();
        this.world = this.engine.world;
        
        // Configure engine
        this.engine.world.gravity.y = 0; // We handle gravity manually
        this.engine.enableSleeping = false;
        
        // Create boundaries
        this.createBoundaries();
        
        console.log('Physics engine initialized');
    }
    
    createBoundaries() {
        const thickness = 50;
        
        // Ground
        const ground = Matter.Bodies.rectangle(
            CONFIG.WIDTH / 2, 
            CONFIG.HEIGHT + thickness / 2, 
            CONFIG.WIDTH, 
            thickness, 
            { 
                isStatic: true,
                label: 'ground',
                render: { fillStyle: '#654321' }
            }
        );
        
        // Ceiling
        const ceiling = Matter.Bodies.rectangle(
            CONFIG.WIDTH / 2, 
            -thickness / 2, 
            CONFIG.WIDTH, 
            thickness, 
            { 
                isStatic: true,
                label: 'ceiling',
                render: { fillStyle: '#444444' }
            }
        );
        
        // Left wall
        const leftWall = Matter.Bodies.rectangle(
            -thickness / 2, 
            CONFIG.HEIGHT / 2, 
            thickness, 
            CONFIG.HEIGHT, 
            { 
                isStatic: true,
                label: 'leftWall',
                render: { fillStyle: '#444444' }
            }
        );
        
        // Right wall
        const rightWall = Matter.Bodies.rectangle(
            CONFIG.WIDTH + thickness / 2, 
            CONFIG.HEIGHT / 2, 
            thickness, 
            CONFIG.HEIGHT, 
            { 
                isStatic: true,
                label: 'rightWall',
                render: { fillStyle: '#444444' }
            }
        );
        
        // Add boundaries to world
        Matter.World.add(this.world, [ground, ceiling, leftWall, rightWall]);
        
        // Store boundary references
        this.boundaries = { ground, ceiling, leftWall, rightWall };
        
        console.log('Physics boundaries created');
    }
    
    createCircleBody(x, y, radius, options = {}) {
        const defaultOptions = {
            restitution: 0.8,
            friction: 0.1,
            frictionAir: 0.01,
            density: 0.001
        };
        
        const body = Matter.Bodies.circle(x, y, radius, { ...defaultOptions, ...options });
        Matter.World.add(this.world, body);
        this.bodies.push(body);
        
        return body;
    }
    
    createRectangleBody(x, y, width, height, options = {}) {
        const defaultOptions = {
            restitution: 0.5,
            friction: 0.1,
            frictionAir: 0.01,
            density: 0.001
        };
        
        const body = Matter.Bodies.rectangle(x, y, width, height, { ...defaultOptions, ...options });
        Matter.World.add(this.world, body);
        this.bodies.push(body);
        
        return body;
    }
    
    removeBody(body) {
        if (body) {
            Matter.World.remove(this.world, body);
            const index = this.bodies.indexOf(body);
            if (index > -1) {
                this.bodies.splice(index, 1);
            }
        }
    }
    
    update(deltaTime) {
        // Update the physics engine
        Matter.Engine.update(this.engine, deltaTime * 1000);
    }
    
    applyForce(body, force) {
        if (body && force) {
            Matter.Body.applyForce(body, body.position, force);
        }
    }
    
    setPosition(body, x, y) {
        if (body) {
            Matter.Body.setPosition(body, { x, y });
        }
    }
    
    setVelocity(body, velocity) {
        if (body && velocity) {
            Matter.Body.setVelocity(body, velocity);
        }
    }
    
    getPosition(body) {
        return body ? body.position : { x: 0, y: 0 };
    }
    
    getVelocity(body) {
        return body ? body.velocity : { x: 0, y: 0 };
    }
    
    getAllBodies() {
        return this.bodies;
    }
    
    // Collision detection helper
    checkCollision(bodyA, bodyB) {
        if (!bodyA || !bodyB) return false;
        
        const collision = Matter.SAT.collides(bodyA, bodyB);
        return collision.collided;
    }
    
    // Get distance between two bodies
    getDistance(bodyA, bodyB) {
        if (!bodyA || !bodyB) return Infinity;
        
        const dx = bodyA.position.x - bodyB.position.x;
        const dy = bodyA.position.y - bodyB.position.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // Apply impulse (instant velocity change)
    applyImpulse(body, impulse) {
        if (body && impulse) {
            const force = {
                x: impulse.x / body.mass,
                y: impulse.y / body.mass
            };
            this.applyForce(body, force);
        }
    }
    
    // Debug drawing
    debugDraw(ctx) {
        if (!ctx) return;
        
        ctx.save();
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        
        // Draw all bodies
        this.bodies.forEach(body => {
            this.drawBody(ctx, body);
        });
        
        // Draw boundaries
        Object.values(this.boundaries).forEach(boundary => {
            this.drawBody(ctx, boundary);
        });
        
        ctx.restore();
    }
    
    drawBody(ctx, body) {
        if (!body) return;
        
        ctx.save();
        ctx.translate(body.position.x, body.position.y);
        ctx.rotate(body.angle);
        
        if (body.circleRadius) {
            // Draw circle
            ctx.beginPath();
            ctx.arc(0, 0, body.circleRadius, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            // Draw polygon/rectangle
            const vertices = body.vertices;
            if (vertices && vertices.length > 0) {
                ctx.beginPath();
                ctx.moveTo(vertices[0].x - body.position.x, vertices[0].y - body.position.y);
                for (let i = 1; i < vertices.length; i++) {
                    ctx.lineTo(vertices[i].x - body.position.x, vertices[i].y - body.position.y);
                }
                ctx.closePath();
                ctx.stroke();
            }
        }
        
        ctx.restore();
    }
    
    // Cleanup
    destroy() {
        if (this.engine) {
            Matter.Engine.clear(this.engine);
            this.engine = null;
            this.world = null;
        }
        this.bodies = [];
        console.log('Physics engine destroyed');
    }
}

// Physics utilities
class PhysicsUtils {
    static distance(pointA, pointB) {
        const dx = pointA.x - pointB.x;
        const dy = pointA.y - pointB.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    static angle(pointA, pointB) {
        return Math.atan2(pointB.y - pointA.y, pointB.x - pointA.x);
    }
    
    static vectorFromAngle(angle, magnitude = 1) {
        return {
            x: Math.cos(angle) * magnitude,
            y: Math.sin(angle) * magnitude
        };
    }
    
    static normalizeVector(vector) {
        const magnitude = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
        if (magnitude === 0) return { x: 0, y: 0 };
        
        return {
            x: vector.x / magnitude,
            y: vector.y / magnitude
        };
    }
    
    static dotProduct(vectorA, vectorB) {
        return vectorA.x * vectorB.x + vectorA.y * vectorB.y;
    }
    
    static clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }
    
    static lerp(a, b, t) {
        return a + (b - a) * t;
    }
}

// Particle system for visual effects
class ParticleSystem {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.particles = [];
        this.maxParticles = 100;
        
        // Create initial particles
        this.generateParticles();
    }
    
    generateParticles() {
        for (let i = 0; i < this.maxParticles; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                size: Math.random() * 3 + 1,
                opacity: Math.random() * 0.5 + 0.2,
                color: this.getRandomColor(),
                life: 1.0,
                maxLife: Math.random() * 3 + 2
            });
        }
    }
    
    getRandomColor() {
        const colors = ['#ffffff', '#66ccff', '#ff6699', '#ffcc66', '#66ff99', '#ff9966'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    update(mouseX, mouseY) {
        this.particles.forEach(particle => {
            // Move particle
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            // Attract to mouse (subtle effect)
            if (mouseX !== undefined && mouseY !== undefined) {
                const dx = mouseX - particle.x;
                const dy = mouseY - particle.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 100) {
                    const force = 0.001;
                    particle.vx += (dx / distance) * force;
                    particle.vy += (dy / distance) * force;
                }
            }
            
            // Boundary wrapping
            if (particle.x < 0) particle.x = this.width;
            if (particle.x > this.width) particle.x = 0;
            if (particle.y < 0) particle.y = this.height;
            if (particle.y > this.height) particle.y = 0;
            
            // Update life
            particle.life -= CONFIG.DT / particle.maxLife;
            if (particle.life <= 0) {
                // Respawn particle
                particle.x = Math.random() * this.width;
                particle.y = Math.random() * this.height;
                particle.vx = (Math.random() - 0.5) * 2;
                particle.vy = (Math.random() - 0.5) * 2;
                particle.life = 1.0;
                particle.color = this.getRandomColor();
            }
        });
    }
    
    draw(ctx) {
        ctx.save();
        
        this.particles.forEach(particle => {
            ctx.globalAlpha = particle.opacity * particle.life;
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
        });
        
        ctx.restore();
    }
}