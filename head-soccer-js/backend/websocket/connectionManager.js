/**
 * Connection Manager - Handles WebSocket connection tracking, health monitoring, and cleanup
 * Provides comprehensive connection management for multiplayer Head Soccer
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class ConnectionManager extends EventEmitter {
  constructor(io, options = {}) {
    super();
    
    this.io = io;
    this.connections = new Map(); // socketId -> connection info
    this.playerConnections = new Map(); // playerId -> socketId
    this.roomConnections = new Map(); // roomId -> Set of socketIds
    
    // Configuration
    this.heartbeatInterval = options.heartbeatInterval || 30000; // 30 seconds
    this.connectionTimeout = options.connectionTimeout || 60000; // 1 minute
    this.maxConnections = options.maxConnections || 1000;
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
    
    // Statistics
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      disconnections: 0,
      timeouts: 0,
      reconnections: 0,
      startTime: Date.now()
    };
    
    // Intervals
    this.heartbeatIntervalId = null;
    this.cleanupIntervalId = null;
    
    // Bind Socket.IO events
    this.setupSocketEvents();
    
    console.log('= Connection Manager initialized');
  }
  
  /**
   * Socket.IO Event Setup
   */
  setupSocketEvents() {
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }
  
  /**
   * Handle new socket connection
   * @param {Socket} socket - Socket.IO socket
   */
  handleConnection(socket) {
    // Check connection limits
    if (this.connections.size >= this.maxConnections) {
      console.log(`L Connection limit reached, rejecting ${socket.id}`);
      socket.emit('connection_rejected', { reason: 'Server at capacity' });
      socket.disconnect(true);
      return;
    }
    
    const connection = {
      id: socket.id,
      socket: socket,
      playerId: null,
      roomId: null,
      connectedAt: Date.now(),
      lastPing: Date.now(),
      lastActivity: Date.now(),
      isAuthenticated: false,
      metadata: {
        userAgent: socket.handshake.headers['user-agent'],
        ip: socket.handshake.address,
        version: socket.handshake.query.version || '1.0.0'
      },
      stats: {
        messagesSent: 0,
        messagesReceived: 0,
        bytesTransferred: 0,
        reconnectCount: 0
      }
    };
    
    // Store connection
    this.connections.set(socket.id, connection);
    this.stats.totalConnections++;
    this.stats.activeConnections++;
    
    console.log(`= New connection: ${socket.id} (${this.stats.activeConnections} active)`);
    
    // Setup socket event handlers
    this.setupSocketHandlers(socket, connection);
    
    // Emit connection event (with socket for internal use)
    const eventData = {
      socketId: socket.id,
      socket: socket,
      connection: connection
    };
    
    console.log('🔍 ConnectionManager emitting connection event with:', {
      socketId: eventData.socketId,
      hasSocket: !!eventData.socket,
      socketType: typeof eventData.socket,
      hasConnection: !!eventData.connection
    });
    
    this.emit('connection', eventData);
    
    // Send welcome message
    socket.emit('connected', {
      socketId: socket.id,
      serverTime: Date.now(),
      heartbeatInterval: this.heartbeatInterval
    });
  }
  
  /**
   * Setup event handlers for a socket
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} connection - Connection object
   */
  setupSocketHandlers(socket, connection) {
    // Heartbeat/ping handling
    socket.on('ping', (data) => {
      connection.lastPing = Date.now();
      connection.lastActivity = Date.now();
      socket.emit('pong', {
        serverTime: Date.now(),
        clientTime: data?.clientTime || Date.now()
      });
    });
    
    // Player authentication
    socket.on('authenticate', (data) => {
      this.handleAuthentication(socket, connection, data);
    });
    
    // Room management
    socket.on('join_room', (data) => {
      this.handleJoinRoom(socket, connection, data);
    });
    
    socket.on('leave_room', (data) => {
      this.handleLeaveRoom(socket, connection, data);
    });
    
    // Activity tracking
    socket.onAny((eventName, ...args) => {
      connection.lastActivity = Date.now();
      connection.stats.messagesReceived++;
      
      // Track data size (approximate)
      const dataSize = JSON.stringify(args).length;
      connection.stats.bytesTransferred += dataSize;
    });
    
    // Disconnection handling
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, connection, reason);
    });
    
    // Error handling
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
      this.emit('socket_error', {
        socketId: socket.id,
        playerId: connection.playerId,
        error: error.message
      });
    });
  }
  
  /**
   * Handle player authentication
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} connection - Connection object
   * @param {Object} data - Authentication data
   */
  handleAuthentication(socket, connection, data) {
    try {
      console.log('🔍 DEBUG: Authentication attempt received:', data);
      const { playerId, username, token } = data;
      
      // Basic validation (extend with proper auth later)
      if (!playerId || !username) {
        console.log('❌ DEBUG: Authentication failed - missing fields:', { playerId, username });
        socket.emit('auth_error', { reason: 'Missing required fields' });
        return;
      }
      
      // Check if player is already connected
      if (this.playerConnections.has(playerId)) {
        const existingSocketId = this.playerConnections.get(playerId);
        const existingConnection = this.connections.get(existingSocketId);
        
        if (existingConnection) {
          // Handle reconnection
          this.handleReconnection(socket, connection, existingConnection, data);
          return;
        }
      }
      
      // Set player information
      connection.playerId = playerId;
      connection.username = username;
      connection.isAuthenticated = true;
      this.playerConnections.set(playerId, socket.id);
      
      console.log(` Player authenticated: ${username} (${playerId}) on ${socket.id}`);
      
      socket.emit('authenticated', {
        playerId: playerId,
        username: username,
        socketId: socket.id,
        serverTime: Date.now()
      });
      
      this.emit('player_authenticated', {
        playerId: playerId,
        username: username,
        socketId: socket.id,
        connection: this.getPublicConnectionInfo(connection)
      });
      
    } catch (error) {
      console.error('Authentication error:', error);
      socket.emit('auth_error', { reason: 'Authentication failed' });
    }
  }
  
  /**
   * Handle player reconnection
   * @param {Socket} newSocket - New socket
   * @param {Object} newConnection - New connection object
   * @param {Object} oldConnection - Previous connection object
   * @param {Object} data - Authentication data
   */
  handleReconnection(newSocket, newConnection, oldConnection, data) {
    console.log(`= Player reconnecting: ${data.playerId} (${oldConnection.id} -> ${newSocket.id})`);
    
    // Update connection mapping
    this.playerConnections.set(data.playerId, newSocket.id);
    
    // Transfer player info to new connection
    newConnection.playerId = data.playerId;
    newConnection.username = data.username;
    newConnection.isAuthenticated = true;
    newConnection.roomId = oldConnection.roomId;
    newConnection.stats.reconnectCount = oldConnection.stats.reconnectCount + 1;
    
    // Update room connections if player was in a room
    if (oldConnection.roomId) {
      const roomConnections = this.roomConnections.get(oldConnection.roomId);
      if (roomConnections) {
        roomConnections.delete(oldConnection.id);
        roomConnections.add(newSocket.id);
        newSocket.join(oldConnection.roomId);
      }
    }
    
    // Clean up old connection
    if (oldConnection.socket && oldConnection.socket.connected) {
      oldConnection.socket.disconnect(true);
    }
    this.connections.delete(oldConnection.id);
    
    this.stats.reconnections++;
    
    newSocket.emit('reconnected', {
      playerId: data.playerId,
      socketId: newSocket.id,
      previousSocketId: oldConnection.id,
      roomId: newConnection.roomId,
      reconnectCount: newConnection.stats.reconnectCount
    });
    
    this.emit('player_reconnected', {
      playerId: data.playerId,
      newSocketId: newSocket.id,
      oldSocketId: oldConnection.id,
      roomId: newConnection.roomId
    });
  }
  
  /**
   * Handle joining a room
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} connection - Connection object
   * @param {Object} data - Room data
   */
  handleJoinRoom(socket, connection, data) {
    try {
      const { roomId } = data;
      
      if (!roomId) {
        socket.emit('join_room_error', { reason: 'Room ID required' });
        return;
      }
      
      // Leave current room if any
      if (connection.roomId) {
        this.handleLeaveRoom(socket, connection, { roomId: connection.roomId });
      }
      
      // Join new room
      socket.join(roomId);
      connection.roomId = roomId;
      
      // Track room connections
      if (!this.roomConnections.has(roomId)) {
        this.roomConnections.set(roomId, new Set());
      }
      this.roomConnections.get(roomId).add(socket.id);
      
      console.log(`<� Player ${connection.playerId} joined room ${roomId}`);
      
      socket.emit('room_joined', {
        roomId: roomId,
        playersInRoom: this.roomConnections.get(roomId).size
      });
      
      this.emit('player_joined_room', {
        playerId: connection.playerId,
        socketId: socket.id,
        roomId: roomId
      });
      
    } catch (error) {
      console.error('Join room error:', error);
      socket.emit('join_room_error', { reason: 'Failed to join room' });
    }
  }
  
  /**
   * Handle leaving a room
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} connection - Connection object
   * @param {Object} data - Room data
   */
  handleLeaveRoom(socket, connection, data) {
    try {
      const roomId = data.roomId || connection.roomId;
      
      if (!roomId) {
        return; // Not in a room
      }
      
      // Leave Socket.IO room
      socket.leave(roomId);
      
      // Update room connections
      const roomConnections = this.roomConnections.get(roomId);
      if (roomConnections) {
        roomConnections.delete(socket.id);
        
        // Clean up empty rooms
        if (roomConnections.size === 0) {
          this.roomConnections.delete(roomId);
        }
      }
      
      connection.roomId = null;
      
      console.log(`=� Player ${connection.playerId} left room ${roomId}`);
      
      socket.emit('room_left', { roomId: roomId });
      
      this.emit('player_left_room', {
        playerId: connection.playerId,
        socketId: socket.id,
        roomId: roomId
      });
      
    } catch (error) {
      console.error('Leave room error:', error);
    }
  }
  
  /**
   * Handle socket disconnection
   * @param {Socket} socket - Socket.IO socket
   * @param {Object} connection - Connection object
   * @param {string} reason - Disconnection reason
   */
  handleDisconnection(socket, connection, reason) {
    console.log(`= Player disconnected: ${socket.id} (${reason})`);
    
    // Update statistics
    this.stats.activeConnections--;
    this.stats.disconnections++;
    
    // Clean up room connections
    if (connection.roomId) {
      this.handleLeaveRoom(socket, connection, { roomId: connection.roomId });
    }
    
    // Clean up player mapping
    if (connection.playerId) {
      this.playerConnections.delete(connection.playerId);
    }
    
    // Emit disconnection event
    this.emit('player_disconnected', {
      playerId: connection.playerId,
      socketId: socket.id,
      reason: reason,
      connectionDuration: Date.now() - connection.connectedAt,
      stats: connection.stats
    });
    
    // Remove connection (keep for a short time for potential reconnection)
    setTimeout(() => {
      this.connections.delete(socket.id);
    }, 5000); // 5 second grace period
  }
  
  /**
   * Broadcasting Utilities
   */
  
  /**
   * Broadcast to all connections
   * @param {string} event - Event name
   * @param {Object} data - Data to send
   */
  broadcastToAll(event, data) {
    this.io.emit(event, data);
    console.log(`=� Broadcast to all: ${event}`);
  }
  
  /**
   * Broadcast to a specific room
   * @param {string} roomId - Room ID
   * @param {string} event - Event name
   * @param {Object} data - Data to send
   */
  broadcastToRoom(roomId, event, data) {
    this.io.to(roomId).emit(event, data);
    const roomSize = this.roomConnections.get(roomId)?.size || 0;
    console.log(`=� Broadcast to room ${roomId} (${roomSize} players): ${event}`);
  }
  
  /**
   * Send message to specific player
   * @param {string} playerId - Player ID
   * @param {string} event - Event name
   * @param {Object} data - Data to send
   */
  sendToPlayer(playerId, event, data) {
    const socketId = this.playerConnections.get(playerId);
    if (socketId) {
      const connection = this.connections.get(socketId);
      if (connection && connection.socket) {
        connection.socket.emit(event, data);
        connection.stats.messagesSent++;
        console.log(`=� Send to player ${playerId}: ${event}`);
      }
    }
  }
  
  /**
   * Broadcast to multiple players
   * @param {Array} playerIds - Array of player IDs
   * @param {string} event - Event name
   * @param {Object} data - Data to send
   */
  broadcastToPlayers(playerIds, event, data) {
    playerIds.forEach(playerId => {
      this.sendToPlayer(playerId, event, data);
    });
  }
  
  /**
   * Health Monitoring and Cleanup
   */
  
  /**
   * Start health monitoring
   */
  startMonitoring() {
    console.log('=� Starting connection health monitoring');
    
    // Heartbeat monitoring
    this.heartbeatIntervalId = setInterval(() => {
      this.performHealthCheck();
    }, this.heartbeatInterval);
    
    // Connection cleanup
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupStaleConnections();
    }, this.cleanupInterval);
  }
  
  /**
   * Stop health monitoring
   */
  stopMonitoring() {
    console.log('=� Stopping connection health monitoring');
    
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
    
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }
  
  /**
   * Perform health check on all connections
   */
  performHealthCheck() {
    const now = Date.now();
    const staleConnections = [];
    
    for (const [socketId, connection] of this.connections.entries()) {
      // Check if connection is stale
      const timeSinceLastActivity = now - connection.lastActivity;
      
      if (timeSinceLastActivity > this.connectionTimeout) {
        staleConnections.push(socketId);
      } else if (timeSinceLastActivity > this.heartbeatInterval) {
        // Send ping to potentially stale connections
        if (connection.socket && connection.socket.connected) {
          connection.socket.emit('ping_request', { serverTime: now });
        }
      }
    }
    
    // Clean up stale connections
    staleConnections.forEach(socketId => {
      const connection = this.connections.get(socketId);
      if (connection) {
        console.log(`� Timing out stale connection: ${socketId}`);
        this.stats.timeouts++;
        
        if (connection.socket && connection.socket.connected) {
          connection.socket.emit('timeout', { reason: 'Connection timeout' });
          connection.socket.disconnect(true);
        }
      }
    });
  }
  
  /**
   * Clean up stale connections
   */
  cleanupStaleConnections() {
    const now = Date.now();
    const disconnectedConnections = [];
    
    for (const [socketId, connection] of this.connections.entries()) {
      // Remove connections that have been disconnected for too long
      if (!connection.socket.connected && (now - connection.lastActivity) > 30000) {
        disconnectedConnections.push(socketId);
      }
    }
    
    disconnectedConnections.forEach(socketId => {
      this.connections.delete(socketId);
    });
    
    if (disconnectedConnections.length > 0) {
      console.log(`>� Cleaned up ${disconnectedConnections.length} stale connections`);
    }
  }
  
  /**
   * Utility Methods
   */
  
  /**
   * Get connection info for a player
   * @param {string} playerId - Player ID
   * @returns {Object|null} Connection info
   */
  getPlayerConnection(playerId) {
    const socketId = this.playerConnections.get(playerId);
    return socketId ? this.connections.get(socketId) : null;
  }
  
  /**
   * Get connection info by socket ID
   * @param {string} socketId - Socket ID
   * @returns {Object|null} Connection info
   */
  getConnectionBySocketId(socketId) {
    return this.connections.get(socketId) || null;
  }
  
  /**
   * Get all connections in a room
   * @param {string} roomId - Room ID
   * @returns {Array} Array of connection objects
   */
  getRoomConnections(roomId) {
    const socketIds = this.roomConnections.get(roomId);
    if (!socketIds) return [];
    
    return Array.from(socketIds)
      .map(socketId => this.connections.get(socketId))
      .filter(connection => connection !== undefined);
  }
  
  /**
   * Get public connection info (safe for client)
   * @param {Object} connection - Connection object
   * @returns {Object} Public connection info
   */
  getPublicConnectionInfo(connection) {
    return {
      socketId: connection.id,
      playerId: connection.playerId,
      username: connection.username,
      roomId: connection.roomId,
      connectedAt: connection.connectedAt,
      isAuthenticated: connection.isAuthenticated,
      stats: {
        messagesSent: connection.stats.messagesSent,
        messagesReceived: connection.stats.messagesReceived,
        reconnectCount: connection.stats.reconnectCount
      }
    };
  }
  
  /**
   * Get connection statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const now = Date.now();
    const uptime = now - this.stats.startTime;
    
    return {
      ...this.stats,
      uptime: uptime,
      activeConnections: this.connections.size,
      authenticatedConnections: Array.from(this.connections.values()).filter(c => c.isAuthenticated).length,
      roomsWithPlayers: this.roomConnections.size,
      avgConnectionDuration: this.getAverageConnectionDuration(),
      connectionsPerMinute: this.stats.totalConnections / (uptime / 60000)
    };
  }
  
  /**
   * Get average connection duration
   * @returns {number} Average duration in milliseconds
   */
  getAverageConnectionDuration() {
    const now = Date.now();
    const durations = Array.from(this.connections.values())
      .map(connection => now - connection.connectedAt);
    
    if (durations.length === 0) return 0;
    return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  }
  
  /**
   * Graceful shutdown
   */
  shutdown() {
    console.log('= Connection Manager shutting down...');
    
    this.stopMonitoring();
    
    // Notify all connected clients
    this.broadcastToAll('server_shutdown', {
      message: 'Server is shutting down',
      timestamp: Date.now()
    });
    
    // Disconnect all clients
    this.io.disconnectSockets(true);
    
    // Clear data structures
    this.connections.clear();
    this.playerConnections.clear();
    this.roomConnections.clear();
    
    console.log(' Connection Manager shutdown complete');
  }
}

module.exports = ConnectionManager;