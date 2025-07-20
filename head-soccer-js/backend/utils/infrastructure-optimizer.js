/**
 * Infrastructure Optimization Utilities
 * Improves connection handling and resource management
 */

class InfrastructureOptimizer {
  constructor() {
    this.connectionQueue = [];
    this.processingConnections = new Set();
    this.maxConcurrentConnections = 5; // Conservative limit for Railway free tier
    this.connectionTimeout = 10000; // Reduced from 15000ms
    this.retryAttempts = 3;
    this.backoffMultiplier = 1.5;
    
    // Performance metrics
    this.metrics = {
      queuedConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      timeouts: 0,
      avgResponseTime: 0,
      resourceUsage: {
        memory: 0,
        cpu: 0
      }
    };
  }

  /**
   * Optimize WebSocket connection handling with queuing
   */
  async optimizeWebSocketConnections() {
    // Connection pooling configuration
    const wsConfig = {
      // Reduced concurrent connections for Railway constraints
      maxConnections: this.maxConcurrentConnections,
      
      // Optimized timeouts
      pingTimeout: 30000,
      pingInterval: 25000,
      
      // Transport optimization
      transports: ['polling', 'websocket'], // Fallback to polling
      upgrade: true,
      
      // Memory optimization
      maxHttpBufferSize: 1e6, // 1MB limit
      
      // Connection management
      allowEIO3: true,
      cors: {
        origin: true,
        methods: ["GET", "POST"],
        credentials: true
      }
    };

    return wsConfig;
  }

  /**
   * Implement connection queuing system
   */
  async queueConnection(connectionRequest) {
    if (this.processingConnections.size >= this.maxConcurrentConnections) {
      this.connectionQueue.push(connectionRequest);
      this.metrics.queuedConnections++;
      
      console.log(`📋 Connection queued. Queue length: ${this.connectionQueue.length}`);
      return { queued: true, position: this.connectionQueue.length };
    }

    return this.processConnectionWithRetry(connectionRequest);
  }

  /**
   * Process connection with retry logic
   */
  async processConnectionWithRetry(connectionRequest, attempt = 1) {
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      this.processingConnections.add(connectionId);
      
      const startTime = Date.now();
      const result = await this.processConnection(connectionRequest, connectionId);
      const responseTime = Date.now() - startTime;
      
      // Update metrics
      this.updateMetrics('success', responseTime);
      
      return { success: true, connectionId, responseTime, result };
      
    } catch (error) {
      this.updateMetrics('failure');
      
      if (attempt < this.retryAttempts) {
        const backoffDelay = 1000 * Math.pow(this.backoffMultiplier, attempt);
        console.log(`🔄 Retrying connection ${connectionId} in ${backoffDelay}ms (attempt ${attempt + 1}/${this.retryAttempts})`);
        
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        return this.processConnectionWithRetry(connectionRequest, attempt + 1);
      }
      
      return { success: false, error: error.message, attempt };
      
    } finally {
      this.processingConnections.delete(connectionId);
      this.processQueue(); // Process next queued connection
    }
  }

  /**
   * Process individual connection
   */
  async processConnection(connectionRequest, connectionId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.connectionTimeout}ms`));
      }, this.connectionTimeout);

      try {
        // Simulate connection processing
        const mockProcessing = setTimeout(() => {
          clearTimeout(timeout);
          resolve({ 
            connectionId, 
            status: 'connected',
            timestamp: Date.now() 
          });
        }, Math.random() * 2000 + 500); // 500ms - 2.5s processing time

      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Process queued connections
   */
  async processQueue() {
    if (this.connectionQueue.length > 0 && 
        this.processingConnections.size < this.maxConcurrentConnections) {
      
      const nextConnection = this.connectionQueue.shift();
      console.log(`📤 Processing queued connection. Remaining in queue: ${this.connectionQueue.length}`);
      
      // Process without waiting
      this.processConnectionWithRetry(nextConnection);
    }
  }

  /**
   * Update performance metrics
   */
  updateMetrics(type, responseTime = null) {
    switch (type) {
      case 'success':
        this.metrics.successfulConnections++;
        if (responseTime) {
          this.metrics.avgResponseTime = 
            (this.metrics.avgResponseTime + responseTime) / 2;
        }
        break;
      case 'failure':
        this.metrics.failedConnections++;
        break;
      case 'timeout':
        this.metrics.timeouts++;
        break;
    }
  }

  /**
   * Get current infrastructure health
   */
  getInfrastructureHealth() {
    const totalConnections = this.metrics.successfulConnections + this.metrics.failedConnections;
    const successRate = totalConnections > 0 ? 
      (this.metrics.successfulConnections / totalConnections) * 100 : 0;

    return {
      connectionQueue: {
        queued: this.connectionQueue.length,
        processing: this.processingConnections.size,
        maxConcurrent: this.maxConcurrentConnections
      },
      performance: {
        successRate: successRate.toFixed(1) + '%',
        avgResponseTime: this.metrics.avgResponseTime.toFixed(2) + 'ms',
        totalProcessed: totalConnections,
        successful: this.metrics.successfulConnections,
        failed: this.metrics.failedConnections,
        timeouts: this.metrics.timeouts
      },
      recommendations: this.generateRecommendations(successRate)
    };
  }

  /**
   * Generate infrastructure recommendations
   */
  generateRecommendations(successRate) {
    const recommendations = [];

    if (successRate < 70) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Upgrade Railway plan for better resource allocation',
        impact: 'Significant improvement in connection success rate'
      });
    }

    if (this.connectionQueue.length > 10) {
      recommendations.push({
        priority: 'HIGH', 
        action: 'Implement horizontal scaling or increase concurrent connection limit',
        impact: 'Reduced queue times and better user experience'
      });
    }

    if (this.metrics.avgResponseTime > 2000) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Optimize connection processing and reduce timeout values',
        impact: 'Faster connection establishment'
      });
    }

    if (this.metrics.timeouts > this.metrics.successfulConnections * 0.1) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Investigate Railway resource constraints and optimize memory usage',
        impact: 'Reduced connection timeouts'
      });
    }

    return recommendations;
  }

  /**
   * Memory optimization strategies
   */
  optimizeMemoryUsage() {
    // Clear old metrics periodically
    if (this.metrics.successfulConnections > 1000) {
      this.metrics = {
        ...this.metrics,
        successfulConnections: Math.floor(this.metrics.successfulConnections * 0.8),
        failedConnections: Math.floor(this.metrics.failedConnections * 0.8)
      };
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Return memory usage
    const memUsage = process.memoryUsage();
    return {
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
    };
  }
}

module.exports = InfrastructureOptimizer;