const http = require("http");
const path = require("path");
const fs = require("fs");

const { players } = require("./server/state");
const { PORT, HOST, ROOT, STATIC_DIR } = require("./server/config");
const { loadPlayers, savePlayers } = require("./server/core/db");
const { makePlayerProfile } = require("./server/utils/playerUtils");
const { getLeaderboard, getPlayers } = require("./server/core/playerService");
const {
  readBody,
  sendJson,
  sendFile,
  getLocalIpAddress,
} = require("./server/utils/httpUtils");
const blockchain = require("./server/core/blockchain");

const ROOM_CAPACITY = 10;
const ACTIVE_WINDOW_MS = 15000;

function getActivePlayers(now = Date.now()) {
  return [...players.values()].filter(
    (player) => now - player.lastSeen <= ACTIVE_WINDOW_MS,
  );
}

function countPlayersInRoom(roomId, now = Date.now()) {
  return getActivePlayers(now).filter(
    (player) => (player.roomId || "room-1") === roomId,
  ).length;
}

function findAvailableRoomId(now = Date.now()) {
  const roomCounts = new Map();
  getActivePlayers(now).forEach((player) => {
    const roomId = player.roomId || "room-1";
    roomCounts.set(roomId, (roomCounts.get(roomId) || 0) + 1);
  });

  let roomNumber = 1;
  while ((roomCounts.get(`room-${roomNumber}`) || 0) >= ROOM_CAPACITY) {
    roomNumber += 1;
  }
  return `room-${roomNumber}`;
}

function ensurePlayerRoom(player, now = Date.now()) {
  if (
    player.roomId &&
    countPlayersInRoom(player.roomId, now) <= ROOM_CAPACITY
  ) {
    return player.roomId;
  }

  const roomId = findAvailableRoomId(now);
  player.roomId = roomId;
  return roomId;
}

// Initialize Data
loadPlayers();

// Initialize on-chain leaderboard bridge (non-blocking)
blockchain.init().catch((err) => console.error("[Blockchain] Boot error:", err.message));

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/state") {
    const requesterId = url.searchParams.get("id");
    const requester = requesterId ? players.get(requesterId) : null;
    const roomId = requester?.roomId || null;
    const roomPlayers = getPlayers(roomId);

    return sendJson(response, 200, {
      roomId,
      roomCapacity: ROOM_CAPACITY,
      roomPlayers: roomPlayers.length,
      players: roomPlayers,
      leaderboard: getLeaderboard(roomId),
      serverTime: Date.now(),
    });
  }

  // ── GameStore on-chain purchase endpoints ─────────────────────────────────

  // Record a completed purchase on-chain
  if (request.method === "POST" && url.pathname === "/api/record-purchase") {
    try {
      const body = await readBody(request);
      const player = body.playerId ? players.get(body.playerId) : null;
      if (!player) {
        return sendJson(response, 404, { error: "Player not found" });
      }
      blockchain.recordPurchase(
        player.name,
        body.action    || "PURCHASE",
        body.cost      || 0,
        body.balanceAfter ?? player.money
      );
      return sendJson(response, 200, { ok: true, queued: true });
    } catch (err) {
      return sendJson(response, 400, { error: "Invalid payload" });
    }
  }

  // Recent purchase feed (last 20, newest first)
  if (request.method === "GET" && url.pathname === "/api/purchases") {
    return sendJson(response, 200, blockchain.getCachedPurchases());
  }

  // Top spenders (sorted by total in-game $ spent)
  if (request.method === "GET" && url.pathname === "/api/top-spenders") {
    return sendJson(response, 200, blockchain.getCachedTopSpenders());
  }

  // Blockchain status (wallet address, contract address, etc.)
  if (request.method === "GET" && url.pathname === "/api/blockchain-status") {
    return sendJson(response, 200, blockchain.getStatus());
  }

  // Force refresh chain cache
  if (request.method === "POST" && url.pathname === "/api/blockchain-refresh") {
    blockchain.refreshCache().catch(() => {});
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === "POST" && url.pathname === "/api/join") {
    try {
      const body = await readBody(request);
      let player;

      if (body.id && players.has(body.id)) {
        player = players.get(body.id);
        player.lastSeen = Date.now();
        if (body.name && typeof body.name === "string") {
          player.name = body.name.trim().slice(0, 18) || player.name;
        }
        if (
          body.color &&
          typeof body.color === "string" &&
          body.color.startsWith("#")
        ) {
          player.shirtColor = body.color;
        }
        ensurePlayerRoom(player, Date.now());
      } else {
        player = makePlayerProfile(body.name);
        if (body.id) player.id = body.id; // Allow client to resume with their own ID
        if (
          body.color &&
          typeof body.color === "string" &&
          body.color.startsWith("#")
        ) {
          player.shirtColor = body.color;
        }
        player.roomId = findAvailableRoomId(Date.now());
        players.set(player.id, player);
      }

      savePlayers();
      return sendJson(response, 200, player);
    } catch (error) {
      return sendJson(response, 400, { error: "Invalid join payload" });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/update") {
    try {
      const body = await readBody(request);
      const player = players.get(body.id);
      if (!player) {
        return sendJson(response, 404, { error: "Player not found" });
      }

      player.name =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 18)
          : player.name;
      if (typeof body.color === "string" && body.color.startsWith("#"))
        player.shirtColor = body.color;
      if (typeof body.x === "number") player.x = body.x;
      if (typeof body.z === "number") player.z = body.z;
      if (typeof body.rotation === "number") player.rotation = body.rotation;
      if (typeof body.money === "number") player.money = body.money;
      if (typeof body.dataCount === "number") player.dataCount = body.dataCount;
      if (typeof body.dataMax === "number") player.dataMax = body.dataMax;
      if (typeof body.serverLevel === "number")
        player.serverLevel = body.serverLevel;
      if (typeof body.activeServers === "number")
        player.activeServers = body.activeServers;
      if (typeof body.workerCount === "number")
        player.workerCount = body.workerCount;
      player.lastSeen = Date.now();
      ensurePlayerRoom(player, Date.now());

      return sendJson(response, 200, { ok: true });
    } catch (error) {
      return sendJson(response, 400, { error: "Invalid update payload" });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/leave") {
    try {
      const body = await readBody(request);
      if (body.id && players.has(body.id)) {
        players.get(body.id).lastSeen = 0; // Mark offline immediately
        savePlayers();
      }
      return sendJson(response, 200, { ok: true });
    } catch (error) {
      return sendJson(response, 400, { error: "Invalid leave payload" });
    }
  }

  const requestPath = url.pathname === "/" ? "index.html" : url.pathname;
  const resolvedPath = path.resolve(STATIC_DIR, `.${path.sep}${requestPath}`);

  if (
    !resolvedPath.startsWith(STATIC_DIR + path.sep) &&
    resolvedPath !== path.join(STATIC_DIR, "index.html")
  ) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(resolvedPath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    sendFile(response, resolvedPath);
  });
});

setInterval(() => {
  savePlayers();
}, 5000);

server.listen(PORT, HOST, () => {
  const localIpAddress = getLocalIpAddress();
  console.log(
    `Multiplayer server running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`,
  );
  console.log(`Share this on your network: http://${localIpAddress}:${PORT}`);
});
