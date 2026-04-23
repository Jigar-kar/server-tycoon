const { players } = require("../state");

const ACTIVE_WINDOW_MS = 15000;

function toPublicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    money: player.money,
    shirtColor: player.shirtColor,
    pantsColor: player.pantsColor,
    x: player.x,
    z: player.z,
    rotation: player.rotation,
    dataCount: player.dataCount,
    dataMax: player.dataMax,
    serverLevel: player.serverLevel,
    activeServers: player.activeServers,
    roomId: player.roomId || "room-1",
    lastSeen: player.lastSeen,
  };
}

function getLeaderboard(roomId) {
  const now = Date.now();
  return [...players.values()]
    .filter((player) => now - player.lastSeen <= ACTIVE_WINDOW_MS)
    .filter((player) => !roomId || (player.roomId || "room-1") === roomId)
    .sort((a, b) => b.money - a.money || b.lastSeen - a.lastSeen)
    .slice(0, 10)
    .map((player, index) => {
      const publicPlayer = toPublicPlayer(player);
      return {
        rank: index + 1,
        ...publicPlayer,
      };
    });
}

function getPlayers(roomId) {
  const now = Date.now();
  return [...players.values()]
    .filter((player) => now - player.lastSeen <= ACTIVE_WINDOW_MS)
    .filter((player) => !roomId || (player.roomId || "room-1") === roomId)
    .map((player) => toPublicPlayer(player));
}

module.exports = { getLeaderboard, getPlayers };
