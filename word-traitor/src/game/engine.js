export function createGame(players, word) {
  return {
    word,
    revealed: Array(word.length).fill("_"),
    currentTurn: 0,
    players,
    status: "playing"
  };
}