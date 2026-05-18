// App.tsx
import { useState, useEffect, useRef } from "react";
import { authenticate, getCachedSession, getSavedUsername, getSavedColor, savePrefs } from "./nakama-client";
import { useGame } from "./useGame";
import { Lobby } from "./Lobby";
import { Game } from "./Game";

type View = "lobby" | "game";

export default function App() {
  const [view, setView]         = useState<View>("lobby");
  const [username, setUsername] = useState(getSavedUsername());
  const [color, setColor]       = useState(getSavedColor());
  const [authErr, setAuthErr]   = useState<string | null>(null);
  const [authed, setAuthed]     = useState(false);
  const didAuth = useRef(false);

  // Authenticate on mount
  useEffect(() => {
    if (didAuth.current) return;
    didAuth.current = true;

    const existing = getCachedSession();
    if (existing && !existing.isexpired(Math.floor(Date.now() / 1000))) {
      setAuthed(true);
      return;
    }
    const autoUsername =
  username ||
  `Player_${Math.floor(Math.random() * 100000)}`;

authenticate(autoUsername)
  .then(() => {
    setUsername(autoUsername);
    setAuthed(true);
  })
      .catch(e => setAuthErr(e?.message ?? "Auth failed"));
  }, []);

  const {
    gameState, matchId, connected, cooldownUntil,
    error, joining, join, makeMove, leave,
  } = useGame(username, color);

  async function handleJoin(uname: string, clr: string) {
    setUsername(uname);
    setColor(clr);
    savePrefs(uname, clr);
    // Re-authenticate if username changed
    try {
      await authenticate(uname);
    } catch { /* already authed */ }
    await join();
    setView("game");
  }

  function handleLeave() {
    leave();
    setView("lobby");
  }

  if (authErr) {
    return (
      <div className="loading-screen">
        <p style={{ color: "#e05252", maxWidth: 320, textAlign: "center" }}>
          Could not connect to server.<br />{authErr}
        </p>
        <button onClick={() => window.location.reload()} style={{ marginTop: 16 }}>
          Retry
        </button>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Connecting…</p>
      </div>
    );
  }

  if (view === "game" && matchId) {
    return (
      <Game
        gameState={gameState}
        myUserId={getCachedSession()?.user_id ?? ""}
        myUsername={username}
        myColor={color}
        onMove={makeMove}
        onLeave={handleLeave}
        connected={connected}
        cooldownUntil={cooldownUntil}
        error={error}
        matchId={matchId}
      />
    );
  }

  return (
    <Lobby
      initialUsername={username}
      initialColor={color}
      onJoin={handleJoin}
      joining={joining}
      error={error}
    />
  );
}
