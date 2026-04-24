import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";
import GameOver from "./pages/GameOver";
// import Voting from "./pages/Voting";
// import Result from "./pages/Result";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/lobby/:roomId" element={<Lobby />} />
      <Route path="/game/:roomId" element={<Game />} />
      <Route path="/game-over/:roomId" element={<GameOver />} />
      {/* <Route path="/voting/:roomId" element={<Voting />} />
      <Route path="/result/:roomId" element={<Result />} /> */}
    </Routes>
  );
}

export default App;