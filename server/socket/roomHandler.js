const {
  createRoom,
  joinRoom,
  getRoom,
  removePlayer,
  addVote,
} = require("../store/roomStore");

module.exports = (io, socket) => {
  let currentRoom = null;

  const wordPairs = [
    ["Apple", "Orange"],
    ["Dog", "Wolf"],
    ["Car", "Bike"],
    ["Ocean", "River"],
  ];

  // 🎯 START GAME
  const startGame = (roomId) => {
    const room = getRoom(roomId);
    if (!room) return;

    const players = Object.values(room.players);

    if (players.length < 2) {
      console.log("Not enough players");
      return;
    }

    // 🎯 pick traitor
    const traitorIndex = Math.floor(Math.random() * players.length);
    const traitor = players[traitorIndex];
    room.traitorId = traitor.id;

    // 🎯 pick word pair
    const [wordA, wordB] =
      wordPairs[Math.floor(Math.random() * wordPairs.length)];

    players.forEach((player) => {
      const isTraitor = player.id === room.traitorId;
      const assignedWord = isTraitor ? wordB : wordA;

      io.to(player.id).emit("game_started", {
        word: assignedWord,
      });
    });

    // ✅ reset voting every game
    room.votes = {};
    room.hasVoted = {};

    room.status = "playing";

    io.to(roomId).emit("room_updated", room);
  };

  // 🗳️ END VOTING
  const endVoting = (roomId) => {
    const room = getRoom(roomId);
    if (!room) return;

    let maxVotes = -1;
    let candidates = [];

    for (const playerId in room.votes) {
      if (room.votes[playerId] > maxVotes) {
        maxVotes = room.votes[playerId];
        candidates = [playerId];
      } else if (room.votes[playerId] === maxVotes) {
        candidates.push(playerId);
      }
    }

    const eliminatedPlayer =
      candidates[Math.floor(Math.random() * candidates.length)];

    const wasTraitor = eliminatedPlayer === room.traitorId;

    // remove player
    delete room.players[eliminatedPlayer];

    // reset votes
    room.votes = {};
    room.hasVoted = {};

    // 🎯 RESULT EVENT
    io.to(roomId).emit("player_eliminated", {
      playerId: eliminatedPlayer,
      wasTraitor,
    });

    // 🏆 WIN CONDITIONS
    if (wasTraitor) {
      room.status = "game_over";

      io.to(roomId).emit("game_over", {
        winner: "civilians",
      });
      return;
    }

    const remainingPlayers = Object.keys(room.players).length;

    if (remainingPlayers <= 2) {
      room.status = "game_over";

      io.to(roomId).emit("game_over", {
        winner: "traitor",
      });
      return;
    }

    // continue next round
    room.status = "playing";

    io.to(roomId).emit("room_updated", room);
  };

  // ✅ CREATE ROOM
  socket.on("create_room", ({ roomId, name }) => {
    createRoom(roomId, socket.id, name);
    socket.join(roomId);

    currentRoom = roomId;

    io.to(roomId).emit("room_updated", getRoom(roomId));
  });

  // ✅ JOIN ROOM
  socket.on("join_room", ({ roomId, name }) => {
    const room = joinRoom(roomId, socket.id, name);

    if (!room) {
      socket.emit("error", "Room not found");
      return;
    }

    socket.join(roomId);
    currentRoom = roomId;

    io.to(roomId).emit("room_updated", room);
  });

  // ✅ START GAME
  socket.on("start_game", ({ roomId }) => {
    startGame(roomId);
  });

  // 🗳️ VOTE
  socket.on("vote_player", ({ roomId, targetId }) => {
    const room = getRoom(roomId);
    if (!room) return;

    // ❌ prevent self vote
    if (socket.id === targetId) return;

    addVote(roomId, socket.id, targetId);

    io.to(roomId).emit("room_updated", room);

    const totalPlayers = Object.keys(room.players).length;
    const totalVotes = Object.keys(room.hasVoted).length;

    if (totalVotes === totalPlayers) {
      endVoting(roomId);
    }
  });

  // ❌ DISCONNECT
  socket.on("disconnect", () => {
    if (!currentRoom) return;

    removePlayer(currentRoom, socket.id);

    const room = getRoom(currentRoom);

    if (room) {
      io.to(currentRoom).emit("room_updated", room);
    }
  });
};