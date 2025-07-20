// In-memory fallback cache for when Redis is not available
class InMemoryCache {
  constructor() {
    this.cache = new Map();
    this.timeouts = new Map();
    this.queues = {
      matchmaking: []
    };
  }

  // Set with TTL
  setEx(key, ttl, value) {
    // Clear existing timeout if any
    if (this.timeouts.has(key)) {
      clearTimeout(this.timeouts.get(key));
    }

    // Set value
    this.cache.set(key, value);

    // Set timeout for expiration
    const timeout = setTimeout(() => {
      this.cache.delete(key);
      this.timeouts.delete(key);
    }, ttl * 1000);

    this.timeouts.set(key, timeout);
    return Promise.resolve();
  }

  // Get value
  get(key) {
    return Promise.resolve(this.cache.get(key) || null);
  }

  // Delete key
  del(key) {
    if (this.timeouts.has(key)) {
      clearTimeout(this.timeouts.get(key));
      this.timeouts.delete(key);
    }
    const existed = this.cache.has(key);
    this.cache.delete(key);
    return Promise.resolve(existed ? 1 : 0);
  }

  // Ping
  ping() {
    return Promise.resolve('PONG');
  }

  // Queue operations
  zAdd(queueName, members) {
    if (!this.queues[queueName]) {
      this.queues[queueName] = [];
    }
    
    if (Array.isArray(members)) {
      members.forEach(member => {
        this.queues[queueName].push({
          score: member.score,
          value: member.value
        });
      });
    } else {
      this.queues[queueName].push({
        score: members.score,
        value: members.value
      });
    }
    
    // Sort by score
    this.queues[queueName].sort((a, b) => a.score - b.score);
    return Promise.resolve();
  }

  zRange(queueName, start, stop) {
    if (!this.queues[queueName]) {
      return Promise.resolve([]);
    }
    
    const queue = this.queues[queueName];
    if (stop === -1) {
      return Promise.resolve(queue.slice(start).map(item => item.value));
    }
    
    return Promise.resolve(queue.slice(start, stop + 1).map(item => item.value));
  }

  zRem(queueName, ...values) {
    if (!this.queues[queueName]) {
      return Promise.resolve(0);
    }
    
    let removed = 0;
    values.forEach(value => {
      const index = this.queues[queueName].findIndex(item => item.value === value);
      if (index !== -1) {
        this.queues[queueName].splice(index, 1);
        removed++;
      }
    });
    
    return Promise.resolve(removed);
  }

  zCard(queueName) {
    if (!this.queues[queueName]) {
      return Promise.resolve(0);
    }
    return Promise.resolve(this.queues[queueName].length);
  }

  // Clear all data
  clear() {
    this.cache.clear();
    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();
    this.queues = { matchmaking: [] };
  }
}

module.exports = InMemoryCache;