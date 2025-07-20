/**
 * Resource Monitor - Real-time infrastructure monitoring
 * Tracks server performance and suggests optimizations
 */

const os = require('os');
const EventEmitter = require('events');

class ResourceMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      monitoringInterval: options.monitoringInterval || 5000, // 5 seconds
      memoryThreshold: options.memoryThreshold || 85, // 85% memory usage
      cpuThreshold: options.cpuThreshold || 80, // 80% CPU usage
      connectionThreshold: options.connectionThreshold || 50, // Max connections
      alertCooldown: options.alertCooldown || 60000, // 1 minute between alerts
      ...options
    };
    
    this.metrics = {
      memory: [],
      cpu: [],
      connections: [],
      errors: [],
      alerts: []
    };
    
    this.lastAlert = {};
    this.monitoring = false;
    this.intervalId = null;
    
    // Railway-specific optimizations
    this.railwayLimits = {
      memory: 512, // MB for free tier
      cpu: 1, // vCPU
      connections: 100, // Estimated safe limit
      storage: 1024 // MB
    };
  }

  /**
   * Start monitoring server resources
   */
  startMonitoring() {
    if (this.monitoring) return;
    
    console.log('🔍 Starting resource monitoring...');
    this.monitoring = true;
    
    this.intervalId = setInterval(() => {
      this.collectMetrics();
    }, this.options.monitoringInterval);
    
    // Initial collection
    this.collectMetrics();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (!this.monitoring) return;
    
    console.log('⏹️ Stopping resource monitoring...');
    this.monitoring = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Collect system metrics
   */
  collectMetrics() {
    const timestamp = Date.now();
    
    // Memory metrics
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryPercent = ((totalMemory - freeMemory) / totalMemory) * 100;
    
    const memoryMetric = {
      timestamp,
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      rss: memoryUsage.rss,
      systemPercent: memoryPercent,
      railwayUsageMB: memoryUsage.rss / 1024 / 1024,
      railwayPercentUsed: (memoryUsage.rss / 1024 / 1024 / this.railwayLimits.memory) * 100
    };
    
    // CPU metrics
    const cpuUsage = process.cpuUsage();
    const loadAverage = os.loadavg();
    
    const cpuMetric = {
      timestamp,
      user: cpuUsage.user,
      system: cpuUsage.system,
      loadAverage: loadAverage[0], // 1-minute load average
      cpuPercent: this.calculateCPUPercent()
    };
    
    // Store metrics (keep last 100 entries)
    this.metrics.memory.push(memoryMetric);
    this.metrics.cpu.push(cpuMetric);
    
    if (this.metrics.memory.length > 100) {
      this.metrics.memory.shift();
    }
    if (this.metrics.cpu.length > 100) {
      this.metrics.cpu.shift();
    }
    
    // Check thresholds and emit alerts
    this.checkThresholds(memoryMetric, cpuMetric);
    
    // Emit metrics event
    this.emit('metrics', {
      memory: memoryMetric,
      cpu: cpuMetric,
      timestamp
    });
  }

  /**
   * Calculate CPU usage percentage
   */
  calculateCPUPercent() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }
    
    return 100 - (totalIdle / totalTick) * 100;
  }

  /**
   * Check resource thresholds and trigger alerts
   */
  checkThresholds(memoryMetric, cpuMetric) {
    const now = Date.now();
    
    // Memory threshold check
    if (memoryMetric.railwayPercentUsed > this.options.memoryThreshold) {
      this.triggerAlert('memory', {
        type: 'HIGH_MEMORY_USAGE',
        severity: 'WARNING',
        message: `Memory usage: ${memoryMetric.railwayPercentUsed.toFixed(1)}% of Railway limit`,
        value: memoryMetric.railwayPercentUsed,
        threshold: this.options.memoryThreshold,
        recommendations: [
          'Consider upgrading Railway plan',
          'Optimize memory usage in application',
          'Implement connection pooling',
          'Add garbage collection optimization'
        ]
      }, now);
    }
    
    // CPU threshold check
    if (cpuMetric.cpuPercent > this.options.cpuThreshold) {
      this.triggerAlert('cpu', {
        type: 'HIGH_CPU_USAGE',
        severity: 'WARNING',
        message: `CPU usage: ${cpuMetric.cpuPercent.toFixed(1)}%`,
        value: cpuMetric.cpuPercent,
        threshold: this.options.cpuThreshold,
        recommendations: [
          'Optimize async operations',
          'Reduce concurrent connection processing',
          'Implement request queuing',
          'Consider horizontal scaling'
        ]
      }, now);
    }
  }

  /**
   * Trigger alert with cooldown
   */
  triggerAlert(type, alert, timestamp) {
    const lastAlertTime = this.lastAlert[type] || 0;
    
    if (timestamp - lastAlertTime > this.options.alertCooldown) {
      this.lastAlert[type] = timestamp;
      this.metrics.alerts.push({ ...alert, timestamp });
      
      console.log(`🚨 ALERT [${alert.severity}]: ${alert.message}`);
      alert.recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
      
      this.emit('alert', alert);
    }
  }

  /**
   * Get current resource status
   */
  getResourceStatus() {
    const latestMemory = this.metrics.memory[this.metrics.memory.length - 1];
    const latestCpu = this.metrics.cpu[this.metrics.cpu.length - 1];
    
    if (!latestMemory || !latestCpu) {
      return { status: 'No metrics available' };
    }
    
    const status = {
      timestamp: Date.now(),
      railway: {
        memoryUsed: `${latestMemory.railwayUsageMB.toFixed(1)}MB`,
        memoryLimit: `${this.railwayLimits.memory}MB`,
        memoryPercent: `${latestMemory.railwayPercentUsed.toFixed(1)}%`,
        memoryStatus: this.getStatusLevel(latestMemory.railwayPercentUsed, this.options.memoryThreshold)
      },
      cpu: {
        usage: `${latestCpu.cpuPercent.toFixed(1)}%`,
        loadAverage: latestCpu.loadAverage.toFixed(2),
        status: this.getStatusLevel(latestCpu.cpuPercent, this.options.cpuThreshold)
      },
      process: {
        heapUsed: `${(latestMemory.heapUsed / 1024 / 1024).toFixed(1)}MB`,
        heapTotal: `${(latestMemory.heapTotal / 1024 / 1024).toFixed(1)}MB`,
        external: `${(latestMemory.external / 1024 / 1024).toFixed(1)}MB`,
        rss: `${(latestMemory.rss / 1024 / 1024).toFixed(1)}MB`
      },
      alerts: {
        total: this.metrics.alerts.length,
        recent: this.metrics.alerts.filter(a => Date.now() - a.timestamp < 300000).length, // Last 5 minutes
        lastAlert: this.metrics.alerts[this.metrics.alerts.length - 1]
      },
      recommendations: this.generateCurrentRecommendations(latestMemory, latestCpu)
    };
    
    return status;
  }

  /**
   * Get status level (OK, WARNING, CRITICAL)
   */
  getStatusLevel(value, threshold) {
    if (value < threshold * 0.7) return 'OK';
    if (value < threshold) return 'WARNING';
    return 'CRITICAL';
  }

  /**
   * Generate current recommendations
   */
  generateCurrentRecommendations(memoryMetric, cpuMetric) {
    const recommendations = [];
    
    if (memoryMetric.railwayPercentUsed > 70) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Memory',
        action: 'Upgrade Railway plan or optimize memory usage',
        impact: 'Prevent memory-related connection timeouts'
      });
    }
    
    if (cpuMetric.cpuPercent > 60) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'CPU',
        action: 'Implement connection queuing and reduce concurrent processing',
        impact: 'Improve connection success rate'
      });
    }
    
    if (this.metrics.alerts.length > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Monitoring',
        action: 'Review recent alerts and implement suggested optimizations',
        impact: 'Proactive issue prevention'
      });
    }
    
    return recommendations;
  }

  /**
   * Get infrastructure optimization suggestions
   */
  getOptimizationSuggestions() {
    return {
      immediate: [
        {
          action: 'Reduce concurrent WebSocket connections from 15 to 5',
          effort: 'Low',
          impact: 'High',
          timeframe: 'Immediate'
        },
        {
          action: 'Implement connection queuing system',
          effort: 'Medium',
          impact: 'High',
          timeframe: '1-2 hours'
        },
        {
          action: 'Optimize Socket.IO transport settings (polling first)',
          effort: 'Low',
          impact: 'Medium',
          timeframe: 'Immediate'
        }
      ],
      shortTerm: [
        {
          action: 'Upgrade Railway plan to Hobby ($5/month)',
          effort: 'Low',
          impact: 'Very High',
          timeframe: 'Same day',
          cost: '$5/month'
        },
        {
          action: 'Implement Redis connection pooling',
          effort: 'Medium',
          impact: 'Medium',
          timeframe: '2-4 hours'
        },
        {
          action: 'Add comprehensive caching layer',
          effort: 'High',
          impact: 'High',
          timeframe: '1 day'
        }
      ],
      longTerm: [
        {
          action: 'Consider migrating to dedicated VPS (DigitalOcean, Linode)',
          effort: 'High',
          impact: 'Very High',
          timeframe: '1-2 weeks',
          cost: '$10-20/month'
        },
        {
          action: 'Implement horizontal scaling with load balancer',
          effort: 'Very High',
          impact: 'Very High',
          timeframe: '2-4 weeks'
        },
        {
          action: 'Set up CDN for static assets',
          effort: 'Medium',
          impact: 'Medium',
          timeframe: '1 week'
        }
      ]
    };
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics() {
    return {
      memory: this.metrics.memory,
      cpu: this.metrics.cpu,
      alerts: this.metrics.alerts,
      summary: this.getResourceStatus(),
      recommendations: this.getOptimizationSuggestions()
    };
  }
}

module.exports = ResourceMonitor;