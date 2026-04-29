import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/layout/Layout";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { emitReconnectPlayer, socket } from "../lib/socket";
import {
  buildPlayerSession,
  clearRememberedRoom,
  getStoredPlayerId,
  getStoredPlayerName,
  rememberRoom,
} from "../lib/session";

const WORD_DISPLAY_SECONDS = 15;

function Game() {
  const { roomId } = useParams();
  const playerId = getStoredPlayerId();

  const [room, setRoom] = useState(null);
  const [word, setWord] = useState(null);
  const [phase, setPhase] = useState("word_assignment");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [hint, setHint] = useState("");
  const [hints, setHints] = useState({});
  const [submittedHint, setSubmittedHint] = useState(false);
  const [countdown, setCountdown] = useState(WORD_DISPLAY_SECONDS);
  const [eliminatedInfo, setEliminatedInfo] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [continueClicked, setContinueClicked] = useState(false);

  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const name = getStoredPlayerName();
  const navigate = useNavigate();
  const me = playerId ? room?.players?.[playerId] : null;
  const isSpectator = Boolean(me?.isEliminated);
  const activePlayers = room
    ? Object.values(room.players).filter((p) => !p.isEliminated)
    : [];

  // ⏰ WORD REVEAL COUNTDOWN — 15s then auto-advance to hint_collection
  useEffect(() => {
    if (phase !== "word_assignment") return;
    setCountdown(WORD_DISPLAY_SECONDS);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Only the first player (or everyone independently) transitions the phase.
          // We emit a client-side phase advance; server guards against duplicate triggers.
          socket.emit("word_reveal_done", { roomId });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, roomId]);

  // 🔌 SOCKET LISTENERS
  useEffect(() => {
    const applyRoomState = (roomData) => {
      setRoom(roomData);
      if (roomData.currentPhase) {
        setPhase(roomData.currentPhase);
        phaseRef.current = roomData.currentPhase;
      }
      if (roomData.lastEliminated) setEliminatedInfo(roomData.lastEliminated);
      const currentPhase = roomData.currentPhase || phaseRef.current;
      if (currentPhase !== "hint_collection") {
        if (roomData.hints && Object.keys(roomData.hints).length > 0) setHints(roomData.hints);
        if (roomData.hasVoted) setHasVoted(Boolean(playerId && roomData.hasVoted[playerId]));
      }
      const me = playerId ? roomData.players?.[playerId] : null;
      if (me?.word) setWord(me.word);
    };

    const handleRoomUpdated = (roomData) => { applyRoomState(roomData); };

    const handleStateSync = (state) => {
      applyRoomState(state.room);
      if (state.wordProgress?.word) setWord(state.wordProgress.word);
      if (state.room?.currentPhase !== "hint_collection") {
        if (state.wordProgress?.hints) setHints(state.wordProgress.hints);
        if (state.wordProgress?.hasVoted) setHasVoted(Boolean(playerId && state.wordProgress.hasVoted[playerId]));
      }
      if (state.wordProgress?.hints?.[playerId]) setSubmittedHint(true);
    };

    const handlePhaseChanged = (data) => {
      setPhase(data.phase);
      phaseRef.current = data.phase;
      if (data.phase === "hint_collection") {
        setSubmittedHint(false); setHint(""); setHints({});
        setEliminatedInfo(null); setContinueClicked(false);
      }
      if (data.phase === "voting") {
        if (data.hints) setHints(data.hints);
        setHasVoted(false); setSelectedPlayer(null);
      }
      if (data.phase === "word_assignment") {
        setCountdown(WORD_DISPLAY_SECONDS);
        setSubmittedHint(false); setHint("");
        setHints({}); setContinueClicked(false);
      }
      if (data.phase === "round_result") {
        setEliminatedInfo({ playerId: data.eliminatedPlayer, wasTraitor: data.wasTraitor });
        setContinueClicked(false);
      }
    };

    const handleReturnToLobby = ({ roomId: rid }) => {
      navigate(`/lobby/${rid}`, { state: { skipNamePrompt: true } });
    };

    const handleGameOver = () => {};

    const handleError = () => {
      clearRememberedRoom(roomId);
      navigate("/");
    };

    socket.on("room_updated", handleRoomUpdated);
    socket.on("STATE_SYNC", handleStateSync);
    socket.on("phase_changed", handlePhaseChanged);
    socket.on("return_to_lobby", handleReturnToLobby);
    socket.on("game_over", handleGameOver);
    socket.on("error", handleError);

    return () => {
      socket.off("room_updated", handleRoomUpdated);
      socket.off("STATE_SYNC", handleStateSync);
      socket.off("phase_changed", handlePhaseChanged);
      socket.off("return_to_lobby", handleReturnToLobby);
      socket.off("game_over", handleGameOver);
      socket.off("error", handleError);
    };
  }, [navigate, playerId, roomId]);

  // 🎯 PRIVATE WORD
  useEffect(() => {
    const handleGameStarted = (data) => {
      setWord(data.word);
      setCountdown(WORD_DISPLAY_SECONDS);
    };
    socket.on("game_started", handleGameStarted);
    return () => { socket.off("game_started", handleGameStarted); };
  }, []);

  // 🚀 JOIN ON MOUNT
  useEffect(() => {
    if (!name) return;
    const session = buildPlayerSession(name);
    rememberRoom(roomId);
    socket.emit("join_room", { roomId, name, playerId: session.playerId, authToken: session.authToken });
  }, [roomId, name]);

  // 🔁 RECONNECT
  useEffect(() => {
    if (!roomId || !playerId) return;
    const handleReconnect = () => { emitReconnectPlayer(roomId); };
    socket.io.on("reconnect", handleReconnect);
    return () => { socket.io.off("reconnect", handleReconnect); };
  }, [roomId, playerId]);

  if (!room) {
    return (
      <Layout>
        <p className="text-center text-zinc-400">Loading game...</p>
      </Layout>
    );
  }

  const isHost = playerId === room.hostId;
  const wordProgress = ((WORD_DISPLAY_SECONDS - countdown) / WORD_DISPLAY_SECONDS) * 100;

  return (
    <Layout>
      <div className="space-y-6">

        {/* Header */}
        <div className="rounded-[28px] border border-cyan-300/14 bg-[linear-gradient(135deg,rgba(8,18,38,0.96),rgba(21,11,40,0.92))] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_26px_90px_-40px_rgba(34,211,238,0.4)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/80">Live Round</p>
              <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">Read the room. Catch the traitor.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300/80">Watch the clues, trust your instincts, and vote before the bluff gets away.</p>
            </div>
            <div className="rounded-[24px] border border-fuchsia-300/18 bg-fuchsia-500/8 px-5 py-4 text-sm text-zinc-200 shadow-[0_0_38px_rgba(217,70,239,0.12)]">
              <div className="text-[11px] uppercase tracking-[0.32em] text-fuchsia-200/70">Current Phase</div>
              <div className="mt-2 text-lg font-black capitalize text-fuchsia-200">{phase.replace(/_/g, " ")}</div>
            </div>
          </div>
          {isSpectator && (
            <div className="mt-4 rounded-[24px] border border-amber-300/20 bg-amber-400/10 px-5 py-4 text-sm text-amber-100">
              You were voted out. You are now spectating.
            </div>
          )}
        </div>

        {/* Room ID */}
        <Card className="p-6">
          <h2 className="text-xl font-bold text-cyan-300 drop-shadow-[0_0_18px_rgba(34,211,238,0.35)]">Room: {room.roomId}</h2>
        </Card>

        {/* 🏆 GAME OVER */}
        {phase === "game_over" && (
          <Card className="p-8 text-center">
            <div className="text-5xl mb-4">{room.winner === "civilians" ? "🎉" : "🕵️"}</div>
            <h2 className="text-2xl font-black text-white mb-2">
              {room.winner === "civilians" ? "Civilians Win!" : "Traitor Wins!"}
            </h2>
            <p className="text-zinc-400 mb-6">
              {room.winner === "civilians"
                ? "The traitor has been unmasked."
                : "The traitor blended in and survived."}
            </p>
            {room.revealedRoles && (
              <div className="space-y-2 mb-8 text-left">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">Roles Revealed</p>
                {Object.entries(room.revealedRoles).map(([pid, role]) => (
                  <div key={pid} className={`flex justify-between rounded-2xl border p-4 ${
                    role === "traitor"
                      ? "border-rose-400/30 bg-rose-500/10"
                      : "border-white/8 bg-slate-950/70"
                  }`}>
                    <span className="text-white font-semibold">{room.players[pid]?.name || "Unknown"}</span>
                    <span className={`text-sm font-bold ${
                      role === "traitor" ? "text-rose-400" : "text-cyan-400"
                    }`}>
                      {role === "traitor" ? "🔴 Traitor" : "🔵 Civilian"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-3">
              {isHost && (
                <Button
                  className="w-full py-4 text-base font-black"
                  onClick={() => socket.emit("play_again", { roomId })}
                >
                  🔁 Play Again
                </Button>
              )}
              {!isHost && (
                <p className="text-sm text-zinc-500">Waiting for the host to start a new game...</p>
              )}
              <button
                onClick={() => { socket.emit("leave_room", { roomId }); navigate("/"); }}
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-sm text-zinc-400 transition hover:border-white/20 hover:text-white"
              >
                Leave Room
              </button>
            </div>
          </Card>
        )}

        {/* 🎯 WORD ASSIGNMENT — 15s reveal with progress bar */}
        {phase === "word_assignment" && (
          <Card className="p-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-400 mb-4">Your Secret Word</p>
            <div className="mb-6">
              <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-fuchsia-300 drop-shadow-[0_0_22px_rgba(34,211,238,0.32)]">
                {word ?? "..."}
              </span>
            </div>

            {/* Countdown ring + number */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                  <circle
                    cx="32" cy="32" r="28"
                    fill="none"
                    stroke={countdown <= 5 ? "#f87171" : countdown <= 10 ? "#fbbf24" : "#22d3ee"}
                    strokeWidth="5"
                    strokeDasharray={`${2 * Math.PI * 28}`}
                    strokeDashoffset={`${2 * Math.PI * 28 * (countdown / WORD_DISPLAY_SECONDS)}`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-xl font-black ${
                  countdown <= 5 ? "text-red-400" : countdown <= 10 ? "text-amber-400" : "text-cyan-300"
                }`}>
                  {countdown}
                </span>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-zinc-200">Memorize your word!</p>
                <p className="text-xs text-zinc-500">Hint phase starts in {countdown}s</p>
              </div>
            </div>

            {/* Linear drain bar */}
            <div className="w-full rounded-full bg-white/6 h-2 overflow-hidden">
              <div
                className="h-2 rounded-full transition-all duration-1000 linear"
                style={{
                  width: `${wordProgress}%`,
                  background: countdown <= 5
                    ? "linear-gradient(90deg,#f87171,#ef4444)"
                    : countdown <= 10
                    ? "linear-gradient(90deg,#fbbf24,#f59e0b)"
                    : "linear-gradient(90deg,#22d3ee,#a855f7)",
                }}
              />
            </div>
            <p className="text-xs text-zinc-600 mt-3">The hint phase will begin automatically</p>
          </Card>
        )}

        {/* 💡 HINT COLLECTION */}
        {phase === "hint_collection" && (
          <Card className="p-8">
            <h2 className="text-lg font-semibold mb-3">Give a Hint 💡</h2>
            <p className="text-sm text-zinc-400 mb-3">Say something related to your word (don't expose it!)</p>
            {isSpectator ? (
              <p className="text-center text-amber-300">Spectators cannot submit hints.</p>
            ) : !submittedHint ? (
              <>
                <input
                  type="text"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && hint.trim()) {
                      socket.emit("submit_hint", { roomId, hint: hint.trim() });
                      setSubmittedHint(true);
                    }
                  }}
                  placeholder="Enter your hint..."
                  className="mb-3 w-full rounded-2xl border border-cyan-300/16 bg-slate-950/78 p-4 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/25"
                  maxLength={100}
                  autoFocus
                />
                <Button
                  onClick={() => {
                    if (!hint.trim()) return;
                    socket.emit("submit_hint", { roomId, hint: hint.trim() });
                    setSubmittedHint(true);
                  }}
                  className="w-full"
                  disabled={!hint.trim()}
                >
                  Submit Hint
                </Button>
              </>
            ) : (
              <p className="text-center text-green-400">✅ Hint submitted! Waiting for others...</p>
            )}
          </Card>
        )}

        {/* 🗳️ VOTING */}
        {phase === "voting" && (
          <Card className="p-8">
            <h2 className="text-lg font-semibold mb-3">All Hints & Vote 🗳️</h2>
            <p className="text-sm text-zinc-400 mb-4">Read everyone's hints and vote for the traitor.</p>
            <div className="space-y-3 mb-4">
              {Object.entries(hints).map(([pid, playerHint]) => {
                const player = room.players[pid];
                return (
                  <div key={pid} className="rounded-2xl border border-white/8 bg-[linear-gradient(135deg,rgba(17,24,39,0.92),rgba(18,16,42,0.82))] p-4">
                    <div className="font-semibold text-cyan-300">{player?.name || "Unknown"}:</div>
                    <div className="text-zinc-300 mt-1">"{playerHint}"</div>
                  </div>
                );
              })}
            </div>
            {isSpectator ? (
              <p className="text-center text-amber-300">Spectators cannot vote.</p>
            ) : !hasVoted ? (
              <>
                <div className="mb-3 mt-6 border-t border-white/8 pt-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-rose-200/75">Vote</div>
                  <p className="mt-2 text-sm text-zinc-400">Choose the player you think is the traitor.</p>
                </div>
                <div className="space-y-2">
                  {activePlayers.filter((p) => p.id !== playerId).map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPlayer(p.id)}
                      className={`flex justify-between rounded-2xl border p-4 cursor-pointer transition ${
                        selectedPlayer === p.id
                          ? "border-rose-300/40 bg-rose-400/14"
                          : "border-white/8 bg-slate-950/76 hover:border-cyan-300/25 hover:bg-cyan-400/8"
                      }`}
                    >
                      {p.name}
                    </div>
                  ))}
                </div>
                <Button
                  className="mt-4 w-full"
                  onClick={() => {
                    if (!selectedPlayer) return;
                    socket.emit("vote_player", { roomId, targetId: selectedPlayer });
                    setHasVoted(true);
                    setSelectedPlayer(null);
                  }}
                  disabled={!selectedPlayer}
                >
                  Submit Vote
                </Button>
              </>
            ) : (
              <p className="text-center text-green-400">✅ Vote submitted! Waiting for others...</p>
            )}
          </Card>
        )}

        {/* 🧾 ROUND RESULT */}
        {phase === "round_result" && eliminatedInfo && (
          <Card className="p-8">
            <h2 className="text-lg font-semibold mb-3">Voting Result</h2>
            <p className="text-sm text-zinc-400 mb-4">
              {room.players[eliminatedInfo.playerId]?.name || "A player"} was voted out.
            </p>
            <div className="rounded-2xl border border-white/10 bg-slate-950/82 p-4">
              <p className="text-white font-semibold">
                {eliminatedInfo.wasTraitor
                  ? "They were the traitor! Citizens win this round."
                  : "They were not the traitor. The game continues..."}
              </p>
            </div>
            {!eliminatedInfo.wasTraitor && (
              <>
                <p className="text-sm text-zinc-500 mt-3">
                  {isSpectator
                    ? "Active players will continue the next round while you spectate."
                    : "The game will continue once a player advances the round."}
                </p>
                {!isSpectator && (
                  <Button
                    className="mt-4 w-full"
                    disabled={continueClicked}
                    onClick={() => {
                      if (continueClicked) return;
                      setContinueClicked(true);
                      socket.emit("continue_round", { roomId });
                    }}
                  >
                    {continueClicked ? "Starting next round..." : "Continue to Next Round"}
                  </Button>
                )}
              </>
            )}
          </Card>
        )}

      </div>
    </Layout>
  );
}

export default Game;
