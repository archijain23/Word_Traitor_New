import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Modal from "../components/ui/Modal";
import { socket } from "../lib/socket";
import {
  buildPlayerSession,
  getRememberedRoom,
  getStoredPlayerName,
  rememberRoom,
  setStoredPlayerName,
} from "../lib/session";

function Home() {
  const navigate = useNavigate();

  const [name, setName] = useState(getStoredPlayerName());
  const [roomId, setRoomId] = useState("");
  const [showJoinModal, setShowJoinModal] = useState(false);

  useEffect(() => {
    const lastRoomId = getRememberedRoom();
    const storedName = getStoredPlayerName();

    if (!lastRoomId || !storedName) return;

    navigate(`/lobby/${lastRoomId}`, {
      replace: true,
      state: { skipNamePrompt: true, autoReconnect: true },
    });
  }, [navigate]);

  const createRoom = () => {
    if (!name) return alert("Enter name");

    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const session = buildPlayerSession(name);

    socket.emit("create_room", {
      roomId: newRoomId,
      name,
      playerId: session.playerId,
      authToken: session.authToken,
    });

    setStoredPlayerName(name);
    rememberRoom(newRoomId);
    sessionStorage.setItem(`joined-room-${newRoomId}`, "true");

    navigate(`/lobby/${newRoomId}`, {
      state: { skipNamePrompt: true },
    });
  };

  const openJoinModal = () => {
    if (!name) return alert("Enter your name first");
    setShowJoinModal(true);
  };

  const joinRoom = () => {
    if (!name || !roomId) return alert("Enter all fields");

    buildPlayerSession(name);
    setStoredPlayerName(name);
    rememberRoom(roomId);
    sessionStorage.setItem(`joined-room-${roomId}`, "true");

    navigate(`/lobby/${roomId}`, {
      state: { skipNamePrompt: true },
    });
    setShowJoinModal(false);
  };

  return (
    <Layout>
      <div className="relative min-h-[calc(100vh-6rem)] flex items-center justify-center overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.2),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(232,121,249,0.18),_transparent_20%)]" />
        <div className="pointer-events-none absolute left-8 top-20 h-32 w-32 rounded-full border border-cyan-300/20 bg-cyan-300/10 blur-2xl" />
        <div className="pointer-events-none absolute bottom-10 right-10 h-40 w-40 rounded-full border border-fuchsia-300/20 bg-fuchsia-500/10 blur-3xl" />

        <div className="relative w-full max-w-5xl px-4 py-16">
          <div className="text-center mb-12">
            <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-cyan-100/85 shadow-[0_0_35px_rgba(34,211,238,0.2)]">
              Social Deduction Night
            </div>
            <h1 className="mt-6 text-5xl sm:text-7xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-sky-300 to-fuchsia-400 drop-shadow-[0_0_25px_rgba(34,211,238,0.35)]">
              Word<span className="text-white">Traitor</span>
            </h1>
            <p className="mt-4 text-zinc-300 text-sm sm:text-base max-w-2xl mx-auto leading-7">
              One word apart. One traitor among you. Build a room, share the glow,
              and catch the fake before the room turns on itself.
            </p>
          </div>

          <div className="mx-auto max-w-xl">
            <input
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-full border border-cyan-300/18 bg-slate-950/85 px-5 py-4 text-white placeholder:text-zinc-500 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_0_50px_rgba(34,211,238,0.08)] focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
            />
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <Card className="p-8 border-cyan-400/20 bg-slate-950/80 shadow-[0_22px_90px_-46px_rgba(34,211,238,0.45)]">
              <div className="mb-6">
                <div className="text-cyan-300 uppercase tracking-[0.3em] text-xs font-semibold mb-2">
                  Create Room
                </div>
                <h2 className="text-2xl font-bold text-white">Start a new circle</h2>
                <p className="mt-3 text-zinc-300/80 text-sm leading-6">
                  Create a room and invite friends with a quick shareable link.
                </p>
              </div>
              <Button onClick={createRoom} className="w-full py-4">
                Create Room
              </Button>
            </Card>

            <Card className="p-8 border-fuchsia-400/20 bg-slate-950/80 shadow-[0_22px_90px_-46px_rgba(217,70,239,0.4)]">
              <div className="mb-6">
                <div className="text-fuchsia-300 uppercase tracking-[0.3em] text-xs font-semibold mb-2">
                  Join Room
                </div>
                <h2 className="text-2xl font-bold text-white">Enter your code</h2>
                <p className="mt-3 text-zinc-300/80 text-sm leading-6">
                  Join an existing game by entering the room code from your host.
                </p>
              </div>

              <Button onClick={openJoinModal} className="w-full py-4">
                Join Room
              </Button>
            </Card>
          </div>

          <div className="mt-12 text-center text-zinc-400 text-sm">
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 shadow-[0_0_35px_rgba(34,211,238,0.08)]">
              Fast play. Brighter lobby. Multiplayer chaos.
            </span>
          </div>
        </div>
      </div>

      <Modal isOpen={showJoinModal} onClose={() => setShowJoinModal(false)}>
        <h2 className="mb-4 text-2xl font-bold text-white">Join Room</h2>
        <p className="mb-6 text-zinc-300/75">
          Enter the room code provided by your host.
        </p>
        <input
          placeholder="Room Code"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value.toUpperCase())}
          className="mb-4 w-full rounded-full border border-fuchsia-300/20 bg-slate-950/80 px-5 py-4 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/30"
          onKeyPress={(e) => e.key === "Enter" && joinRoom()}
        />
        <Button onClick={joinRoom} className="w-full py-4">
          Join Room
        </Button>
      </Modal>
    </Layout>
  );
}

export default Home;
