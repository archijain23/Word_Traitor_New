import { useEffect, useRef, useState } from "react";
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

const WORD_ASSIGNMENT_SECONDS = 10;
const RESULT_REVEAL_DELAY_MS = 950;
const RESULT_SETTLE_DELAY_MS = 2350;

let sharedAudioContext = null;

function getSharedAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!sharedAudioContext) sharedAudioContext = new AudioContextCtor();
  return sharedAudioContext;
}

function primeAudioContext() {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

function playImpactCue(kind) {
  const ctx = getSharedAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime + 0.01;
  const master = ctx.createGain();
  master.connect(ctx.destination);

  const playTone = ({ startAt, frequency, endFrequency = frequency, duration, volume, type }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startAt);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), startAt + duration);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(startAt);
    osc.stop(startAt + duration + 0.02);
  };

  if (kind === "hint") {
    playTone({ startAt: now, frequency: 620, endFrequency: 880, duration: 0.11, volume: 0.025, type: "triangle" });
    return;
  }

  if (kind === "vote") {
    playTone({ startAt: now, frequency: 240, endFrequency: 170, duration: 0.12, volume: 0.035, type: "square" });
    return;
  }

  if (kind === "phase") {
    playTone({ startAt: now, frequency: 430, endFrequency: 690, duration: 0.18, volume: 0.02, type: "sine" });
    playTone({ startAt: now + 0.05, frequency: 690, endFrequency: 910, duration: 0.12, volume: 0.015, type: "triangle" });
    return;
  }

  if (kind === "elimination") {
    playTone({ startAt: now, frequency: 180, endFrequency: 65, duration: 0.34, volume: 0.05, type: "sawtooth" });
    playTone({ startAt: now + 0.08, frequency: 110, endFrequency: 52, duration: 0.38, volume: 0.035, type: "triangle" });
  }
}

function pulseVibration(pattern) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

// ── Circular countdown ring (reused for word-assignment phase)
function CountdownRing({ seconds, total, label, sublabel }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, seconds / total));
  const color = seconds <= 5 ? "#f87171" : seconds <= Math.ceil(total * 0.35) ? "#fbbf24" : "#22d3ee";
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-16 h-16 shrink-0">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
          <circle
            cx="32" cy="32" r={r}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - frac)}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-xl font-black"
          style={{ color }}
        >
          {seconds}
        </span>
      </div>
      <div className="text-left">
        <p className="text-sm font-semibold text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500">{sublabel}</p>
      </div>
    </div>
  );
}

