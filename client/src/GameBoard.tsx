// GameBoard.tsx — 40×25 pixel grid with sidebar
import { useState, useEffect, useRef, useCallback } from "react";
import type { GameState } from "./nakama-client";

interface GameBoardProps {
  gameState:     GameState;
  myUserId:      string;
  myUsername:    string;
  myColor:       string;
  onMove:        (position: number) => void;
  disabled:      boolean;
  cooldownUntil: number;
}

const COLS        = 40;
const ROWS        = 25;
const TOTAL_TILES = 1000;

export function GameBoard({
  gameState, myUserId, myUsername, myColor,
  onMove, disabled, cooldownUntil,
}: GameBoardProps) {
  const [now, setNow]               = useState(Date.now());
  const [cellSize, setCellSize]     = useState(18);
  const [flashSet, setFlashSet]     = useState<Set<number>>(new Set());
  const [toast, setToast]           = useState("");
  const gridRef                     = useRef<HTMLDivElement>(null);
  const intervalRef                 = useRef<ReturnType<typeof setInterval>>();

  // Keep `now` updated for the cooldown bar
  useEffect(() => {
    intervalRef.current = setInterval(() => setNow(Date.now()), 80);
    return () => clearInterval(intervalRef.current);
  }, []);

  const cooldownMs  = Math.max(0, cooldownUntil - now);
  const onCooldown  = cooldownMs > 0;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }

  const handleClick = useCallback((idx: number) => {
    if (disabled)    { showToast("Board not ready"); return; }
    if (onCooldown)  { showToast(`Wait ${(cooldownMs / 1000).toFixed(1)}s`); return; }
    const tile = gameState.tiles[idx];
    if (tile?.userId === myUserId) { showToast("You already own this"); return; }

    onMove(idx);
    setFlashSet(prev => {
      const next = new Set(prev);
      next.add(idx);
      setTimeout(() => setFlashSet(s => { const n = new Set(s); n.delete(idx); return n; }), 350);
      return next;
    });
  }, [disabled, onCooldown, cooldownMs, gameState.tiles, myUserId, onMove]);

  const myTiles      = gameState.tiles.filter(t => t?.userId === myUserId).length;
  const totalClaimed = gameState.totalClaimed;
  const pct          = ((myTiles / TOTAL_TILES) * 100).toFixed(1);

  // Build leaderboard from tiles
  const playerMap = new Map<string, { username: string; color: string; count: number }>();
  for (const tile of gameState.tiles) {
    if (!tile) continue;
    const e = playerMap.get(tile.userId);
    if (e) e.count++;
    else playerMap.set(tile.userId, { username: tile.username, color: tile.color, count: 1 });
  }
  const topPlayers = [...playerMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);

  const cooldownPct = (cooldownMs / 3000) * 100;

  return (
    <div className="board-wrapper">
      {toast && <div className="floating-message">{toast}</div>}

      {/* ── Stats bar ── */}
      <div className="grid-header">
        <div className="stat-card">
          <div className="stat-label">Your Tiles</div>
          <div className="stat-value" style={{ color: myColor }}>
            {myTiles} <span className="stat-sub">({pct}%)</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Board Progress</div>
          <div className="stat-value">
            {totalClaimed} / {TOTAL_TILES}
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${(totalClaimed / TOTAL_TILES) * 100}%` }} />
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
                  <div className="cooldown-fill" style={{ width: `${cooldownPct}%`, background: myColor }} />
                </div>
              </>
            ) : (
              <span style={{ color: "#22c55e" }}>✓ Ready</span>
            )}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Players Online</div>
          <div className="stat-value" style={{ color: "#52c4e0" }}>
            {gameState.playerCount}
          </div>
        </div>
      </div>

      {/* ── Zoom controls ── */}
      <div className="grid-controls">
        <div className="zoom-controls">
          <button className="icon-btn" onClick={() => setCellSize(s => Math.max(8, s - 2))}>−</button>
          <span className="zoom-label">{cellSize}px</span>
          <button className="icon-btn" onClick={() => setCellSize(s => Math.min(32, s + 2))}>+</button>
        </div>
        <div className="grid-info">{COLS} × {ROWS} · {TOTAL_TILES} tiles</div>
      </div>

      {/* ── Grid + sidebar ── */}
      <div className="grid-layout">
        <div className="grid-scroll" ref={gridRef}>
          <div
            className="pixel-grid"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${COLS}, ${cellSize}px)`,
              gap: "1px",
              width: "fit-content",
            }}
          >
            {gameState.tiles.map((tile, idx) => {
              const mine      = tile?.userId === myUserId;
              const claimed   = !!tile;
              const clickable = !disabled && !onCooldown && !mine;
              const flashing  = flashSet.has(idx);

              return (
                <div
                  key={idx}
                  className={`pixel${clickable ? " clickable" : ""}${flashing ? " flashing" : ""}`}
                  style={{
                    width:      cellSize,
                    height:     cellSize,
                    background: tile ? tile.color : "#1e2029",
                    opacity:    onCooldown && !claimed ? 0.55 : 1,
                    cursor:     clickable ? "crosshair" : onCooldown ? "wait" : "default",
                    outline:    mine ? `2px solid rgba(255,255,255,0.6)` : undefined,
                    outlineOffset: mine ? "-2px" : undefined,
                    transition: "transform 0.12s, opacity 0.15s",
                    transform:  flashing ? "scale(1.4)" : "scale(1)",
                    borderRadius: 2,
                  }}
                  onClick={() => handleClick(idx)}
                  title={tile ? `${tile.username}` : "Click to claim"}
                />
              );
            })}
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="grid-sidebar">
          <div className="sidebar-section">
            <h3 className="sidebar-title">🏆 Leaderboard</h3>
            {topPlayers.length === 0 ? (
              <p className="empty-state">No tiles claimed yet</p>
            ) : (
              <div className="leaderboard-list">
                {topPlayers.map((p, i) => (
                  <div key={i} className={`leaderboard-item${p.username === myUsername ? " is-me" : ""}`}>
                    <span className="rank">#{i + 1}</span>
                    <div className="player-color" style={{ background: p.color }} />
                    <span className="player-name">{p.username}</span>
                    <span className="player-count">{p.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">⚡ Recent Activity</h3>
            <div className="activity-list">
              {gameState.recentActions.length > 0 ? (
                gameState.recentActions.slice(0, 15).map((a, i) => (
                  <div key={i} className="activity-item">
                    <div className="activity-dot" style={{ background: a.color }} />
                    <span className="activity-text">
                      <strong>{a.username}</strong> claimed #{a.position}
                    </span>
                  </div>
                ))
              ) : (
                <p className="empty-state">Waiting for activity…</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
