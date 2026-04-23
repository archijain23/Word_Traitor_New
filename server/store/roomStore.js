const rooms = {};

function createRoom(roomId, hostId, name) {
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
  };
}

function joinRoom(roomId, socketId, name) {
  const room = rooms[roomId];
  if (!room) return null;

  console.log("BEFORE JOIN:", room.players);

  room.players[socketId] = {
    id: socketId,
    name,
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

module.exports = {
  createRoom,
  joinRoom,
  getRoom,
  removePlayer,
  addVote,
};