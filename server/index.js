const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const roomHandler = require("./socket/roomHandler");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  roomHandler(io, socket);
});

server.listen(5001, () => {
  console.log("Server running on port 5001");
});