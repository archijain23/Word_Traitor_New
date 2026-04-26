const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const roomHandler = require("./socket/roomHandler");

const app = express();
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("CORS not allowed"));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: corsOptions,
});

io.on("connection", (socket) => {
  roomHandler(io, socket);
});

const port = Number(process.env.PORT || 5001);
server.listen(port);
