import { useEffect, useState } from "react";
import { socket } from "./lib/socket";
import  Button  from "./components/ui/Button";
import Card  from "./components/ui/Card";

function App() {
  const [room, setRoom] = useState(null);
  const [word, setWord] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);


  useEffect(() => {
  socket.on("player_eliminated", ({ playerId }) => {
    alert("Player eliminated: " + playerId);
    setHasVoted(false);
  });

  return () => socket.off("player_eliminated");
}, []);

  // 🔌 ROOM UPDATES
  useEffect(() => {
    socket.on("room_updated", (roomData) => {
      console.log("ROOM UPDATE:", roomData);
      setRoom(roomData);
    });

    return () => socket.off("room_updated");
  }, []);

  // 🎯 PRIVATE GAME DATA (ONLY WORD)
  useEffect(() => {
    socket.on("game_started", (data) => {
      console.log("PRIVATE DATA:", data);
      setWord(data.word);
    });

    return () => socket.off("game_started");
  }, []);

  const isHost = room && socket.id === room.hostId;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <h1 className="text-3xl font-bold mb-6">🎭 Word Traitor</h1>

      {!room ? (
        <div className="flex gap-4">
          <Button
            onClick={() =>
              socket.emit("create_room", {
                roomId: "ABC123",
                name: "Archi",
              })
            }
          >
            Create Room
          </Button>

          <Button
            onClick={() =>
              socket.emit("join_room", {
                roomId: "ABC123",
                name: "User2",
              })
            }
          >
            Join Room
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 🏠 ROOM INFO */}
          <Card>
            <h2 className="text-xl font-semibold">
              Room: {room.roomId}
            </h2>
            <p className="text-gray-400">
              Status: {room.status}
            </p>
          </Card>

          {/* 👥 PLAYERS */}
          <Card>
            <h3 className="text-lg mb-3">Players</h3>
            <div className="space-y-2">
              {Object.values(room.players).map((player) => (
                <div
                  key={player.id}
                  className="p-3 rounded-lg bg-zinc-800 flex justify-between"
                >
                  <span>{player.name}</span>
                  {player.id === room.hostId && (
                    <span className="text-yellow-400">👑</span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* 🎮 WAITING STATE */}
          {room.status === "waiting" && (
            <Card>
              <p className="text-gray-400">
                Waiting for host to start...
              </p>

              {isHost && (
                <Button
                  className="mt-4"
                  onClick={() =>
                    socket.emit("start_game", {
                      roomId: room.roomId,
                    })
                  }
                >
                  Start Game 🚀
                </Button>
              )}
            </Card>
          )}

          {/* 🚀 GAME STARTED */}
          {room.status === "playing" && (
            <Card>
              <h2 className="text-xl font-bold mb-2">
                Game Started 🚀
              </h2>

              <p className="text-gray-400 mb-2">
                Your Word:
              </p>

              <h2 className="text-3xl text-cyan-400 font-bold tracking-wide">
                {word}
              </h2>

              <p className="text-sm text-gray-500 mt-3">
                Give a hint related to this word...
              </p>
            </Card>
          )}

          {Object.values(room.players).map((player) => (
  <div
    key={player.id}
    className="p-3 rounded-lg bg-zinc-800 flex justify-between"
  >
    <span>{player.name}</span>

    {room.status === "playing" && !hasVoted && (
      <button
        onClick={() => {
          socket.emit("vote_player", {
            roomId: room.roomId,
            targetId: player.id,
          });
          setHasVoted(true);
        }}
        className="text-red-400"
      >
        Vote
      </button>
    )}
  </div>
))}
        </div>
      )}
    </div>
  );
}

export default App;