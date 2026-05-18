// useGame.ts — pixel war match state
import { useState, useCallback, useEffect, useRef } from "react";
import {
  openSocket, closeSocket, getSocket, joinBoard, claimTile,
  getGlobalMatchId, createInitialGameState,
  OpCode, TOTAL_TILES,
  type GameState, type Tile, type RecentAction,
} from "./nakama-client";

const COOLDOWN_MS = 3000;

export function useGame(username: string, color: string) {
  const [gameState, setGameState]     = useState<GameState>(createInitialGameState());
  const [matchId, setMatchId]         = useState<string | null>(null);
  const [connected, setConnected]     = useState(false);
  const [cooldownUntil, setCooldown]  = useState(0);
  const [error, setError]             = useState<string | null>(null);
  const [joining, setJoining]         = useState(false);
  const matchIdRef = useRef<string | null>(null);

  // ── Wire socket events once on mount ──────────────────────
  useEffect(() => {
    return () => { closeSocket(); };
  }, []);

  function wireEvents(sock: ReturnType<typeof getSocket>) {
    if (!sock) return;

    sock.onmatchdata = (data) => {
      let payload: any;
      try {
        payload = JSON.parse(new TextDecoder().decode(data.data));
      } catch { return; }

      switch (data.op_code) {
        case OpCode.FULL_STATE:
          setGameState({
            tiles:         payload.tiles         ?? Array(TOTAL_TILES).fill(null),
            recentActions: payload.recentActions  ?? [],
            playerCount:   payload.playerCount    ?? 1,
            totalClaimed:  (payload.tiles ?? []).filter(Boolean).length,
          });
          setConnected(true);
          break;

        case OpCode.TILE_UPDATE:
          setGameState(prev => {
            const newTiles = [...prev.tiles] as (Tile | null)[];
            newTiles[payload.position] = payload.tile ?? null;
            const newActions = payload.recentAction
              ? [payload.recentAction as RecentAction, ...prev.recentActions].slice(0, 50)
              : prev.recentActions;
            return {
              ...prev,
              tiles:        newTiles,
              recentActions: newActions,
              totalClaimed:  payload.totalClaimed ?? prev.totalClaimed,
            };
          });
          break;

        case OpCode.PLAYER_COUNT:
          setGameState(prev => ({ ...prev, playerCount: payload.count ?? prev.playerCount }));
          break;

        case OpCode.ERROR:
          // Server cooldown override — sync client cooldown with server
          if (payload.cooldownMs) {
            setCooldown(Date.now() + payload.cooldownMs);
          }
          setError(payload.message ?? "Server error");
          setTimeout(() => setError(null), 3000);
          break;
      }
    };

    sock.ondisconnect = () => {
      setConnected(false);
      setError("Disconnected — reconnecting…");
    };
  }

  // ── Join the global board ──────────────────────────────────
  const join = useCallback(async () => {
    if (joining || matchIdRef.current) return;
    setJoining(true);
    setError(null);

    try {
      const mid = await getGlobalMatchId();
      const sock = await openSocket();
      wireEvents(sock);
      await joinBoard(mid, username, color);
      matchIdRef.current = mid;
      setMatchId(mid);
    } catch (e: any) {
      setError(e?.message ?? "Failed to join board");
    } finally {
      setJoining(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, color]);

  // ── Claim a tile ──────────────────────────────────────────
  const makeMove = useCallback(async (position: number) => {
    const mid = matchIdRef.current;
    if (!mid || Date.now() < cooldownUntil) return;

    // Optimistic cooldown — server will correct if wrong
    setCooldown(Date.now() + COOLDOWN_MS);

    try {
      await claimTile(mid, position);
    } catch (e: any) {
      setError(e?.message ?? "Move failed");
    }
  }, [cooldownUntil]);

  const leave = useCallback(() => {
    closeSocket();
    matchIdRef.current = null;
    setMatchId(null);
    setConnected(false);
    setGameState(createInitialGameState());
  }, []);

  return {
    gameState,
    matchId,
    connected,
    cooldownUntil,
    error,
    joining,
    join,
    makeMove,
    leave,
  };
}

