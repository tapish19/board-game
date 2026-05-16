import { useGame } from "./useGame";
import { GameBoard } from "./GameBoard";
import { useState } from "react";

const PLAYER_COLORS = [
  "#7F77DD",
  "#1D9E75",
  "#D85A30",
  "#D4537E",
  "#378ADD",
  "#639922",
  "#BA7517",
  "#E24B4A",
];

export function Game() {
  const [view, setView] = useState<"lobby" | "game">("lobby");
  const [username, setUsername] = useState("");
  const [matchId, setMatchId] = useState("");
  const [playerColor] = useState(
    PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]
  );

  const {
    gameState,
    isConnected,
    error,
    userId,
    username: connectedUsername,
    makeMove,
    connect,
    createNewMatch,
    joinExistingMatch,
    cooldownUntil,
  } = useGame(playerColor);

  async function handleCreateMatch() {
    if (!username.trim()) return;
    await connect(username.trim());
    const newMatchId = await createNewMatch();
    setMatchId(newMatchId);
    setView("game");
  }

  async function handleJoinMatch() {
    if (!username.trim() || !matchId.trim()) return;
    await connect(username.trim());
    await joinExistingMatch(matchId.trim());
    setView("game");
  }

  if (view === "lobby") {
    return (
      <div className="lobby">
        <div className="lobby-card">
          <div
            className="color-preview"
            style={{ background: playerColor }}
          />
          <h1>Pixel War</h1>
          <p className="subtitle">
            Real-time shared grid game. Click tiles to claim them.
            Everyone sees changes instantly!
          </p>

          <div className="form-section">
            <label htmlFor="username">Your Name</label>
            <input
              id="username"
              type="text"
              placeholder="e.g. swift_fox"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && username.trim()) {
                  handleCreateMatch();
                }
              }}
              maxLength={20}
              autoFocus
            />
          </div>

          <button
            onClick={handleCreateMatch}
            disabled={!username.trim()}
            className="primary-btn"
          >
            Create New Game
          </button>

          <div className="divider">
            <span>or</span>
          </div>

          <div className="form-section">
            <label htmlFor="matchId">Match ID</label>
            <input
              id="matchId"
              type="text"
              placeholder="Paste match ID to join"
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && username.trim() && matchId.trim()) {
                  handleJoinMatch();
                }
              }}
            />
          </div>

          <button
            onClick={handleJoinMatch}
            disabled={!username.trim() || !matchId.trim()}
          >
            Join Existing Game
          </button>

          {error && <div className="error-message">{error}</div>}

          <p className="notice">
            Game data syncs through Nakama server. Multiple players can
            claim tiles simultaneously.
          </p>
        </div>
      </div>
    );
  }

  if (!isConnected || !gameState) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Connecting to game server...</p>
      </div>
    );
  }

  return (
    <div className="game-container">
      <div className="game-header">
        <div className="game-title">
          <h2>Pixel War</h2>
          <div className="connection-status">
            <div className="status-dot connected" />
            <span>Live</span>
          </div>
        </div>

        <div className="player-info">
          <div
            className="player-color-dot"
            style={{ background: playerColor }}
          />
          <span className="player-username">{connectedUsername}</span>
        </div>

        <div className="match-info">
          <span className="match-label">Match ID:</span>
          <code className="match-id">{matchId}</code>
          <button
            className="copy-btn"
            onClick={() => {
              navigator.clipboard.writeText(matchId);
            }}
            title="Copy to clipboard"
          >
            📋
          </button>
        </div>
      </div>

      <GameBoard
        gameState={gameState}
        myUserId={userId || ""}
        myUsername={connectedUsername || ""}
        myColor={playerColor}
        onMove={makeMove}
        disabled={!isConnected}
        cooldownUntil={cooldownUntil}
      />

      {error && <div className="game-error">{error}</div>}
    </div>
  );
}
