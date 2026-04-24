const {
  createRoom,
  joinRoom,
  getRoom,
  removePlayer,
  addVote,
  addHint,
  resetRound,
} = require("../store/roomStore");

module.exports = (io, socket) => {
  let currentRoom = null;

  const standardWordPairs = [
    ["Apple", "Orange"],
    ["Dog", "Wolf"],
    ["Car", "Bike"],
    ["Ocean", "River"],
  ];
  const adultWordPairs = [
    ["Lingerie", "Bikini"],
    ["Hookup", "Date"],
    ["Condom", "Birth Control"],
    ["Champagne", "Tequila"],
    ["Strip Club", "Nightclub"],
  ];

  // 🎯 START GAME
  const startGame = (roomId) => {
    const room = getRoom(roomId);
    if (!room) return;

    const players = Object.values(room.players);
    const numTraitors = room.config?.numTraitors || 1;

    if (players.length < 2) {
      console.log("Not enough players");
      return;
    }

    // 🎯 pick traitors (can be multiple)
    room.traitorIds = [];
    const selectedIndexes = new Set();
    
    while (room.traitorIds.length < Math.min(numTraitors, players.length - 1)) {
      const idx = Math.floor(Math.random() * players.length);
      if (!selectedIndexes.has(idx)) {
        selectedIndexes.add(idx);
        room.traitorIds.push(players[idx].id);
      }
    }
    
    room.traitorId = room.traitorIds[0]; // Keep for backward compatibility

    // 🎯 pick word pair based on room configuration
    const use18Plus = room.config?.use18Plus;
    const availableWordPairs = use18Plus
      ? [...standardWordPairs, ...adultWordPairs]
      : standardWordPairs;
    const [wordA, wordB] =
      availableWordPairs[Math.floor(Math.random() * availableWordPairs.length)];

    console.log(
      `Starting room ${roomId} with ${use18Plus ? "18+" : "standard"} word pool`
    );

   players.forEach((player) => {
  const isTraitor = room.traitorIds.includes(player.id);

  const assignedWord = isTraitor ? wordB : wordA;

  // ✅ store word on player
  room.players[player.id].word = assignedWord;

  console.log(`Player ${player.name} (${player.id}) is ${isTraitor ? 'TRAITOR' : 'CITIZEN'} - assigned word: ${assignedWord}`);

  io.to(player.id).emit("game_started", {
    word: assignedWord,
  });
});

    // ✅ reset round data
    resetRound(roomId);

    room.status = "playing";
    room.currentPhase = "word_assignment";

    io.to(roomId).emit("room_updated", room);

    // ⏰ Start hint collection phase after a delay (using hintTime config)
    const wordAssignmentTime = 30000; // Always 30 seconds to memorize
    setTimeout(() => {
      room.currentPhase = "hint_collection";
      io.to(roomId).emit("phase_changed", { phase: "hint_collection" });
      io.to(roomId).emit("room_updated", room);
    }, wordAssignmentTime);
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

    const wasTraitor = room.traitorIds.includes(eliminatedPlayer);

    // remove player
    delete room.players[eliminatedPlayer];
    room.lastEliminated = {
      playerId: eliminatedPlayer,
      wasTraitor,
    };

    // 🎯 RESULT EVENT
    io.to(roomId).emit("player_eliminated", {
      playerId: eliminatedPlayer,
      wasTraitor,
    });

    room.currentPhase = "round_result";
    io.to(roomId).emit("phase_changed", {
      phase: "round_result",
      eliminatedPlayer,
      wasTraitor,
    });
    io.to(roomId).emit("room_updated", room);

    // 🏆 WIN CONDITIONS
    if (wasTraitor) {
      room.status = "game_over";
      room.currentPhase = "game_over";
      room.winner = "civilians";

      io.to(roomId).emit("room_updated", room);
      io.to(roomId).emit("game_over", {
        winner: "civilians",
      });
      return;
    }

    const remainingPlayers = Object.keys(room.players).length;

    if (remainingPlayers <= 2) {
      room.status = "game_over";
      room.currentPhase = "game_over";
      room.winner = "traitor";

      io.to(roomId).emit("room_updated", room);
      io.to(roomId).emit("game_over", {
        winner: "traitor",
      });
      return;
    }

  };

  // 🔄 START NEXT ROUND
  const startNextRound = (roomId) => {
    const room = getRoom(roomId);
    if (!room) return;

    // Reset round data
    resetRound(roomId);
    room.lastEliminated = null;

    room.status = "playing";
    room.currentPhase = "hint_collection";

    io.to(roomId).emit("phase_changed", { phase: "hint_collection" });
    io.to(roomId).emit("room_updated", room);
  };

  // 💡 END HINT COLLECTION
  const endHintCollection = (roomId) => {
    const room = getRoom(roomId);
    if (!room) return;

    const totalPlayers = Object.keys(room.players).length;
    const totalHints = Object.keys(room.hints).length;

    if (totalHints === totalPlayers) {
      // All hints collected, show them and start voting together
      room.currentPhase = "voting";

      io.to(roomId).emit("phase_changed", {
        phase: "voting",
        hints: room.hints,
      });
      io.to(roomId).emit("room_updated", room);
    }
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

  // ⬅️ LEAVE ROOM
  socket.on("leave_room", ({ roomId }) => {
    if (!roomId) return;

    socket.leave(roomId);
    removePlayer(roomId, socket.id);

    if (currentRoom === roomId) {
      currentRoom = null;
    }

    const room = getRoom(roomId);

    if (room) {
      io.to(roomId).emit("room_updated", room);
    }
  });

  // ✅ START GAME
  socket.on("start_game", ({ roomId, config }) => {
    const room = getRoom(roomId);
    if (room && config) {
      room.config = config;
    }
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

  // 💡 SUBMIT HINT
  socket.on("submit_hint", ({ roomId, hint }) => {
    const room = getRoom(roomId);
    if (!room) return;

    if (room.currentPhase !== "hint_collection") return;

    addHint(roomId, socket.id, hint);

    io.to(roomId).emit("room_updated", room);

    endHintCollection(roomId);
  });

  // ▶️ CONTINUE ROUND
  socket.on("continue_round", ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room) return;

    if (room.currentPhase !== "round_result") return;

    startNextRound(roomId);
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
