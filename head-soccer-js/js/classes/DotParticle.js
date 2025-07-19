// DotParticle Class - Exact copy from Python lines 779-848
class DotParticle {
    constructor(width, height) {
        this.screenWidth = width;
        this.screenHeight = height;
        
        // Random initial position
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        
        // Random movement direction and speed (Python lines 785-787)
        const angle = Math.random() * 2 * Math.PI;
        const speed = Math.random() * 0.7 + 0.5; // Python: random.uniform(0.5, 1.2)
        this.baseDx = Math.cos(angle) * speed;
        this.baseDy = Math.sin(angle) * speed;
        
        // Velocity for mouse interaction
        this.velDx = 0;
        this.velDy = 0;
        
        // Visual properties (Python lines 791-792)
        this.radius = Math.floor(Math.random() * 2) + 2; // Python: random.randint(2, 3)
        this.color = [200, 200, 200];
    }
    
    // Update particle position and handle mouse interaction (Python lines 794-811)
    update(mouseTrail = [], particles = []) {
        // Mouse repulsion effect
        if (mouseTrail && Array.isArray(mouseTrail)) {
            for (let [mx, my] of mouseTrail) {
            const dx = this.x - mx;
            const dy = this.y - my;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const repelRadius = 120; // Python line 799
            
            if (dist < repelRadius && dist > 1) {
                const strength = (repelRadius - dist) / repelRadius;
                const power = 1.2; // Python line 802
                const factor = Math.pow(strength, 2) * power; // Python line 803
                this.velDx += (dx / dist) * factor;
                this.velDy += (dy / dist) * factor;
            }
        }
        }
        
        // Apply velocity damping (Python lines 806-807)
        this.velDx *= 0.9;
        this.velDy *= 0.9;
        
        // Update position (Python lines 808-809)
        this.x += this.baseDx + this.velDx;
        this.y += this.baseDy + this.velDy;
        
        // Check if particle is out of bounds (Python lines 810-811)
        if (this.x < -10 || this.x > this.screenWidth + 10 || 
            this.y < -10 || this.y > this.screenHeight + 10) {
            this.reenterFromLeastPopulatedEdge(particles);
        }
    }
    
    // Reenter from least populated edge - exact algorithm from Python lines 813-845
    reenterFromLeastPopulatedEdge(particles) {
        const edgeCounts = { left: 0, right: 0, top: 0, bottom: 0 };
        const margin = 100; // Python line 815
        
        // Count particles near each edge
        for (let p of particles) {
            if (p === this) continue;
            
            if (p.x < margin) {
                edgeCounts.left++;
            } else if (p.x > this.screenWidth - margin) {
                edgeCounts.right++;
            }
            
            if (p.y < margin) {
                edgeCounts.top++;
            } else if (p.y > this.screenHeight - margin) {
                edgeCounts.bottom++;
            }
        }
        
        // Find least populated edge (Python line 827)
        const least = Object.keys(edgeCounts).reduce((a, b) => 
            edgeCounts[a] < edgeCounts[b] ? a : b
        );
        
        // Position particle at least populated edge (Python lines 828-843)
        switch (least) {
            case 'left':
                this.x = -5;
                this.y = Math.random() * this.screenHeight;
                this.baseDx = Math.abs(this.baseDx);
                break;
            case 'right':
                this.x = this.screenWidth + 5;
                this.y = Math.random() * this.screenHeight;
                this.baseDx = -Math.abs(this.baseDx);
                break;
            case 'top':
                this.x = Math.random() * this.screenWidth;
                this.y = -5;
                this.baseDy = Math.abs(this.baseDy);
                break;
            case 'bottom':
                this.x = Math.random() * this.screenWidth;
                this.y = this.screenHeight + 5;
                this.baseDy = -Math.abs(this.baseDy);
                break;
        }
        
        // Reset interaction velocity (Python lines 844-845)
        this.velDx = 0;
        this.velDy = 0;
    }
    
    // Draw particle (Python line 847-848)
    draw(ctx) {
        ctx.fillStyle = Utils.colorToCSS(this.color);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
        ctx.fill();
    }
}

// Particle system manager
class ParticleSystem {
    constructor(width, height, count = CONFIG.PARTICLE_COUNT) {
        this.particles = [];
        this.mouseTrail = [];
        this.maxDistance = CONFIG.MAX_DISTANCE;
        this.maxTrailLength = CONFIG.MOUSE_TRAIL_LENGTH;
        
        // Create particles
        for (let i = 0; i < count; i++) {
            this.particles.push(new DotParticle(width, height));
        }
    }
    
    // Update all particles and mouse trail
    update(mouseX, mouseY) {
        // Update mouse trail (Python line 758)
        this.mouseTrail.push([mouseX, mouseY]);
        if (this.mouseTrail.length > this.maxTrailLength) {
            this.mouseTrail.shift();
        }
        
        // Update all particles (Python line 760)
        for (let particle of this.particles) {
            particle.update(this.mouseTrail, this.particles);
        }
    }
    
    // Draw particle connections and particles (Python lines 763-776)
    draw(ctx) {
        // Draw connections between nearby particles
        ctx.save();
        for (let i = 0; i < this.particles.length; i++) {
            const p1 = this.particles[i];
            for (let j = i + 1; j < this.particles.length; j++) {
                const p2 = this.particles[j];
                const dx = p1.x - p2.x;
                const dy = p1.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < this.maxDistance) {
                    const alpha = 1 - dist / this.maxDistance;
                    ctx.strokeStyle = `rgba(200, 200, 200, ${alpha})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
        
        // Draw particles
        for (let particle of this.particles) {
            particle.draw(ctx);
        }
    }
}