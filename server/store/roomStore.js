const rooms = {};

function createRoom(roomId, hostId, name, socketId, config = {}) {
  rooms[roomId] = {
    roomId,
    hostId,
    status: "waiting",

    players: {
      [hostId]: {
        id: hostId,
        socketId,
        name,
        online: true,
        isEliminated: false,
        lastSeen: Date.now(),
        authToken: config.authToken || null,
      },
    },

    votes: {},
    hasVoted: {},
    traitorId: null,
    hints: {},
    currentPhase: "waiting",
    lastEliminated: null,
    messages: [],
    history: [],
    traitorIds: [],
    revealedRoles: null,

    config: {
      numTraitors: config.numTraitors ?? 1,
      hintTime: config.hintTime ?? 30,
      difficulty: config.difficulty ?? "Medium",
      use18Plus: config.use18Plus === true,   // explicit boolean, never truthy-coerced
      anonymousVoting: config.anonymousVoting === true,
    },
  };
}

function joinRoom(roomId, playerId, socketId, name) {
  const room = rooms[roomId];
  if (!room) return null;

  const existingPlayer = room.players[playerId];
  const player = {
    ...existingPlayer,
    id: playerId,
    socketId,
    name,
    online: true,
    isEliminated: existingPlayer?.isEliminated || false,
    lastSeen: Date.now(),
    authToken: existingPlayer?.authToken || null,
  };

  room.players[playerId] = player;

  return { room, player, reconnected: Boolean(existingPlayer) };
}

function getRoom(roomId) {
  return rooms[roomId];
}

function removePlayer(roomId, playerId) {
  const room = rooms[roomId];
  if (!room) return;
  delete room.players[playerId];
  if (Object.keys(room.players).length === 0) delete rooms[roomId];
}

function markPlayerOffline(roomId, playerId) {
  const room = rooms[roomId];
  if (!room || !room.players[playerId]) return null;
  room.players[playerId] = {
    ...room.players[playerId],
    online: false,
    socketId: null,
    lastSeen: Date.now(),
  };
  return room.players[playerId];
}

function markPlayerEliminated(roomId, playerId) {
  const room = rooms[roomId];
  if (!room || !room.players[playerId]) return null;
  room.players[playerId] = { ...room.players[playerId], isEliminated: true };
  return room.players[playerId];
}

function setPlayerAuthToken(roomId, playerId, authToken) {
  const room = rooms[roomId];
  if (!room || !room.players[playerId]) return null;
  room.players[playerId] = { ...room.players[playerId], authToken };
  return room.players[playerId];
}

function addVote(roomId, voterId, targetId) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.hasVoted[voterId]) return;
  room.hasVoted[voterId] = true;
  if (!room.votes[targetId]) room.votes[targetId] = 0;
  room.votes[targetId]++;
}

function addHint(roomId, playerId, hint) {
  const room = rooms[roomId];
  if (!room) return;
  room.hints[playerId] = hint;
}

function resetRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.votes = {};
  room.hasVoted = {};
  room.hints = {};
  room.revealedRoles = null;
}

function resetGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  Object.values(room.players).forEach((player) => {
    player.isEliminated = false;
    player.word = null;
  });

  room.votes = {};
  room.hasVoted = {};
  room.hints = {};
  room.traitorId = null;
  room.traitorIds = [];
  room.revealedRoles = null;
  room.lastEliminated = null;
  room.winner = null;
  room.status = "waiting";
  room.currentPhase = "waiting";
}

module.exports = {
  createRoom,
  joinRoom,
  getRoom,
  removePlayer,
  markPlayerOffline,
  addVote,
  addHint,
  markPlayerEliminated,
  setPlayerAuthToken,
  resetRound,
  resetGame,
};
