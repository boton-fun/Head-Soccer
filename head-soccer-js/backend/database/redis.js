const { createClient } = require('redis');
const config = require('../utils/config');

let redisClient = null;
let isConnected = false;

async function connectRedis() {
  try {
    // Check if Redis is configured
    if (!config.redis.url) {
      console.log('⚠️  Redis not configured - running without cache (features will be limited)');
      return null;
    }

    console.log('🔄 Attempting to connect to Redis...');
    console.log('Redis URL format:', config.redis.url.substring(0, 10) + '...');

    // Parse Redis URL for Railway compatibility
    let redisConfig;
    
    if (config.redis.url.startsWith('redis://') || config.redis.url.startsWith('rediss://')) {
      // Standard Redis URL format
      redisConfig = {
        url: config.redis.url,
        socket: {
          connectTimeout: 15000,
          commandTimeout: 10000,
          keepAlive: 30000,
          reconnectDelay: 1000,
          lazyConnect: true,
          tls: config.redis.url.startsWith('rediss://') ? {} : false
        },
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 3
      };
    } else if (config.redis.url.includes(':')) {
      // Railway internal hostname format (redis:6379 or host:port)
      const [host, port] = config.redis.url.split(':');
      redisConfig = {
        socket: {
          host: host || 'redis',
          port: parseInt(port) || 6379,
          connectTimeout: 15000,
          commandTimeout: 10000,
          keepAlive: 30000,
          reconnectDelay: 1000,
          lazyConnect: true
        },
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 3
      };
      
      if (config.redis.password) {
        redisConfig.password = config.redis.password;
      }
    } else {
      // Just hostname
      redisConfig = {
        socket: {
          host: config.redis.url,
          port: 6379,
          connectTimeout: 15000,
          commandTimeout: 10000,
          keepAlive: 30000,
          reconnectDelay: 1000,
          lazyConnect: true
        },
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 3
      };
      
      if (config.redis.password) {
        redisConfig.password = config.redis.password;
      }
    }

    redisClient = createClient(redisConfig);

    redisClient.on('error', (err) => {
      console.error('❌ Redis connection error:', err.message);
      isConnected = false;
      
      // Attempt reconnection for connection issues
      if (err.message.includes('Socket closed') || 
          err.message.includes('connect ECONNREFUSED') ||
          err.message.includes('timeout')) {
        console.log('🔄 Attempting Redis reconnection in 5 seconds...');
        setTimeout(() => {
          if (!isConnected && redisClient && !redisClient.isOpen) {
            redisClient.connect().catch(reconnectErr => {
              console.error('Reconnection failed:', reconnectErr.message);
            });
          }
        }, 5000);
      }
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected successfully');
      isConnected = true;
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis ready for operations');
      isConnected = true;
    });

    redisClient.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
      isConnected = false;
    });

    redisClient.on('end', () => {
      console.log('Redis connection ended');
      isConnected = false;
    });

    await redisClient.connect();
    
    // Test the connection
    await redisClient.ping();
    console.log('✅ Redis ping successful');
    isConnected = true;
    
    // Set up periodic heartbeat to keep connection alive
    const heartbeat = setInterval(async () => {
      if (isRedisAvailable()) {
        try {
          await redisClient.ping();
        } catch (err) {
          console.warn('⚠️ Redis heartbeat failed:', err.message);
        }
      } else {
        clearInterval(heartbeat);
      }
    }, 30000); // Ping every 30 seconds
    
    return redisClient;
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error.message);
    console.log('⚠️  Continuing without Redis - some features will be disabled');
    isConnected = false;
    return null;
  }
}

// Helper function to check if Redis is available
function isRedisAvailable() {
  return redisClient && isConnected && redisClient.isOpen;
}

