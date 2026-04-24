import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/layout/Layout";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { socket } from "../lib/socket";

function Game() {
  const { roomId } = useParams();

  const [room, setRoom] = useState(null);
  const [word, setWord] = useState(null);
  const [phase, setPhase] = useState("word_assignment"); // word_assignment → hint_collection → voting → round_result
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [hint, setHint] = useState("");
  const [hints, setHints] = useState({});
  const [submittedHint, setSubmittedHint] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [eliminatedInfo, setEliminatedInfo] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);

  const name = localStorage.getItem("playerName");
  const navigate = useNavigate();

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

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [phase]);

  // 🔌 ROOM UPDATES
  useEffect(() => {
    socket.on("room_updated", (roomData) => {
      setRoom(roomData);
      if (roomData.currentPhase) {
        setPhase(roomData.currentPhase);
      }
      if (roomData.lastEliminated) {
        setEliminatedInfo(roomData.lastEliminated);
      }
    });

    socket.on("phase_changed", (data) => {
      setPhase(data.phase);
      if (data.hints) {
        setHints(data.hints);
      }
      if (data.phase === "hint_collection") {
        setSubmittedHint(false);
        setHint("");
        setEliminatedInfo(null);
      }
      if (data.phase === "round_result") {
        setEliminatedInfo({
          playerId: data.eliminatedPlayer,
          wasTraitor: data.wasTraitor,
        });
      }
      // Reset countdown for new phases
      if (data.phase === "word_assignment") {
        setCountdown(30);
      }
      if (data.phase === "voting") {
        setHasVoted(false);
      }
    });

    socket.on("game_over", () => {
      navigate(`/game-over/${roomId}`);
    });

    return () => {
      socket.off("room_updated");
      socket.off("phase_changed");
      socket.off("game_over");
    };
  }, [navigate, roomId]);

  // 🎯 PRIVATE WORD
useEffect(() => {
  socket.on("game_started", (data) => {
    console.log("Received game_started event with word:", data.word);
    setWord(data.word);
  });

  socket.on("room_updated", (roomData) => {
    const me = roomData.players[socket.id];

    // ✅ fallback if event missed
    if (me?.word) {
      console.log("Using fallback word from room_updated:", me.word);
      setWord(me.word);
    }
  });

  return () => {
    socket.off("game_started");
    socket.off("room_updated");
  };
}, []);

  // 🚀 Join room (important if user refreshes)
  useEffect(() => {
    if (!name) return;

    socket.emit("join_room", {
      roomId,
      name,
    });
  }, [roomId, name]);

  // ⛔ loading
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
                {phase.replace("_", " ")}
              </div>
            </div>
          </div>
        </div>

        {/* 🏠 ROOM */}
        <Card className="p-6">
          <h2 className="text-xl font-bold text-cyan-300 drop-shadow-[0_0_18px_rgba(34,211,238,0.35)]">
            Room: {room.roomId}
          </h2>
        </Card>

        {/* 🎯 WORD ASSIGNMENT PHASE */}
        {phase === "word_assignment" && (
          <Card className="p-8 text-center">
            <h2 className="text-lg text-zinc-300/75 mb-2">
              Your Secret Word
            </h2>

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

        {/* 💡 HINT COLLECTION PHASE */}
        {phase === "hint_collection" && (
          <Card className="p-8">
            <h2 className="text-lg font-semibold mb-3">
              Give a Hint 💡
            </h2>

            <p className="text-sm text-zinc-400 mb-3">
              Say something related to your word (don't expose it!)
            </p>

            {!submittedHint ? (
              <>
                <input
                  type="text"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder="Enter your hint..."
                  className="mb-3 w-full rounded-2xl border border-cyan-300/16 bg-slate-950/78 p-4 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/25"
                  maxLength={100}
                />

                <Button
                  onClick={() => {
                    if (!hint.trim()) return;

                    socket.emit("submit_hint", {
                      roomId,
                      hint: hint.trim(),
                    });

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

        {/* 🗳️ VOTING + HINT DISPLAY PHASE */}
        {phase === "never" && (
          <Card className="p-8">
            <h2 className="text-lg font-semibold mb-3">
              All Hints & Vote 🗳️
            </h2>

            <p className="text-sm text-zinc-400 mb-4">
              Read everyone's hints carefully...
            </p>

            <div className="space-y-3">
              {Object.entries(hints).map(([playerId, playerHint]) => {
                const player = room.players[playerId];
                return (
                  <div key={playerId} className="rounded-2xl border border-white/8 bg-[linear-gradient(135deg,rgba(17,24,39,0.92),rgba(18,16,42,0.82))] p-4 shadow-[0_0_35px_rgba(34,211,238,0.06)]">
                    <div className="font-semibold text-cyan-300">
                      {player?.name || "Unknown"}:
                    </div>
                    <div className="text-zinc-300 mt-1">
                      "{playerHint}"
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-sm text-zinc-500 mt-4">
              Voting starts soon...
            </p>
          </Card>
        )}

        {/* �🗳️ VOTING PHASE */}
        {phase === "voting" && (
          <Card className="p-8">
            <h2 className="text-lg font-semibold mb-3">
              All Hints & Vote 🗳️
            </h2>

            <p className="text-sm text-zinc-400 mb-4">
              Read everyone's hints and vote for the traitor.
            </p>

            <div className="space-y-3 mb-4">
              {Object.entries(hints).map(([playerId, playerHint]) => {
                const player = room.players[playerId];
                return (
                  <div key={playerId} className="rounded-2xl border border-white/8 bg-[linear-gradient(135deg,rgba(17,24,39,0.92),rgba(18,16,42,0.82))] p-4 shadow-[0_0_35px_rgba(34,211,238,0.06)]">
                    <div className="font-semibold text-cyan-300">
                      {player?.name || "Unknown"}:
                    </div>
                    <div className="text-zinc-300 mt-1">
                      "{playerHint}"
                    </div>
                  </div>
                );
              })}
            </div>

            {!hasVoted ? (
              <>
                <div className="space-y-2">
                  {Object.values(room.players)
                    .filter((player) => player.id !== socket.id)
                    .map((player) => (
                      <div
                        key={player.id}
                        onClick={() => setSelectedPlayer(player.id)}
                        className={`flex justify-between rounded-2xl border p-4 cursor-pointer transition ${
                          selectedPlayer === player.id
                            ? "border-rose-300/40 bg-rose-400/14 shadow-[0_0_40px_rgba(251,113,133,0.18)]"
                            : "border-white/8 bg-slate-950/76 hover:border-cyan-300/25 hover:bg-cyan-400/8"
                        }`}
                      >
                        {player.name}
                      </div>
                    ))}
                </div>

                <Button
                  className="mt-4 w-full"
                  onClick={() => {
                    if (!selectedPlayer) return;

                    socket.emit("vote_player", {
                      roomId,
                      targetId: selectedPlayer,
                    });

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

        {/* 🧾 ROUND RESULT PHASE */}
        {phase === "round_result" && eliminatedInfo && (
          <Card className="p-8">
            <h2 className="text-lg font-semibold mb-3">
              Voting Result
            </h2>

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
                  The game will continue once a player advances the round.
                </p>
                <Button
                  className="mt-4 w-full"
                  onClick={() => {
                    socket.emit("continue_round", { roomId });
                  }}
                >
                  Continue to Next Round
                </Button>
              </>
            )}
          </Card>
        )}

      </div>
    </Layout>
  );
}

export default Game;
