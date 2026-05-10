import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import { emitReconnectPlayer, socket } from "../lib/socket";
import {
  buildPlayerSession,
  clearRememberedRoom,
  getStoredPlayerId,
  getStoredPlayerName,
  rememberRoom,
  setSkipAutoReconnect,
} from "../lib/session";

function GameOver() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [winner, setWinner] = useState(null);
  const [room, setRoom] = useState(null);
  const [myRole, setMyRole] = useState(null);
  const playerId = getStoredPlayerId();

  const name = getStoredPlayerName();

  useEffect(() => {
    if (!name) {
      navigate("/");
      return;
    }

    const session = buildPlayerSession(name);
    rememberRoom(roomId);

    socket.emit("join_room", {
      roomId,
      name,
      playerId: session.playerId,
      authToken: session.authToken,
    });

    const handleRoomUpdated = (roomData) => {
      setRoom(roomData);
      if (roomData.status === "game_over" && roomData.winner) {
        setWinner(roomData.winner);
      }
    };

    const handleStateSync = (state) => {
      handleRoomUpdated(state.room);
      setMyRole(state.wordProgress?.role || null);
    };

    socket.on("room_updated", handleRoomUpdated);
    socket.on("STATE_SYNC", handleStateSync);

    socket.on("game_over", (data) => {
      setWinner(data.winner);
    });

    const handleError = () => {
      clearRememberedRoom(roomId);
      setSkipAutoReconnect();
      navigate("/");
    };

    socket.on("error", handleError);

    return () => {
      socket.off("room_updated", handleRoomUpdated);
      socket.off("STATE_SYNC", handleStateSync);
      socket.off("game_over");
      socket.off("error", handleError);
    };
  }, [navigate, roomId, name]);

  useEffect(() => {
    if (!roomId || !playerId) return;

    const handleReconnect = () => {
      emitReconnectPlayer(roomId);
    };

    socket.io.on("reconnect", handleReconnect);
    return () => {
      socket.io.off("reconnect", handleReconnect);
    };
  }, [roomId, playerId]);

  const winnerText = winner === "traitor" ? "Traitor wins" : "Citizens win";
  const winnerAccent =
    winner === "traitor"
      ? "from-rose-400/90 to-orange-300/80 text-rose-100"
      : "from-cyan-300/90 to-blue-300/80 text-cyan-50";

  return (
    <Layout>
      <div className="mx-auto w-full max-w-3xl">
        <div className="relative overflow-hidden rounded-[28px] border border-white/8 bg-[#0a0f19] shadow-[0_35px_120px_-55px_rgba(0,0,0,0.95)] sm:rounded-[36px]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_42%)]" />
          <div className="pointer-events-none absolute -right-16 top-10 h-36 w-36 rounded-full bg-cyan-400/8 blur-3xl" />
          <div className="pointer-events-none absolute -left-12 bottom-0 h-40 w-40 rounded-full bg-fuchsia-500/8 blur-3xl" />

          <div className="relative z-10 grid gap-0 md:grid-cols-[1.05fr_0.95fr]">
            <div className="border-b border-white/6 p-5 sm:p-8 md:border-b-0 md:border-r">
              <div className="inline-flex max-w-full rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 sm:text-[11px] sm:tracking-[0.28em]">
                Final Result
              </div>
              <h1 className="mt-5 text-3xl font-black tracking-tight text-white sm:mt-6 sm:text-5xl">
                Game Over
              </h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-zinc-400">
                The room has spoken. Here’s how the final round ended.
              </p>

              <div className={`mt-8 rounded-[28px] border border-white/8 bg-gradient-to-br ${winnerAccent} p-[1px] shadow-[0_0_60px_rgba(255,255,255,0.05)]`}>
                <div className="rounded-[27px] bg-[#0d1320] px-5 py-5 sm:px-6">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/55 sm:text-[11px] sm:tracking-[0.3em]">
                    Winner
                  </div>
                  <div className="mt-3 text-xl font-black text-white sm:text-2xl">
                    {winner ? winnerText : "Waiting for result..."}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-8">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[11px] sm:tracking-[0.3em]">
                Room Summary
              </div>

              {room ? (
                <div className="mt-5 space-y-3">
                  {Object.values(room.players).map((player) => (
                    <div
                      key={player.id}
                      className="flex flex-col gap-2 rounded-[22px] border border-white/7 bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="font-semibold text-white">{player.name}</div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                          {player.id === room.hostId ? "Host" : "Player"}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                          room.revealedRoles?.[player.id] === "traitor"
                            ? "bg-rose-400/12 text-rose-200"
                            : "bg-cyan-400/10 text-cyan-100"
                        }`}
                      >
                        {room.revealedRoles?.[player.id] === "traitor" ? "Traitor" : "Citizen"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-[22px] border border-white/7 bg-white/[0.03] px-4 py-5 text-sm text-zinc-400">
                  Loading final room state...
                </div>
              )}

              {myRole && (
                <div className="mt-5 rounded-[22px] border border-white/7 bg-white/[0.03] px-4 py-4 text-sm text-zinc-300">
                  Your role: <span className="font-semibold text-white capitalize">{myRole}</span>
                </div>
              )}

              <Button
                className="mt-6 w-full border-white/10 bg-white/[0.05] text-white shadow-[0_18px_50px_-28px_rgba(255,255,255,0.2)] hover:border-white/20 hover:bg-white/[0.08] hover:shadow-[0_22px_60px_-30px_rgba(255,255,255,0.22)]"
                onClick={() => {
                  clearRememberedRoom(roomId);
                  setSkipAutoReconnect();
                  navigate("/");
                }}
              >
                Back to Home
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center text-xs uppercase tracking-[0.26em] text-zinc-600">
          Room {roomId}
        </div>
      </div>
    </Layout>
  );
}

export default GameOver;
