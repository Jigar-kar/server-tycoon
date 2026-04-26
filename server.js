const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

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

  if (url.pathname.startsWith("/socket.io/")) {
    return;
  }

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, ngrok-skip-browser-warning",
    });
    response.end();
    return;
  }

  // ── GameStore on-chain purchase endpoints ─────────────────────────────────

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

  if (request.method === "GET" && url.pathname === "/api/purchases") {
    return sendJson(response, 200, blockchain.getCachedPurchases());
  }

  if (request.method === "GET" && url.pathname === "/api/top-spenders") {
    return sendJson(response, 200, blockchain.getCachedTopSpenders());
  }

  if (request.method === "GET" && url.pathname === "/api/blockchain-status") {
    return sendJson(response, 200, blockchain.getStatus());
  }

  if (request.method === "POST" && url.pathname === "/api/blockchain-refresh") {
    blockchain.refreshCache().catch(() => {});
    return sendJson(response, 200, { ok: true });
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

// --- SOCKET.IO IMPLEMENTATION ---
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  socket.on("join", (body, callback) => {
    try {
      let player;
      if (body.id && players.has(body.id)) {
        player = players.get(body.id);
        player.lastSeen = Date.now();
        if (body.name && typeof body.name === "string") {
          player.name = body.name.trim().slice(0, 18) || player.name;
        }
        if (body.color && typeof body.color === "string" && body.color.startsWith("#")) {
          player.shirtColor = body.color;
        }
        ensurePlayerRoom(player, Date.now());
      } else {
        player = makePlayerProfile(body.name);
        if (body.id) player.id = body.id;
        if (body.color && typeof body.color === "string" && body.color.startsWith("#")) {
          player.shirtColor = body.color;
        }
        player.roomId = findAvailableRoomId(Date.now());
        players.set(player.id, player);
      }
      player.socketId = socket.id;
      savePlayers();
      
      socket.join(player.roomId);
      if (callback) callback({ ok: true, player });
    } catch (err) {
      if (callback) callback({ error: "Invalid join payload" });
    }
  });

  socket.on("update", (body) => {
    const player = players.get(body.id);
    if (!player) return;

    player.name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 18) : player.name;
    if (typeof body.color === "string" && body.color.startsWith("#")) player.shirtColor = body.color;
    if (typeof body.x === "number") player.x = body.x;
    if (typeof body.z === "number") player.z = body.z;
    if (typeof body.rotation === "number") player.rotation = body.rotation;
    if (typeof body.money === "number") player.money = body.money;
    if (typeof body.dataCount === "number") player.dataCount = body.dataCount;
    if (typeof body.dataMax === "number") player.dataMax = body.dataMax;
    if (typeof body.serverLevel === "number") player.serverLevel = body.serverLevel;
    if (typeof body.activeServers === "number") player.activeServers = body.activeServers;
    if (typeof body.workerCount === "number") player.workerCount = body.workerCount;
    player.lastSeen = Date.now();
    ensurePlayerRoom(player, Date.now());
  });

  socket.on("leave", (body) => {
    if (body.id && players.has(body.id)) {
      players.get(body.id).lastSeen = 0;
      savePlayers();
    }
  });

  socket.on("disconnect", () => {
    for (let [id, player] of players.entries()) {
      if (player.socketId === socket.id) {
        player.lastSeen = 0;
        break;
      }
    }
  });
});

// Fixed tick rate to broadcast state to rooms (20 times a second)
const TICK_RATE = 1000 / 20;
setInterval(() => {
  const roomStates = {};
  
  // Group players by room
  for (let player of getPlayers()) {
    if (!player.roomId) continue;
    if (!roomStates[player.roomId]) {
      roomStates[player.roomId] = {
        roomId: player.roomId,
        roomCapacity: ROOM_CAPACITY,
        players: [],
        leaderboard: getLeaderboard(player.roomId)
      };
    }
    roomStates[player.roomId].players.push(player);
  }

  // Emit to each room
  for (let roomId in roomStates) {
    roomStates[roomId].roomPlayers = roomStates[roomId].players.length;
    roomStates[roomId].serverTime = Date.now();
    io.to(roomId).emit("stateUpdate", roomStates[roomId]);
  }
}, TICK_RATE);

setInterval(() => {
  savePlayers();
}, 5000);

server.listen(PORT, HOST, () => {
  const localIpAddress = getLocalIpAddress();
  console.log(`Multiplayer server running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`Share this on your network: http://${localIpAddress}:${PORT}`);
});
