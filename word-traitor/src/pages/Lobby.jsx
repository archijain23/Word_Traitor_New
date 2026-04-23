import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { socket } from "../lib/socket";

function Lobby() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);

  const name = localStorage.getItem("playerName");

  // ❌ If no name → go back
  useEffect(() => {
    if (!name) {
      navigate("/");
    }
  }, []);

  // 🔌 Listen for updates
  useEffect(() => {
    socket.on("room_updated", (roomData) => {
      setRoom(roomData);
    });

    socket.on("error", (msg) => {
      alert(msg);
      navigate("/");
    });

    return () => {
      socket.off("room_updated");
      socket.off("error");
    };
  }, []);

  // 🚀 Join room
  useEffect(() => {
    socket.emit("join_room", {
      roomId,
      name,
    });
  }, [roomId]);

  // ⛔ Loading state
  if (!room) {
    return (
      <Layout>
        <p className="text-center text-zinc-400">
          Joining room...
        </p>
      </Layout>
    );
  }

  const isHost = socket.id === room.hostId;

  return (
    <Layout>
      <div className="space-y-6">

        <Card>
          <h2 className="text-2xl text-cyan-400 font-bold">
            Room: {room.roomId}
          </h2>
          <p className="text-zinc-400">
            Status: {room.status}
          </p>
        </Card>

        <Card>
          <h3 className="text-lg mb-3">Players</h3>
          {Object.values(room.players).map((p) => (
            <div
              key={p.id}
              className="p-3 bg-zinc-800 rounded-lg flex justify-between"
            >
              {p.name}
              {p.id === room.hostId && "👑"}
            </div>
          ))}
        </Card>

        {room.status === "waiting" && isHost && (
          <Button
            onClick={() =>
              socket.emit("start_game", { roomId })
            }
          >
            Start Game 🚀
          </Button>
        )}
      </div>
    </Layout>
  );
}

export default Lobby;