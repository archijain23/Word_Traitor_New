const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

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

// Serve frontend build if it exists
const frontendDist = path.join(__dirname, "../word-traitor/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback — all non-API routes serve index.html
  app.get(/^(?!\/health|\/socket\.io).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

const server = http.createServer(app);

const io = new Server(server, {
  cors: corsOptions,
});

io.on("connection", (socket) => {
  roomHandler(io, socket);
});

const port = Number(process.env.PORT || 5001);
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
