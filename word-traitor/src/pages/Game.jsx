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
  const [countdown, setCountdown] = useState(30);
  const [eliminatedInfo, setEliminatedInfo] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [continueClicked, setContinueClicked] = useState(false);

  // Keep a ref to the current phase so event handlers always see latest value
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const name = getStoredPlayerName();
  const navigate = useNavigate();
  const me = playerId ? room?.players?.[playerId] : null;
  const isSpectator = Boolean(me?.isEliminated);
  const activePlayers = room
    ? Object.values(room.players).filter((p) => !p.isEliminated)
    : [];

  // ⏰ COUNTDOWN TIMER
  useEffect(() => {
    let timer;
    if (phase === "word_assignment") {
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [phase]);

  // 🔌 ROOM UPDATES
  useEffect(() => {
    const applyRoomState = (roomData) => {
      setRoom(roomData);

      if (roomData.currentPhase) {
        setPhase(roomData.currentPhase);
        phaseRef.current = roomData.currentPhase;
      }

      if (roomData.lastEliminated) {
        setEliminatedInfo(roomData.lastEliminated);
      }

      // ✅ FIX: Only update hints from roomData when NOT in hint_collection phase.
      // During hint_collection, server intentionally sends hints:{} to keep them secret.
      // Updating from that would wipe local submittedHint state and cause the glitch.
      const currentPhase = roomData.currentPhase || phaseRef.current;
      if (currentPhase !== "hint_collection") {
        if (roomData.hints && Object.keys(roomData.hints).length > 0) {
          setHints(roomData.hints);
        }
        if (roomData.hasVoted) {
          setHasVoted(Boolean(playerId && roomData.hasVoted[playerId]));
        }
      }

      const me = playerId ? roomData.players?.[playerId] : null;
      if (me?.word) {
        setWord(me.word);
      }
    };

    const handleRoomUpdated = (roomData) => {
      applyRoomState(roomData);
    };

    const handleStateSync = (state) => {
      applyRoomState(state.room);
      if (state.wordProgress?.word) {
        setWord(state.wordProgress.word);
      }
      // Only restore hints/votes if not in hint_collection phase
      if (state.room?.currentPhase !== "hint_collection") {
        if (state.wordProgress?.hints) {
          setHints(state.wordProgress.hints);
        }
        if (state.wordProgress?.hasVoted) {
          setHasVoted(Boolean(playerId && state.wordProgress.hasVoted[playerId]));
        }
      }
      // Restore submittedHint only if hints are available
      if (state.wordProgress?.hints?.[playerId]) {
        setSubmittedHint(true);
      }
    };

    // ✅ FIX: Named handler so it can be properly removed
    const handlePhaseChanged = (data) => {
      setPhase(data.phase);
      phaseRef.current = data.phase;

      if (data.phase === "hint_collection") {
        // Fresh round — reset hint state
        setSubmittedHint(false);
        setHint("");
        setHints({});
        setEliminatedInfo(null);
        setContinueClicked(false);
      }

      if (data.phase === "voting") {
        // Hints are now revealed by server in this event
        if (data.hints) {
          setHints(data.hints);
        }
        setHasVoted(false);
        setSelectedPlayer(null);
      }

      if (data.phase === "word_assignment") {
        setCountdown(30);
        setSubmittedHint(false);
        setHint("");
        setHints({});
        setContinueClicked(false);
      }

      if (data.phase === "round_result") {
        setEliminatedInfo({
          playerId: data.eliminatedPlayer,
          wasTraitor: data.wasTraitor,
        });
        setContinueClicked(false);
      }
    };

    const handleGameOver = () => {
      navigate(`/game-over/${roomId}`);
    };

    const handleError = () => {
      clearRememberedRoom(roomId);
      navigate("/");
    };

    socket.on("room_updated", handleRoomUpdated);
    socket.on("STATE_SYNC", handleStateSync);
    socket.on("phase_changed", handlePhaseChanged);
    socket.on("game_over", handleGameOver);
    socket.on("error", handleError);

    return () => {
      socket.off("room_updated", handleRoomUpdated);
      socket.off("STATE_SYNC", handleStateSync);
      socket.off("phase_changed", handlePhaseChanged);
      socket.off("game_over", handleGameOver);
      socket.off("error", handleError);
    };
  }, [navigate, playerId, roomId]);

  // 🎯 PRIVATE WORD
  useEffect(() => {
    const handleGameStarted = (data) => {
      setWord(data.word);
      setCountdown(30);
    };
    socket.on("game_started", handleGameStarted);
    return () => { socket.off("game_started", handleGameStarted); };
  }, []);

  // 🚀 Join room on mount / refresh
  useEffect(() => {
    if (!name) return;
    const session = buildPlayerSession(name);
    rememberRoom(roomId);
    socket.emit("join_room", {
      roomId,
      name,
      playerId: session.playerId,
      authToken: session.authToken,
    });
  }, [roomId, name]);

  // 🔁 Reconnect
  useEffect(() => {
    if (!roomId || !playerId) return;
    const handleReconnect = () => { emitReconnectPlayer(roomId); };
    socket.io.on("reconnect", handleReconnect);
    return () => { socket.io.off("reconnect", handleReconnect); };
  }, [roomId, playerId]);

  // ⛔ Loading
  if (!room) {
    return (
      <Layout>
        <p className="text-center text-zinc-400">Loading game...</p>
      </Layout>
    );
  }

  // 🎮 PHASE UI
  return (
    <Layout>
      <div className="space-y-6">

        {/* Header */}
        <div className="rounded-[28px] border border-cyan-300/14 bg-[linear-gradient(135deg,rgba(8,18,38,0.96),rgba(21,11,40,0.92))] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_26px_90px_-40px_rgba(34,211,238,0.4)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/80">
                Live Round
              </p>
              <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">
                Read the room. Catch the traitor.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300/80">
                Watch the clues, trust your instincts, and vote before the bluff gets away.
              </p>
            </div>
            <div className="rounded-[24px] border border-fuchsia-300/18 bg-fuchsia-500/8 px-5 py-4 text-sm text-zinc-200 shadow-[0_0_38px_rgba(217,70,239,0.12)]">
              <div className="text-[11px] uppercase tracking-[0.32em] text-fuchsia-200/70">Current Phase</div>
              <div className="mt-2 text-lg font-black capitalize text-fuchsia-200">
                {phase.replace(/_/g, " ")}
              </div>
            </div>
          </div>

          {isSpectator && (
            <div className="mt-4 rounded-[24px] border border-amber-300/20 bg-amber-400/10 px-5 py-4 text-sm text-amber-100 shadow-[0_0_38px_rgba(251,191,36,0.12)]">
              You were voted out. You are now spectating and can watch the rest of the game.
            </div>
          )}
        </div>

        {/* Room ID */}
        <Card className="p-6">
          <h2 className="text-xl font-bold text-cyan-300 drop-shadow-[0_0_18px_rgba(34,211,238,0.35)]">
            Room: {room.roomId}
          </h2>
        </Card>

        {/* 🎯 WORD ASSIGNMENT */}
        {phase === "word_assignment" && (
          <Card className="p-8 text-center">
            <h2 className="text-lg text-zinc-300/75 mb-2">Your Secret Word</h2>
            <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-fuchsia-300 drop-shadow-[0_0_22px_rgba(34,211,238,0.32)] text-center">
              {word}
            </h1>
            <div className="text-center mt-4">
              <div className="text-3xl font-black text-amber-300 drop-shadow-[0_0_18px_rgba(252,211,77,0.3)]">
                {countdown}s
              </div>
              <p className="text-sm text-zinc-400 mt-2">
                Memorize this word... Hint phase starts soon!
              </p>
            </div>
          </Card>
        )}

        {/* 💡 HINT COLLECTION */}
        {phase === "hint_collection" && (
          <Card className="p-8">
            <h2 className="text-lg font-semibold mb-3">Give a Hint 💡</h2>
            <p className="text-sm text-zinc-400 mb-3">
              Say something related to your word (don't expose it!)
            </p>

            {isSpectator ? (
              <p className="text-center text-amber-300">
                Spectators cannot submit hints.
              </p>
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
              <p className="text-center text-green-400">
                ✅ Hint submitted! Waiting for others...
              </p>
            )}
          </Card>
        )}

        {/* 🗳️ VOTING */}
        {phase === "voting" && (
          <Card className="p-8">
            <h2 className="text-lg font-semibold mb-3">All Hints & Vote 🗳️</h2>
            <p className="text-sm text-zinc-400 mb-4">
              Read everyone's hints and vote for the traitor.
            </p>

            <div className="space-y-3 mb-4">
              {Object.entries(hints).map(([pid, playerHint]) => {
                const player = room.players[pid];
                return (
                  <div key={pid} className="rounded-2xl border border-white/8 bg-[linear-gradient(135deg,rgba(17,24,39,0.92),rgba(18,16,42,0.82))] p-4 shadow-[0_0_35px_rgba(34,211,238,0.06)]">
                    <div className="font-semibold text-cyan-300">
                      {player?.name || "Unknown"}:
                    </div>
                    <div className="text-zinc-300 mt-1">"{playerHint}"</div>
                  </div>
                );
              })}
            </div>

            {isSpectator ? (
              <p className="text-center text-amber-300">
                Spectators cannot vote.
              </p>
            ) : !hasVoted ? (
              <>
                <div className="mb-3 mt-6 border-t border-white/8 pt-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-rose-200/75">Vote</div>
                  <p className="mt-2 text-sm text-zinc-400">Choose the player you think is the traitor.</p>
                </div>
                <div className="space-y-2">
                  {activePlayers
                    .filter((p) => p.id !== playerId)
                    .map((p) => (
                      <div
                        key={p.id}
                        onClick={() => setSelectedPlayer(p.id)}
                        className={`flex justify-between rounded-2xl border p-4 cursor-pointer transition ${
                          selectedPlayer === p.id
                            ? "border-rose-300/40 bg-rose-400/14 shadow-[0_0_40px_rgba(251,113,133,0.18)]"
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
              <p className="text-center text-green-400">
                ✅ Vote submitted! Waiting for others...
              </p>
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
            <div className="rounded-2xl border border-white/10 bg-slate-950/82 p-4 shadow-[0_0_35px_rgba(34,211,238,0.08)]">
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
                    ? "Active players will continue to the next round while you spectate."
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
