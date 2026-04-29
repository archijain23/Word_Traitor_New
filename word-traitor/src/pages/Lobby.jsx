import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Modal from "../components/ui/Modal";
import { emitReconnectPlayer, socket } from "../lib/socket";
import {
  buildPlayerSession,
  clearRememberedRoom,
  getStoredPlayerName,
  getStoredPlayerId,
  rememberRoom,
  setStoredPlayerName,
} from "../lib/session";

function Lobby() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const playerId = getStoredPlayerId();

  const storedName = getStoredPlayerName();
  const hasJoinedThisRoom = sessionStorage.getItem(`joined-room-${roomId}`) === "true";
  const shouldSkipNamePrompt = location.state?.skipNamePrompt || hasJoinedThisRoom;
  const [name, setName] = useState(storedName);
  const [room, setRoom] = useState(null);
  const [showNameModal, setShowNameModal] = useState(!shouldSkipNamePrompt);
  const [numTraitors, setNumTraitors] = useState(1);
  const [hintTime, setHintTime] = useState(30);
  const [difficulty, setDifficulty] = useState("Medium");
  const [use18Plus, setUse18Plus] = useState(false);
  const [anonymousVoting, setAnonymousVoting] = useState(false);

  // 🔌 Listen for updates
  useEffect(() => {
    const applyRoomState = (roomData) => {
      setRoom(roomData);
      if (roomData.status === "playing") {
        navigate(`/game/${roomData.roomId}`);
      }
    };

    const handleRoomUpdated = (roomData) => { applyRoomState(roomData); };
    const handleStateSync = (state) => { applyRoomState(state.room); };
    const handleReconnectEvent = ({ room: syncedRoom }) => {
      if (syncedRoom?.roomId === roomId) applyRoomState(syncedRoom);
    };
    const handleError = (msg) => {
      clearRememberedRoom(roomId);
      alert(msg);
      navigate("/");
    };

    socket.on("room_updated", handleRoomUpdated);
    socket.on("STATE_SYNC", handleStateSync);
    socket.on("PLAYER_RECONNECTED", handleReconnectEvent);
    socket.on("PLAYER_DISCONNECTED", handleReconnectEvent);
    socket.on("error", handleError);

    return () => {
      socket.off("room_updated", handleRoomUpdated);
      socket.off("STATE_SYNC", handleStateSync);
      socket.off("PLAYER_RECONNECTED", handleReconnectEvent);
      socket.off("PLAYER_DISCONNECTED", handleReconnectEvent);
      socket.off("error", handleError);
    };
  }, [navigate, roomId]);

  // 🚀 Join room when name is ready
  useEffect(() => {
    if (showNameModal || !name) return;
    const session = buildPlayerSession(name);
    rememberRoom(roomId);
    socket.emit("join_room", { roomId, name, playerId: session.playerId, authToken: session.authToken });
  }, [roomId, name, showNameModal]);

  useEffect(() => {
    if (!roomId || !playerId) return;
    const handleReconnect = () => { emitReconnectPlayer(roomId); };
    socket.io.on("reconnect", handleReconnect);
    return () => { socket.io.off("reconnect", handleReconnect); };
  }, [roomId, playerId]);

  const handleJoin = () => {
    if (!name.trim()) { alert("Enter your name to join the room"); return; }
    setStoredPlayerName(name.trim());
    buildPlayerSession(name.trim());
    rememberRoom(roomId);
    sessionStorage.setItem(`joined-room-${roomId}`, "true");
    setShowNameModal(false);
  };

  const handleBackToHome = () => {
    socket.emit("leave_room", { roomId });
    sessionStorage.removeItem(`joined-room-${roomId}`);
    clearRememberedRoom(roomId);
    navigate("/");
  };

  if (!room) {
    return (
      <Layout>
        <p className="text-center text-zinc-400">Joining room...</p>
        <Modal isOpen={showNameModal} onClose={() => {}}>
          <h2 className="text-2xl font-bold text-cyan-400 mb-3">Join Room {roomId}</h2>
          <p className="text-zinc-400 mb-4">
            {storedName ? "Choose the name you want to use in this room." : "Enter your name to join this room."}
          </p>
          <input
            placeholder="Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-3 rounded-lg bg-zinc-800 mb-3"
            onKeyPress={(e) => e.key === "Enter" && handleJoin()}
          />
          <Button onClick={handleJoin} className="w-full">Join Room</Button>
        </Modal>
      </Layout>
    );
  }

  const isHost = playerId === room.hostId;

  // Determine if room is in post-game state (back to waiting after play_again)
  const isWaiting = room.status === "waiting";

  return (
    <Layout>
      <div className="space-y-6">
        <div className="rounded-[28px] border border-cyan-300/14 bg-[linear-gradient(135deg,rgba(8,16,38,0.94),rgba(21,12,44,0.88))] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_28px_90px_-38px_rgba(34,211,238,0.38)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/80">Room Control</p>
              <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">Build your glowing trap</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300/80">Tune the room, invite the crew, and launch the round when everyone is in.</p>
            </div>
            <div className="rounded-[24px] border border-fuchsia-300/18 bg-fuchsia-400/8 px-5 py-4 text-sm text-zinc-200 shadow-[0_0_38px_rgba(217,70,239,0.12)]">
              <div className="text-[11px] uppercase tracking-[0.32em] text-fuchsia-200/75">Share Code</div>
              <div className="mt-2 text-2xl font-black tracking-[0.28em] text-fuchsia-200">{room.roomId}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          <Card className="p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-cyan-300 font-semibold">Game Settings</p>
                <h2 className="text-3xl font-bold text-white mt-2">Configure your lobby</h2>
              </div>
              <div className="rounded-2xl border border-cyan-300/15 bg-slate-950/85 px-4 py-3 text-sm text-zinc-300">
                Room Code: <span className="text-cyan-300">{room.roomId}</span>
              </div>
            </div>

            <Button
              onClick={handleBackToHome}
              className="mb-5 w-full border-white/12 bg-white/6 text-zinc-100 hover:border-white/25"
            >
              Back To Home
            </Button>

            <div className="grid gap-5">
              <div className="grid sm:grid-cols-[1fr_120px] gap-3 items-center rounded-3xl border border-cyan-300/12 bg-slate-950/80 p-4">
                <div>
                  <p className="text-sm text-zinc-400">No. of Traitors</p>
                  <p className="text-white font-semibold">One or more secret opponents</p>
                </div>
                <select value={numTraitors} onChange={(e) => setNumTraitors(Number(e.target.value))} className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-white">
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </div>
              <div className="grid sm:grid-cols-[1fr_120px] gap-3 items-center rounded-3xl border border-cyan-300/12 bg-slate-950/80 p-4">
                <div>
                  <p className="text-sm text-zinc-400">Hint Drop Time (sec)</p>
                  <p className="text-white font-semibold">How long players have to drop hints</p>
                </div>
                <select value={hintTime} onChange={(e) => setHintTime(Number(e.target.value))} className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-white">
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={45}>45</option>
                </select>
              </div>
              <div className="grid sm:grid-cols-[1fr_160px] gap-3 items-center rounded-3xl border border-cyan-300/12 bg-slate-950/80 p-4">
                <div>
                  <p className="text-sm text-zinc-400">Word Difficulty</p>
                  <p className="text-white font-semibold">Choose the word difficulty level</p>
                </div>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-white">
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_120px] items-center rounded-3xl border border-cyan-300/12 bg-slate-950/80 p-4">
                <div>
                  <p className="text-sm text-zinc-400">18+ Words</p>
                  <p className="text-white font-semibold">Enable mature word set</p>
                </div>
                <button type="button" onClick={() => setUse18Plus((prev) => !prev)} className={`w-full rounded-full px-4 py-3 text-sm font-semibold transition ${use18Plus ? "bg-cyan-500 text-black" : "bg-zinc-900 text-zinc-300"}`}>
                  {use18Plus ? "On" : "Off"}
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_120px] items-center rounded-3xl border border-cyan-300/12 bg-slate-950/80 p-4">
                <div>
                  <p className="text-sm text-zinc-400">Anonymous Voting</p>
                  <p className="text-white font-semibold">Hide voter names during results</p>
                </div>
                <button type="button" onClick={() => setAnonymousVoting((prev) => !prev)} className={`w-full rounded-full px-4 py-3 text-sm font-semibold transition ${anonymousVoting ? "bg-cyan-500 text-black" : "bg-zinc-900 text-zinc-300"}`}>
                  {anonymousVoting ? "On" : "Off"}
                </button>
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="p-6 bg-slate-950/78 border border-fuchsia-300/14">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-fuchsia-300 font-semibold">
                    Players ({Object.values(room.players).length})
                  </p>
                  <h3 className="text-2xl font-bold text-white">Lobby</h3>
                </div>
                <div className="rounded-2xl border border-fuchsia-300/15 bg-slate-950/85 px-4 py-3 text-sm text-zinc-300">
                  <span className="font-semibold text-cyan-300">Host:</span> {room.players[room.hostId]?.name || "Unknown"}
                </div>
              </div>
              <div className="space-y-3">
                {Object.values(room.players).map((p) => (
                  <div key={p.id} className="rounded-3xl border border-white/6 bg-[linear-gradient(135deg,rgba(17,24,39,0.9),rgba(26,16,44,0.82))] p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">{p.name}</p>
                      <p className="text-xs text-zinc-500">
                        {p.id === room.hostId ? "Host" : "Player"} • {p.online ? "Online" : "Offline"}
                      </p>
                    </div>
                    {p.id === room.hostId && (
                      <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-300">HOST</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6 bg-slate-950/78 border border-cyan-300/14">
              <div className="flex items-center justify-between mb-4 gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-cyan-300 font-semibold">Invite Players</p>
                  <p className="text-zinc-400 text-sm">Share this link to join directly.</p>
                </div>
              </div>
              <div className="rounded-3xl border border-cyan-300/12 bg-slate-950/82 p-4 mb-4">
                <p className="text-xs text-zinc-500 mb-2">Invite link</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={`${window.location.origin}/lobby/${room.roomId}`}
                    className="flex-1 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white"
                  />
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/lobby/${room.roomId}`);
                      alert("Link copied to clipboard!");
                    }}
                    className="px-5"
                  >
                    Copy
                  </Button>
                </div>
              </div>

              {/* ✅ Start Game button — only shown to host when room is waiting */}
              {isWaiting && isHost && (
                <Button
                  onClick={() => socket.emit("start_game", {
                    roomId,
                    config: { numTraitors, hintTime, difficulty, use18Plus, anonymousVoting },
                  })}
                  className="w-full py-4"
                >
                  Start Game
                </Button>
              )}

              {/* Non-host waiting message */}
              {isWaiting && !isHost && (
                <p className="text-sm text-zinc-500 text-center py-2">
                  Waiting for the host to start the game...
                </p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default Lobby;
