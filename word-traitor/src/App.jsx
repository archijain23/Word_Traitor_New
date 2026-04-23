import { useEffect, useState } from "react";
import { socket } from "./lib/socket";

function App() {
  const [room, setRoom] = useState(null);

  useEffect(() => {
    // Listen for room updates
    socket.on("room_updated", (roomData) => {
      console.log("ROOM UPDATE:", roomData);
      setRoom(roomData);
    });

    return () => {
      socket.off("room_updated");
    };
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Word Traitor - Lobby Test</h1>

      {!room ? (
        <>
          <button
            onClick={() => {
              socket.emit("create_room", {
                roomId: "ABC123",
                name: "Archi",
              });
            }}
            style={{ marginRight: "10px" }}
          >
            Create Room
          </button>

          <button
            onClick={() => {
              socket.emit("join_room", {
                roomId: "ABC123",
                name: "User2",
              });
            }}
          >
            Join Room
          </button>
        </>
      ) : (
        <div style={{ marginTop: "20px" }}>
          <h2>Room: {room.roomId}</h2>
          <p>Status: {room.status}</p>

          <h3>Players:</h3>
          <ul>
            {Object.values(room.players).map((player) => (
              <li key={player.id}>
                {player.name}
                {player.id === room.hostId && " (Host)"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;