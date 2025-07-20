const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Load config after ensuring env vars are available
const config = require('./utils/config');

// Simple in-memory cache fallback for immediate deployment
const cacheService = {
  cache: new Map(),
  
  async initialize() {
    console.log('⚠️  Using simple in-memory cache (Redis disabled for now)');
    return Promise.resolve();
  },
  
  getStatus() {
    return { 
      redis: false, 
      fallback: true, 
      mode: 'simple-memory',
      note: 'Redis temporarily disabled to fix deployment'
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

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: config.frontendUrl,
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: config.frontendUrl,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

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

app.get('/', (req, res) => {
  res.json({ 
    message: 'Head Soccer Multiplayer Server',
    version: require('./package.json').version,
    endpoints: [
      '/health - Server health check',
      '/test-redis - Redis functionality test'
    ]
  });
});

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: config.isDevelopment() ? err.message : 'Something went wrong'
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