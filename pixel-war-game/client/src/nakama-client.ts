import { Client, Session, Socket } from "@heroiclabs/nakama-js";

const client = new Client("defaultkey", "localhost", "7350");
client.ssl = false;

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

export async function authenticateUser(
  username: string
): Promise<{ session: Session; socket: Socket }> {
  const session = await client.authenticateDevice(
    Math.random().toString(36).substring(7),
    true,
    username
  );

  const socket = client.createSocket();
  await socket.connect(session);

  return { session, socket };
}

export async function createMatch(socket: Socket): Promise<string> {
  const match = await socket.createMatch();
  return match.match_id;
}

export async function joinMatch(
  socket: Socket,
  matchId: string
): Promise<void> {
  await socket.joinMatch(matchId);
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
