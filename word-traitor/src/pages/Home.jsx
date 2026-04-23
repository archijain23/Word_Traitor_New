import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import { socket } from "../lib/socket";

function Home() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");

  const createRoom = () => {
    if (!name) return alert("Enter name");

    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();

    socket.emit("create_room", {
      roomId: newRoomId,
      name,
    });

    // 👉 store name locally
    localStorage.setItem("playerName", name);

    navigate(`/lobby/${newRoomId}`);
  };

  const joinRoom = () => {
    if (!name || !roomId) return alert("Enter all fields");

    localStorage.setItem("playerName", name);

    navigate(`/lobby/${roomId}`);
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto space-y-6">
        
        <Card>
          <h2 className="text-xl font-bold mb-4">Create Room</h2>

          <input
            placeholder="Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-3 rounded-lg bg-zinc-800 mb-3"
          />

          <Button onClick={createRoom} className="w-full">
            Create Room 🚀
          </Button>
        </Card>

        <Card>
          <h2 className="text-xl font-bold mb-4">Join Room</h2>

          <input
            placeholder="Room Code"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="w-full p-3 rounded-lg bg-zinc-800 mb-3"
          />

          <input
            placeholder="Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-3 rounded-lg bg-zinc-800 mb-3"
          />

          <Button onClick={joinRoom} className="w-full">
            Join Room
          </Button>
        </Card>

      </div>
    </Layout>
  );
}

export default Home;