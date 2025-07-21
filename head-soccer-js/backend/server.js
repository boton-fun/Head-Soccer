const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Load config after ensuring env vars are available
const config = require('./utils/config');

// Import WebSocket components
const ConnectionManager = require('./websocket/connectionManager');
const SocketHandler = require('./websocket/socketHandler');

// Import infrastructure optimization utilities
const InfrastructureOptimizer = require('./utils/infrastructure-optimizer');
const ResourceMonitor = require('./utils/resource-monitor');

// Import cache service with Redis support
let cacheService;
try {
  cacheService = require('./utils/cache-service');
  console.log('✅ Cache service loaded successfully');
} catch (error) {
  console.error('❌ Failed to load cache service:', error.message);
  console.log('⚠️  Falling back to simple in-memory cache');
  
  // Simple fallback cache
  cacheService = {
    cache: new Map(),
    
    async initialize() {
      console.log('⚠️  Using simple in-memory cache fallback');
      return Promise.resolve();
    },
    
    getStatus() {
      return { 
        redis: false, 
        fallback: true, 
        mode: 'simple-memory-fallback',
        error: 'Cache service failed to load'
      };
    },
    
    async setEx(key, ttl, value) {
      this.cache.set(key, { value, expires: Date.now() + (ttl * 1000) });
      return true;
    },
    
    async get(key) {
      const item = this.cache.get(key);
      if (!item) return null;
      if (Date.now() > item.expires) {
        this.cache.delete(key);
        return null;
      }
      return item.value;
    },
    
    async del(key) {
      return this.cache.delete(key);
    },
    
    // Queue operations for matchmaking
    async zAdd(key, members) { return true; },
    async zRange(key, start, stop) { return []; },
    async zRem(key, ...members) { return 0; },
    async zCard(key) { return 0; }
  };
}

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [config.frontendUrl, "http://localhost:3001", "http://127.0.0.1:3001"],
    methods: ["GET", "POST"],
    credentials: true
  },
  // Railway-optimized Socket.IO configuration
  pingTimeout: 25000, // Reduced from default 60000
  pingInterval: 20000, // Reduced from default 25000
  maxHttpBufferSize: 1e6, // 1MB limit for Railway
  transports: ['polling', 'websocket'], // Polling first for stability
  allowEIO3: true, // Backward compatibility
  upgradeTimeout: 10000, // Reduced upgrade timeout
  connectTimeout: 15000, // Reduced connection timeout
  // Memory optimization
  serveClient: false, // Don't serve client files
  allowRequest: (req, callback) => {
    // Basic rate limiting at Socket.IO level
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    // Could implement IP-based rate limiting here
    callback(null, true);
  }
});

