import { motion } from "framer-motion";
import type { GameState } from "./nakama-client";
import { useState, useEffect } from "react";

interface GameBoardProps {
  gameState: GameState;
  myUserId: string;
  myUsername: string;
  myColor: string;
  onMove: (position: number) => void;
  disabled: boolean;
  cooldownUntil: number;
}

const COLS = 40;
const ROWS = 25;
const TOTAL_TILES = 1000;

export function GameBoard({
  gameState,
  myUserId,
  myUsername,
  myColor,
  onMove,
  disabled,
  cooldownUntil,
}: GameBoardProps) {
  const [now, setNow] = useState(Date.now());
  const [zoomLevel, setZoomLevel] = useState(12);
  const [flashingTiles, setFlashingTiles] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("");

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, []);

  const cooldownMs = Math.max(0, cooldownUntil - now);
  const onCooldown = cooldownMs > 0;

  function cellClickable(idx: number): boolean {
    if (disabled || onCooldown) return false;
    const tile = gameState.tiles[idx];
    return !tile || tile.userId !== myUserId;
  }

  function handleClick(idx: number) {
    if (disabled) {
      showMessage("Game not started");
      return;
    }

    if (onCooldown) {
      showMessage(`Wait ${(cooldownMs / 1000).toFixed(1)}s before next claim`);
      return;
    }

    const tile = gameState.tiles[idx];
    if (tile && tile.userId === myUserId) {
      showMessage("You already own this tile");
      return;
    }

    onMove(idx);

    setFlashingTiles((prev) => new Set(prev).add(idx));
    setTimeout(() => {
      setFlashingTiles((prev) => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }, 400);
  }

  function showMessage(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(""), 2000);
  }

  const myTiles = gameState.tiles.filter((t) => t?.userId === myUserId).length;
  const totalClaimed = gameState.tiles.filter(Boolean).length;
  const myPercentage = ((myTiles / TOTAL_TILES) * 100).toFixed(1);

  const playerStats = new Map<
    string,
    { username: string; color: string; count: number }
  >();
  gameState.tiles.forEach((tile) => {
    if (!tile) return;
    const key = tile.userId;
    if (!playerStats.has(key)) {
      playerStats.set(key, {
        username: tile.username,
        color: tile.color,
        count: 0,
      });
    }
    playerStats.get(key)!.count++;
  });

  const topPlayers = Array.from(playerStats.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <div className="board-wrapper">
      {message && (
        <div className="floating-message">
          {message}
        </div>
      )}

      <div className="grid-header">
        <div className="stat-card">
          <div className="stat-label">Your Tiles</div>
          <div className="stat-value" style={{ color: myColor }}>
            {myTiles}{" "}
            <span className="stat-sub">({myPercentage}%)</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Board Progress</div>
          <div className="stat-value">
            {totalClaimed} / {TOTAL_TILES}
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(totalClaimed / TOTAL_TILES) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Cooldown</div>
          <div className="stat-value">
            {onCooldown ? (
              <>
                {(cooldownMs / 1000).toFixed(1)}s
                <div className="cooldown-bar">
                  <div
                    className="cooldown-fill"
                    style={{
                      width: `${(cooldownMs / 3000) * 100}%`,
                      background: myColor,
                    }}
                  />
                </div>
              </>
            ) : (
              <span style={{ color: "#22c55e" }}>✓ Ready</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid-controls">
        <div className="zoom-controls">
          <button
            className="icon-btn"
            onClick={() => setZoomLevel((z) => Math.max(6, z - 2))}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="zoom-label">{zoomLevel}px</span>
          <button
            className="icon-btn"
            onClick={() => setZoomLevel((z) => Math.min(24, z + 2))}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>

        <div className="grid-info">
          {COLS} × {ROWS} grid
        </div>
      </div>

      <div className="grid-layout">
        <div className="grid-scroll">
          <div
            className="pixel-grid"
            style={{
              gridTemplateColumns: `repeat(${COLS}, ${zoomLevel}px)`,
              gap: "1px",
            }}
          >
            {gameState.tiles.map((tile, idx) => {
              const isFlashing = flashingTiles.has(idx);
              const clickable = cellClickable(idx);

              return (
                <motion.div
                  key={idx}
                  className={`pixel ${clickable ? "clickable" : ""} ${
                    isFlashing ? "flashing" : ""
                  }`}
                  style={{
                    width: zoomLevel,
                    height: zoomLevel,
                    background: tile ? tile.color : "#e5e7eb",
                    cursor: clickable ? "crosshair" : onCooldown ? "wait" : "default",
                    opacity: onCooldown && !tile ? 0.4 : 1,
                  }}
                  onClick={() => handleClick(idx)}
                  title={tile ? `${tile.username}'s tile` : "Click to claim"}
                  whileTap={clickable ? { scale: 0.85 } : {}}
                  animate={isFlashing ? { scale: [1, 1.5, 1] } : {}}
                  transition={{ duration: 0.4 }}
                />
              );
            })}
          </div>
        </div>

        <div className="grid-sidebar">
          <div className="sidebar-section">
            <h3 className="sidebar-title">🏆 Leaderboard</h3>
            {topPlayers.length === 0 ? (
              <p className="empty-state">No players yet</p>
            ) : (
              <div className="leaderboard-list">
                {topPlayers.map((player, rank) => (
                  <div
                    key={rank}
                    className={`leaderboard-item ${
                      player.username === myUsername ? "is-me" : ""
                    }`}
                  >
                    <span className="rank">#{rank + 1}</span>
                    <div
                      className="player-color"
                      style={{ background: player.color }}
                    />
                    <span className="player-name">{player.username}</span>
                    <span className="player-count">{player.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">⚡ Recent Activity</h3>
            <div className="activity-list">
              {gameState.recentActions && gameState.recentActions.length > 0 ? (
                gameState.recentActions.slice(0, 15).map((action, i) => (
                  <div key={i} className="activity-item">
                    <div
                      className="activity-dot"
                      style={{ background: action.color }}
                    />
                    <span className="activity-text">
                      <strong>{action.username}</strong> claimed a tile
                    </span>
                  </div>
                ))
              ) : (
                <p className="empty-state">Waiting for activity...</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
