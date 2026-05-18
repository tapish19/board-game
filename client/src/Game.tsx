// Game.tsx — game shell with header
import { GameBoard } from "./GameBoard";
import type { GameState } from "./nakama-client";

interface GameProps {
  gameState:     GameState;
  myUserId:      string;
  myUsername:    string;
  myColor:       string;
  onMove:        (position: number) => void;
  onLeave:       () => void;
  connected:     boolean;
  cooldownUntil: number;
  error:         string | null;
  matchId:       string;
}

export function Game({
  gameState, myUserId, myUsername, myColor,
  onMove, onLeave, connected, cooldownUntil, error, matchId,
}: GameProps) {
  return (
    <div className="game-container">
      <div className="game-header">
        <div className="game-title">
          <h2>Pixel War 🌍</h2>
          <div className="connection-status">
            <div className={`status-dot ${connected ? "connected" : ""}`} />
            <span>{connected ? "Live" : "Connecting…"}</span>
          </div>
        </div>

        <div className="match-info">
          <span className="match-label">
            {gameState.playerCount} player{gameState.playerCount !== 1 ? "s" : ""} online
          </span>
        </div>

        <div className="player-info" style={{ marginLeft: "auto" }}>
          <div
            className="player-color-dot"
            style={{ background: myColor, width: 14, height: 14, borderRadius: "50%" }}
          />
          <span className="player-username">{myUsername}</span>
        </div>

        <button className="copy-btn" onClick={onLeave} style={{ marginLeft: 12 }}>
          Leave
        </button>
      </div>

      <GameBoard
        gameState={gameState}
        myUserId={myUserId}
        myUsername={myUsername}
        myColor={myColor}
        onMove={onMove}
        disabled={false}
        cooldownUntil={cooldownUntil}
      />

      {error && <div className="game-error">{error}</div>}
    </div>
  );
}
