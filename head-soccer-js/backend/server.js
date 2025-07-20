const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Load config after ensuring env vars are available
const config = require('./utils/config');
const cacheService = require('./utils/cache-service');

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

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (require.main === module) {
  // Initialize cache service before starting server
  cacheService.initialize().then(() => {
    console.log('Cache service initialized');
    
    server.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Frontend URL: ${config.frontendUrl}`);
      console.log(`Cache status:`, cacheService.getStatus());
    });
  }).catch((error) => {
    console.error('Failed to initialize cache service:', error.message);
    console.log('Starting server without Redis caching...');
    
    server.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      console.log(`Frontend URL: ${config.frontendUrl}`);
      console.log(`Cache status:`, cacheService.getStatus());
    });
  });
}

module.exports = { app, server, io };