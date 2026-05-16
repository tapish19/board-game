import { useState, useCallback, useEffect, useRef } from "react";
import type { Socket, Session } from "@heroiclabs/nakama-js";
import {
  authenticateUser,
  createMatch,
  joinMatch,
  createInitialGameState,
  updateGameStateWithMove,
  type GameState,
  type MatchData,
} from "./nakama-client";

const COOLDOWN_MS = 3000; // 3 second cooldown between moves

export function useGame(playerColor: string) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const currentMatchIdRef = useRef<string | null>(null);

  const connect = useCallback(async (user: string) => {
    try {
      setError(null);
      const { session, socket } = await authenticateUser(user);

      sessionRef.current = session;
      socketRef.current = socket;
      setUserId(session.user_id);
      setUsername(session.username);
      setIsConnected(true);

      socket.onmatchdata = (matchData) => {
        const data = JSON.parse(
          new TextDecoder().decode(matchData.data)
        ) as MatchData;
        if (data.gameState) {
          setGameState(data.gameState);
        }
      };

      return socket;
    } catch (err) {
      setError(`Connection failed: ${err}`);
      throw err;
    }
  }, []);

  const createNewMatch = useCallback(async (): Promise<string> => {
    const socket = socketRef.current;
    if (!socket) throw new Error("Not connected");

    try {
      const matchId = await createMatch(socket);
      currentMatchIdRef.current = matchId;

      const initialState = createInitialGameState();
      setGameState(initialState);

      const data: MatchData = { gameState: initialState };
      await socket.sendMatchState(
        matchId,
        1,
        JSON.stringify(data)
      );

      return matchId;
    } catch (err) {
      setError(`Failed to create match: ${err}`);
      throw err;
    }
  }, []);

  const joinExistingMatch = useCallback(async (matchId: string) => {
    const socket = socketRef.current;
    if (!socket) throw new Error("Not connected");

    try {
      await joinMatch(socket, matchId);
      currentMatchIdRef.current = matchId;
    } catch (err) {
      setError(`Failed to join match: ${err}`);
      throw err;
    }
  }, []);

  const makeMove = useCallback(
    async (position: number) => {
      const socket = socketRef.current;
      const matchId = currentMatchIdRef.current;
      const user = username;
      const uid = userId;

      if (!socket || !matchId || !gameState || !user || !uid) {
        return;
      }

      if (Date.now() < cooldownUntil) {
        return;
      }

      try {
        const newState = updateGameStateWithMove(
          gameState,
          position,
          uid,
          user,
          playerColor
        );

        setGameState(newState);
        setCooldownUntil(Date.now() + COOLDOWN_MS);

        const data: MatchData = { gameState: newState };
        await socket.sendMatchState(matchId, 1, JSON.stringify(data));
      } catch (err) {
        setError(`Move failed: ${err}`);
      }
    },
    [gameState, username, userId, playerColor, cooldownUntil]
  );

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return {
    gameState,
    isConnected,
    error,
    userId,
    username,
    cooldownUntil,
    makeMove,
    connect,
    createNewMatch,
    joinExistingMatch,
  };
}
