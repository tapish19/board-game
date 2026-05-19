// ============================================================
// Pixel War — Nakama JS Runtime Module
// Authoritative 1000-tile shared grid, unlimited concurrent players
//
// NOTE: Nakama's Goja runtime deep-freezes the global scope after
// module load. Do NOT use module-level mutable variables — even
// object property mutations are blocked. All mutable state must
// live inside match state (passed through match lifecycle fns)
// or be looked up from Nakama's own APIs (matchList, storageRead).
// ============================================================

var TOTAL_TILES          = 1000;
var TICK_RATE            = 10;
var COOLDOWN_TICKS       = 30;    // 3 s at 10 tps
var SAVE_INTERVAL_TICKS  = 50;    // persist every 5 s
var RECENT_ACTIONS_MAX   = 50;
var BROADCAST_RELIABLE   = true;

var OpCode = {
  FULL_STATE:   1,
  CLAIM_TILE:   2,
  TILE_UPDATE:  3,
  ERROR:        4,
  PLAYER_COUNT: 5,
};

var STORAGE_COLLECTION = "pixel_war";
var STORAGE_KEY_TILES  = "tiles";
var SYSTEM_USER_ID     = "00000000-0000-0000-0000-000000000000";
var MATCH_LABEL        = "pixel_war_global";

// ── Helpers ───────────────────────────────────────────────────

function emptyTiles() {
  var t = [];
  for (var i = 0; i < TOTAL_TILES; i++) t.push(null);
  return t;
}

function sendToAll(dispatcher, presences, opcode, payload) {
  if (!presences || presences.length === 0) return;
  dispatcher.broadcastMessage(opcode, JSON.stringify(payload), presences, null, BROADCAST_RELIABLE);
}

function sendToOne(dispatcher, presence, opcode, payload) {
  dispatcher.broadcastMessage(opcode, JSON.stringify(payload), [presence], null, BROADCAST_RELIABLE);
}

function getAllPresences(state) {
  return Object.keys(state.players).map(function(id) {
    return state.players[id].presence;
  });
}

// ── Persistent storage ────────────────────────────────────────

function saveTiles(nk, logger, tiles) {
  try {
    nk.storageWrite([{
      collection:      STORAGE_COLLECTION,
      key:             STORAGE_KEY_TILES,
      userId:          SYSTEM_USER_ID,
      value:           { tiles: tiles },
      permissionRead:  2,
      permissionWrite: 0,
    }]);
  } catch (e) {
    logger.error("saveTiles failed: %v", e);
  }
}

function loadTiles(nk, logger) {
  try {
    var reads = nk.storageRead([{
      collection: STORAGE_COLLECTION,
      key:        STORAGE_KEY_TILES,
      userId:     SYSTEM_USER_ID,
    }]);
    if (reads && reads.length > 0) {
      var raw    = reads[0].value;
      var parsed = (typeof raw === "string") ? JSON.parse(raw) : raw;
      if (parsed && Array.isArray(parsed.tiles) && parsed.tiles.length === TOTAL_TILES) {
        logger.info("Loaded %v claimed tiles from storage", parsed.tiles.filter(Boolean).length);
        return parsed.tiles;
      }
    }
  } catch (e) {
    logger.error("loadTiles failed: %v", e);
  }
  logger.info("Starting with empty board");
  return emptyTiles();
}

// ── RPC: get or create the singleton global match ─────────────
//
// No module-level variable is used here. Instead we call
// nk.matchList on every RPC invocation and look for a live match
// with our label. This is a cheap O(1) server-side lookup.
// If no match is alive (first boot or after a crash), we create one.

function rpcGetGlobalMatch(ctx, logger, nk, payload) {
  // 1. Search for an existing live match with our label
  try {
    var found = nk.matchList(10, true, MATCH_LABEL, null, null, null);
    if (found && found.length > 0) {
      var matchId = found[0].matchId;
      logger.info("Returning existing global match: %v", matchId);
      return JSON.stringify({ matchId: matchId });
    }
  } catch (listErr) {
    logger.warn("matchList error (will create new match): %v", listErr);
  }

  // 2. No live match found — create one
  var newId = nk.matchCreate("pixel_war", {});
  logger.info("Created new global match: %v", newId);
  return JSON.stringify({ matchId: newId });
}

// ── Match lifecycle ───────────────────────────────────────────

function matchInit(ctx, logger, nk, params) {
  var tiles = loadTiles(nk, logger);
  var state = {
    tiles:               tiles,
    players:             {},
    recentActions:       [],
    ticksSinceLastSave:  0,
    totalClaimed:        tiles.filter(Boolean).length,
  };
  logger.info("matchInit: %v tiles already claimed", state.totalClaimed);
  return { state: state, tickRate: TICK_RATE, label: MATCH_LABEL };
}

function matchJoinAttempt(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
  return { state: state, accept: true };
}

