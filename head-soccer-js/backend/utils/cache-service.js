const { createClient } = require('redis');
const config = require('./config');
const InMemoryCache = require('./in-memory-cache');

class CacheService {
  constructor() {
    this.redisClient = null;
    this.fallbackCache = new InMemoryCache();
    this.isRedisConnected = false;
    this.useRedis = false;
  }

  async initialize() {
    try {
      // Try to connect to Redis first
      if (config.redis.url) {
        await this.connectRedis();
      } else {
        console.log('⚠️  Redis URL not configured, using in-memory cache');
        this.useRedis = false;
      }
    } catch (error) {
      console.error('Redis connection failed, falling back to in-memory cache:', error.message);
      this.useRedis = false;
    }
  }

  async connectRedis() {
    try {
      console.log('🔄 Attempting to connect to Redis...');
      
      let redisConfig;
      
      // Handle different Redis URL formats
      if (config.redis.url.startsWith('redis://') || config.redis.url.startsWith('rediss://')) {
        redisConfig = {
          url: config.redis.url,
          socket: {
            connectTimeout: 5000,  // Reduced timeout
            lazyConnect: true      // Changed to lazy connect
          }
        };
      } else {
        // Railway internal format or host:port
        const [host, port] = config.redis.url.split(':');
        redisConfig = {
          socket: {
            host: host || 'redis',
            port: parseInt(port) || 6379,
            connectTimeout: 5000,  // Reduced timeout
            lazyConnect: true      // Changed to lazy connect
          }
        };
        
        if (config.redis.password) {
          redisConfig.password = config.redis.password;
        }
      }

      this.redisClient = createClient(redisConfig);

      this.redisClient.on('error', (err) => {
        console.error('❌ Redis error:', err.message);
        this.isRedisConnected = false;
        this.useRedis = false;
      });

      this.redisClient.on('connect', () => {
        console.log('✅ Redis connected');
        this.isRedisConnected = true;
        this.useRedis = true;
      });

      this.redisClient.on('end', () => {
        console.log('Redis connection ended');
        this.isRedisConnected = false;
        this.useRedis = false;
      });

      await this.redisClient.connect();
      await this.redisClient.ping();
      
      console.log('✅ Redis connected and ready');
      this.useRedis = true;
      this.isRedisConnected = true;
      
    } catch (error) {
      console.error('❌ Redis connection failed:', error.message);
      this.useRedis = false;
      this.isRedisConnected = false;
      throw error;
    }
  }

  // Generic cache methods that use Redis or fallback
  async setEx(key, ttl, value) {
    if (this.useRedis && this.isRedisConnected) {
      try {
        return await this.redisClient.setEx(key, ttl, value);
      } catch (error) {
        console.error('Redis setEx error, falling back:', error.message);
        this.useRedis = false;
      }
    }
    
    return this.fallbackCache.setEx(key, ttl, value);
  }

  // Alias method for backward compatibility
  async set(key, value, ttl) {
    // Handle different parameter orders - some calls use (key, value, ttl)
    if (typeof value === 'object' && typeof ttl === 'number') {
      // Convert object to JSON string for storage
      return this.setEx(key, ttl, JSON.stringify(value));
    } else if (typeof ttl === 'number') {
      // Standard (key, value, ttl) format
      const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;
      return this.setEx(key, ttl, valueStr);
    } else {
      throw new Error('Invalid parameters for set method');
    }
  }

  async get(key) {
    let result = null;
    
    if (this.useRedis && this.isRedisConnected) {
      try {
        result = await this.redisClient.get(key);
      } catch (error) {
        console.error('Redis get error, falling back:', error.message);
        this.useRedis = false;
      }
    }
    
    if (result === null) {
      result = this.fallbackCache.get(key);
    }
    
    // Try to parse JSON if it's a string that looks like JSON
    if (typeof result === 'string' && (result.startsWith('{') || result.startsWith('['))) {
      try {
        return JSON.parse(result);
      } catch (parseError) {
        // If parsing fails, return the original string
        return result;
      }
    }
    
    return result;
  }

  async del(key) {
    if (this.useRedis && this.isRedisConnected) {
      try {
        return await this.redisClient.del(key);
      } catch (error) {
        console.error('Redis del error, falling back:', error.message);
        this.useRedis = false;
      }
    }
    
    return this.fallbackCache.del(key);
  }

  async zAdd(key, members) {
    if (this.useRedis && this.isRedisConnected) {
      try {
        return await this.redisClient.zAdd(key, members);
      } catch (error) {
        console.error('Redis zAdd error, falling back:', error.message);
        this.useRedis = false;
      }
    }
    
    return this.fallbackCache.zAdd(key, members);
  }

  async zRange(key, start, stop) {
    if (this.useRedis && this.isRedisConnected) {
      try {
        return await this.redisClient.zRange(key, start, stop);
      } catch (error) {
        console.error('Redis zRange error, falling back:', error.message);
        this.useRedis = false;
      }
    }
    
    return this.fallbackCache.zRange(key, start, stop);
  }

  async zRem(key, ...members) {
    if (this.useRedis && this.isRedisConnected) {
      try {
        return await this.redisClient.zRem(key, ...members);
      } catch (error) {
        console.error('Redis zRem error, falling back:', error.message);
        this.useRedis = false;
      }
    }
    
    return this.fallbackCache.zRem(key, ...members);
  }

  async zCard(key) {
    if (this.useRedis && this.isRedisConnected) {
      try {
        return await this.redisClient.zCard(key);
      } catch (error) {
        console.error('Redis zCard error, falling back:', error.message);
        this.useRedis = false;
      }
    }
    
    return this.fallbackCache.zCard(key);
  }

  isConnected() {
    return this.useRedis && this.isRedisConnected;
  }

  getStatus() {
    return {
      redis: this.isRedisConnected,
      fallback: !this.useRedis,
      mode: this.useRedis ? 'redis' : 'in-memory'
    };
  }
}

// Create singleton instance
const cacheService = new CacheService();

module.exports = cacheService;