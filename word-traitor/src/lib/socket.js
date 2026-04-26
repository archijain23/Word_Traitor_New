import { io } from "socket.io-client";
import { getStoredPlayerAuthToken, getStoredPlayerId } from "./session";

const socketUrl = import.meta.env.VITE_SOCKET_URL || undefined;

export const socket = io(socketUrl, {
  autoConnect: true,
  reconnection: true,
  withCredentials: true,
});

export function emitReconnectPlayer(roomId) {
  const playerId = getStoredPlayerId();
  const authToken = getStoredPlayerAuthToken();
  if (!roomId || !playerId || !authToken) return;

  socket.emit("RECONNECT_PLAYER", {
    roomId,
    playerId,
    authToken,
  });
}
