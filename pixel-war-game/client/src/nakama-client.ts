import { Client } from "@heroiclabs/nakama-js";
import type { Session, Socket } from "@heroiclabs/nakama-js";

function resolveConnectionConfig() {
  const rawHost = (import.meta.env.VITE_NAKAMA_HOST ?? window.location.hostname).trim();
  const envPort = import.meta.env.VITE_NAKAMA_PORT;

  if (rawHost.includes("://")) {
    const parsed = new URL(rawHost);
    return {
      host: parsed.hostname,
      port: envPort ?? (parsed.port || (parsed.protocol === "https:" ? "443" : "80")),
      ssl: parsed.protocol === "https:",
    };
  }

  return {
    host: rawHost,
    port: envPort ?? "7350",
    ssl: (window.location.protocol === "https:"),
  };
}

const { host, port, ssl } = resolveConnectionConfig();
const serverKey = import.meta.env.VITE_NAKAMA_SERVER_KEY ?? "defaultkey";

const envSsl = import.meta.env.VITE_NAKAMA_SSL;
const isPageHttps = window.location.protocol === "https:";
// Never use insecure HTTP on an HTTPS page (avoids mixed-content failures in browsers).
const useSsl = envSsl !== undefined
  ? envSsl === "true" || (isPageHttps && envSsl !== "true")
  : (ssl || isPageHttps);

const client = new Client(serverKey, host, port, useSsl);

const SESSION_STORAGE_KEY = "pixel-war-session";
const DEVICE_ID_STORAGE_KEY = "pixel-war-device-id";

let socket: Socket | null = null;
let session: Session | null = null;

export interface Tile {
  userId: string;
  username: string;
  color: string;
  timestamp: number;
}

export interface RecentAction {
  username: string;
  color: string;
  position: number;
  timestamp: number;
}

export interface GameState {
  tiles: (Tile | null)[];
  recentActions: RecentAction[];
}

export interface MatchData {
  gameState: GameState;
}

const TOTAL_TILES = 1000;

function getOrCreateDeviceId(): string {
  const stored = localStorage.getItem(DEVICE_ID_STORAGE_KEY)?.trim();
  if (stored) return stored;

  const generated = `device-${crypto.randomUUID()}`;
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
  return generated;
}

export function getSession(): Session | null {
  if (session) return session;

  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    session = JSON.parse(raw) as Session;
    return session;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export async function authenticateDevice(username?: string): Promise<Session> {
  const newSession = await client.authenticateDevice(getOrCreateDeviceId(), true, username);
  session = newSession;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
  return newSession;
}

export async function openSocket(): Promise<Socket> {
  if (socket) return socket;

  const activeSession = getSession() ?? (await authenticateDevice());
  socket = client.createSocket();
  await socket.connect(activeSession, true);
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export async function findMatch(mode: "classic" | "timed"): Promise<void> {
  const activeSocket = await openSocket();
  const query = `+properties.mode:${mode}`;
  await activeSocket.addMatchmaker(query, 2, 2, {
    mode,
  });
}

export async function createRoom(mode: "classic" | "timed"): Promise<string> {
  const activeSocket = await openSocket();
  const match = await activeSocket.createMatch({ mode });
  return match.match_id;
}

export async function authenticateUser(
  username: string
): Promise<{ session: Session; socket: Socket }> {
  const newSession = await authenticateDevice(username);
  const activeSocket = await openSocket();
  return { session: newSession, socket: activeSocket };
}

export async function createMatch(activeSocket: Socket): Promise<string> {
  const match = await activeSocket.createMatch();
  return match.match_id;
}

export async function joinMatch(
  activeSocket: Socket,
  matchId: string
): Promise<void> {
  await activeSocket.joinMatch(matchId);
}

export function createInitialGameState(): GameState {
  return {
    tiles: Array(TOTAL_TILES).fill(null),
    recentActions: [],
  };
}

export function updateGameStateWithMove(
  state: GameState,
  position: number,
  userId: string,
  username: string,
  color: string
): GameState {
  const newTiles = [...state.tiles];
  const tile: Tile = {
    userId,
    username,
    color,
    timestamp: Date.now(),
  };
  newTiles[position] = tile;

  const newAction: RecentAction = {
    username,
    color,
    position,
    timestamp: Date.now(),
  };

  const newActions = [newAction, ...state.recentActions].slice(0, 50);

  return {
    tiles: newTiles,
    recentActions: newActions,
  };
}

export { client };


export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface PlayerStats {
  wins: number;
  losses: number;
  draws: number;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  return [];
}

export async function getMyStats(): Promise<PlayerStats> {
  return { wins: 0, losses: 0, draws: 0 };
}