app.use(cors({
  origin: config.frontendUrl,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Apply comprehensive middleware suite
const { setupMiddleware, errorLogger } = require('./middleware');
setupMiddleware(app);

app.get('/health', (req, res) => {
  const cacheStatus = cacheService.getStatus();
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
    version: require('./package.json').version,
    services: {
      database: config.supabase.url ? 'configured' : 'not configured',
      redis: config.redis.url ? 'configured' : 'not configured',
      cache: cacheStatus
    }
  });
});

// Add Cache test endpoint
app.get('/test-redis', async (req, res) => {
  try {
    // First check if getStatus method exists
    if (typeof cacheService.getStatus !== 'function') {
      return res.status(500).json({
        status: 'Cache service not properly initialized',
        error: 'getStatus method not available',
        timestamp: new Date().toISOString(),
        availableMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(cacheService))
      });
    }

    const cacheStatus = cacheService.getStatus();
    
    // Test cache operations
    const testKey = 'test:' + Date.now();
    const testValue = 'test-value-' + Date.now();
    
    // Test setEx
    await cacheService.setEx(testKey, 60, testValue);
    
    // Test get
    const retrievedValue = await cacheService.get(testKey);
    
    // Test del
    await cacheService.del(testKey);
    
    res.json({
      status: 'Cache test completed',
      timestamp: new Date().toISOString(),
      cacheStatus,
      testResults: {
        setValue: testValue,
        retrievedValue,
        testPassed: retrievedValue === testValue
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'Cache test failed',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      cacheStatus: typeof cacheService.getStatus === 'function' ? cacheService.getStatus() : 'getStatus not available'
    });
  }
});

// WebSocket status endpoints
app.get('/websocket/stats', (req, res) => {
  if (!connectionManager || !socketHandler) {
    return res.status(503).json({ error: 'WebSocket components not initialized' });
  }
  
  res.json({
    connectionManager: connectionManager.getStats(),
    socketHandler: socketHandler.getStats(),
    timestamp: new Date().toISOString()
  });
});

app.get('/websocket/connections', (req, res) => {
  if (!connectionManager) {
    return res.status(503).json({ error: 'Connection manager not initialized' });
  }
  
  const connections = [];
  for (const [socketId, connection] of connectionManager.connections.entries()) {
    connections.push(connectionManager.getPublicConnectionInfo(connection));
  }
  
  res.json({
    totalConnections: connections.length,
    connections: connections.slice(0, 100), // Limit to first 100 for performance
    timestamp: new Date().toISOString()
  });
});

// Infrastructure monitoring endpoints
app.get('/infrastructure/status', (req, res) => {
  try {
    const resourceStatus = resourceMonitor.getResourceStatus();
    const infrastructureHealth = infrastructureOptimizer.getInfrastructureHealth();
    const memoryUsage = infrastructureOptimizer.optimizeMemoryUsage();
    
    res.json({
      status: 'Infrastructure monitoring active',
      timestamp: new Date().toISOString(),
      resources: resourceStatus,
      infrastructure: infrastructureHealth,
      memory: memoryUsage,
      recommendations: resourceStatus.recommendations || []
    });
  } catch (error) {
    res.status(500).json({
      error: 'Infrastructure monitoring error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/infrastructure/optimize', (req, res) => {
  try {
    const suggestions = resourceMonitor.getOptimizationSuggestions();
    const wsConfig = infrastructureOptimizer.optimizeWebSocketConnections();
    
    res.json({
      status: 'Infrastructure optimization suggestions',
      timestamp: new Date().toISOString(),
      suggestions,
      optimizedWebSocketConfig: wsConfig,
      currentMetrics: resourceMonitor.exportMetrics().summary
    });
  } catch (error) {
    res.status(500).json({
      error: 'Infrastructure optimization error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Import and use authentication routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Import and use statistics routes
const statsRoutes = require('./routes/stats');
app.use('/api/stats', statsRoutes);

// Import and use leaderboard routes
const leaderboardRoutes = require('./routes/leaderboard');
app.use('/api/leaderboard', leaderboardRoutes);

app.get('/', (req, res) => {
  res.json({ 
    message: 'Head Soccer Multiplayer Server',
    version: require('./package.json').version,
    endpoints: [
      '/health - Server health check',
      '/test-redis - Redis functionality test',
      '/websocket/stats - WebSocket statistics',
      '/websocket/connections - Active connections',
      '/infrastructure/status - Infrastructure monitoring',
      '/infrastructure/optimize - Optimization suggestions',
      '/api/auth/register - User registration',
      '/api/auth/check-username - Username availability check',
      '/api/auth/health - Auth service health',
      '/api/stats/me - Current user statistics',
      '/api/stats/player/:id - Player statistics by ID',
      '/api/stats/history/:id - Player game history',
      '/api/stats/compare/:id1/:id2 - Compare two players',
      '/api/stats/summary - Overall game statistics',
      '/api/stats/submit-game-result - Submit game result',
      '/api/stats/recent-activity/:id - Recent player activity',
      '/api/leaderboard - Global leaderboard with filtering',
      '/api/leaderboard/top/:count - Top N players',
      '/api/leaderboard/player/:id/rank - Player rank and context',
      '/api/leaderboard/seasons - Seasonal leaderboards',
      '/api/leaderboard/categories/:category - Category leaderboards'
    ]
  });
});

// Initialize WebSocket components
let connectionManager;
let socketHandler;

// Initialize infrastructure optimization
const infrastructureOptimizer = new InfrastructureOptimizer();
const resourceMonitor = new ResourceMonitor({
  monitoringInterval: 10000, // 10 seconds
  memoryThreshold: 80, // 80% for Railway free tier
  cpuThreshold: 70,
  connectionThreshold: 50
});

// WebSocket initialization will happen after server starts

// Error logging middleware
app.use(errorLogger);

// Error handling middleware
app.use((err, req, res, next) => {
  // Don't log again, errorLogger already logged it
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: config.isDevelopment() ? err.message : 'Something went wrong',
    ...(config.isDevelopment() && { stack: err.stack })
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}. Graceful shutdown...`);
  
  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      console.error('Error during server shutdown:', err);
      process.exit(1);
    }
    
    console.log('HTTP server closed.');
    
    // Cleanup WebSocket components
    if (connectionManager) {
      connectionManager.shutdown();
    }
    if (socketHandler) {
      socketHandler.shutdown();
    }
    
    // Close Socket.IO connections
    io.close(() => {
      console.log('Socket.IO server closed.');
      
      // Additional cleanup can be added here (database connections, etc.)
      console.log('Graceful shutdown completed.');
      process.exit(0);
    });
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  console.error('Stack:', error.stack);
  console.log('Attempting graceful shutdown...');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  console.log('Attempting graceful shutdown...');
  process.exit(1);
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (require.main === module) {
  console.log('🚀 Starting Head Soccer Multiplayer Server...');
  
  // Initialize cache service
  cacheService.initialize().then(() => {
    console.log('✅ Cache service ready');
  }).catch(() => {
    console.log('⚠️  Cache service failed, continuing anyway');
  });
  
  // Start server immediately
  try {
    console.log(`Starting server on port ${config.port}...`);
    
    server.listen(config.port, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Frontend URL: ${config.frontendUrl}`);
      console.log(`Cache status:`, cacheService.getStatus());
      
      // Start infrastructure monitoring
      resourceMonitor.startMonitoring();
      console.log('📊 Infrastructure monitoring started');
      
      // Initialize WebSocket components after server is running
      try {
        connectionManager = new ConnectionManager(io);
        socketHandler = new SocketHandler(connectionManager);
        
        // Start monitoring
        connectionManager.startMonitoring();
        
        console.log('🔗 WebSocket components initialized');
      } catch (error) {
        console.error('❌ Failed to initialize WebSocket components:', error);
      }
      
      console.log('🚀 Head Soccer Multiplayer Server is ready!');
    });

    server.on('error', (error) => {
      console.error('❌ Server error:', error.message);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${config.port} is already in use`);
      }
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

module.exports = { app, server, io };