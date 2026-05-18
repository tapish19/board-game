// Lobby.tsx — pixel war join screen with color picker
import { useState } from "react";

interface LobbyProps {
  initialUsername: string;
  initialColor:    string;
  onJoin:          (username: string, color: string) => Promise<void>;
  joining:         boolean;
  error:           string | null;
}

const PALETTE = [
  "#e05252","#e07b52","#e0c452","#a8e052","#52e07b",
  "#52e0c4","#527be0","#a352e0","#e052a3","#e052c4",
  "#7F77DD","#52c4e0","#e0a352","#6be052","#52e0e0",
];

export function Lobby({ initialUsername, initialColor, onJoin, joining, error }: LobbyProps) {
  const [username, setUsername] = useState(initialUsername || "");
  const [color, setColor]       = useState(initialColor);
  const [localErr, setLocalErr] = useState<string | null>(null);

  async function handleJoin() {
    const u = username.trim();
    if (!u) { setLocalErr("Enter a username"); return; }
    if (u.length > 20) { setLocalErr("Username max 20 chars"); return; }
    setLocalErr(null);
    await onJoin(u, color);
  }

  const displayError = localErr || error;

  return (
    <div className="lobby">
      <div className="lobby-card">
        {/* Color preview swatch */}
        <div className="color-preview" style={{ background: color }} />

        <h1>Pixel War 🌍</h1>
        <p className="subtitle">
          Join thousands of players claiming tiles on a live shared board.
          Pick your color and start building your territory.
        </p>

        <div className="form-section">
          <label htmlFor="uname">Your name</label>
          <input
            id="uname"
            type="text"
            placeholder="Enter username…"
            value={username}
            maxLength={20}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleJoin()}
            autoFocus
          />
        </div>

        <div className="form-section">
          <label>Your color</label>
          <div className="color-grid">
            {PALETTE.map(c => (
              <button
                key={c}
                className={`color-swatch ${c === color ? "selected" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={c}
                type="button"
              />
            ))}
          </div>
        </div>

        <button
          className="primary-btn"
          onClick={handleJoin}
          disabled={joining || !username.trim()}
        >
          {joining ? "Joining board…" : "Join the Board →"}
        </button>

        {displayError && (
          <div className="error-message">{displayError}</div>
        )}

        <p className="notice">
          Your color identifies you on the board. All players share the same 40×25 grid in real time.
        </p>
      </div>
    </div>
  );
}
