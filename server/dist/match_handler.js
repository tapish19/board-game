"use strict";
// match_handler.ts
// Server-authoritative Pixel War match handler for Nakama runtime
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchSignal = exports.matchTerminate = exports.matchLoop = exports.matchLeave = exports.matchJoin = exports.matchJoinAttempt = exports.matchInit = void 0;
const TICK_RATE = 5; // 5 ticks per second
const TOTAL_TILES = 1000;
const MOVE_COOLDOWN_MS = 3000;
// Op-codes for client <-> server messages
const OpCode = {
    GAME_STATE: 1,
    MAKE_MOVE: 2,
    TILE_CLAIMED: 3,
    ERROR: 6,
};
function buildGameStatePayload(state) {
    return {
        gameState: {
            tiles: state.tiles,
            recentActions: state.recentActions,
        }
    };
}
function sendToAll(dispatcher, presences, opcode, payload) {
    dispatcher.broadcastMessage(opcode, JSON.stringify(payload), presences, null, true);
}
function sendToOne(dispatcher, presence, opcode, payload) {
    dispatcher.broadcastMessage(opcode, JSON.stringify(payload), [presence], null, true);
}
function generatePlayerColor(userId) {
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
const matchInit = (ctx, logger, nk, params) => {
    logger.info("Pixel War match initialized");
    const state = {
        tiles: Array(TOTAL_TILES).fill(null),
        recentActions: [],
        players: {},
    };
    return { state, tickRate: TICK_RATE, label: "pixel-war" };
};
exports.matchInit = matchInit;
const matchJoinAttempt = (ctx, logger, nk, dispatcher, tick, state, presence, metadata) => {
    return { state, accept: true };
};
exports.matchJoinAttempt = matchJoinAttempt;
const matchJoin = (ctx, logger, nk, dispatcher, tick, state, presences) => {
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
        }
        else {
            state.players[presence.userId].presence = presence;
            logger.info("Player %v reconnected", presence.username);
        }
    }
    sendToAll(dispatcher, presences, OpCode.GAME_STATE, buildGameStatePayload(state));
    return { state };
};
exports.matchJoin = matchJoin;
const matchLeave = (ctx, logger, nk, dispatcher, tick, state, presences) => {
    for (const presence of presences) {
        logger.info("Player %v left the game", presence.username);
    }
    return { state };
};
exports.matchLeave = matchLeave;
const matchLoop = (ctx, logger, nk, dispatcher, tick, state, messages) => {
    for (const msg of messages) {
        const player = state.players[msg.sender.userId];
        if (!player)
            continue;
        if (msg.opCode === OpCode.MAKE_MOVE) {
            let data;
            try {
                data = JSON.parse(nk.binaryToString(msg.data));
            }
            catch {
                sendToOne(dispatcher, player.presence, OpCode.ERROR, { message: "Invalid message format" });
                continue;
            }
            const idx = data.position;
            if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= TOTAL_TILES) {
                sendToOne(dispatcher, player.presence, OpCode.ERROR, { message: "Invalid tile position" });
                continue;
            }
            const now = Date.now();
            if (now - player.lastMoveTime < MOVE_COOLDOWN_MS) {
                sendToOne(dispatcher, player.presence, OpCode.ERROR, { message: "Move cooldown active" });
                continue;
            }
            const existingTile = state.tiles[idx];
            if (existingTile && existingTile.userId !== player.userId) {
                sendToOne(dispatcher, player.presence, OpCode.ERROR, { message: "Tile already claimed" });
                continue;
            }
            const tile = {
                userId: player.userId,
                username: player.username,
                color: player.color,
                timestamp: now,
            };
            state.tiles[idx] = tile;
            player.lastMoveTime = now;
            const action = {
                username: player.username,
                color: player.color,
                position: idx,
                timestamp: now,
            };
            state.recentActions = [action, ...state.recentActions].slice(0, 50);
            const allPresences = Object.values(state.players).map((p) => p.presence);
            sendToAll(dispatcher, allPresences, OpCode.GAME_STATE, buildGameStatePayload(state));
            logger.info("Player %v claimed tile %v", player.username, idx);
        }
    }
    return { state };
};
exports.matchLoop = matchLoop;
const matchTerminate = (ctx, logger, nk, dispatcher, tick, state, graceSeconds) => {
    logger.info("Pixel War match terminating with %d grace seconds", graceSeconds);
    return { state };
};
exports.matchTerminate = matchTerminate;
const matchSignal = (ctx, logger, nk, dispatcher, tick, state) => {
    return { state, data: "" };
};
exports.matchSignal = matchSignal;
