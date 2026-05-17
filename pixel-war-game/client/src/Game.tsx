import { GameBoard } from "./GameBoard";
import type { GameState } from "./nakama-client";

interface GameProps {
  gameState: GameState;
  gameOver: boolean;
  myUserId: string;
  opponentStatus: string;
  timeLeft: number | null;
  onMove: (position: number) => void;
  onLeave: () => void;
  onClientError: (message: string | null) => void;
  error: string | null;
  matchId: string;
  cooldownUntil: number;
}

export function Game({
  gameState,
  gameOver,
  myUserId,
  opponentStatus,
  timeLeft,
  onMove,
  onLeave,
  onClientError,
  error,
  matchId,
  cooldownUntil,
}: GameProps) {
  const connectionLabel = opponentStatus === "connected" ? "Live" : "Waiting";

  return (
    <div className="game-container">
      <div className="game-header">
        <div className="game-title">
          <h2>Pixel War</h2>
          <div className="connection-status">
            <div className={`status-dot ${opponentStatus === "connected" ? "connected" : ""}`} />
            <span>{connectionLabel}</span>
          </div>
        </div>

        <div className="match-info">
          <span className="match-label">Match ID:</span>
          <code className="match-id">{matchId}</code>
          <button
            className="copy-btn"
            onClick={() => {
              navigator.clipboard.writeText(matchId);
              onClientError("Copied match ID");
              setTimeout(() => onClientError(null), 1200);
            }}
            title="Copy to clipboard"
          >
            📋
          </button>
        </div>

        <div className="game-actions">
          {timeLeft !== null && <span className="timer">⏱ {timeLeft}s</span>}
          {gameOver && <span className="game-over-pill">Game Over</span>}
          <button className="secondary-btn" onClick={onLeave}>Leave</button>
        </div>
      </div>

      <GameBoard
        gameState={gameState}
        myUserId={myUserId}
        myUsername="Player"
        myColor="#7F77DD"
        onMove={onMove}
        disabled={gameOver}
        cooldownUntil={cooldownUntil}
      />

      {error && <div className="game-error">{error}</div>}
    </div>
  );
}