function matchJoin(ctx, logger, nk, dispatcher, tick, state, presences) {
  for (var i = 0; i < presences.length; i++) {
    var p    = presences[i];
    var meta = {};
    try {
      var md = p.metadata;
      logger.info("DEBUG metadata type=%v raw=%v", typeof md, JSON.stringify(md));

      if (!md || md === "" || md === "{}") {
        meta = {};
      } else if (typeof md === "string") {
        meta = JSON.parse(md);
      } else if (typeof md === "object") {
        meta = {
          username: String(md.username || md["username"] || ""),
          color:    String(md.color    || md["color"]    || ""),
        };
      }
    } catch (e) {
      logger.error("metadata parse error: %v", e);
      meta = {};
    }
    logger.info("DEBUG resolved username=%v color=%v", meta.username, meta.color);

    state.players[p.userId] = {
      presence:      p,
      username:      meta.username || p.username || ("Player_" + p.userId.slice(0, 6)),
      color:         meta.color    || "#7F77DD",
      lastClaimTick: -COOLDOWN_TICKS,   // ready to claim immediately
    };

    // Send full board state only to the new player
    sendToOne(dispatcher, p, OpCode.FULL_STATE, {
      tiles:       state.tiles,
      recentActions: state.recentActions,
      playerCount: Object.keys(state.players).length,
    });
  }

  // Broadcast updated player count to everyone
  sendToAll(dispatcher, getAllPresences(state), OpCode.PLAYER_COUNT, {
    count: Object.keys(state.players).length,
  });

  return { state: state };
}

function matchLeave(ctx, logger, nk, dispatcher, tick, state, presences) {
  for (var i = 0; i < presences.length; i++) {
    delete state.players[presences[i].userId];
  }
  sendToAll(dispatcher, getAllPresences(state), OpCode.PLAYER_COUNT, {
    count: Object.keys(state.players).length,
  });
  return { state: state };
}

function matchLoop(ctx, logger, nk, dispatcher, tick, state, messages) {
  // ── Process incoming claim messages ───────────────────────
  for (var i = 0; i < messages.length; i++) {
    var msg    = messages[i];
    var player = state.players[msg.sender.userId];
    if (!player)                            continue;
    if (msg.opCode !== OpCode.CLAIM_TILE)   continue;

    // Parse payload
    var data = null;
    try {
      data = JSON.parse(nk.binaryToString(msg.data));
    } catch (_) {
      sendToOne(dispatcher, player.presence, OpCode.ERROR, { message: "Bad message format" });
      continue;
    }

    var pos = data.position;

    // Validate position
    if (typeof pos !== "number" || pos < 0 || pos >= TOTAL_TILES || Math.floor(pos) !== pos) {
      sendToOne(dispatcher, player.presence, OpCode.ERROR, { message: "Invalid tile position" });
      continue;
    }

    // Server-side cooldown check
    var ticksSinceLast = tick - player.lastClaimTick;
    if (ticksSinceLast < COOLDOWN_TICKS) {
      var remainMs = Math.ceil(((COOLDOWN_TICKS - ticksSinceLast) / TICK_RATE) * 1000);
      sendToOne(dispatcher, player.presence, OpCode.ERROR, {
        message:    "Cooldown active",
        cooldownMs: remainMs,
      });
      continue;
    }

    // Prevent reclaiming own tile
    var existing = state.tiles[pos];
    if (existing && existing.userId === msg.sender.userId) {
      sendToOne(dispatcher, player.presence, OpCode.ERROR, { message: "Tile already yours" });
      continue;
    }

    // Apply claim
    var newTile = {
      userId:    msg.sender.userId,
      username:  player.username,
      color:     player.color,
      timestamp: Date.now(),
    };

    if (!state.tiles[pos]) state.totalClaimed++;
    state.tiles[pos]       = newTile;
    player.lastClaimTick   = tick;

    var action = {
      username:  player.username,
      color:     player.color,
      position:  pos,
      timestamp: newTile.timestamp,
    };
    state.recentActions.unshift(action);
    if (state.recentActions.length > RECENT_ACTIONS_MAX) {
      state.recentActions.length = RECENT_ACTIONS_MAX;
    }

    // Broadcast delta to all connected players
    sendToAll(dispatcher, getAllPresences(state), OpCode.TILE_UPDATE, {
      position:     pos,
      tile:         newTile,
      recentAction: action,
      totalClaimed: state.totalClaimed,
    });
  }

  // ── Periodic autosave ─────────────────────────────────────
  state.ticksSinceLastSave++;
  if (state.ticksSinceLastSave >= SAVE_INTERVAL_TICKS) {
    state.ticksSinceLastSave = 0;
    saveTiles(nk, logger, state.tiles);
  }

  return { state: state };
}

function matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
  saveTiles(nk, logger, state.tiles);
  logger.info("Match terminated — tiles saved");
  return { state: state };
}

function matchSignal(ctx, logger, nk, dispatcher, tick, state, data) {
  return { state: state, data: "" };
}

// ── Module init ───────────────────────────────────────────────

function InitModule(ctx, logger, nk, initializer) {
  initializer.registerMatch("pixel_war", {
    matchInit:        matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin:        matchJoin,
    matchLeave:       matchLeave,
    matchLoop:        matchLoop,
    matchTerminate:   matchTerminate,
    matchSignal:      matchSignal,
  });

  initializer.registerRpc("get_global_match", rpcGetGlobalMatch);

  // Pre-create the singleton match on startup.
  // Uses a local var — no module-scope mutation.
  try {
    var preId = nk.matchCreate("pixel_war", {});
    logger.info("Pre-created global match: %v", preId);
  } catch (e) {
    logger.warn("Could not pre-create match (will create on first RPC call): %v", e);
  }

  logger.info("Pixel War module loaded");
}

globalThis.InitModule = InitModule;

