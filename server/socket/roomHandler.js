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
  resetGame,
} = require("../store/roomStore");

module.exports = (io, socket) => {
  let currentRoom = null;
  let currentPlayerId = null;

  const getActivePlayers = (room) =>
    Object.values(room.players).filter((p) => !p.isEliminated);

  const buildPublicPlayers = (room) =>
    Object.fromEntries(
      Object.values(room.players).map((p) => [
        p.id,
        {
          id: p.id,
          name: p.name,
          online: Boolean(p.online),
          isEliminated: Boolean(p.isEliminated),
          lastSeen: p.lastSeen || null,
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
    hints:
      room.currentPhase === "voting" ||
      room.currentPhase === "round_result" ||
      room.currentPhase === "game_over"
        ? room.hints
        : room.hints, // always send hints so live feed works during hint_collection
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
    const p = room.players[playerId];
    return Boolean(p && p.authToken === authToken);
  };

  // ─── WORD PAIRS ──────────────────────────────────────────────────────────────
  const standardWordPairs = [
    ["Apple", "Orange"],
    ["Dog", "Wolf"],
    ["Car", "Bike"],
    ["Ocean", "River"],
    ["Doctor", "Nurse"],
    ["Sword", "Knife"],
    ["Castle", "Fort"],
    ["Vampire", "Zombie"],
    ["Piano", "Guitar"],
    ["Football", "Rugby"],
    ["Astronaut", "Pilot"],
    ["Lion", "Tiger"],
    ["Diamond", "Ruby"],
    ["Volcano", "Earthquake"],
    ["Pirate", "Ninja"],
    ["Coffee", "Tea"],
    ["Laptop", "Tablet"],
    ["Subway", "Bus"],
    ["Chef", "Baker"],
    ["Museum", "Library"],
    ["Basketball", "Volleyball"],
    ["Winter", "Autumn"],
    ["Shark", "Whale"],
    ["Crown", "Tiara"],
    ["Rocket", "Missile"],
    ["Elephant", "Rhino"],
    ["Architect", "Engineer"],
    ["Poem", "Novel"],
    ["Pizza", "Burger"],
    ["Headphones", "Speakers"],
    ["Lake", "Pond"],
    ["Witch", "Wizard"],
    ["Painting", "Drawing"],
    ["Treadmill", "Bicycle"],
    ["Compass", "Map"],
    ["Ballet", "Hip Hop"],
    ["Sunglasses", "Goggles"],
    ["Owl", "Hawk"],
    ["Thunder", "Lightning"],
    ["Candy", "Chocolate"],
    ["Prison", "Jail"],
    ["Trumpet", "Saxophone"],
    ["Skiing", "Snowboarding"],
    ["Crocodile", "Alligator"],
    ["Superhero", "Villain"],
    ["Sofa", "Chair"],
    ["Microwave", "Oven"],
    ["Whale", "Dolphin"],
    ["Passport", "Visa"],
    ["Telescope", "Microscope"],
  ];

  const adultWordPairs = [
    ["Lingerie", "Bikini"],
    ["Hookup", "Date"],
    ["Condom", "Birth Control"],
    ["Champagne", "Tequila"],
    ["Strip Club", "Nightclub"],
    ["Affair", "Crush"],
    ["Hangover", "Headache"],
    ["Seduction", "Flirting"],
    ["One Night Stand", "Blind Date"],
    ["Whiskey", "Beer"],
    ["Casino", "Arcade"],
    ["Divorce", "Breakup"],
    ["Threesome", "Couple"],
    ["Dominatrix", "Boss"],
    ["Sex Tape", "Home Video"],
    ["Brothel", "Hotel"],
    ["Vodka", "Gin"],
    ["Stripper", "Dancer"],
    ["BDSM", "Roleplay"],
    ["Pornstar", "Actor"],
    ["Orgasm", "Climax"],
    ["Vibrator", "Massager"],
    ["Escort", "Tour Guide"],
    ["Fetish", "Hobby"],
    ["Lap Dance", "Salsa Dance"],
    ["Marijuana", "Tobacco"],
    ["Cocaine", "Powder"],
    ["Orgy", "Party"],
    ["Nude Beach", "Water Park"],
    ["Safeword", "Password"],
    ["Swingers", "Dance Partners"],
    ["Kink", "Quirk"],
    ["Bondage", "Yoga Strap"],
    ["Sugar Daddy", "Sponsor"],
    ["Weed", "Herb"],
    ["Booty Call", "Late Night Call"],
    ["Erotic", "Romantic"],
    ["Sexting", "Texting"],
    ["Playboy", "Magazine"],
    ["Cheating", "Lying"],
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
    if (authToken) setPlayerAuthToken(roomId, playerId, authToken);
    const { room, reconnected } = result;
    socket.join(roomId);
    currentRoom = roomId;
    currentPlayerId = playerId;
    return { room, reconnected };
  };

  // ─── START GAME ──────────────────────────────────────────────────────────────
  const startGame = (roomId) => {
    const room = getRoom(roomId);
    if (!room) return;

    const players = getActivePlayers(room);
    const numTraitors = room.config?.numTraitors ?? 1;
    if (players.length < 2) return;

    // Assign traitors
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

    // ✅ Read use18Plus as strict boolean — set correctly by start_game handler below
    const use18Plus = room.config.use18Plus === true;
    console.log(`[startGame] roomId=${roomId} use18Plus=${use18Plus} config=`, room.config);

    const pool = use18Plus
      ? [...standardWordPairs, ...adultWordPairs]
      : standardWordPairs;

    const [wordA, wordB] = pool[Math.floor(Math.random() * pool.length)];

    players.forEach((player) => {
      const isTraitor = room.traitorIds.includes(player.id);
      room.players[player.id].word = isTraitor ? wordB : wordA;
      if (player.socketId) {
        io.to(player.socketId).emit("game_started", {
          word: room.players[player.id].word,
        });
      }
    });

    resetRound(roomId);
    room.status = "playing";
    room.currentPhase = "word_assignment";
    emitRoomUpdate(roomId, room);
  };

  // ─── END VOTING ──────────────────────────────────────────────────────────────
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

    const eliminated = candidates[Math.floor(Math.random() * candidates.length)];
    const wasTraitor = room.traitorIds.includes(eliminated);

    markPlayerEliminated(roomId, eliminated);
    room.lastEliminated = { playerId: eliminated, wasTraitor };

    io.to(roomId).emit("player_eliminated", { playerId: eliminated, wasTraitor });

    room.currentPhase = "round_result";
    io.to(roomId).emit("phase_changed", {
      phase: "round_result",
      eliminatedPlayer: eliminated,
      wasTraitor,
    });
    emitRoomUpdate(roomId, room);

    if (wasTraitor) {
      room.status = "game_over";
      room.currentPhase = "game_over";
      room.winner = "civilians";
      room.revealedRoles = Object.fromEntries(
        Object.keys(room.players).map((pid) => [
          pid,
          room.traitorIds.includes(pid) ? "traitor" : "citizen",
        ])
      );
      emitRoomUpdate(roomId, room);
      io.to(roomId).emit("game_over", { winner: "civilians" });
      return;
    }

    if (getActivePlayers(room).length <= 2) {
      room.status = "game_over";
      room.currentPhase = "game_over";
      room.winner = "traitor";
      room.revealedRoles = Object.fromEntries(
        Object.keys(room.players).map((pid) => [
          pid,
          room.traitorIds.includes(pid) ? "traitor" : "citizen",
        ])
      );
      emitRoomUpdate(roomId, room);
      io.to(roomId).emit("game_over", { winner: "traitor" });
    }
  };

  // ─── START NEXT ROUND ────────────────────────────────────────────────────────
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

  // ─── END HINT COLLECTION ─────────────────────────────────────────────────────
  const endHintCollection = (roomId) => {
    const room = getRoom(roomId);
    if (!room) return;
    const total = getActivePlayers(room).length;
    const submitted = Object.keys(room.hints).length;
    if (submitted >= total) {
      room.currentPhase = "voting";
      io.to(roomId).emit("phase_changed", { phase: "voting", hints: room.hints });
      emitRoomUpdate(roomId, room);
    }
  };

  // ─── SOCKET EVENTS ───────────────────────────────────────────────────────────

  socket.on("create_room", ({ roomId, name, playerId, authToken }) => {
    const resolvedPlayerId = playerId || socket.id;
    if (!roomId || !name || !authToken) {
      socket.emit("error", "Missing room or session details"); return;
    }
    if (getRoom(roomId)) { socket.emit("error", "Room already exists"); return; }
    createRoom(roomId, resolvedPlayerId, name, socket.id, { authToken });
    socket.join(roomId);
    currentRoom = roomId;
    currentPlayerId = resolvedPlayerId;
    const room = getRoom(roomId);
    emitRoomUpdate(roomId, room);
    syncPlayerState(socket, room, resolvedPlayerId);
  });

  socket.on("join_room", ({ roomId, name, playerId, authToken }) => {
    const resolvedPlayerId = playerId || socket.id;
    if (!roomId || !name || !authToken) {
      socket.emit("error", "Missing room or session details"); return;
    }
    const existingRoom = getRoom(roomId);
    if (!existingRoom) { socket.emit("error", "Room not found"); return; }
    const existingPlayer = existingRoom.players[resolvedPlayerId];
    if (existingPlayer && existingPlayer.authToken !== authToken) {
      socket.emit("error", "Player session could not be verified"); return;
    }
    const result = attachToRoom(roomId, resolvedPlayerId, socket.id, name, authToken);
    if (!result) { socket.emit("error", "Room not found"); return; }
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

  socket.on("RECONNECT_PLAYER", ({ roomId, playerId, authToken }) => {
    if (!roomId || !playerId || !authToken) return;
    const room = getRoom(roomId);
    if (!room) { socket.emit("error", "Room not found"); return; }
    if (!isAuthorizedPlayer(room, playerId, authToken)) {
      socket.emit("error", "Player session not found"); return;
    }
    const result = attachToRoom(roomId, playerId, socket.id, room.players[playerId].name, authToken);
    if (!result) return;
    emitRoomUpdate(roomId, result.room);
    io.to(roomId).emit("PLAYER_RECONNECTED", {
      playerId,
      room: buildPublicRoom(result.room),
    });
    syncPlayerState(socket, result.room, playerId);
  });

  socket.on("leave_room", ({ roomId }) => {
    if (!roomId) return;
    socket.leave(roomId);
    removePlayer(roomId, currentPlayerId || socket.id);
    if (currentRoom === roomId) { currentRoom = null; currentPlayerId = null; }
    const room = getRoom(roomId);
    if (room) emitRoomUpdate(roomId, room);
  });

  socket.on("start_game", ({ roomId, config }) => {
    const room = getRoom(roomId);
    if (!room) return;
    if (currentPlayerId !== room.hostId) {
      socket.emit("error", "Only the host can start the game"); return;
    }
    if (config) {
      // ✅ Use === true for booleans so false is never discarded by || coercion
      room.config = {
        numTraitors:      config.numTraitors      ?? room.config.numTraitors      ?? 1,
        hintTime:         config.hintTime         ?? room.config.hintTime         ?? 30,
        difficulty:       config.difficulty       ?? room.config.difficulty       ?? "Medium",
        use18Plus:        config.use18Plus        === true,
        anonymousVoting:  config.anonymousVoting  === true,
      };
    }
    console.log(`[start_game] config received:`, config, `→ stored:`, room.config);
    startGame(roomId);
  });

  socket.on("word_reveal_done", ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room) return;
    if (room.currentPhase !== "word_assignment") return;
    room.currentPhase = "hint_collection";
    io.to(roomId).emit("phase_changed", { phase: "hint_collection" });
    emitRoomUpdate(roomId, room);
  });

  socket.on("vote_player", ({ roomId, targetId }) => {
    const room = getRoom(roomId);
    if (!room || room.currentPhase !== "voting") return;
    const voter = room.players[currentPlayerId];
    const target = room.players[targetId];
    if (!voter || !target) return;
    if (voter.isEliminated || target.isEliminated) return;
    if (currentPlayerId === targetId) return;
    if (room.hasVoted?.[currentPlayerId]) return;
    addVote(roomId, currentPlayerId, targetId);
    emitRoomUpdate(roomId, room);
    if (Object.keys(room.hasVoted).length >= getActivePlayers(room).length) {
      endVoting(roomId);
    }
  });

  socket.on("submit_hint", ({ roomId, hint }) => {
    const room = getRoom(roomId);
    if (!room || room.currentPhase !== "hint_collection") return;
    if (!room.players[currentPlayerId] || room.players[currentPlayerId].isEliminated) return;
    if (room.hints?.[currentPlayerId]) return;
    if (!hint || !hint.trim()) return;
    addHint(roomId, currentPlayerId, hint.trim());
    emitRoomUpdate(roomId, room);
    endHintCollection(roomId);
  });

  socket.on("continue_round", ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room || room.currentPhase !== "round_result") return;
    if (!room.players[currentPlayerId] || room.players[currentPlayerId].isEliminated) return;
    startNextRound(roomId);
  });

  socket.on("play_again", ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room) return;
    if (currentPlayerId !== room.hostId) {
      socket.emit("error", "Only the host can start a new game"); return;
    }
    if (room.status !== "game_over") return;
    resetGame(roomId);
    emitRoomUpdate(roomId, room);
    io.to(roomId).emit("return_to_lobby", { roomId });
  });

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
