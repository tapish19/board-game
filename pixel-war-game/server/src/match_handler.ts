// match_handler.ts
// Server-authoritative Pixel War match handler for Nakama runtime

const TICK_RATE = 5; // 5 ticks per second
const TOTAL_TILES = 1000;

// Op-codes for client <-> server messages
const OpCode = {
  GAME_STATE: 1,
  MAKE_MOVE: 2,
  TILE_CLAIMED: 3,
  ERROR: 6,
} as const;

interface Tile {
  userId: string;
  username: string;
  color: string;
  timestamp: number;
}

interface RecentAction {
  username: string;
  color: string;
  position: number;
  timestamp: number;
}

interface PlayerInfo {
  userId: string;
  username: string;
  color: string;
  presence: nkruntime.Presence;
  lastMoveTime: number;
}

interface MatchState {
  tiles: (Tile | null)[];
  recentActions: RecentAction[];
  players: Record<string, PlayerInfo>;
}

function buildGameStatePayload(state: MatchState) {
  return {
    gameState: {
      tiles: state.tiles,
      recentActions: state.recentActions,
    }
  };
}

function sendToAll(
  dispatcher: nkruntime.MatchDispatcher,
  presences: nkruntime.Presence[],
  opcode: number,
  payload: object
) {
  dispatcher.broadcastMessage(opcode, JSON.stringify(payload), presences, null, true);
}

function sendToOne(
  dispatcher: nkruntime.MatchDispatcher,
  presence: nkruntime.Presence,
  opcode: number,
  payload: object
) {
  dispatcher.broadcastMessage(opcode, JSON.stringify(payload), [presence], null, true);
}

function generatePlayerColor(userId: string): string {
  const colors = [
    "#7F77DD",
    "#1D9E75",
    "#D85A30",
    "#D4537E",
    "#378ADD",
    "#639922",
    "#BA7517",
    "#E24B4A",
  ];
  
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash;
  }
  
  return colors[Math.abs(hash) % colors.length];
}

export const matchInit: nkruntime.MatchInitFunction<MatchState> = (
  ctx, logger, nk, params
) => {
  logger.info("Pixel War match initialized");

  const state: MatchState = {
    tiles: Array(TOTAL_TILES).fill(null),
    recentActions: [],
    players: {},
  };

  return { state, tickRate: TICK_RATE, label: "pixel-war" };
};

export const matchJoinAttempt: nkruntime.MatchJoinAttemptFunction<MatchState> = (
  ctx, logger, nk, dispatcher, tick, state, presence, metadata
) => {
  return { state, accept: true };
};

export const matchJoin: nkruntime.MatchJoinFunction<MatchState> = (
  ctx, logger, nk, dispatcher, tick, state, presences
) => {
  for (const presence of presences) {
    if (!state.players[presence.userId]) {
      const color = generatePlayerColor(presence.userId);
      
      state.players[presence.userId] = {
        userId: presence.userId,
        username: presence.username,
        color,
        presence,
        lastMoveTime: 0,
      };
      
      logger.info("Player %v joined the grid game", presence.username);
    } else {
      state.players[presence.userId].presence = presence;
      logger.info("Player %v reconnected", presence.username);
    }
  }

  sendToAll(dispatcher, presences, OpCode.GAME_STATE, buildGameStatePayload(state));

  return { state };
};

export const matchLeave: nkruntime.MatchLeaveFunction<MatchState> = (
  ctx, logger, nk, dispatcher, tick, state, presences
) => {
  for (const presence of presences) {
    logger.info("Player %v left the game", presence.username);
  }
  return { state };
};

export const matchLoop: nkruntime.MatchLoopFunction<MatchState> = (
  ctx, logger, nk, dispatcher, tick, state, messages
) => {
  for (const msg of messages) {
    const player = state.players[msg.sender.userId];
    if (!player) continue;

    if (msg.opCode === OpCode.GAME_STATE || msg.opCode === OpCode.MAKE_MOVE) {
      let data: { gameState?: { tiles: (Tile | null)[], recentActions: RecentAction[] }, position?: number };
      try {
        data = JSON.parse(nk.binaryToString(msg.data));
      } catch {
        sendToOne(dispatcher, player.presence, OpCode.ERROR, { message: "Invalid message format" });
        continue;
      }

      if (data.gameState) {
        const { tiles, recentActions } = data.gameState;
        
        if (Array.isArray(tiles) && tiles.length === TOTAL_TILES) {
          tiles.forEach((tile, idx) => {
            if (tile && tile.userId === player.userId) {
              if (!state.tiles[idx] || state.tiles[idx]!.userId === player.userId) {
                state.tiles[idx] = tile;
              }
            }
          });
          
          if (Array.isArray(recentActions)) {
            const newActions = recentActions.filter(a => a.username === player.username);
            state.recentActions = [...newActions, ...state.recentActions].slice(0, 50);
          }

          const allPresences = Object.values(state.players).map(p => p.presence);
          sendToAll(dispatcher, allPresences, OpCode.GAME_STATE, buildGameStatePayload(state));
          
          logger.info("Player %v updated game state", player.username);
        }
      }
    }
  }

  return { state };
};

export const matchTerminate: nkruntime.MatchTerminateFunction<MatchState> = (
  ctx, logger, nk, dispatcher, tick, state, graceSeconds
) => {
  logger.info("Pixel War match terminating with %d grace seconds", graceSeconds);
  return { state };
};

export const matchSignal: nkruntime.MatchSignalFunction<MatchState> = (
  ctx, logger, nk, dispatcher, tick, state
) => {
  return { state, data: "" };
};
