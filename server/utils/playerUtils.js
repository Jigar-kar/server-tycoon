const crypto = require("crypto");
const { players } = require("../state");

const NAME_WORDS = [
  "Nova", "Pixel", "Rex", "Luna", "Echo", "Orbit", "Milo", "Kai",
  "Zed", "Ava", "Nico", "Iris", "Juno", "Flux", "Pip", "Skye",
  "Theo", "Mira", "Rio", "Zara",
];

const SHIRT_COLORS = [
  "#FF6F61", "#0a4575ff", "#26A69A", "#AB47BC", "#FFCA28", "#EF5350",
  "#29B6F6", "#66BB6A", "#FFA726", "#EC407A", "#5C6BC0", "#8D6E63",
];

const PANTS_COLORS = [
  "#1976D2", "#455A64", "#1E88E5", "#546E7A", "#3949AB", "#00897B",
  "#5D4037", "#6D4C41", "#3F51B5", "#2E7D32", "#1565C0", "#4E342E",
];

function randomId() {
  return crypto.randomBytes(8).toString("hex");
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function makePlayerName(requestedName) {
  const base =
    typeof requestedName === "string" && requestedName.trim()
      ? requestedName.trim().slice(0, 18)
      : `${pick(NAME_WORDS)}-${Math.floor(100 + Math.random() * 900)}`;

  const taken = new Set([...players.values()].map((player) => player.name));
  if (!taken.has(base)) return base;

  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function makePlayerProfile(requestedName) {
  return {
    id: randomId(),
    name: makePlayerName(requestedName),
    shirtColor: pick(SHIRT_COLORS),
    pantsColor: pick(PANTS_COLORS),
    x: 0,
    z: 30,
    rotation: 0,
    money: 500,
    dataCount: 0,
    dataMax: 10,
    serverLevel: 1,
    activeServers: 0,
    lastSeen: Date.now(),
  };
}

module.exports = { randomId, pick, makePlayerName, makePlayerProfile };