// ── Sticky hint-phase timer bar ───────────────────────────────────────────────────────
// Always visible to every player (submitted / not-submitted / spectator) while
// the hint_collection phase is active, regardless of scroll position.
function HintTimerBar({ seconds, total, submittedCount, totalActive }) {
  if (total <= 0) return null;

  const frac = Math.max(0, Math.min(1, seconds / total));
  const pct = frac * 100;
  const isLow = seconds <= 5;
  const isMid = !isLow && seconds <= Math.ceil(total * 0.35);

  const barColor = isLow
    ? "linear-gradient(90deg,#f87171,#ef4444)"
    : isMid
    ? "linear-gradient(90deg,#fbbf24,#f59e0b)"
    : "linear-gradient(90deg,#22d3ee,#a855f7)";

  const ringColor = isLow ? "#f87171" : isMid ? "#fbbf24" : "#22d3ee";
  const borderColor = isLow
    ? "rgba(248,113,113,0.25)"
    : isMid
    ? "rgba(251,191,36,0.22)"
    : "rgba(34,211,238,0.18)";
  const bgGlow = isLow
    ? "rgba(239,68,68,0.08)"
    : isMid
    ? "rgba(245,158,11,0.07)"
    : "rgba(34,211,238,0.06)";

  const r = 20;
  const circ = 2 * Math.PI * r;

  return (
    <div
      className="sticky top-0 z-50 mb-4"
      style={{
        background: `linear-gradient(135deg,rgba(8,18,38,0.97),rgba(21,11,40,0.95))`,
        borderBottom: `1px solid ${borderColor}`,
        boxShadow: `0 4px 32px ${bgGlow}, 0 1px 0 rgba(255,255,255,0.03)`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 sm:flex-nowrap">

        {/* Arc ring */}
        <div className="relative shrink-0" style={{ width: 48, height: 48 }}>
          <svg className="-rotate-90" width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <circle
              cx="24" cy="24" r={r}
              fill="none"
              stroke={ringColor}
              strokeWidth="4"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - frac)}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
            />
          </svg>
          <span
            className="absolute inset-0 flex items-center justify-center text-sm font-black tabular-nums"
            style={{ color: ringColor, transition: "color 0.3s" }}
          >
            {seconds}
          </span>
        </div>

        {/* Label + progress bar */}
        <div className="flex-1 min-w-0">
          <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <span
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: ringColor, transition: "color 0.3s" }}
            >
              {seconds > 0 ? "Hint Phase" : "Time's Up!"}
            </span>
            <span className="text-xs text-zinc-500 tabular-nums">
              {submittedCount} / {totalActive} submitted
            </span>
          </div>
          <div className="w-full rounded-full bg-white/6 h-1.5 overflow-hidden">
            <div
              className="h-1.5 rounded-full"
              style={{
                width: `${pct}%`,
                background: barColor,
                transition: "width 1s linear, background 0.3s",
              }}
            />
          </div>
        </div>

        {/* Seconds badge */}
        <div
          className="shrink-0 text-right"
          style={{ color: ringColor, transition: "color 0.3s" }}
        >
          <span className="text-lg font-black tabular-nums">{seconds}</span>
          <span className="text-xs text-zinc-500 ml-0.5">s</span>
        </div>
      </div>
    </div>
  );
}

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
  // word-assignment countdown
  const [wordCountdown, setWordCountdown] = useState(WORD_ASSIGNMENT_SECONDS);
  // hint-phase countdown
  const [hintCountdown, setHintCountdown] = useState(0);
  const hintTimerRef = useRef(null);
  const [eliminatedInfo, setEliminatedInfo] = useState(null);
  const [voteSummary, setVoteSummary] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [newHintIds, setNewHintIds] = useState(new Set());
  const prevHintsRef = useRef({});
  const resultTimersRef = useRef([]);
  const resultSequenceKeyRef = useRef(null);
  const phaseCueTimerRef = useRef(null);
  const impactFlashTimerRef = useRef(null);
  // store hintTime config for the ring total
  const [hintTimeDuration, setHintTimeDuration] = useState(30);
  const [resultStage, setResultStage] = useState("idle");
  const [impactFlash, setImpactFlash] = useState(null);
  const [phaseCue, setPhaseCue] = useState(null);

  const name = getStoredPlayerName();
  const navigate = useNavigate();
  const me = playerId ? room?.players?.[playerId] : null;
  const isSpectator = Boolean(me?.isEliminated);
  const activePlayers = room
    ? Object.values(room.players).filter((p) => !p.isEliminated)
    : [];

  // ─── Hint timer helpers ──────────────────────────────────────────────────────────────
  const clearHintInterval = () => {
    if (hintTimerRef.current) {
      clearInterval(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  };

  const clearResultTimers = () => {
    resultTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    resultTimersRef.current = [];
  };

  const triggerImpactFlash = (mode) => {
    setImpactFlash(mode);
    window.clearTimeout(impactFlashTimerRef.current);
    impactFlashTimerRef.current = window.setTimeout(() => setImpactFlash(null), mode === "elimination" ? 720 : 420);
  };

  const showPhaseCue = (label) => {
    setPhaseCue(label);
    window.clearTimeout(phaseCueTimerRef.current);
    phaseCueTimerRef.current = window.setTimeout(() => setPhaseCue(null), 1300);
  };

  const runRoundResultSequence = (incomingVoteSummary, incomingEliminatedInfo) => {
    if (!incomingEliminatedInfo?.playerId) return;
    const sequenceKey = `${incomingEliminatedInfo.playerId}:${incomingEliminatedInfo.wasTraitor ? "traitor" : "citizen"}`;
    if (resultSequenceKeyRef.current === sequenceKey) return;

    resultSequenceKeyRef.current = sequenceKey;
    clearResultTimers();
    setVoteSummary(incomingVoteSummary || null);
    setEliminatedInfo(incomingEliminatedInfo);
    setResultStage("votes");
    triggerImpactFlash("votes");
    playImpactCue("phase");

    resultTimersRef.current.push(window.setTimeout(() => {
      setResultStage("elimination");
      triggerImpactFlash("elimination");
      playImpactCue("elimination");
      pulseVibration([80, 40, 140]);
    }, RESULT_REVEAL_DELAY_MS));

    resultTimersRef.current.push(window.setTimeout(() => {
      setResultStage("resolved");
    }, RESULT_SETTLE_DELAY_MS));
  };

  const startLocalHintCountdown = (endsAt, durationSeconds) => {
    clearHintInterval();
    setHintTimeDuration(durationSeconds);
    const tick = () => {
      const remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setHintCountdown(remaining);
      if (remaining <= 0) clearHintInterval();
    };
    tick();
    hintTimerRef.current = setInterval(tick, 500);
  };

  // ─── Listen for server hint timer ──────────────────────────────────────────────
  useEffect(() => {
    const handleHintTimer = ({ endsAt, durationSeconds }) => {
      startLocalHintCountdown(endsAt, durationSeconds);
    };
    socket.on("hint_timer_start", handleHintTimer);
    return () => {
      socket.off("hint_timer_start", handleHintTimer);
      clearHintInterval();
    };
  }, []);

  useEffect(() => {
    const unlockAudio = () => primeAudioContext();
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      clearResultTimers();
      window.clearTimeout(phaseCueTimerRef.current);
      window.clearTimeout(impactFlashTimerRef.current);
    };
  }, []);

  // ─── Word-assignment countdown ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "word_assignment") return;
    setWordCountdown(WORD_ASSIGNMENT_SECONDS);
    const timer = setInterval(() => {
      setWordCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // The server guards this event against eliminated players,
          // but we also skip emitting on the client side for cleanliness.
          socket.emit("word_reveal_done", { roomId });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, roomId]);

  // ─── Room updates ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const applyRoomState = (roomData) => {
      setRoom(roomData);
      if (roomData.currentPhase) setPhase(roomData.currentPhase);
      if (roomData.lastEliminated) setEliminatedInfo(roomData.lastEliminated);
      if (roomData.lastVoteSummary) setVoteSummary(roomData.lastVoteSummary);
      if (roomData.config?.hintTime) setHintTimeDuration(roomData.config.hintTime);
      if (roomData.hints) {
        const prev = prevHintsRef.current;
        const incoming = roomData.hints;
        const fresh = Object.keys(incoming).filter((k) => !prev[k]);
        if (fresh.length > 0) {
          setNewHintIds((ids) => { const n = new Set(ids); fresh.forEach((k) => n.add(k)); return n; });
          playImpactCue("hint");
          setTimeout(() => {
            setNewHintIds((ids) => { const n = new Set(ids); fresh.forEach((k) => n.delete(k)); return n; });
          }, 600);
        }
        prevHintsRef.current = incoming;
        setHints(incoming);
        setSubmittedHint(Boolean(playerId && incoming[playerId]));
      }
      if (roomData.hasVoted) setHasVoted(Boolean(playerId && roomData.hasVoted[playerId]));
      const me = playerId ? roomData.players[playerId] : null;
      if (me?.word) setWord(me.word);
      // Sync hint countdown from server timestamp if mid-phase
      if (roomData.hintTimerEndsAt && roomData.currentPhase === "hint_collection") {
        startLocalHintCountdown(roomData.hintTimerEndsAt, roomData.config?.hintTime ?? 30);
      }
      if (roomData.currentPhase === "round_result" && roomData.lastEliminated) {
        runRoundResultSequence(roomData.lastVoteSummary, roomData.lastEliminated);
      }
    };

    const handleRoomUpdated = (roomData) => applyRoomState(roomData);

    const handleStateSync = (state) => {
      applyRoomState(state.room);
      setWord(state.wordProgress?.word || null);
      const h = state.wordProgress?.hints || {};
      prevHintsRef.current = h;
      setHints(h);
      setHasVoted(Boolean(playerId && state.wordProgress?.hasVoted?.[playerId]));
      setSubmittedHint(Boolean(playerId && h[playerId]));
    };

    const handlePhaseChanged = (data) => {
      setPhase(data.phase);
      if (data.hints) { prevHintsRef.current = data.hints; setHints(data.hints); }
      if (data.phase === "hint_collection") {
        setSubmittedHint(false);
        setHint("");
        setEliminatedInfo(null);
        setVoteSummary(null);
        setResultStage("idle");
        resultSequenceKeyRef.current = null;
        prevHintsRef.current = {};
        setHints({});
        showPhaseCue("Hint phase");
      }
      if (data.phase === "round_result") {
        runRoundResultSequence(
          data.voteSummary,
          { playerId: data.eliminatedPlayer, wasTraitor: data.wasTraitor }
        );
        clearHintInterval();
        setHintCountdown(0);
      }
      if (data.phase === "voting") {
        setHasVoted(false);
        clearHintInterval();
        setHintCountdown(0);
        showPhaseCue("Voting time");
        triggerImpactFlash("votes");
        playImpactCue("phase");
      }
      if (data.phase === "word_assignment") {
        setWordCountdown(WORD_ASSIGNMENT_SECONDS);
        setVoteSummary(null);
        setResultStage("idle");
        resultSequenceKeyRef.current = null;
        // Clear the stale word for spectators — they won’t receive
        // game_started so the old word would linger otherwise.
        setWord(null);
        showPhaseCue("New words");
      }
    };

    const handleReturnToLobby = ({ roomId: rid }) => {
      navigate(`/lobby/${rid}`, { state: { skipNamePrompt: true } });
    };

    const handleError = () => { clearRememberedRoom(roomId); navigate("/"); };

    socket.on("room_updated", handleRoomUpdated);
    socket.on("STATE_SYNC", handleStateSync);
    socket.on("phase_changed", handlePhaseChanged);
    socket.on("return_to_lobby", handleReturnToLobby);
    socket.on("game_over", () => {});
    socket.on("error", handleError);

    return () => {
      socket.off("room_updated", handleRoomUpdated);
      socket.off("STATE_SYNC", handleStateSync);
      socket.off("phase_changed", handlePhaseChanged);
      socket.off("return_to_lobby", handleReturnToLobby);
      socket.off("game_over");
      socket.off("error", handleError);
    };
  }, [navigate, playerId, roomId]);

  // ─── Private word ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleGameStarted = (data) => {
      setWord(data.word);
      setWordCountdown(WORD_ASSIGNMENT_SECONDS);
      showPhaseCue("Your word");
      playImpactCue("phase");
    };
    socket.on("game_started", handleGameStarted);
    return () => socket.off("game_started", handleGameStarted);
  }, []);

  // ─── Join on mount ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!name) return;
    const session = buildPlayerSession(name);
    rememberRoom(roomId);
    socket.emit("join_room", { roomId, name, playerId: session.playerId, authToken: session.authToken });
  }, [roomId, name]);

  // ─── Reconnect ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId || !playerId) return;
    const handleReconnect = () => emitReconnectPlayer(roomId);
    socket.io.on("reconnect", handleReconnect);
    return () => socket.io.off("reconnect", handleReconnect);
  }, [roomId, playerId]);

  if (!room) {
    return <Layout><p className="text-center text-zinc-400">Loading game...</p></Layout>;
  }

  const isHost = playerId === room.hostId;
  const wordProgress = ((WORD_ASSIGNMENT_SECONDS - wordCountdown) / WORD_ASSIGNMENT_SECONDS) * 100;
  const hintEntries = Object.entries(hints);
  const submittedCount = hintEntries.length;
  const totalActive = activePlayers.length;
  const hintTimedOut = hintCountdown <= 0 && phase === "hint_collection";
  const voteLines = voteSummary?.votes || [];
  const voteTotals = voteSummary?.totals || [];
  const eliminatedPlayerName = room.players[eliminatedInfo?.playerId]?.name || "A player";
  const totalVotesCast = voteLines.length || voteTotals.reduce((sum, entry) => sum + entry.count, 0);

  // ─── Live hint feed ───────────────────────────────────────────────────────────────
  const HintFeed = ({ showWaiting = true }) => (
    <div className="space-y-2">
      {hintEntries.length === 0 && showWaiting && (
        <p className="text-center text-zinc-500 text-sm py-4">Waiting for first hint...</p>
      )}
      {hintEntries.map(([pid, playerHint]) => {
        const player = room.players[pid];
        const isMe = pid === playerId;
        const isNew = newHintIds.has(pid);
        return (
          <div
            key={pid}
            className={`flex items-start gap-3 rounded-2xl border p-4 transition-all duration-300 ${
              isNew
                ? "border-cyan-300/40 bg-cyan-400/10 scale-[1.02] shadow-[0_0_24px_rgba(34,211,238,0.18)]"
                : isMe
                ? "border-fuchsia-300/25 bg-fuchsia-500/8"
                : "border-white/8 bg-[linear-gradient(135deg,rgba(17,24,39,0.92),rgba(18,16,42,0.82))]"
            }`}
            style={isNew ? { animation: "hintPop 0.35s cubic-bezier(0.34,1.56,0.64,1)" } : {}}
          >
            <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${isMe ? "bg-fuchsia-400" : "bg-cyan-400"}`} />
            <div className="min-w-0 flex-1">
              <span className={`text-sm font-semibold ${isMe ? "text-fuchsia-300" : "text-cyan-300"}`}>
                {player?.name || "Unknown"}{isMe ? " (you)" : ""}
              </span>
              <p className="text-zinc-200 mt-0.5 text-sm break-words">&ldquo;{playerHint}&rdquo;</p>
            </div>
            {isNew && (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-cyan-300 bg-cyan-400/15 px-2 py-0.5 rounded-full">new</span>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes hintPop {
          0%   { transform: scale(0.88) translateY(6px); opacity: 0; }
          60%  { transform: scale(1.03) translateY(-2px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }

        @keyframes phaseCueIn {
          0% { transform: translate(-50%, -24px) scale(0.94); opacity: 0; }
          18% { opacity: 1; }
          100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
        }

        @keyframes voteBeam {
          0% { transform: translateX(-10px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }

        @keyframes eliminatedCard {
          0% { transform: scale(0.92) translateY(20px); opacity: 0; filter: saturate(0.7); }
          45% { transform: scale(1.06) translateY(-6px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; filter: saturate(1); }
        }

        @keyframes eliminatedStamp {
          0% { transform: rotate(-8deg) scale(1.4); opacity: 0; }
          65% { transform: rotate(-8deg) scale(0.92); opacity: 1; }
          100% { transform: rotate(-8deg) scale(1); opacity: 1; }
        }
      `}</style>

      <Layout>
        {impactFlash && (
          <div
            className={`pointer-events-none fixed inset-0 z-40 transition-opacity duration-500 ${
              impactFlash === "elimination" ? "bg-rose-500/18" : "bg-cyan-400/10"
            }`}
            style={{
              boxShadow:
                impactFlash === "elimination"
                  ? "inset 0 0 220px rgba(244,63,94,0.32)"
                  : "inset 0 0 180px rgba(34,211,238,0.18)",
            }}
          />
        )}

        {phaseCue && (
          <div
            className="pointer-events-none fixed left-1/2 top-6 z-50 rounded-full border border-white/12 bg-slate-950/88 px-5 py-2 text-xs font-black uppercase tracking-[0.3em] text-white shadow-[0_20px_60px_-25px_rgba(34,211,238,0.55)]"
            style={{ animation: "phaseCueIn 0.28s cubic-bezier(0.22,1,0.36,1)" }}
          >
            {phaseCue}
          </div>
        )}

        {/* ⏱ Sticky timer bar — visible to ALL players during hint phase */}
        {phase === "hint_collection" && (
          <HintTimerBar
            seconds={hintCountdown}
            total={hintTimeDuration}
            submittedCount={submittedCount}
            totalActive={totalActive}
          />
        )}

        <div className="space-y-6 overflow-x-hidden">

          {/* Header */}
          <div className="rounded-[28px] border border-cyan-300/14 bg-[linear-gradient(135deg,rgba(8,18,38,0.96),rgba(21,11,40,0.92))] p-5 sm:p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_26px_90px_-40px_rgba(34,211,238,0.4)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/80 sm:tracking-[0.35em]">Live Round</p>
                <h1 className="mt-3 text-2xl font-black text-white sm:text-4xl">Read the room. Catch the traitor.</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300/80">Watch the clues, trust your instincts, and vote before the bluff gets away.</p>
              </div>
              <div className="w-full rounded-[24px] border border-fuchsia-300/18 bg-fuchsia-500/8 px-5 py-4 text-sm text-zinc-200 shadow-[0_0_38px_rgba(217,70,239,0.12)] md:w-auto">
                <div className="text-[11px] uppercase tracking-[0.24em] text-fuchsia-200/70 sm:tracking-[0.32em]">Current Phase</div>
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
            <h2 className="break-all text-xl font-bold text-cyan-300 drop-shadow-[0_0_18px_rgba(34,211,238,0.35)]">Room: {room.roomId}</h2>
          </Card>

          {/* 🏆 GAME OVER */}
          {phase === "game_over" && (
            <Card className="p-8 text-center">
              <div className="text-5xl mb-4">{room.winner === "civilians" ? "🎉" : "🕵️"}</div>
              <h2 className="text-2xl font-black text-white mb-2">
                {room.winner === "civilians" ? "Civilians Win!" : "Traitor Wins!"}
              </h2>
              <p className="text-zinc-400 mb-6">
                {room.winner === "civilians" ? "The traitor has been unmasked." : "The traitor blended in and survived."}
              </p>
              {room.revealedRoles && (
                <div className="space-y-2 mb-8 text-left">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">Roles Revealed</p>
                  {Object.entries(room.revealedRoles).map(([pid, role]) => (
                    <div key={pid} className={`flex justify-between rounded-2xl border p-4 ${
                      role === "traitor" ? "border-rose-400/30 bg-rose-500/10" : "border-white/8 bg-slate-950/70"
                    }`}>
                      <span className="text-white font-semibold">{room.players[pid]?.name || "Unknown"}</span>
                      <span className={`text-sm font-bold ${role === "traitor" ? "text-rose-400" : "text-cyan-400"}`}>
                        {role === "traitor" ? "🔴 Traitor" : "🔵 Civilian"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-3">
                {isHost && (
                  <Button className="w-full py-4 text-base font-black" onClick={() => socket.emit("play_again", { roomId })}>🔁 Play Again</Button>
                )}
                {!isHost && <p className="text-sm text-zinc-500">Waiting for the host to start a new game...</p>}
                <button
                  onClick={() => { socket.emit("leave_room", { roomId }); navigate("/"); }}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 text-sm text-zinc-400 transition hover:border-white/20 hover:text-white"
                >Leave Room</button>
              </div>
            </Card>
          )}

          {/* 🎯 WORD ASSIGNMENT */}
          {phase === "word_assignment" && (
            <Card className="p-8 text-center">
              {isSpectator ? (
                // Spectators never receive game_started so they have no new word.
                // Show a neutral waiting card instead of the stale previous word.
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-400 mb-4">Next Round</p>
                  <div className="mb-6 flex flex-col items-center gap-3">
                    <span className="text-5xl">👁️</span>
                    <p className="text-zinc-200 font-semibold text-lg">New words are being dealt…</p>
                    <p className="text-zinc-500 text-sm">You are spectating this round</p>
                  </div>
                  <div className="flex items-center justify-center gap-4">
                    <CountdownRing
                      seconds={wordCountdown}
                      total={WORD_ASSIGNMENT_SECONDS}
                      label="Hint phase starting soon"
                      sublabel={`Game resumes in ${wordCountdown}s`}
                    />
                  </div>
                </>
              ) : (
                // Active players see their secret word and the memorise countdown.
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-zinc-400 mb-4">Your Secret Word</p>
                  <div className="mb-6">
                    <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-fuchsia-300 drop-shadow-[0_0_22px_rgba(34,211,238,0.32)]">
                      {word ?? "..."}
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-4 mb-6">
                    <CountdownRing
                      seconds={wordCountdown}
                      total={WORD_ASSIGNMENT_SECONDS}
                      label="Memorize your word!"
                      sublabel={`Hint phase starts in ${wordCountdown}s`}
                    />
                  </div>
                  <div className="w-full rounded-full bg-white/6 h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full transition-all duration-1000 linear"
                      style={{
                        width: `${wordProgress}%`,
                        background: wordCountdown <= 3
                          ? "linear-gradient(90deg,#f87171,#ef4444)"
                          : wordCountdown <= 6
                          ? "linear-gradient(90deg,#fbbf24,#f59e0b)"
                          : "linear-gradient(90deg,#22d3ee,#a855f7)",
                      }}
                    />
                  </div>
                  <p className="text-xs text-zinc-600 mt-3">The hint phase will begin automatically</p>
                </>
              )}
            </Card>
          )}

          {/* 💡 HINT COLLECTION */}
          {phase === "hint_collection" && (
            <div className="space-y-4">
              {/* Input card — no duplicate ring here, timer bar is always visible above */}
              <Card className="p-6">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-lg font-bold text-white">Give a Hint 💡</h2>
                  <span className="w-fit text-xs font-semibold px-3 py-1 rounded-full bg-cyan-400/10 border border-cyan-300/20 text-cyan-300">
                    {submittedCount} / {totalActive} submitted
                  </span>
                </div>

                <p className="text-sm text-zinc-400 mb-4">Say something related to your word. Don&apos;t give it away!</p>

                {isSpectator ? (
                  <p className="text-center text-amber-300">Spectators cannot submit hints.</p>
                ) : !submittedHint && !hintTimedOut ? (
                  <>
                    <input
                      type="text"
                      value={hint}
                      onChange={(e) => setHint(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && hint.trim()) {
                          primeAudioContext();
                          playImpactCue("hint");
                          pulseVibration(18);
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
                        primeAudioContext();
                        playImpactCue("hint");
                        pulseVibration(18);
                        socket.emit("submit_hint", { roomId, hint: hint.trim() });
                        setSubmittedHint(true);
                      }}
                      className="w-full"
                      disabled={!hint.trim()}
                    >Submit Hint</Button>
                  </>
                ) : submittedHint ? (
                  <div className="flex items-center gap-2 justify-center rounded-2xl border border-green-400/20 bg-green-400/8 p-4">
                    <span className="text-green-400 text-lg">✅</span>
                    <p className="text-green-400 font-semibold text-sm">Hint submitted! Watching others drop theirs...</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 justify-center rounded-2xl border border-amber-400/20 bg-amber-400/8 p-4">
                    <span className="text-amber-400 text-lg">⏰</span>
                    <p className="text-amber-400 font-semibold text-sm">Time&apos;s up! You didn&apos;t submit a hint this round.</p>
                  </div>
                )}
              </Card>

              {/* Live hint feed card */}
              <Card className="p-6">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="flex items-center gap-2 text-base font-bold text-white min-w-0">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
                    </span>
                    Live Hints
                  </h3>
                  <span className="text-xs text-zinc-500">
                    {totalActive - submittedCount > 0 ? `Waiting for ${totalActive - submittedCount} more...` : "All hints in!"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {activePlayers.map((p) => {
                    const done = Boolean(hints[p.id]);
                    return (
                      <div
                        key={p.id}
                        title={p.name}
                        className={`flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all duration-300 ${
                          done ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300" : "border-white/10 bg-white/5 text-zinc-500"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${done ? "bg-cyan-400" : "bg-zinc-600"}`} />
                        <span className="truncate">{p.name}{p.id === playerId ? " (you)" : ""}</span>
                      </div>
                    );
                  })}
                </div>
                <HintFeed showWaiting />
              </Card>
            </div>
          )}

          {/* 🗾 VOTING */}
          {phase === "voting" && (
            <Card className="p-8">
              <h2 className="text-lg font-semibold mb-1">All Hints 🗾</h2>
              <p className="text-sm text-zinc-400 mb-4">Read everyone&apos;s hints and vote for the traitor.</p>
              <HintFeed showWaiting={false} />
              {isSpectator ? (
                <p className="text-center text-amber-300 mt-6">Spectators cannot vote.</p>
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
                            ? "border-rose-300/45 bg-rose-400/14 shadow-[0_0_28px_rgba(251,113,133,0.2)]"
                            : "border-white/8 bg-slate-950/76 hover:border-cyan-300/25 hover:bg-cyan-400/8"
                        }`}
                      >
                        <span className="font-semibold text-white">{p.name}</span>
                        <span className={`text-xs font-black uppercase tracking-[0.24em] ${
                          selectedPlayer === p.id ? "text-rose-200" : "text-zinc-500"
                        }`}>
                          {selectedPlayer === p.id ? "Targeted" : "Tap to accuse"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button
                    className="mt-4 w-full"
                    onClick={() => {
                      if (!selectedPlayer) return;
                      primeAudioContext();
                      playImpactCue("vote");
                      pulseVibration(24);
                      socket.emit("vote_player", { roomId, targetId: selectedPlayer });
                      setHasVoted(true);
                      setSelectedPlayer(null);
                    }}
                    disabled={!selectedPlayer}
                  >Submit Vote</Button>
                </>
              ) : (
                <p className="text-center text-green-400 mt-6">✅ Vote submitted! Waiting for others...</p>
              )}
            </Card>
          )}

          {/* 🧾 ROUND RESULT */}
          {phase === "round_result" && eliminatedInfo && (
            <Card className="p-8">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-200/80">Round result</p>
                  <h2 className="mt-2 text-2xl font-black text-white">The votes are in.</h2>
                  <p className="mt-2 text-sm text-zinc-400">
                    {voteSummary?.isAnonymous
                      ? "Vote totals are revealed, but individual ballots stayed anonymous."
                      : "Every ballot is on the table."}
                  </p>
                </div>
                <div className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.26em] ${
                  resultStage === "resolved"
                    ? "border-white/12 bg-white/6 text-white"
                    : "border-cyan-300/25 bg-cyan-400/10 text-cyan-200"
                }`}>
                  {resultStage === "votes" ? "Revealing votes" : resultStage === "elimination" ? "Elimination" : "Resolved"}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[24px] border border-white/10 bg-slate-950/78 p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold uppercase tracking-[0.24em] text-zinc-300">Vote Reveal</h3>
                    <span className="text-xs text-zinc-500">{voteLines.length} ballot{voteLines.length === 1 ? "" : "s"}</span>
                  </div>

                  {!voteSummary?.isAnonymous && voteLines.length > 0 && (
                    <div className="space-y-2">
                      {voteLines.map(({ voterId, targetId }, index) => (
                        <div
                          key={`${voterId}-${targetId}`}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/4 px-4 py-3"
                          style={{
                            animation: "voteBeam 0.3s ease-out both",
                            animationDelay: `${index * 90}ms`,
                            opacity: resultStage === "votes" || resultStage === "elimination" || resultStage === "resolved" ? 1 : 0,
                          }}
                        >
                          <span className="min-w-0 truncate font-semibold text-white">
                            {room.players[voterId]?.name || "Unknown"}{voterId === playerId ? " (you)" : ""}
                          </span>
                          <span className="shrink-0 text-xs font-black uppercase tracking-[0.24em] text-rose-200/75">voted</span>
                          <span className="min-w-0 truncate text-right font-semibold text-rose-300">
                            {room.players[targetId]?.name || "Unknown"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {voteSummary?.isAnonymous && (
                    <div className="rounded-2xl border border-amber-300/18 bg-amber-400/8 px-4 py-3 text-sm text-amber-100">
                      Anonymous voting is enabled for this room, so only the totals are shown below.
                    </div>
                  )}

                  <div className="mt-4 space-y-2">
                    {voteTotals.map(({ targetId, count }) => {
                      const totalVotes = Math.max(totalVotesCast, 1);
                      const width = `${Math.max((count / totalVotes) * 100, 12)}%`;
                      const isEliminatedTarget = targetId === eliminatedInfo.playerId;
                      return (
                        <div
                          key={targetId}
                          className={`rounded-2xl border p-4 ${
                            isEliminatedTarget
                              ? "border-rose-300/30 bg-rose-500/10"
                              : "border-white/8 bg-white/4"
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="font-semibold text-white">{room.players[targetId]?.name || "Unknown"}</span>
                            <span className={`text-sm font-black ${isEliminatedTarget ? "text-rose-300" : "text-cyan-300"}`}>
                              {count} vote{count === 1 ? "" : "s"}
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white/6">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isEliminatedTarget ? "bg-gradient-to-r from-rose-400 to-orange-300" : "bg-gradient-to-r from-cyan-400 to-fuchsia-400"
                              }`}
                              style={{ width }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div
                  className={`relative overflow-hidden rounded-[24px] border p-5 ${
                    eliminatedInfo.wasTraitor
                      ? "border-emerald-300/24 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_55%),linear-gradient(135deg,rgba(6,78,59,0.82),rgba(10,10,18,0.96))]"
                      : "border-rose-300/24 bg-[radial-gradient(circle_at_top,rgba(251,113,133,0.18),transparent_55%),linear-gradient(135deg,rgba(76,5,25,0.82),rgba(10,10,18,0.96))]"
                  }`}
                  style={{
                    animation: resultStage === "elimination" || resultStage === "resolved" ? "eliminatedCard 0.55s cubic-bezier(0.22,1,0.36,1)" : "none",
                  }}
                >
                  <div className="relative z-10">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/65">Eliminated</p>
                    <h3 className="mt-3 text-3xl font-black text-white">{eliminatedPlayerName}</h3>
                    <p className="mt-3 text-sm text-white/80">
                      {eliminatedInfo.wasTraitor
                        ? "The bluff cracked. Citizens found the traitor."
                        : "Wrong call. The real traitor is still hidden in the room."}
                    </p>

                    {(resultStage === "elimination" || resultStage === "resolved") && (
                      <div
                        className={`mt-6 inline-flex rounded-full border px-4 py-2 text-sm font-black uppercase tracking-[0.26em] ${
                          eliminatedInfo.wasTraitor
                            ? "border-emerald-200/30 bg-emerald-300/15 text-emerald-100"
                            : "border-rose-200/30 bg-rose-300/15 text-rose-100"
                        }`}
                        style={{ animation: "eliminatedStamp 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}
                      >
                        {eliminatedInfo.wasTraitor ? "Traitor exposed" : "Citizen down"}
                      </div>
                    )}
                  </div>
                  <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/72 p-4">
                <p className="text-white font-semibold">
                  {eliminatedInfo.wasTraitor
                    ? "They were the traitor. Citizens win this round."
                    : "They were not the traitor. The game continues."}
                </p>
              </div>

              {!eliminatedInfo.wasTraitor && (
                <>
                  <p className="text-sm text-zinc-500 mt-3">
                    {isSpectator
                      ? "Active players will continue with a new hint phase while you spectate."
                      : "Launch the next hint phase when everyone has seen the result."}
                  </p>
                  {!isSpectator && (
                    <Button className="mt-4 w-full" onClick={() => socket.emit("continue_round", { roomId })}>
                      Continue to Hint Phase
                    </Button>
                  )}
                </>
              )}
            </Card>
          )}

        </div>
      </Layout>
    </>
  );
}

export default Game;
