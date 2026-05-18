// nakama-client.ts — Pixel War singleton board client
import { Client } from "@heroiclabs/nakama-js";
import type { Session, Socket } from "@heroiclabs/nakama-js";

// ── Connection config ─────────────────────────────────────────
function resolveConfig() {
  const rawHost = (import.meta.env.VITE_NAKAMA_HOST ?? "").trim() || "127.0.0.1";
  const port = import.meta.env.VITE_NAKAMA_PORT ?? "7350";
  const envSsl = import.meta.env.VITE_NAKAMA_SSL;
  const ssl = envSsl === "true" || (window.location.protocol === "https:" && envSsl !== "false");
  const serverKey = import.meta.env.VITE_NAKAMA_SERVER_KEY ?? import.meta.env.VITE_NAKAMA_KEY ?? "defaultkey";
  return { host: rawHost, port, ssl, serverKey };
}

const cfg = resolveConfig();
const client = new Client(cfg.serverKey, cfg.host, cfg.port, cfg.ssl);

// ── Shared state ─────────────────────────────────────────────
let session: Session | null = null;
let socket: Socket | null = null;

const SESSION_KEY = "pixel-war-session";
const DEVICE_KEY  = "pixel-war-device-id";
const COLOR_KEY   = "pixel-war-color";
const NAME_KEY    = "pixel-war-username";

// ── Types ─────────────────────────────────────────────────────
export interface Tile {
  userId:    string;
  username:  string;
  color:     string;
  timestamp: number;
}

export interface RecentAction {
  username:  string;
  color:     string;
  position:  number;
  timestamp: number;
}

export interface GameState {
  tiles:         (Tile | null)[];
  recentActions: RecentAction[];
  playerCount:   number;
  totalClaimed:  number;
}

export const OpCode = {
  FULL_STATE:   1,
  CLAIM_TILE:   2,
  TILE_UPDATE:  3,
  ERROR:        4,
  PLAYER_COUNT: 5,
} as const;

export const TOTAL_TILES = 1000;

// ── Local prefs ────────────────────────────────────────────────
export function getSavedUsername(): string {
  return localStorage.getItem(NAME_KEY) ?? "";
}
export function getSavedColor(): string {
  return localStorage.getItem(COLOR_KEY) ?? randomColor();
}
export function savePrefs(username: string, color: string) {
  localStorage.setItem(NAME_KEY, username);
  localStorage.setItem(COLOR_KEY, color);
}

function randomColor(): string {
  const palette = [
    "#e05252","#e07b52","#e0c452","#7de052","#52c4e0",
    "#527be0","#a352e0","#e052a3","#52e0a3","#e05299",
  ];
  return palette[Math.floor(Math.random() * palette.length)];
}

// ── Auth ──────────────────────────────────────────────────────
function getOrCreateDeviceId(): string {
  const stored = localStorage.getItem(DEVICE_KEY);
  if (stored) return stored;
  const id = `device-${crypto.randomUUID()}`;
  localStorage.setItem(DEVICE_KEY, id);
  return id;
}

function toSession(raw: any): Session {
  return {
    token:    raw.token,
    user_id:  raw.user_id,
    username: raw.username,
    exp:      raw.exp,
    isexpired(now: number) { return now >= raw.exp; },
  };
}

export function getCachedSession(): Session | null {
  if (session) return session;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    session = toSession(JSON.parse(raw));
    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export async function authenticate(username: string): Promise<Session> {
  const s = await client.authenticateDevice(getOrCreateDeviceId(), false, username);
  session = toSession(s);
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  return session;
}

// ── Socket ────────────────────────────────────────────────────
export async function openSocket(): Promise<Socket> {
  if (socket) return socket;
  const s = getCachedSession();
  if (!s) throw new Error("Not authenticated");
  socket = client.createSocket(cfg.ssl, false);
  await socket.connect(s, true);
  return socket;
}

export function getSocket(): Socket | null { return socket; }
export function getSession(): Session | null { return getCachedSession(); }

export function closeSocket() {
  if (socket) {
    socket.ondisconnect = () => {};
    socket.disconnect();
  }
  socket = null;
}

// ── Global match ──────────────────────────────────────────────
export async function getGlobalMatchId(): Promise<string> {
  const s = getCachedSession();
  if (!s) throw new Error("Not authenticated");

  // client.rpc sends the session JWT — no CORS issues, no http_key needed
  const result = await client.rpc(s, "get_global_match", "");
  const payload = typeof result.payload === "string"
    ? JSON.parse(result.payload)
    : result.payload;
  return payload.matchId as string;
}

// ── Join board ────────────────────────────────────────────────
export async function joinBoard(
  matchId: string,
  username: string,
  color: string
): Promise<void> {
  const sock = await openSocket();
  // Pass username + color as metadata so the server can read them in matchJoin
  // Pass as a plain object — Nakama Go server expects a JSON object, not a JSON string.
  await sock.joinMatch(matchId, undefined, { username, color });
}

// ── Claim tile ────────────────────────────────────────────────
export async function claimTile(matchId: string, position: number): Promise<void> {
  if (!socket) throw new Error("Not connected");
  await socket.sendMatchState(matchId, OpCode.CLAIM_TILE, JSON.stringify({ position }));
}

// ── Initial empty game state ──────────────────────────────────
export function createInitialGameState(): GameState {
  return {
    tiles:         Array(TOTAL_TILES).fill(null),
    recentActions: [],
    playerCount:   0,
    totalClaimed:  0,
  };
}

