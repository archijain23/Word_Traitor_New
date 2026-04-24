const rooms = {};

function createRoom(roomId, hostId, name, config = {}) {
  rooms[roomId] = {
    roomId,
    hostId,
    status: "waiting",

    players: {
      [hostId]: {
        id: hostId,
        name,
      },
    },

    votes: {},
    hasVoted: {},
    traitorId: null,
    hints: {}, // Store hints for each player
    currentPhase: "waiting", // waiting -> word_assignment -> hint_collection -> voting -> round_result -> game_over
    lastEliminated: null,
    
    // Configuration
    config: {
      numTraitors: config.numTraitors || 1,
      hintTime: config.hintTime || 30,
      difficulty: config.difficulty || "Medium",
      use18Plus: config.use18Plus || false,
      anonymousVoting: config.anonymousVoting || false,
    },
  };
}

function joinRoom(roomId, socketId, name) {
  const room = rooms[roomId];
  if (!room) return null;

  console.log("BEFORE JOIN:", room.players);

  // Preserve existing player data if it exists
  room.players[socketId] = {
    id: socketId,
    name,
    ...room.players[socketId], // Keep existing properties like word
  };

  console.log("AFTER JOIN:", room.players);

  return room;
}

function getRoom(roomId) {
  return rooms[roomId];
}

function removePlayer(roomId, playerId) {
  const room = rooms[roomId];
  if (!room) return;

  delete room.players[playerId];

  if (Object.keys(room.players).length === 0) {
    delete rooms[roomId];
  }
}

// 🗳️ ADD VOTE
function addVote(roomId, voterId, targetId) {
  const room = rooms[roomId];
  if (!room) return;

  if (room.hasVoted[voterId]) return;

  room.hasVoted[voterId] = true;

  if (!room.votes[targetId]) {
    room.votes[targetId] = 0;
  }

  room.votes[targetId]++;
}

// 💡 ADD HINT
function addHint(roomId, playerId, hint) {
  const room = rooms[roomId];
  if (!room) return;

  room.hints[playerId] = hint;
}

// 🔄 RESET ROUND
function resetRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.votes = {};
  room.hasVoted = {};
  room.hints = {};
}

module.exports = {
  createRoom,
  joinRoom,
  getRoom,
  removePlayer,
  addVote,
  addHint,
  resetRound,
};