const PLAYER_ID_KEY = "word-traitor-player-id";
const PLAYER_AUTH_TOKEN_KEY = "word-traitor-player-auth-token";
const PLAYER_NAME_KEY = "playerName";
const LAST_ROOM_KEY = "word-traitor-last-room";

function createPlayerId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createPlayerAuthToken() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  }

  return `auth-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export function getOrCreatePlayerId() {
  const existingPlayerId = localStorage.getItem(PLAYER_ID_KEY);
  if (existingPlayerId) {
    return existingPlayerId;
  }

  const nextPlayerId = createPlayerId();
  localStorage.setItem(PLAYER_ID_KEY, nextPlayerId);
  return nextPlayerId;
}

export function getStoredPlayerId() {
  return localStorage.getItem(PLAYER_ID_KEY);
}

export function getOrCreatePlayerAuthToken() {
  const existingAuthToken = localStorage.getItem(PLAYER_AUTH_TOKEN_KEY);
  if (existingAuthToken) {
    return existingAuthToken;
  }

  const nextAuthToken = createPlayerAuthToken();
  localStorage.setItem(PLAYER_AUTH_TOKEN_KEY, nextAuthToken);
  return nextAuthToken;
}

export function getStoredPlayerAuthToken() {
  return localStorage.getItem(PLAYER_AUTH_TOKEN_KEY);
}

export function getStoredPlayerName() {
  return localStorage.getItem(PLAYER_NAME_KEY) || "";
}

export function setStoredPlayerName(name) {
  localStorage.setItem(PLAYER_NAME_KEY, name);
}

export function rememberRoom(roomId) {
  localStorage.setItem(LAST_ROOM_KEY, roomId);
}

export function clearRememberedRoom(roomId) {
  const lastRoomId = localStorage.getItem(LAST_ROOM_KEY);
  if (!roomId || lastRoomId === roomId) {
    localStorage.removeItem(LAST_ROOM_KEY);
  }
}

export function getRememberedRoom() {
  return localStorage.getItem(LAST_ROOM_KEY) || "";
}

export function buildPlayerSession(nameOverride) {
  return {
    playerId: getOrCreatePlayerId(),
    authToken: getOrCreatePlayerAuthToken(),
    name: nameOverride || getStoredPlayerName(),
  };
}
