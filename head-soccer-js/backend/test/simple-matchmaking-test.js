/**
 * Simple Matchmaking Test - Test basic matchmaking flow
 */

const MatchmakingEvents = require('../websocket/matchmakingEvents');
const Matchmaker = require('../modules/Matchmaker');
const GameEventSystem = require('../websocket/gameEventSystem');
const Player = require('../modules/Player');

// Mock connection manager
function createMockConnectionManager() {
  const connections = new Map();
  const rooms = new Map();
  
  return {
    connections,
    rooms,
    io: {
      to: () => ({
        emit: (event, data) => {
          console.log(`=� Broadcasting ${event} to room:`, data);
        }
      })
    },
    getConnectionByPlayerId: (playerId) => {
      for (const conn of connections.values()) {
        if (conn.playerId === playerId) return conn;
      }
      return null;
    },
    getConnectionBySocketId: (socketId) => connections.get(socketId),
    broadcastToRoom: (roomId, event, data) => {
      console.log(`=� Broadcasting ${event} to room ${roomId}`);
    },
    addToRoom: (socketId, roomId) => {
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }
      rooms.get(roomId).add(socketId);
      console.log(`� Added socket ${socketId} to room ${roomId}`);
    },
    removeFromRoom: (socketId, roomId) => {
      if (rooms.has(roomId)) {
        rooms.get(roomId).delete(socketId);
      }
      console.log(`� Removed socket ${socketId} from room ${roomId}`);
    },
    // Add mock connection
    addMockConnection: (playerId, username) => {
      const socketId = `socket_${playerId}`;
      const player = new Player(socketId, playerId, username);
      const connection = {
        socketId,
        playerId,
        player,
        isAuthenticated: true,
        socket: {
          id: socketId,
          emit: (event, data) => {
            console.log(`= Socket ${playerId} received ${event}:`, data);
          },
          join: (room) => {
            console.log(`=� Socket ${playerId} joined ${room}`);
          },
          leave: (room) => {
            console.log(`=� Socket ${playerId} left ${room}`);
          }
        }
      };
      connections.set(socketId, connection);
      return connection;
    }
  };
}

async function runTest() {
  console.log('=� Starting Simple Matchmaking Test\n');
  
  // Create instances
  const connectionManager = createMockConnectionManager();
  const matchmaker = new Matchmaker();
  const gameEventSystem = new GameEventSystem(connectionManager);
  const matchmakingEvents = new MatchmakingEvents(
    connectionManager,
    matchmaker,
    gameEventSystem,
    {
      readyTimeout: 2000 // 2 seconds for testing
    }
  );
  
  // Start matchmaker service
  matchmaker.start();
  
  console.log(' Services initialized\n');
  
  // Test 1: Join Queue
  console.log('=� Test 1: Join Queue');
  
  // Add mock connections
  connectionManager.addMockConnection('player1', 'Alice');
  connectionManager.addMockConnection('player2', 'Bob');
  
  // Join queue
  const join1 = await matchmakingEvents.handleJoinQueue('player1', 'casual');
  console.log('Player 1 join result:', join1);
  
  const join2 = await matchmakingEvents.handleJoinQueue('player2', 'casual');
  console.log('Player 2 join result:', join2);
  
  // Give matchmaker time to process
  console.log('\n⏳ Manually processing queue...');
  matchmaker.processQueue();
  
  // Check if match was created
  const stats = matchmaker.getStats();
  console.log('\n=� Matchmaker stats:', {
    totalMatches: stats.totalMatches,
    queueSize: stats.currentQueueSize,
    activeRooms: stats.activeRoomsCount
  });
  
  // Test 2: Ready Up
  console.log('\n=� Test 2: Ready Up System');
  
  // Get pending matches
  const pendingMatches = matchmakingEvents.pendingMatches;
  console.log('Pending matches:', pendingMatches.size);
  
  if (pendingMatches.size > 0) {
    const matchId = Array.from(pendingMatches.keys())[0];
    const match = pendingMatches.get(matchId);
    console.log('Match ID:', matchId);
    console.log('Players in match:', match.players.map(p => p.username).join(' vs '));
    
    // Both players ready up
    const ready1 = await matchmakingEvents.handlePlayerReady('player1', true, matchId);
    console.log('Player 1 ready:', ready1.success);
    
    const ready2 = await matchmakingEvents.handlePlayerReady('player2', true, matchId);
    console.log('Player 2 ready:', ready2.success);
    
    // Wait for match to start
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check room assignments
    const roomAssignments = matchmakingEvents.roomAssignments;
    console.log('\n<� Room assignments:', roomAssignments.size);
  }
  
  // Test 3: Leave Queue
  console.log('\n=� Test 3: Leave Queue');
  
  // Add another player and leave
  connectionManager.addMockConnection('player3', 'Charlie');
  const join3 = await matchmakingEvents.handleJoinQueue('player3', 'casual');
  console.log('Player 3 joined:', join3.success);
  
  const leave3 = await matchmakingEvents.handleLeaveQueue('player3');
  console.log('Player 3 left:', leave3.success, `(queue time: ${leave3.queueTime}ms)`);
  
  // Final stats
  console.log('\n=� Final Stats:');
  const finalStats = matchmakingEvents.getStats();
  console.log({
    totalMatches: finalStats.totalMatches,
    successfulMatches: finalStats.successfulMatches,
    timeoutMatches: finalStats.timeoutMatches,
    queuedPlayers: finalStats.queuedPlayers,
    pendingMatches: finalStats.pendingMatches,
    activeRooms: finalStats.activeRooms
  });
  
  // Cleanup
  console.log('\n>� Cleaning up...');
  matchmakingEvents.shutdown();
  gameEventSystem.shutdown();
  matchmaker.stop();
  
  console.log(' Test complete!');
}

// Run test
runTest().catch(console.error);