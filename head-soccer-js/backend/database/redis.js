const { createClient } = require('redis');
const config = require('../utils/config');

let redisClient;

async function connectRedis() {
  try {
    if (!config.redis.url) {
      console.log('Redis not configured, skipping connection');
      return null;
    }

    redisClient = createClient({
      url: config.redis.url,
      password: config.redis.password || undefined,
      socket: {
        connectTimeout: 10000,
        lazyConnect: true
      }
    });

    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log(' Redis connected successfully');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('Failed to connect to Redis:', error.message);
    return null;
  }
}

// Cache operations for game sessions
const gameCache = {
  // Store active game room data
  async setGameRoom(roomId, roomData, ttl = 3600) {
    try {
      if (!redisClient?.isOpen) return false;
      
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
      if (!redisClient?.isOpen) return null;
      
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
      if (!redisClient?.isOpen) return false;
      
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
      if (!redisClient?.isOpen) return false;
      
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
      if (!redisClient?.isOpen) return null;
      
      return await redisClient.get(`player:room:${playerId}`);
    } catch (error) {
      console.error('Error getting player room cache:', error.message);
      return null;
    }
  },

  // Remove player from room cache
  async removePlayerFromRoom(playerId) {
    try {
      if (!redisClient?.isOpen) return false;
      
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
      if (!redisClient?.isOpen) return false;
      
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
      if (!redisClient?.isOpen) return false;
      
      // Remove from sorted set (need to find by player ID)
      const queueMembers = await redisClient.zRange('matchmaking:queue', 0, -1);
      
      for (const member of queueMembers) {
        const data = JSON.parse(member);
        if (data.playerId === playerId) {
          await redisClient.zRem('matchmaking:queue', member);
          break;
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
      if (!redisClient?.isOpen) return 0;
      
      return await redisClient.zCard('matchmaking:queue');
    } catch (error) {
      console.error('Error getting queue length:', error.message);
      return 0;
    }
  },

  // Get next two players for matching
  async getNextMatch() {
    try {
      if (!redisClient?.isOpen) return null;
      
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
      if (!redisClient?.isOpen) return false;
      
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
      if (!redisClient?.isOpen) return null;
      
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
      if (!redisClient?.isOpen) return false;
      
      await redisClient.del(`session:${sessionId}`);
      return true;
    } catch (error) {
      console.error('Error deleting session cache:', error.message);
      return false;
    }
  }
};

// Initialize Redis connection
connectRedis().catch(console.error);

module.exports = {
  redisClient,
  connectRedis,
  gameCache,
  queueCache,
  sessionCache
};