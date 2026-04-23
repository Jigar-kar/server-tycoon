const fs = require("fs");
const path = require("path");
const { players } = require("../state");
const { ROOT } = require("../config");

const dataFile = path.join(ROOT, "playersData.json");

function loadPlayers() {
  if (fs.existsSync(dataFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
      for (const [id, player] of Object.entries(data)) {
        players.set(id, player);
      }
    } catch (e) {
      console.error("Failed to load players data", e);
    }
  }
}

function savePlayers() {
  fs.writeFileSync(dataFile, JSON.stringify(Object.fromEntries(players)), "utf-8");
}

module.exports = { loadPlayers, savePlayers };
