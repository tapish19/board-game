import { useState, useCallback, useEffect, useRef } from "react";
import { getSession, openSocket, joinMatch, createInitialGameState, updateGameStateWithMove, type GameState, type MatchData } from "./nakama-client";
import type { Socket } from "@heroiclabs/nakama-js";

const COOLDOWN_MS = 3000;

export function useGame() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);

  const ensureConnected = useCallback(async () => {
    if (socketRef.current) return socketRef.current;

    const session = getSession();
    if (!session) throw new Error("Not authenticated");
    setMyUserId(session.user_id);

    const socket = await openSocket();
    socketRef.current = socket;

    socket.onmatchdata = (matchData) => {
      const data = JSON.parse(new TextDecoder().decode(matchData.data)) as MatchData;
      if (data.gameState) setGameState(data.gameState);
    };

    return socket;
  }, []);

  const enterMatch = useCallback(async (incomingMatchId: string): Promise<boolean> => {
    try {
      setError(null);
      const socket = await ensureConnected();
      await joinMatch(socket, incomingMatchId);
      setMatchId(incomingMatchId);

      if (!gameState) {
        setGameState(createInitialGameState());
      }
      return true;
    } catch (err) {
      setError(`Failed to join match: ${err}`);
      return false;
    }
  }, [ensureConnected, gameState]);

  const makeMove = useCallback(async (position: number) => {
    const socket = socketRef.current;
    const activeMatchId = matchId;
    const activeUserId = myUserId;
    if (!socket || !activeMatchId || !gameState || !activeUserId) return;
    if (Date.now() < cooldownUntil) return;

    try {
      const newState = updateGameStateWithMove(gameState, position, activeUserId, "Player", "#7F77DD");
      setGameState(newState);
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      await socket.sendMatchState(activeMatchId, 1, JSON.stringify({ gameState: newState }));
    } catch (err) {
      setError(`Move failed: ${err}`);
    }
  }, [cooldownUntil, gameState, matchId, myUserId]);

  const leaveMatch = useCallback(() => {
    setMatchId(null);
    setGameState(null);
  }, []);

  const setClientError = useCallback((message: string | null) => {
    setError(message);
  }, []);

  useEffect(() => {
    return () => socketRef.current?.disconnect();
  }, []);

  return {
    gameState,
    gameOver: false,
    matchId,
    myUserId,
    opponentStatus: "connected",
    timeLeft: null,
    enterMatch,
    makeMove,
    leaveMatch,
    setClientError,
    error,
  };
}