// Cache operations for game sessions
const gameCache = {
  // Store active game room data
  async setGameRoom(roomId, roomData, ttl = 3600) {
    try {
      if (!isRedisAvailable()) {
        console.log('Redis not available, skipping game room cache');
        return false;
      }
      
      await redisClient.setEx(
        `game:room:${roomId}`, 
        ttl, 
        JSON.stringify(roomData)
      );
      return true;
    } catch (error) {
      console.error('Error setting game room cache:', error.message);
      return false;
    }
  },

  // Get active game room data
  async getGameRoom(roomId) {
    try {
      if (!isRedisAvailable()) {
        return null;
      }
      
      const data = await redisClient.get(`game:room:${roomId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting game room cache:', error.message);
      return null;
    }
  },

  // Remove game room from cache
  async deleteGameRoom(roomId) {
    try {
      if (!isRedisAvailable()) {
        return false;
      }
      
      await redisClient.del(`game:room:${roomId}`);
      return true;
    } catch (error) {
      console.error('Error deleting game room cache:', error.message);
      return false;
    }
  },

  // Store player's current room
  async setPlayerRoom(playerId, roomId, ttl = 3600) {
    try {
      if (!isRedisAvailable()) {
        return false;
      }
      
      await redisClient.setEx(
        `player:room:${playerId}`, 
        ttl, 
        roomId
      );
      return true;
    } catch (error) {
      console.error('Error setting player room cache:', error.message);
      return false;
    }
  },

  // Get player's current room
  async getPlayerRoom(playerId) {
    try {
      if (!isRedisAvailable()) {
        return null;
      }
      
      return await redisClient.get(`player:room:${playerId}`);
    } catch (error) {
      console.error('Error getting player room cache:', error.message);
      return null;
    }
  },

  // Remove player from room cache
  async removePlayerFromRoom(playerId) {
    try {
      if (!isRedisAvailable()) {
        return false;
      }
      
      await redisClient.del(`player:room:${playerId}`);
      return true;
    } catch (error) {
      console.error('Error removing player from room cache:', error.message);
      return false;
    }
  }
};

// Matchmaking queue operations
const queueCache = {
  // Add player to matchmaking queue
  async addToQueue(playerId, playerData) {
    try {
      if (!isRedisAvailable()) {
        console.log('Redis not available, using in-memory queue fallback');
        return false;
      }
      
      // Add to sorted set with timestamp as score
      const score = Date.now();
      await redisClient.zAdd('matchmaking:queue', {
        score,
        value: JSON.stringify({ playerId, ...playerData })
      });
      
      // Set individual player queue data
      await redisClient.setEx(
        `queue:player:${playerId}`, 
        300, // 5 minutes
        JSON.stringify({ joinedAt: score, ...playerData })
      );
      
      return true;
    } catch (error) {
      console.error('Error adding to queue:', error.message);
      return false;
    }
  },

  // Remove player from queue
  async removeFromQueue(playerId) {
    try {
      if (!isRedisAvailable()) {
        return false;
      }
      
      // Remove from sorted set (need to find by player ID)
      const queueMembers = await redisClient.zRange('matchmaking:queue', 0, -1);
      
      for (const member of queueMembers) {
        try {
          const data = JSON.parse(member);
          if (data.playerId === playerId) {
            await redisClient.zRem('matchmaking:queue', member);
            break;
          }
        } catch (parseError) {
          console.error('Error parsing queue member:', parseError.message);
        }
      }
      
      // Remove individual player data
      await redisClient.del(`queue:player:${playerId}`);
      return true;
    } catch (error) {
      console.error('Error removing from queue:', error.message);
      return false;
    }
  },

  // Get queue length
  async getQueueLength() {
    try {
      if (!isRedisAvailable()) {
        return 0;
      }
      
      return await redisClient.zCard('matchmaking:queue');
    } catch (error) {
      console.error('Error getting queue length:', error.message);
      return 0;
    }
  },

  // Get next two players for matching
  async getNextMatch() {
    try {
      if (!isRedisAvailable()) {
        return null;
      }
      
      const players = await redisClient.zRange('matchmaking:queue', 0, 1);
      
      if (players.length < 2) return null;
      
      // Remove matched players from queue
      await redisClient.zRem('matchmaking:queue', players[0], players[1]);
      
      const player1 = JSON.parse(players[0]);
      const player2 = JSON.parse(players[1]);
      
      // Clean up individual player data
      await redisClient.del(`queue:player:${player1.playerId}`);
      await redisClient.del(`queue:player:${player2.playerId}`);
      
      return { player1, player2 };
    } catch (error) {
      console.error('Error getting next match:', error.message);
      return null;
    }
  }
};

// Session cache operations
const sessionCache = {
  // Store temporary session data
  async setSession(sessionId, data, ttl = 1800) {
    try {
      if (!isRedisAvailable()) {
        return false;
      }
      
      await redisClient.setEx(
        `session:${sessionId}`, 
        ttl, 
        JSON.stringify(data)
      );
      return true;
    } catch (error) {
      console.error('Error setting session cache:', error.message);
      return false;
    }
  },

  // Get session data
  async getSession(sessionId) {
    try {
      if (!isRedisAvailable()) {
        return null;
      }
      
      const data = await redisClient.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting session cache:', error.message);
      return null;
    }
  },

  // Delete session
  async deleteSession(sessionId) {
    try {
      if (!isRedisAvailable()) {
        return false;
      }
      
      await redisClient.del(`session:${sessionId}`);
      return true;
    } catch (error) {
      console.error('Error deleting session cache:', error.message);
      return false;
    }
  }
};

// Initialize Redis connection with graceful fallback
connectRedis().catch((error) => {
  console.error('Redis initialization failed:', error.message);
  console.log('Application will continue without Redis caching');
});

module.exports = {
  redisClient,
  connectRedis,
  isRedisAvailable,
  gameCache,
  queueCache,
  sessionCache
};