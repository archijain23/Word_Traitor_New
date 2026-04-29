const {
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
} = require("../store/roomStore");

module.exports = (io, socket) => {
  let currentRoom = null;
  let currentPlayerId = null;

  const getActivePlayers = (room) =>
    Object.values(room.players).filter((player) => !player.isEliminated);

  const buildPublicPlayers = (room) =>
    Object.fromEntries(
      Object.values(room.players).map((player) => [
        player.id,
        {
          id: player.id,
          name: player.name,
          online: Boolean(player.online),
          isEliminated: Boolean(player.isEliminated),
          lastSeen: player.lastSeen || null,
        },
      ])
    );

  const buildPublicRoom = (room) => ({
    roomId: room.roomId,
    hostId: room.hostId,
    status: room.status,
    currentPhase: room.currentPhase,
    winner: room.winner || null,
    players: buildPublicPlayers(room),
    // ✅ FIX: During hint_collection, send hint COUNT only (not the hints themselves)
    // so clients know how many have submitted without seeing content.
    // Reveal full hints only when voting starts.
    hints:
      room.currentPhase === "voting" ||
      room.currentPhase === "round_result" ||
      room.currentPhase === "game_over"
        ? room.hints
        : {},
    // ✅ FIX: Always include hintCount so frontend can show "X/Y hints submitted"
    hintCount: Object.keys(room.hints || {}).length,
    hasVoted: room.hasVoted || {},
    lastEliminated: room.lastEliminated,
    config: room.config,
    revealedRoles: room.revealedRoles || null,
  });

  const emitRoomUpdate = (roomId, room) => {
    io.to(roomId).emit("room_updated", buildPublicRoom(room));
  };

  const isAuthorizedPlayer = (room, playerId, authToken) => {
    if (!room || !playerId || !authToken) return false;
    const existingPlayer = room.players[playerId];
    return Boolean(existingPlayer && existingPlayer.authToken === authToken);
  };

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

  const buildStateSync = (room, playerId) => ({
    room: buildPublicRoom(room),
    currentGameState: {
      roomId: room.roomId,
      status: room.status,
      currentPhase: room.currentPhase,
      winner: room.winner || null,
      config: room.config,
    },
    players: Object.values(buildPublicPlayers(room)),
    messages: room.messages || [],
    history: room.history || [],
    wordProgress: {
      hints: room.hints,
      votes: room.votes,
      hasVoted: room.hasVoted,
      lastEliminated: room.lastEliminated,
      word: room.players[playerId]?.word || null,
      role:
        room.currentPhase === "game_over"
          ? room.traitorIds.includes(playerId)
            ? "traitor"
            : "citizen"
          : null,
    },
  });

  const syncPlayerState = (targetSocket, room, playerId) => {
    targetSocket.emit("STATE_SYNC", buildStateSync(room, playerId));
  };

  const attachToRoom = (roomId, playerId, socketId, name, authToken) => {
    const result = joinRoom(roomId, playerId, socketId, name);
    if (!result) return null;

    if (authToken) {
      setPlayerAuthToken(roomId, playerId, authToken);
    }

    const { room, reconnected } = result;
    socket.join(roomId);
    currentRoom = roomId;
    currentPlayerId = playerId;

    return { room, reconnected };
  };

  // 🎯 START GAME
  const startGame = (roomId) => {
    const room = getRoom(roomId);
    if (!room) return;

    const players = getActivePlayers(room);
    const numTraitors = room.config?.numTraitors || 1;

    if (players.length < 2) return;

    room.traitorIds = [];
    const selectedIndexes = new Set();
    while (room.traitorIds.length < Math.min(numTraitors, players.length - 1)) {
      const idx = Math.floor(Math.random() * players.length);
      if (!selectedIndexes.has(idx)) {
        selectedIndexes.add(idx);
        room.traitorIds.push(players[idx].id);
      }
    }
    room.traitorId = room.traitorIds[0];

    const use18Plus = room.config?.use18Plus;
    const availableWordPairs = use18Plus
      ? [...standardWordPairs, ...adultWordPairs]
      : standardWordPairs;
    const [wordA, wordB] =
      availableWordPairs[Math.floor(Math.random() * availableWordPairs.length)];

    players.forEach((player) => {
      const isTraitor = room.traitorIds.includes(player.id);
      const assignedWord = isTraitor ? wordB : wordA;
      room.players[player.id].word = assignedWord;
      if (player.socketId) {
        io.to(player.socketId).emit("game_started", { word: assignedWord });
      }
    });

    resetRound(roomId);
    room.status = "playing";
    room.currentPhase = "word_assignment";
    emitRoomUpdate(roomId, room);

    const wordAssignmentTime = 30000;
    setTimeout(() => {
      const r = getRoom(roomId);
      if (!r || r.currentPhase !== "word_assignment") return;
      r.currentPhase = "hint_collection";
      io.to(roomId).emit("phase_changed", { phase: "hint_collection" });
      emitRoomUpdate(roomId, r);
    }, wordAssignmentTime);
  };

  // 🗳️ END VOTING
  const endVoting = (roomId) => {
    const room = getRoom(roomId);
    if (!room) return;

    let maxVotes = -1;
    let candidates = [];
    for (const pid in room.votes) {
      if (room.votes[pid] > maxVotes) {
        maxVotes = room.votes[pid];
        candidates = [pid];
      } else if (room.votes[pid] === maxVotes) {
        candidates.push(pid);
      }
    }

    const eliminatedPlayer = candidates[Math.floor(Math.random() * candidates.length)];
    const wasTraitor = room.traitorIds.includes(eliminatedPlayer);

    markPlayerEliminated(roomId, eliminatedPlayer);
    room.lastEliminated = { playerId: eliminatedPlayer, wasTraitor };

    io.to(roomId).emit("player_eliminated", { playerId: eliminatedPlayer, wasTraitor });

    room.currentPhase = "round_result";
    io.to(roomId).emit("phase_changed", { phase: "round_result", eliminatedPlayer, wasTraitor });
    emitRoomUpdate(roomId, room);

    if (wasTraitor) {
      room.status = "game_over";
      room.currentPhase = "game_over";
      room.winner = "civilians";
      room.revealedRoles = Object.fromEntries(
        Object.keys(room.players).map((pid) => [pid, room.traitorIds.includes(pid) ? "traitor" : "citizen"])
      );
      emitRoomUpdate(roomId, room);
      io.to(roomId).emit("game_over", { winner: "civilians" });
      return;
    }

    const remainingPlayers = getActivePlayers(room).length;
    if (remainingPlayers <= 2) {
      room.status = "game_over";
      room.currentPhase = "game_over";
      room.winner = "traitor";
      room.revealedRoles = Object.fromEntries(
        Object.keys(room.players).map((pid) => [pid, room.traitorIds.includes(pid) ? "traitor" : "citizen"])
      );
      emitRoomUpdate(roomId, room);
      io.to(roomId).emit("game_over", { winner: "traitor" });
    }
  };

  // 🔄 START NEXT ROUND
  const startNextRound = (roomId) => {
    const room = getRoom(roomId);
    if (!room) return;

    resetRound(roomId);
    room.lastEliminated = null;
    room.status = "playing";
    room.currentPhase = "hint_collection";

    io.to(roomId).emit("phase_changed", { phase: "hint_collection" });
    emitRoomUpdate(roomId, room);
  };

  // 💡 END HINT COLLECTION — move to voting when all hints are in
  const endHintCollection = (roomId) => {
    const room = getRoom(roomId);
    if (!room) return;

    const totalPlayers = getActivePlayers(room).length;
    const totalHints = Object.keys(room.hints).length;

    if (totalHints >= totalPlayers) {
      room.currentPhase = "voting";
      // ✅ FIX: Send hints in the phase_changed event so frontend
      // receives them atomically when switching to voting phase
      io.to(roomId).emit("phase_changed", { phase: "voting", hints: room.hints });
      emitRoomUpdate(roomId, room);
    }
  };

  // ✅ CREATE ROOM
  socket.on("create_room", ({ roomId, name, playerId, authToken }) => {
    const resolvedPlayerId = playerId || socket.id;
    if (!roomId || !name || !authToken) {
      socket.emit("error", "Missing room or session details");
      return;
    }
    if (getRoom(roomId)) {
      socket.emit("error", "Room already exists");
      return;
    }
    createRoom(roomId, resolvedPlayerId, name, socket.id, { authToken });
    socket.join(roomId);
    currentRoom = roomId;
    currentPlayerId = resolvedPlayerId;
    const room = getRoom(roomId);
    emitRoomUpdate(roomId, room);
    syncPlayerState(socket, room, resolvedPlayerId);
  });

  // ✅ JOIN ROOM
  socket.on("join_room", ({ roomId, name, playerId, authToken }) => {
    const resolvedPlayerId = playerId || socket.id;
    if (!roomId || !name || !authToken) {
      socket.emit("error", "Missing room or session details");
      return;
    }
    const existingRoom = getRoom(roomId);
    if (!existingRoom) {
      socket.emit("error", "Room not found");
      return;
    }
    const existingPlayer = existingRoom.players[resolvedPlayerId];
    if (existingPlayer && existingPlayer.authToken !== authToken) {
      socket.emit("error", "Player session could not be verified");
      return;
    }
    const result = attachToRoom(roomId, resolvedPlayerId, socket.id, name, authToken);
    if (!result) {
      socket.emit("error", "Room not found");
      return;
    }
    const { room, reconnected } = result;
    emitRoomUpdate(roomId, room);
    syncPlayerState(socket, room, resolvedPlayerId);
    if (reconnected) {
      io.to(roomId).emit("PLAYER_RECONNECTED", {
        playerId: resolvedPlayerId,
        room: buildPublicRoom(room),
      });
    }
  });

  // 🔁 RECONNECT
  socket.on("RECONNECT_PLAYER", ({ roomId, playerId, authToken }) => {
    if (!roomId || !playerId || !authToken) return;
    const room = getRoom(roomId);
    if (!room) { socket.emit("error", "Room not found"); return; }
    if (!isAuthorizedPlayer(room, playerId, authToken)) {
      socket.emit("error", "Player session not found");
      return;
    }
    const existingPlayer = room.players[playerId];
    const result = attachToRoom(roomId, playerId, socket.id, existingPlayer.name, authToken);
    if (!result) return;
    emitRoomUpdate(roomId, result.room);
    io.to(roomId).emit("PLAYER_RECONNECTED", { playerId, room: buildPublicRoom(result.room) });
    syncPlayerState(socket, result.room, playerId);
  });

  // ⬅️ LEAVE ROOM
  socket.on("leave_room", ({ roomId }) => {
    if (!roomId) return;
    socket.leave(roomId);
    removePlayer(roomId, currentPlayerId || socket.id);
    if (currentRoom === roomId) { currentRoom = null; currentPlayerId = null; }
    const room = getRoom(roomId);
    if (room) emitRoomUpdate(roomId, room);
  });

  // ▶️ START GAME
  socket.on("start_game", ({ roomId, config }) => {
    const room = getRoom(roomId);
    if (!room) return;
    if (currentPlayerId !== room.hostId) {
      socket.emit("error", "Only the host can start the game");
      return;
    }
    if (config) room.config = { ...room.config, ...config };
    startGame(roomId);
  });

  // 🗳️ VOTE
  socket.on("vote_player", ({ roomId, targetId }) => {
    const room = getRoom(roomId);
    if (!room) return;
    if (room.currentPhase !== "voting") return;
    const currentPlayer = room.players[currentPlayerId];
    const targetPlayer = room.players[targetId];
    if (!currentPlayer || !targetPlayer) return;
    if (currentPlayer.isEliminated || targetPlayer.isEliminated) return;
    if (currentPlayerId === targetId) return;
    // ✅ FIX: prevent double voting
    if (room.hasVoted?.[currentPlayerId]) return;
    addVote(roomId, currentPlayerId, targetId);
    emitRoomUpdate(roomId, room);
    const totalPlayers = getActivePlayers(room).length;
    const totalVotes = Object.keys(room.hasVoted).length;
    if (totalVotes >= totalPlayers) endVoting(roomId);
  });

  // 💡 SUBMIT HINT
  socket.on("submit_hint", ({ roomId, hint }) => {
    const room = getRoom(roomId);
    if (!room) return;
    if (room.currentPhase !== "hint_collection") return;
    if (!room.players[currentPlayerId] || room.players[currentPlayerId].isEliminated) return;
    // ✅ FIX: prevent duplicate hint submission
    if (room.hints?.[currentPlayerId]) return;
    if (!hint || !hint.trim()) return;
    addHint(roomId, currentPlayerId, hint.trim());
    emitRoomUpdate(roomId, room);
    endHintCollection(roomId);
  });

  // ▶️ CONTINUE ROUND
  socket.on("continue_round", ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room) return;
    if (room.currentPhase !== "round_result") return;
    if (!room.players[currentPlayerId] || room.players[currentPlayerId].isEliminated) return;
    startNextRound(roomId);
  });

  // ❌ DISCONNECT
  socket.on("disconnect", () => {
    if (!currentRoom || !currentPlayerId) return;
    const room = getRoom(currentRoom);
    if (!room) return;
    markPlayerOffline(currentRoom, currentPlayerId);
    io.to(currentRoom).emit("PLAYER_DISCONNECTED", {
      playerId: currentPlayerId,
      room: buildPublicRoom(room),
    });
    emitRoomUpdate(currentRoom, room);
  });
};
