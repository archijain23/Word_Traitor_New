import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
// import Game from "./pages/Game";
// import Voting from "./pages/Voting";
// import Result from "./pages/Result";
// import GameOver from "./pages/GameOver";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/lobby/:roomId" element={<Lobby />} />
      {/* <Route path="/game/:roomId" element={<Game />} />
      <Route path="/voting/:roomId" element={<Voting />} />
      <Route path="/result/:roomId" element={<Result />} />
      <Route path="/game-over/:roomId" element={<GameOver />} /> */}
    </Routes>
  );
}

export default App;