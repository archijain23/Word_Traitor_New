const {
  createRoom,
  joinRoom,
  getRoom,
  removePlayer,
} = require("../store/roomStore");

module.exports = (io, socket) => {

  let currentRoom = null; // track player's room

  // CREATE ROOM
  socket.on("create_room", ({ roomId, name }) => {
    createRoom(roomId, socket.id, name);
    socket.join(roomId);

    currentRoom = roomId;

    io.to(roomId).emit("room_updated", getRoom(roomId));
  });

  // JOIN ROOM
  socket.on("join_room", ({ roomId, name }) => {
     console.log("JOIN EVENT:", roomId, name); 
    const room = joinRoom(roomId, socket.id, name);

    if (!room) {
      socket.emit("error", "Room not found");
      return;
    }

    socket.join(roomId);
    currentRoom = roomId;

    io.to(roomId).emit("room_updated", getRoom(roomId));
  });

  // START GAME
socket.on("start_game", ({ roomId }) => {
  const room = getRoom(roomId);
  if (!room) return;

  // Only host can start
  if (room.hostId !== socket.id) {
    socket.emit("error", "Only host can start the game");
    return;
  }

  room.status = "playing";

  io.to(roomId).emit("room_updated", room);
});

  // DISCONNECT
  socket.on("disconnect", () => {
    if (!currentRoom) return;

    removePlayer(currentRoom, socket.id);

    const room = getRoom(currentRoom);

    if (room) {
      io.to(currentRoom).emit("room_updated", room);
    }
  });
};