import {
  initChainStore,
  recordPurchaseOnChain,
  refreshChainLeaderboard,
} from "./js/chain-store.js";
import {
  createPurchaseZone,
  createServer,
  unlockServer,
  updateServerUI,
} from "./js/factory.js";
import { createGlowHalo, createGrassTexture } from "./js/graphics.js";
import { createHuman, updateCharacterAnim } from "./js/human.js";
import {
  joinMultiplayer,
  pullMultiplayerState,
  pushMultiplayerState,
  removeRemotePlayer,
  syncRemotePlayers,
} from "./js/network.js";
import { addCollider, checkCollision, checkPacketSpawn } from "./js/physics.js";
import {
  createNameTag,
  escapeHtml,
  renderLeaderboard,
  setMultiplayerStatus,
  spawnFloatingText,
  syncHTMLOverlays,
  syncWorldLabel,
  updateMinimap,
  updateUI,
} from "./js/ui.js";
import { hireWorker } from "./js/worker.js";

import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";

const forceNewGame = sessionStorage.getItem("forceNewGame") === "1";
const autoStartNewGame = sessionStorage.getItem("autoStartNewGame") === "1";
if (forceNewGame) {
  localStorage.removeItem("gameState");
  localStorage.removeItem("tycoonMap");
  sessionStorage.removeItem("forceNewGame");
}

const savedState = JSON.parse(localStorage.getItem("gameState") || "{}");

const state = {
  money: savedState.money ?? 500,
  dataMax: savedState.dataMax ?? 10,
  dataCount: savedState.dataCount ?? 0,
  playerSpeed: savedState.playerSpeed ?? 30,
  globalWorkerSpeed: savedState.globalWorkerSpeed ?? 20,
  globalWorkerMax: savedState.globalWorkerMax ?? 1,
  activeServers: savedState.activeServers ?? 0,
  serverLevel: savedState.serverLevel ?? 1,
  workerCount: savedState.workerCount ?? 0,
  powerUpLevels: savedState.powerUpLevels ?? {},
  activePowerUps: savedState.activePowerUps ?? {},
};

if (!state.powerUpLevels || typeof state.powerUpLevels !== "object") {
  state.powerUpLevels = {};
}
if (!state.activePowerUps || typeof state.activePowerUps !== "object") {
  state.activePowerUps = {};
}

const powerUpCatalog = {
  speed: {
    id: "speed",
    title: "Nitro Shoes",
    baseCost: 220,
    costScale: 1.7,
    multiplier: 1.45,
    durationSec: 90,
    desc: "Move faster for a short time.",
  },
  income: {
    id: "income",
    title: "Turbo Contracts",
    baseCost: 300,
    costScale: 1.75,
    multiplier: 2.0,
    durationSec: 80,
    desc: "Double server cash payout.",
  },
  magnate: {
    id: "magnate",
    title: "Magnate Mode",
    baseCost: 420,
    costScale: 1.9,
    multiplier: 5,
    durationSec: 70,
    desc: "Multiply income by 5x. Stacks with Turbo Contracts!",
  },
  overclock: {
    id: "overclock",
    title: "Quantum Overclock",
    baseCost: 360,
    costScale: 1.85,
    multiplier: 0.65,
    durationSec: 75,
    desc: "Servers process faster.",
  },
};

function getPowerUpLevel(powerUpId) {
  return state.powerUpLevels[powerUpId] ?? 0;
}

function getPowerUpCost(powerUpId) {
  const cfg = powerUpCatalog[powerUpId];
  if (!cfg) return Number.MAX_SAFE_INTEGER;
  return Math.floor(
    cfg.baseCost * Math.pow(cfg.costScale, getPowerUpLevel(powerUpId)),
  );
}

function getPowerUpRemainingMs(powerUpId) {
  const active = state.activePowerUps[powerUpId];
  if (!active || !active.expiresAt) return 0;
  return Math.max(0, active.expiresAt - Date.now());
}

function isPowerUpActive(powerUpId) {
  return getPowerUpRemainingMs(powerUpId) > 0;
}

function clearExpiredPowerUps() {
  Object.keys(powerUpCatalog).forEach((powerUpId) => {
    if (state.activePowerUps[powerUpId] && !isPowerUpActive(powerUpId)) {
      delete state.activePowerUps[powerUpId];
    }
  });
}

function getEffectivePlayerSpeed() {
  const speedBoost = isPowerUpActive("speed")
    ? powerUpCatalog.speed.multiplier
    : 1;
  return state.playerSpeed * speedBoost;
}

function getEffectiveIncomeMultiplier() {
  let multiplier = 1;
  if (isPowerUpActive("income")) {
    multiplier *= powerUpCatalog.income.multiplier;
  }
  if (isPowerUpActive("magnate")) {
    multiplier *= powerUpCatalog.magnate.multiplier;
  }
  return multiplier;
}

function getEffectiveProcessSpeedMultiplier() {
  return isPowerUpActive("overclock") ? powerUpCatalog.overclock.multiplier : 1;
}

const pads = [];
const servers = [];
const dataPackets = [];
const workers = [];
const colliders = [];

const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:";
// Set your active ngrok URL here before uploading to itch.io!
// Example: "https://1234-abcd.ngrok-free.app"
export const NGROK_URL = ""; 

let apiRoot = "http://localhost:3000";
if (!isLocal) {
  if (NGROK_URL) {
    apiRoot = NGROK_URL;
  } else {
    let saved = localStorage.getItem("serverApiRoot");
    if (!saved) {
      try {
        saved = prompt("Enter the Server Factory Multiplayer URL (Ngrok or Render URL):", "https://");
        if (saved) localStorage.setItem("serverApiRoot", saved);
      } catch(e) {
        // Itch.io might block prompt. In this case, they must hardcode NGROK_URL.
        console.warn("Prompt blocked by iframe. You must set NGROK_URL in main.js.");
      }
    }
    apiRoot = saved || "http://localhost:3000";
  }
} else if (location.hostname && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    apiRoot = location.origin;
}

const multiplayer = {
  playerId: localStorage.getItem("playerId") || null,
  playerName:
    localStorage.getItem("playerName") ||
    `Player-${Math.floor(1000 + Math.random() * 9000)}`,
  color:
    localStorage.getItem("playerColor") ||
    `#${Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0")}`,
  connected: false,
  joining: false,
  lastSyncAt: 0,
  lastStateAt: 0,
  lastJoinAt: 0,
  remotePlayers: new Map(),
  leaderboard: [],
};

const leaderboardList = document.getElementById("leaderboard-list");
const multiplayerStatus = document.getElementById("multiplayer-status");

window.addEventListener("beforeunload", () => {
  if (!multiplayer.playerId) return;

  const payload = JSON.stringify({ id: multiplayer.playerId });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      `${apiRoot}/api/leave`,
      new Blob([payload], { type: "application/json" }),
    );
    return;
  }

  fetch(`${apiRoot}/api/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
});

// --- SETUP THREE.JS (PERFORMANCE OPTIMIZED) ---
const container = document.getElementById("game-container");
const labelsBox = document.getElementById("labels-container");

const isMobile =
  window.innerWidth <= 768 || /Mobi|Android/i.test(navigator.userAgent);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0x87ceeb, isMobile ? 0.015 : 0.009);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: "high-performance",
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(
  isMobile
    ? Math.min(window.devicePixelRatio, 1)
    : Math.min(window.devicePixelRatio, 1.5),
);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = isMobile
  ? THREE.PCFShadowMap
  : THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// --- LIGHTING ---
const ambientLight = new THREE.HemisphereLight(0xffffff, 0x4caf50, 0.7);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(20, 60, 20);
dirLight.castShadow = true;
dirLight.shadow.camera.left = -40;
dirLight.shadow.camera.right = 40;
dirLight.shadow.camera.top = 40;
dirLight.shadow.camera.bottom = -40;
dirLight.shadow.mapSize.width = isMobile ? 512 : 1024;
dirLight.shadow.mapSize.height = isMobile ? 512 : 1024;
scene.add(dirLight);
scene.add(dirLight.target);

// --- ENVIRONMENT ---

const floorGeo = new THREE.PlaneGeometry(400, 400);
const floorMat = new THREE.MeshLambertMaterial({
  map: createGrassTexture(),
  color: 0xeeeeee,
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
floor.matrixAutoUpdate = false;
floor.updateMatrix();
scene.add(floor);

// --- INPUT HANDLING ---
const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  arrowup: false,
  arrowdown: false,
  arrowleft: false,
  arrowright: false,
};
window.addEventListener("keydown", (e) => {
  if (keys.hasOwnProperty(e.key.toLowerCase()))
    keys[e.key.toLowerCase()] = true;
});
window.addEventListener("keyup", (e) => {
  if (keys.hasOwnProperty(e.key.toLowerCase()))
    keys[e.key.toLowerCase()] = false;
});

// --- TOUCH / VIRTUAL JOYSTICK ---
let touchVector = { x: 0, z: 0 };
let jStart = { x: 0, y: 0 };
const jBase = document.getElementById("joystick-base");
const jStick = document.getElementById("joystick-stick");

document.addEventListener(
  "touchstart",
  (e) => {
    if (e.touches.length > 0) {
      const t = e.touches[0];
      jStart.x = t.clientX;
      jStart.y = t.clientY;
      jBase.style.left = jStart.x + "px";
      jBase.style.top = jStart.y + "px";
      jBase.style.display = "block";
      jStick.style.transform = `translate(-50%, -50%)`;
      touchVector = { x: 0, z: 0 };
    }
  },
  { passive: false },
);

document.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      const t = e.touches[0];
      let dx = t.clientX - jStart.x;
      let dy = t.clientY - jStart.y;

      let maxDist = 40;
      let dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > maxDist) {
        dx = (dx / dist) * maxDist;
        dy = (dy / dist) * maxDist;
      }

      jStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      touchVector.x = dx / maxDist;
      touchVector.z = dy / maxDist;
    }
  },
  { passive: false },
);

const touchEnd = () => {
  jBase.style.display = "none";
  touchVector = { x: 0, z: 0 };
};
document.addEventListener("touchend", touchEnd);
document.addEventListener("touchcancel", touchEnd);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- ARTICULATED REAL-PERSON GENERATOR ---

const player = createHuman(0xffffff, 0x1976d2, true);
// Move player up to start in the new HQ!
player.position.set(0, 0, 30);
scene.add(player);
player.labelElement = createNameTag(
  multiplayer.playerName,
  multiplayer.color,
  true,
);

// --- FACTORIES ---
const packetGeo = new THREE.IcosahedronGeometry(0.8, 0);
const packetMat = new THREE.MeshLambertMaterial({
  color: 0xffc107,
  emissive: 0xffc107,
  emissiveIntensity: 0.6,
});

const ringGeo = new THREE.RingGeometry(8, 9, 24);
const ringMat = new THREE.MeshBasicMaterial({
  color: 0x1976d2,
  side: THREE.DoubleSide,
});

// --- VISUAL LOCATORS (Glows & Halos) ---

// --- MINIMAP SYSTEM ---
const minimapCanvas = document.getElementById("minimap-canvas");
const minimapCtx = minimapCanvas.getContext("2d");
const minimapScale = 0.5; // pixels per unit
const minimapSize = 200;

// --- UI HELPERS ---

// --- GAMEPLAY MECHANICS ---

let serverPositions = [
  { x: 0, z: -10 },
  { x: 30, z: -10 },
  { x: -30, z: -10 },
  { x: 0, z: -40 },
  { x: 30, z: -40 },
  { x: -30, z: -40 },
  { x: 0, z: -70 },
  { x: 30, z: -70 },
  { x: -30, z: -70 },
];

try {
  let saved = localStorage.getItem("tycoonMap");
  if (saved) {
    let pars = JSON.parse(saved);
    let srvs = pars.filter((d) => d.type === "server");
    if (srvs.length > 0) serverPositions = srvs;
  }
} catch (e) {}

// Map Configuration & Head Quarters Setup
function initMap() {
  let savedMap = null;
  try {
    savedMap = JSON.parse(localStorage.getItem("tycoonMap"));
  } catch (e) {}

  let padCoords = [
    { x: -20, z: 30 },
    { x: 20, z: 30 },
    { x: -20, z: 55 },
    { x: 0, z: 55 },
    { x: 20, z: 55 },
  ];

  const purchaseRoomConfigs = [
    { title: "BUY SERVER", floorColor: 0xe3f2fd, accent: 0x1976d2 },
    { title: "UPGRADE SERVERS", floorColor: 0xe8f5e9, accent: 0x2e7d32 },
    { title: "UPGRADE SUIT", floorColor: 0xfff3e0, accent: 0xef6c00 },
    { title: "HIRE WORKER", floorColor: 0xf3e5f5, accent: 0x8e24aa },
    { title: "UPGRADE BOTS", floorColor: 0xffebee, accent: 0xc62828 },
  ];

  function buildPurchaseRooms(coords, roomConfigs) {
    const roomWidth = 18;
    const roomDepth = 14;
    const wallThickness = 1;
    const wallHeight = 4;
    const halfW = roomWidth / 2;
    const halfD = roomDepth / 2;

    coords.forEach((coord, index) => {
      const cfg = roomConfigs[index];
      if (!cfg) return;

      const roomGroup = new THREE.Group();
      roomGroup.position.set(coord.x, 0, coord.z);

      const floorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(roomWidth, 0.12, roomDepth),
        new THREE.MeshLambertMaterial({ color: cfg.floorColor }),
      );
      floorMesh.position.set(0, 0.06, 0);
      floorMesh.receiveShadow = !isMobile;
      roomGroup.add(floorMesh);

      const wallMat = new THREE.MeshLambertMaterial({ color: 0xb0bec5 });

      const leftWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness, wallHeight, roomDepth),
        wallMat,
      );
      leftWall.position.set(-halfW, wallHeight / 2, 0);
      leftWall.castShadow = !isMobile;
      roomGroup.add(leftWall);
      addCollider(coord.x - halfW, coord.z, wallThickness, roomDepth);

      const rightWall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness, wallHeight, roomDepth),
        wallMat,
      );
      rightWall.position.set(halfW, wallHeight / 2, 0);
      rightWall.castShadow = !isMobile;
      roomGroup.add(rightWall);
      addCollider(coord.x + halfW, coord.z, wallThickness, roomDepth);

      const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(roomWidth, wallHeight, wallThickness),
        wallMat,
      );
      backWall.position.set(0, wallHeight / 2, halfD);
      backWall.castShadow = !isMobile;
      roomGroup.add(backWall);
      addCollider(coord.x, coord.z + halfD, roomWidth, wallThickness);

      // Add store-like structure inside each purchase room.
      const counter = new THREE.Mesh(
        new THREE.BoxGeometry(roomWidth - 3, 1.5, 2),
        new THREE.MeshLambertMaterial({ color: 0x546e7a }),
      );
      counter.position.set(0, 0.75, 2.4);
      counter.castShadow = !isMobile;
      counter.receiveShadow = !isMobile;
      roomGroup.add(counter);
      addCollider(coord.x, coord.z + 2.4, roomWidth - 3, 2);

      const accentStrip = new THREE.Mesh(
        new THREE.BoxGeometry(roomWidth - 3.4, 0.28, 0.25),
        new THREE.MeshLambertMaterial({ color: cfg.accent }),
      );
      accentStrip.position.set(0, 1.2, 1.35);
      roomGroup.add(accentStrip);

      const shelfMat = new THREE.MeshLambertMaterial({ color: 0x90a4ae });
      const shelfPanelGeo = new THREE.BoxGeometry(0.8, 3, 4.5);
      const shelfRackGeo = new THREE.BoxGeometry(2.8, 0.25, 4.5);

      [-6.2, 6.2].forEach((sx) => {
        const shelfPanel = new THREE.Mesh(shelfPanelGeo, shelfMat);
        shelfPanel.position.set(sx, 1.5, 2.2);
        shelfPanel.castShadow = !isMobile;
        roomGroup.add(shelfPanel);

        [0.6, 1.45, 2.3].forEach((sy) => {
          const rack = new THREE.Mesh(
            shelfRackGeo,
            new THREE.MeshLambertMaterial({ color: 0xcfd8dc }),
          );
          rack.position.set(sx, sy, 2.2);
          rack.castShadow = !isMobile;
          roomGroup.add(rack);
        });

        addCollider(coord.x + sx, coord.z + 2.2, 2.8, 4.5);
      });

      const displayGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
      [-3.8, -2.4, -1.0, 0.4, 1.8, 3.2].forEach((dx, i) => {
        const product = new THREE.Mesh(
          displayGeo,
          new THREE.MeshLambertMaterial({
            color: i % 2 === 0 ? cfg.accent : 0xffffff,
          }),
        );
        product.position.set(dx, 2.1, 2.35);
        product.castShadow = !isMobile;
        roomGroup.add(product);
      });

      const lightBar = new THREE.Mesh(
        new THREE.BoxGeometry(roomWidth - 4, 0.2, 1.2),
        new THREE.MeshLambertMaterial({ color: 0xf5f5f5, emissive: 0x222222 }),
      );
      lightBar.position.set(0, 3.6, 1.6);
      roomGroup.add(lightBar);

      const lightOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 12, 12),
        new THREE.MeshLambertMaterial({ color: 0xfff59d, emissive: 0x665c00 }),
      );
      lightOrb.position.set(0, 3.3, 1.6);
      roomGroup.add(lightOrb);

      // Chair + seated store clerk NPC.
      const chairMat = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });
      const chairSeat = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.22, 1.8),
        chairMat,
      );
      chairSeat.position.set(0, 0.95, 3.7);
      chairSeat.castShadow = !isMobile;
      chairSeat.receiveShadow = !isMobile;
      roomGroup.add(chairSeat);

      const chairBack = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 1.8, 0.2),
        chairMat,
      );
      chairBack.position.set(0, 1.8, 4.5);
      chairBack.castShadow = !isMobile;
      roomGroup.add(chairBack);

      [
        [-0.75, -0.75],
        [0.75, -0.75],
        [-0.75, 0.75],
        [0.75, 0.75],
      ].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.9, 0.2),
          chairMat,
        );
        leg.position.set(lx, 0.45, 3.7 + lz);
        leg.castShadow = !isMobile;
        roomGroup.add(leg);
      });

      const clerk = createHuman(cfg.accent, 0x37474f, false, 0xffd8b3);
      clerk.position.set(0, -0.95, 3.65);
      clerk.rotation.y = Math.PI;
      if (clerk.userData?.lLeg) clerk.userData.lLeg.rotation.x = -Math.PI / 2;
      if (clerk.userData?.rLeg) clerk.userData.rLeg.rotation.x = -Math.PI / 2;
      if (clerk.userData?.lArm) clerk.userData.lArm.rotation.x = -0.4;
      if (clerk.userData?.rArm) clerk.userData.rArm.rotation.x = -0.4;
      if (clerk.userData?.torso) clerk.userData.torso.position.y = 2.05;
      roomGroup.add(clerk);

      scene.add(roomGroup);
    });
  }

  function placeTree(x, z, variant = 0) {
    const tree = new THREE.Group();

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.55, 2.5, 8),
      new THREE.MeshLambertMaterial({ color: 0x6d4c41 }),
    );
    trunk.position.y = 1.25;
    trunk.castShadow = !isMobile;
    tree.add(trunk);

    const leafColor = variant % 2 === 0 ? 0x2e7d32 : 0x388e3c;
    const leavesLower = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 3.2, 9),
      new THREE.MeshLambertMaterial({ color: leafColor }),
    );
    leavesLower.position.y = 3.2;
    leavesLower.castShadow = !isMobile;
    tree.add(leavesLower);

    const leavesUpper = new THREE.Mesh(
      new THREE.ConeGeometry(1.9, 2.6, 9),
      new THREE.MeshLambertMaterial({ color: 0x43a047 }),
    );
    leavesUpper.position.y = 4.6;
    leavesUpper.castShadow = !isMobile;
    tree.add(leavesUpper);

    tree.position.set(x, 0, z);
    tree.rotation.y = (variant * Math.PI) / 5;
    scene.add(tree);
    addCollider(x, z, 2.3, 2.3);
  }

  function placeHouse(x, z, variant = 0) {
    const house = new THREE.Group();

    const baseColor = variant % 2 === 0 ? 0xd7ccc8 : 0xcfd8dc;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(12, 6, 9),
      new THREE.MeshLambertMaterial({ color: baseColor }),
    );
    wall.position.y = 3;
    wall.castShadow = !isMobile;
    wall.receiveShadow = !isMobile;
    house.add(wall);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(8.2, 4, 4),
      new THREE.MeshLambertMaterial({ color: 0x8d6e63 }),
    );
    roof.position.y = 7;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = !isMobile;
    house.add(roof);

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 3.2, 0.35),
      new THREE.MeshLambertMaterial({ color: 0x5d4037 }),
    );
    door.position.set(0, 1.6, 4.65);
    house.add(door);

    const windowMat = new THREE.MeshLambertMaterial({
      color: 0x90caf9,
      emissive: 0x102030,
    });
    const leftWindow = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.6, 0.25),
      windowMat,
    );
    leftWindow.position.set(-3, 3.4, 4.6);
    house.add(leftWindow);
    const rightWindow = leftWindow.clone();
    rightWindow.position.x = 3;
    house.add(rightWindow);

    house.position.set(x, 0, z);
    house.rotation.y = variant % 2 === 0 ? 0 : Math.PI;
    scene.add(house);
    addCollider(x, z, 12, 9);
  }

  function placeEnvironmentObstacles() {
    const houseSpots = [
      { x: -95, z: -30 },
      { x: 98, z: -28 },
      { x: -100, z: -98 },
      { x: 102, z: -94 },
    ];
    houseSpots.forEach((p, i) => placeHouse(p.x, p.z, i));

    const treeSpots = [
      { x: -74, z: -10 },
      { x: -58, z: -42 },
      { x: -78, z: -76 },
      { x: 72, z: -14 },
      { x: 58, z: -44 },
      { x: 76, z: -78 },
      { x: -118, z: -58 },
      { x: 118, z: -60 },
      { x: -18, z: -102 },
      { x: 16, z: -104 },
    ];
    treeSpots.forEach((p, i) => placeTree(p.x, p.z, i));
  }

  if (savedMap && savedMap.length > 0) {
    let pIdx = 0;
    savedMap.forEach((d) => {
      if (d.type === "wall" || d.type === "floor") {
        const geo = new THREE.BoxGeometry(
          d.type === "wall" ? 1 : 10,
          d.type === "wall" ? 4 : 0.5,
          d.type === "wall" ? 1 : 10,
        );
        const mat = new THREE.MeshLambertMaterial({
          color: d.type === "wall" ? 0x90a4ae : 0xe0e0e0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(d.x, d.type === "wall" ? 2 : 0.25, d.z);
        mesh.scale.set(d.scaleX, 1, d.scaleZ);
        mesh.castShadow = !isMobile;
        mesh.receiveShadow = !isMobile;
        if (d.rotationY) mesh.rotation.y = d.rotationY;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        scene.add(mesh);

        if (d.type === "wall") addCollider(d.x, d.z, d.scaleX, d.scaleZ);
      } else if (d.type === "tree") {
        const mesh = new THREE.Group();
        const trunkGeo = new THREE.CylinderGeometry(0.5, 0.5, 2);
        const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1;
        trunk.castShadow = !isMobile;
        const leavesGeo = new THREE.ConeGeometry(2.5, 5, 8);
        const leavesMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
        const leaves = new THREE.Mesh(leavesGeo, leavesMat);
        leaves.position.y = 3.5;
        leaves.castShadow = !isMobile;
        mesh.add(trunk);
        mesh.add(leaves);
        mesh.position.set(d.x, 0, d.z);
        if (d.rotationY) mesh.rotation.y = d.rotationY;
        scene.add(mesh);
        addCollider(d.x, d.z, 1, 1);
      } else if (d.type === "glass") {
        const geo = new THREE.BoxGeometry(1, 4, 1);
        const mat = new THREE.MeshLambertMaterial({
          color: 0x81d4fa,
          transparent: true,
          opacity: 0.5,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(d.x, 2, d.z);
        mesh.scale.set(d.scaleX, 1, d.scaleZ);
        if (d.rotationY) mesh.rotation.y = d.rotationY;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        scene.add(mesh);
        addCollider(d.x, d.z, d.scaleX, d.scaleZ);
      } else if (d.type === "carpet") {
        const geo = new THREE.BoxGeometry(10, 0.1, 10);
        const mat = new THREE.MeshLambertMaterial({ color: 0xc62828 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(d.x, 0.05, d.z);
        mesh.scale.set(d.scaleX, 1, d.scaleZ);
        mesh.receiveShadow = !isMobile;
        if (d.rotationY) mesh.rotation.y = d.rotationY;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        scene.add(mesh);
      } else if (d.type === "pad" && pIdx < 5) {
        padCoords[pIdx] = {
          x: d.x,
          z: d.z,
          title: d.title,
          cost: d.cost,
          repeatable: d.repeatable,
        };
        pIdx++;
      }
    });
  } else {
    // Default HQ
    const hqGeo = new THREE.BoxGeometry(80, 0.5, 50);
    const hqMat = new THREE.MeshLambertMaterial({ color: 0xe0e0e0 });
    const hqBase = new THREE.Mesh(hqGeo, hqMat);
    hqBase.position.set(0, 0.25, 45);
    hqBase.receiveShadow = !isMobile;
    hqBase.matrixAutoUpdate = false;
    hqBase.updateMatrix();
    scene.add(hqBase);

    const wallMat = new THREE.MeshLambertMaterial({ color: 0x90a4ae });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(80, 4, 1), wallMat);
    backWall.position.set(0, 2, 70.5);
    backWall.castShadow = !isMobile;
    backWall.matrixAutoUpdate = false;
    backWall.updateMatrix();
    scene.add(backWall);
    addCollider(0, 70.5, 80, 1);

    const lWall = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 50), wallMat);
    lWall.position.set(-39.5, 2, 45);
    lWall.castShadow = !isMobile;
    lWall.matrixAutoUpdate = false;
    lWall.updateMatrix();
    scene.add(lWall);
    addCollider(-39.5, 45, 1, 50);

    const rWall = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 50), wallMat);
    rWall.position.set(39.5, 2, 45);
    rWall.castShadow = !isMobile;
    rWall.matrixAutoUpdate = false;
    rWall.updateMatrix();
    scene.add(rWall);
    addCollider(39.5, 45, 1, 50);

    // Build dedicated mini-rooms for each purchase area in the default HQ layout.
    buildPurchaseRooms(padCoords, purchaseRoomConfigs);
  }

  placeEnvironmentObstacles();

  createPurchaseZone(
    padCoords[0].x,
    padCoords[0].z,
    14,
    8,
    "BUY SERVER",
    10,
    true,
    (pz) => {
      if (state.activeServers < serverPositions.length) {
        let pos = serverPositions[state.activeServers];
        unlockServer(pos.x, pos.z);
        state.activeServers++;

        if (state.activeServers >= serverPositions.length) {
          pz.active = false;
          pz.uiElement.remove();
          scene.remove(pz.group);
        } else {
          pz.cost = Math.floor(pz.cost * 2.5);
          pz.uiElement.querySelector(".pad-title").innerText =
            "BUY SERVER " + (state.activeServers + 1);
        }
      }
    },
  );

  createPurchaseZone(
    padCoords[1].x,
    padCoords[1].z,
    14,
    8,
    "UPGRADE SERVERS",
    150,
    true,
    (pz) => {
      state.serverLevel++;
      servers.forEach((s) => {
        s.stats.level = state.serverLevel;
        s.stats.capacity += 5;
        s.stats.moneyValue += 2;
        s.stats.processSpeed = Math.max(0.15, s.stats.processSpeed * 0.85);
        updateServerUI(s);
        spawnFloatingText(
          s.position.x,
          8,
          s.position.z,
          "ACCELERATED!",
          "#1976D2",
        );
        s.group.scale.set(1.1, 1.1, 1.1);
        setTimeout(() => s.group.scale.set(1, 1, 1), 200);
      });

      pz.cost = Math.floor(pz.cost * 1.8);
      pz.uiElement.querySelector(".pad-title").innerText =
        "UPGRADE (L" + (state.serverLevel + 1) + ")";
      spawnFloatingText(0, 5, 30, "ALL SERVERS UPGRADED", "#1976D2");
    },
  );

  createPurchaseZone(
    padCoords[2].x,
    padCoords[2].z,
    14,
    8,
    "UPGRADE SUIT",
    100,
    true,
    (pz) => {
      state.dataMax += 10;
      state.playerSpeed += 4;
      updateUI();
      pz.cost = Math.floor(pz.cost * 1.6);
      spawnFloatingText(
        player.position.x,
        5,
        player.position.z,
        "++ CARRY MAX ++",
        "#E65100",
      );
    },
  );

  createPurchaseZone(
    padCoords[3].x,
    padCoords[3].z,
    14,
    8,
    "HIRE WORKER",
    300,
    true,
    (dz) => {
      hireWorker(0, 50);
      state.workerCount++; // Track workers for persistence
      dz.cost = Math.floor(dz.cost * 1.5);
      spawnFloatingText(0, 5, 50, "WORKER ARRIVED", "#1976D2");
    },
  );

  createPurchaseZone(
    padCoords[4].x,
    padCoords[4].z,
    14,
    8,
    "UPGRADE BOTS",
    400,
    true,
    (uz) => {
      state.globalWorkerSpeed += 5;
      state.globalWorkerMax += 1;

      workers.forEach((w) => {
        w.speed = state.globalWorkerSpeed;
        w.dataMax = state.globalWorkerMax;
        spawnFloatingText(
          w.position.x,
          5,
          w.position.z,
          "OVERCLOCKED!",
          "#E65100",
        );
      });

      uz.cost = Math.floor(uz.cost * 1.8);
      spawnFloatingText(
        player.position.x,
        5,
        player.position.z,
        `BOTS: SIZE ${state.globalWorkerMax}`,
        "#E65100",
      );
    },
  );

  // --- Restore state on load ---
  let pzServer = pads.find((p) => p.originalTitle === "BUY SERVER");
  if (pzServer) {
    let prevServers = state.activeServers;
    state.activeServers = 0; // Temporarily reset so pad callback logic or custom logic works smoothly
    for (let i = 0; i < prevServers; i++) {
      pzServer.cost = Math.floor(pzServer.cost * 2.5);
      let pos = serverPositions[i];
      unlockServer(pos.x, pos.z);
      state.activeServers++;
    }
    if (state.activeServers >= serverPositions.length) {
      pzServer.active = false;
      pzServer.uiElement.remove();
      scene.remove(pzServer.group);
    } else if (state.activeServers > 0) {
      pzServer.uiElement.querySelector(".pad-title").innerText =
        "BUY SERVER " + (state.activeServers + 1);
      pzServer.uiElement.querySelector(".pad-cost").innerText =
        "$" + pzServer.cost;
    }
  }

  let pzUpSrv = pads.find((p) => p.originalTitle === "UPGRADE SERVERS");
  if (pzUpSrv && state.serverLevel > 1) {
    for (let i = 0; i < state.serverLevel - 1; i++) {
      pzUpSrv.cost = Math.floor(pzUpSrv.cost * 1.8);
    }
    pzUpSrv.uiElement.querySelector(".pad-title").innerText =
      "UPGRADE (L" + (state.serverLevel + 1) + ")";
    pzUpSrv.uiElement.querySelector(".pad-cost").innerText = "$" + pzUpSrv.cost;
  }

  let pzUpSuit = pads.find((p) => p.originalTitle === "UPGRADE SUIT");
  if (pzUpSuit && state.dataMax > 10) {
    let suitUpgrades = (state.dataMax - 10) / 10;
    for (let i = 0; i < suitUpgrades; i++) {
      pzUpSuit.cost = Math.floor(pzUpSuit.cost * 1.6);
    }
    pzUpSuit.uiElement.querySelector(".pad-cost").innerText =
      "$" + pzUpSuit.cost;
  }

  let pzWorker = pads.find((p) => p.originalTitle === "HIRE WORKER");
  if (pzWorker && state.workerCount > 0) {
    for (let i = 0; i < state.workerCount; i++) {
      pzWorker.cost = Math.floor(pzWorker.cost * 1.5);
      hireWorker(0, 50);
    }
    pzWorker.uiElement.querySelector(".pad-cost").innerText =
      "$" + pzWorker.cost;
  }

  let pzBots = pads.find((p) => p.originalTitle === "UPGRADE BOTS");
  if (pzBots && state.globalWorkerMax > 1) {
    for (let i = 0; i < state.globalWorkerMax - 1; i++) {
      pzBots.cost = Math.floor(pzBots.cost * 1.8);
    }
    pzBots.uiElement.querySelector(".pad-cost").innerText = "$" + pzBots.cost;
  }
}

// Spawner Logic
setInterval(() => {
  const maxPackets = isMobile ? 80 : 180;
  if (dataPackets.length >= maxPackets) return;

  const spawnMinX = -135;
  const spawnMaxX = 135;
  const spawnMinZ = -75;
  const spawnMaxZ = 135;

  let x, z;
  let attempts = 0;
  do {
    x = spawnMinX + Math.random() * (spawnMaxX - spawnMinX);
    z = spawnMinZ + Math.random() * (spawnMaxZ - spawnMinZ);
    attempts++;
  } while (checkPacketSpawn(x, z) && attempts < 20);

  if (attempts >= 20) return;

  const mesh = new THREE.Mesh(packetGeo, packetMat);
  mesh.position.set(x, 1, z);

  scene.add(mesh);

  dataPackets.push({
    mesh,
    active: true,
    ogY: 1.5,
    position: mesh.position,
    isTargeted: false,
    uiElement: null,
    isData: true,
  });
}, 1000);

initMap();
updateUI();
// joinMultiplayer() and game-active deferred to Start Menu

// Start Menu Logic
const nameInput = document.getElementById("player-name-input");
const colorInput = document.getElementById("player-color-input");
const colorHex = document.getElementById("color-hex-display");
const resumeButton = document.getElementById("resume-button");
const newGameButton = document.getElementById("new-game-button");
const friendsButton = document.getElementById("friends-button");
const settingsButton = document.getElementById("settings-button");
const friendsPanel = document.getElementById("friends-panel");
const settingsPanel = document.getElementById("settings-panel");
const startMessage = document.getElementById("start-screen-message");
const startKicker = document.querySelector(".start-kicker");
const inviteLinkInput = document.getElementById("invite-link-input");
const copyInviteButton = document.getElementById("copy-invite-button");
const skinPresetInput = document.getElementById("skin-preset-input");
const masterVolumeInput = document.getElementById("master-volume-input");
const musicVolumeInput = document.getElementById("music-volume-input");
const sfxVolumeInput = document.getElementById("sfx-volume-input");
const shadowsToggleInput = document.getElementById("shadows-toggle-input");
const qualityInput = document.getElementById("quality-input");
const playButton = document.getElementById("play-button");
const powerUpStoreButton = document.getElementById("powerup-store-button");
const powerUpStorePanel = document.getElementById("powerup-store-panel");
const powerUpStoreClose = document.getElementById("powerup-store-close");
const powerUpItems = document.getElementById("powerup-items");
const powerUpStatus = document.getElementById("powerup-status");

const defaultGameSettings = {
  skinPreset: "custom",
  masterVolume: 100,
  musicVolume: 70,
  sfxVolume: 80,
  shadows: true,
  quality: "auto",
};

const storedPlayerName = (localStorage.getItem("playerName") || "").trim();
const isFirstTimePlayer = storedPlayerName.length === 0;

function updateStartGreeting(nameValue) {
  if (!startKicker) return;

  const safeName = (nameValue || "").trim();
  const skinColor = (colorInput?.value || "").toUpperCase();
  if (safeName && skinColor) {
    startKicker.innerText = `Welcome, ${safeName} | Skin: ${skinColor}`;
    return;
  }

  if (safeName) {
    startKicker.innerText = `Welcome, ${safeName}`;
    return;
  }

  startKicker.innerText = skinColor
    ? `Welcome, New Operator | Skin: ${skinColor}`
    : "Welcome, New Operator";
}

function readStoredSettings() {
  const raw = localStorage.getItem("gameSettings");
  if (!raw) return { ...defaultGameSettings };

  try {
    const parsed = JSON.parse(raw);
    return { ...defaultGameSettings, ...parsed };
  } catch (_error) {
    return { ...defaultGameSettings };
  }
}

const gameSettings = readStoredSettings();

const webAudioSources = {
  click: "https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3",
  walk: "https://assets.mixkit.co/active_storage/sfx/212/212-preview.mp3",
  collect: "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3",
  purchase: "https://assets.mixkit.co/active_storage/sfx/270/270-preview.mp3",
  success: "https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3",
  error: "https://assets.mixkit.co/active_storage/sfx/2955/2955-preview.mp3",
};

const audioState = {
  unlocked: false,
  sfxCooldowns: {},
  audioContext: null,
};

const sfxPlayers = {
  click: new Audio(webAudioSources.click),
  walk: new Audio(webAudioSources.walk),
  collect: new Audio(webAudioSources.collect),
  purchase: new Audio(webAudioSources.purchase),
  success: new Audio(webAudioSources.success),
  error: new Audio(webAudioSources.error),
};

const audioMix = {
  sfx: {
    click: 0.75,
    walk: 0.34,
    collect: 1.25,
    purchase: 0.95,
    success: 1.0,
    error: 0.85,
  },
};

Object.values(sfxPlayers).forEach((audio) => {
  audio.preload = "auto";
});

function getSfxVolume() {
  const master = (gameSettings.masterVolume ?? 100) / 100;
  const sfx = (gameSettings.sfxVolume ?? 80) / 100;
  return Math.max(0, Math.min(1, master * sfx));
}

function applyAudioVolumes() {
  const sfxVolume = getSfxVolume();
  Object.entries(sfxPlayers).forEach(([key, audio]) => {
    const mix = audioMix.sfx[key] ?? 1;
    audio.volume = Math.max(0, Math.min(1, sfxVolume * mix));
  });
}

function getAudioContext() {
  if (audioState.audioContext) return audioState.audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioState.audioContext = new Ctx();
  return audioState.audioContext;
}

function playSynthSfx(key) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const master = getSfxVolume();
  if (master <= 0) return;

  if (key === "walk") {
    // Short noisy hit + low thunk with slight random pitch for voxel-style steps.
    const t = ctx.currentTime;
    const stepVariant = Math.random();
    const duration = 0.09 + stepVariant * 0.04;

    const noiseBuffer = ctx.createBuffer(
      1,
      Math.floor(ctx.sampleRate * duration),
      ctx.sampleRate,
    );
    const channel = noiseBuffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) {
      const progress = i / channel.length;
      const envelope = Math.pow(1 - progress, 1.7);
      channel[i] = (Math.random() * 2 - 1) * envelope;
    }

    const grit = ctx.createBufferSource();
    grit.buffer = noiseBuffer;

    const gritFilter = ctx.createBiquadFilter();
    gritFilter.type = "bandpass";
    gritFilter.frequency.setValueAtTime(170 + stepVariant * 95, t);
    gritFilter.Q.value = 1.15;

    const gritGain = ctx.createGain();
    gritGain.gain.setValueAtTime(0.0001, t);
    gritGain.gain.linearRampToValueAtTime(0.03 * master, t + 0.006);
    gritGain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    grit.connect(gritFilter);
    gritFilter.connect(gritGain);
    gritGain.connect(ctx.destination);

    const thunk = ctx.createOscillator();
    thunk.type = "square";
    thunk.frequency.setValueAtTime(86 + stepVariant * 14, t);
    thunk.frequency.exponentialRampToValueAtTime(
      63 + stepVariant * 8,
      t + 0.045,
    );

    const thunkGain = ctx.createGain();
    thunkGain.gain.setValueAtTime(0.0001, t);
    thunkGain.gain.linearRampToValueAtTime(0.022 * master, t + 0.004);
    thunkGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);

    thunk.connect(thunkGain);
    thunkGain.connect(ctx.destination);

    grit.start(t);
    grit.stop(t + duration);
    thunk.start(t);
    thunk.stop(t + 0.08);
    return;
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (key === "collect") {
    osc.type = "square";
    osc.frequency.setValueAtTime(620, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(920, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.11 * master, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
    return;
  }
}

function unlockAudio() {
  if (!audioState.unlocked) {
    audioState.unlocked = true;
  }
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  applyAudioVolumes();
}

function playSfx(key, cooldownMs = 0) {
  const sfx = sfxPlayers[key];
  if (!sfx || !audioState.unlocked) return;

  const now = performance.now();
  const lastPlayed = audioState.sfxCooldowns[key] || 0;
  if (cooldownMs > 0 && now - lastPlayed < cooldownMs) return;
  audioState.sfxCooldowns[key] = now;

  if (key === "walk") {
    playSynthSfx("walk");
    return;
  }

  try {
    sfx.currentTime = 0;
    sfx.play().catch(() => {});
  } catch (_error) {}

  if (key === "walk" || key === "collect") {
    playSynthSfx(key);
  }
}

function saveGameSettings() {
  localStorage.setItem("gameSettings", JSON.stringify(gameSettings));
}

function applyPlayerLook(colorValue) {
  const colorNum = Number.parseInt(colorValue.replace("#", ""), 16);
  player.traverse((part) => {
    if (
      part.isMesh &&
      part.userData &&
      part.userData.tintGroup === "outfit" &&
      part.material
    ) {
      part.material.color.setHex(colorNum);
    }
  });
}

function applyGraphicsSettings() {
  const quality = gameSettings.quality;
  let pixelRatio = Math.min(window.devicePixelRatio, isMobile ? 1 : 1.5);
  if (quality === "performance") pixelRatio = 1;
  if (quality === "balanced") {
    pixelRatio = Math.min(window.devicePixelRatio, 1.25);
  }
  if (quality === "ultra") {
    pixelRatio = Math.min(window.devicePixelRatio, isMobile ? 1.2 : 2);
  }

  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = !!gameSettings.shadows;
  if (renderer.shadowMap.enabled) {
    renderer.shadowMap.type =
      quality === "ultra" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  }
}

function openPanel(panelType) {
  const showFriends = panelType === "friends";
  const showSettings = panelType === "settings";
  friendsPanel.hidden = !showFriends;
  settingsPanel.hidden = !showSettings;
}

function formatPowerUpCountdown(msLeft) {
  const totalSec = Math.ceil(msLeft / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function renderPowerUpStatus() {
  if (!powerUpStatus) return;

  const activeLabels = Object.values(powerUpCatalog)
    .map((cfg) => {
      const msLeft = getPowerUpRemainingMs(cfg.id);
      if (msLeft <= 0) return null;
      return `${cfg.title} ${formatPowerUpCountdown(msLeft)}`;
    })
    .filter(Boolean);

  powerUpStatus.innerText =
    activeLabels.length > 0
      ? `ACTIVE: ${activeLabels.join(" | ")}`
      : "No active power-ups";
}

function renderPowerUpStoreItems() {
  if (!powerUpItems) return;

  powerUpItems.innerHTML = "";
  Object.values(powerUpCatalog).forEach((cfg) => {
    const level = getPowerUpLevel(cfg.id);
    const cost = getPowerUpCost(cfg.id);
    const msLeft = getPowerUpRemainingMs(cfg.id);
    const isActive = msLeft > 0;

    const card = document.createElement("div");
    card.className = "powerup-item";

    const info = document.createElement("div");
    info.innerHTML = `
      <div class="powerup-item-name">${cfg.title} (Lv ${level + 1})</div>
      <div class="powerup-item-meta">${cfg.desc} | ${cfg.durationSec}s</div>
      <div class="powerup-item-meta">${isActive ? `Active: ${formatPowerUpCountdown(msLeft)}` : `Cost: $${cost}`}</div>
    `;

    const buyButton = document.createElement("button");
    buyButton.className = "powerup-buy-button";
    buyButton.type = "button";
    buyButton.innerText = isActive ? "ACTIVE" : `BUY $${cost}`;
    buyButton.disabled = isActive || state.money < cost;

    buyButton.addEventListener("click", () => {
      playSfx("click", 70);
      const latestCost = getPowerUpCost(cfg.id);
      if (state.money < latestCost) {
        playSfx("error", 140);
        if (startMessage)
          startMessage.innerText = "Not enough cash for this power-up.";
        return;
      }

      state.money -= latestCost;
      playSfx("purchase", 140);
      state.powerUpLevels[cfg.id] = getPowerUpLevel(cfg.id) + 1;
      state.activePowerUps[cfg.id] = {
        expiresAt: Date.now() + cfg.durationSec * 1000,
      };

      updateUI();
      renderPowerUpStoreItems();
      renderPowerUpStatus();

      spawnFloatingText(
        player.position.x,
        5,
        player.position.z,
        `${cfg.title.toUpperCase()} ON`,
        "#43A047",
      );
    });

    card.appendChild(info);
    card.appendChild(buyButton);
    powerUpItems.appendChild(card);
  });
}

function setPowerUpStoreOpen(isOpen) {
  if (!powerUpStorePanel) return;
  powerUpStorePanel.hidden = !isOpen;
  if (isOpen) {
    renderPowerUpStoreItems();
    renderPowerUpStatus();
  }
}

const hasSavedProgress =
  !!localStorage.getItem("gameState") || !!localStorage.getItem("tycoonMap");
if (resumeButton) {
  resumeButton.disabled = !hasSavedProgress;
}
if (!hasSavedProgress && startMessage) {
  startMessage.innerText = "No saved game found. Start a new game to begin.";
}

const presetColors = {
  custom: null,
  classic: "#1976d2",
  lava: "#ef6c00",
  forest: "#2e7d32",
  neon: "#00acc1",
};

nameInput.value = storedPlayerName || "";
colorInput.value = multiplayer.color;
colorHex.innerText = multiplayer.color.toUpperCase();
skinPresetInput.value = gameSettings.skinPreset;
masterVolumeInput.value = String(gameSettings.masterVolume);
musicVolumeInput.value = String(gameSettings.musicVolume);
sfxVolumeInput.value = String(gameSettings.sfxVolume);
shadowsToggleInput.checked = !!gameSettings.shadows;
qualityInput.value = gameSettings.quality;
inviteLinkInput.value = `${location.origin}/`;

if (presetColors[gameSettings.skinPreset]) {
  colorInput.value = presetColors[gameSettings.skinPreset];
  colorHex.innerText = colorInput.value.toUpperCase();
}

applyPlayerLook(colorInput.value);
applyGraphicsSettings();
updateStartGreeting(nameInput.value);
clearExpiredPowerUps();
renderPowerUpStatus();
applyAudioVolumes();
document.addEventListener("pointerdown", unlockAudio, { once: true });
document.addEventListener("keydown", unlockAudio, { once: true });

if (isFirstTimePlayer) {
  openPanel("settings");
  startMessage.innerText = "Enter your player name, then click Enter Server.";
}

nameInput.addEventListener("input", () => {
  updateStartGreeting(nameInput.value);
});

resumeButton.addEventListener("click", () => {
  unlockAudio();
  playSfx("click", 70);
  if (!hasSavedProgress) {
    playSfx("error", 140);
    startMessage.innerText = "No saved game to resume.";
    return;
  }

  openPanel(null);
  startMessage.innerText = "Resumed. Entering server...";
  document.body.classList.add("game-active");
  joinMultiplayer();
  initChainStore(multiplayer);
});

newGameButton.addEventListener("click", () => {
  unlockAudio();
  playSfx("click", 70);
  const shouldReset = window.confirm(
    "Start a new game? This will erase your saved progress.",
  );
  if (!shouldReset) return;

  localStorage.removeItem("gameState");
  localStorage.removeItem("tycoonMap");
  sessionStorage.setItem("forceNewGame", "1");
  sessionStorage.setItem("autoStartNewGame", "1");
  location.reload();
});

friendsButton.addEventListener("click", () => {
  unlockAudio();
  playSfx("click", 70);
  openPanel("friends");
  startMessage.innerText = "Share your link and enter the server together.";
});

settingsButton.addEventListener("click", () => {
  unlockAudio();
  playSfx("click", 70);
  openPanel("settings");
  startMessage.innerText =
    "Adjust character skin, sound, and graphics settings.";
});

copyInviteButton.addEventListener("click", async () => {
  unlockAudio();
  playSfx("click", 70);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(inviteLinkInput.value);
    } else {
      inviteLinkInput.select();
      document.execCommand("copy");
    }
    startMessage.innerText = "Invite link copied.";
    playSfx("success", 140);
  } catch (_error) {
    startMessage.innerText = "Copy failed. Please copy manually.";
    playSfx("error", 140);
  }
});

colorInput.addEventListener("input", (e) => {
  colorHex.innerText = e.target.value.toUpperCase();
  gameSettings.skinPreset = "custom";
  skinPresetInput.value = "custom";
  saveGameSettings();
  applyPlayerLook(e.target.value);
  updateStartGreeting(nameInput.value);
});

skinPresetInput.addEventListener("change", (e) => {
  const preset = e.target.value;
  gameSettings.skinPreset = preset;

  if (presetColors[preset]) {
    colorInput.value = presetColors[preset];
    colorHex.innerText = colorInput.value.toUpperCase();
    applyPlayerLook(colorInput.value);
    updateStartGreeting(nameInput.value);
  }
  saveGameSettings();
});

masterVolumeInput.addEventListener("input", () => {
  gameSettings.masterVolume = Number(masterVolumeInput.value);
  saveGameSettings();
  applyAudioVolumes();
});

musicVolumeInput.addEventListener("input", () => {
  gameSettings.musicVolume = Number(musicVolumeInput.value);
  saveGameSettings();
  applyAudioVolumes();
});

sfxVolumeInput.addEventListener("input", () => {
  gameSettings.sfxVolume = Number(sfxVolumeInput.value);
  saveGameSettings();
  applyAudioVolumes();
});

shadowsToggleInput.addEventListener("change", () => {
  gameSettings.shadows = shadowsToggleInput.checked;
  saveGameSettings();
  applyGraphicsSettings();
});

qualityInput.addEventListener("change", () => {
  gameSettings.quality = qualityInput.value;
  saveGameSettings();
  applyGraphicsSettings();
});

if (powerUpStoreButton) {
  powerUpStoreButton.addEventListener("click", () => {
    unlockAudio();
    playSfx("click", 70);
    const willOpen = powerUpStorePanel?.hidden;
    setPowerUpStoreOpen(!!willOpen);
  });
}

if (powerUpStoreClose) {
  powerUpStoreClose.addEventListener("click", () => {
    playSfx("click", 70);
    setPowerUpStoreOpen(false);
  });
}

playButton.addEventListener("click", () => {
  unlockAudio();
  playSfx("click", 70);
  const enteredName = nameInput.value.trim();
  if (!enteredName) {
    playSfx("error", 140);
    openPanel("settings");
    startMessage.innerText = "Please enter a player name before starting.";
    nameInput.focus();
    return;
  }

  multiplayer.playerName = enteredName;
  multiplayer.color = colorInput.value;

  localStorage.setItem("playerName", multiplayer.playerName);
  localStorage.setItem("playerColor", multiplayer.color);
  updateStartGreeting(multiplayer.playerName);

  gameSettings.skinPreset = skinPresetInput.value;
  gameSettings.masterVolume = Number(masterVolumeInput.value);
  gameSettings.musicVolume = Number(musicVolumeInput.value);
  gameSettings.sfxVolume = Number(sfxVolumeInput.value);
  gameSettings.shadows = shadowsToggleInput.checked;
  gameSettings.quality = qualityInput.value;

  applyPlayerLook(multiplayer.color);
  applyGraphicsSettings();
  saveGameSettings();

  document.body.classList.add("game-active");
  joinMultiplayer();
  initChainStore(multiplayer);
});

if (autoStartNewGame) {
  sessionStorage.removeItem("autoStartNewGame");
  document.body.classList.add("game-active");
  joinMultiplayer();
  initChainStore(multiplayer);
}

let currentPurchasePad = null;
const purchaseModal = document.getElementById("purchase-modal");
const purchaseText = document.getElementById("purchase-text");

document.getElementById("purchase-yes").addEventListener("click", () => {
  if (currentPurchasePad) {
    playSfx("purchase", 140);
    // Record purchase on-chain then refresh the leaderboard after tx confirms
    recordPurchaseOnChain(
      currentPurchasePad.title,
      currentPurchasePad.cost,
      state.money - currentPurchasePad.cost,
    ).then(() => refreshChainLeaderboard(9000));
    currentPurchasePad.permissionGranted = true;
    purchaseModal.style.display = "none";
  }
});

document.getElementById("purchase-no").addEventListener("click", () => {
  if (currentPurchasePad) {
    playSfx("error", 140);
    currentPurchasePad.permissionRejected = true;
    purchaseModal.style.display = "none";
    currentPurchasePad = null;
  }
});

// --- MAIN 3D RENDERING LOOP ---
const clock = new THREE.Clock();
let powerUpUiTick = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const time = clock.getElapsedTime();

  clearExpiredPowerUps();
  powerUpUiTick += dt;
  if (powerUpUiTick >= 0.25) {
    powerUpUiTick = 0;
    renderPowerUpStatus();
    if (powerUpStorePanel && !powerUpStorePanel.hidden) {
      renderPowerUpStoreItems();
    }
  }

  // 1. PLAYER MOVEMENT & ANIMATION
  let vx = 0,
    vz = 0;
  if (keys.w || keys.arrowup) vz -= 1;
  if (keys.s || keys.arrowdown) vz += 1;
  if (keys.a || keys.arrowleft) vx -= 1;
  if (keys.d || keys.arrowright) vx += 1;

  if (touchVector.x !== 0 || touchVector.z !== 0) {
    vx = touchVector.x;
    vz = touchVector.z;
  }

  let pSpeedObj = 0;
  if (vx !== 0 || vz !== 0) {
    let mag = Math.sqrt(vx * vx + vz * vz);
    if (mag > 1) {
      vx /= mag;
      vz /= mag;
      mag = 1;
    }

    const effectivePlayerSpeed = getEffectivePlayerSpeed();
    pSpeedObj = effectivePlayerSpeed * mag * dt;

    let moveX = vx * effectivePlayerSpeed * dt;
    let moveZ = vz * effectivePlayerSpeed * dt;

    // Apply Sliding Collisions
    if (!checkCollision(player.position.x + moveX, player.position.z)) {
      player.position.x += moveX;
    }
    if (!checkCollision(player.position.x, player.position.z + moveZ)) {
      player.position.z += moveZ;
    }

    player.rotation.y = Math.atan2(vx, vz);

    player.position.x = Math.max(-140, Math.min(140, player.position.x));
    player.position.z = Math.max(-80, Math.min(140, player.position.z));

    playSfx("walk", 220);
  }

  updateCharacterAnim(player, pSpeedObj, time);

  dirLight.position.x = player.position.x + 20;
  dirLight.position.z = player.position.z + 10;
  dirLight.target.position.copy(player.position);
  dirLight.target.updateMatrixWorld();

  // Interpolate Remote Players
  multiplayer.remotePlayers.forEach((remote) => {
    if (remote.targetX !== undefined) {
      let dx = remote.targetX - remote.mesh.position.x;
      let dz = remote.targetZ - remote.mesh.position.z;
      let dist = Math.hypot(dx, dz);

      remote.mesh.position.x += dx * (dt * 10);
      remote.mesh.position.z += dz * (dt * 10);

      let dr = remote.targetRotation - remote.mesh.rotation.y;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      remote.mesh.rotation.y += dr * (dt * 10);

      updateCharacterAnim(remote.mesh, dist > 0.05 ? dist * 10 : 0, time);
    }
  });

  // 2. CAMERA TRACKING
  const targetCamX = player.position.x;
  const targetCamZ = player.position.z + 35;
  const targetCamY = 30;

  camera.position.x += (targetCamX - camera.position.x) * (dt * 5);
  camera.position.z += (targetCamZ - camera.position.z) * (dt * 5);
  camera.position.y += (targetCamY - camera.position.y) * (dt * 5);
  camera.lookAt(player.position.x, player.position.y, player.position.z);

  // 3. DATA PACKET ANIMATIONS
  for (let i = dataPackets.length - 1; i >= 0; i--) {
    let d = dataPackets[i];
    if (!d.active) {
      scene.remove(d.mesh);
      if (d.uiElement) d.uiElement.remove();
      dataPackets.splice(i, 1);
      continue;
    }

    d.mesh.position.y = d.ogY + Math.sin(time * 3 + d.position.x) * 0.5;
    d.mesh.rotation.y += dt;
    d.mesh.rotation.x += dt * 0.5;

    // Player Data Collection
    let dist = Math.hypot(
      player.position.x - d.position.x,
      player.position.z - d.position.z,
    );
    if (dist < 2.5 && state.dataCount < state.dataMax) {
      d.active = false;
      state.dataCount++;
      updateUI();
      playSfx("collect", 90);
      spawnFloatingText(
        player.position.x,
        3,
        player.position.z,
        "+ BLOCK",
        "#1976D2",
      );
    }
  }

  // 4. PAD PURCHASING LOGIC
  for (let i = pads.length - 1; i >= 0; i--) {
    let pad = pads[i];
    if (!pad.active) continue;

    let dx = Math.abs(player.position.x - pad.position.x);
    let dz = Math.abs(player.position.z - pad.position.z);

    if (dx < pad.width / 2 && dz < pad.length / 2) {
      // If pad is stuck, finalize the upgrade
      if (pad.isStuck) {
        // Change UI to show "COLLECT" feedback
        const titleEl = pad.uiElement.querySelector(".pad-title");
        const costEl = pad.uiElement.querySelector(".pad-cost");
        titleEl.innerText = "COLLECTING...";
        titleEl.classList.remove("stuck");
        costEl.innerText = "✓ DONE";
        costEl.classList.remove("stuck");

        // Call the upgrade callback
        pad.onComplete(pad);

        if (!pad.isRepeatable) {
          pad.active = false;
          pad.uiElement.remove();
          scene.remove(pad.group);
          pads.splice(i, 1);
        } else {
          // Reset for next upgrade
          pad.isStuck = false;
          pad.paid = 0;
          pad.permissionGranted = false;
          const titleEl = pad.uiElement.querySelector(".pad-title");
          const costEl = pad.uiElement.querySelector(".pad-cost");
          titleEl.innerText = pad.originalTitle;
          titleEl.classList.remove("stuck");
          costEl.innerText = "$" + pad.cost;
          costEl.classList.remove("stuck");
          pad.fillPlane.scale.set(0.001, 0.001, 1);

          // Reset glow color back to original
          if (pad.padGlow && pad.padGlow.material) {
            pad.padGlow.material.color.setHex(0xff5722);
            pad.padGlow.material.opacity = 0.6;
          }
        }
      }
      // If not stuck yet, accumulate payment
      else if (state.money > 0 && pad.paid < pad.cost) {
        if (pad.paid === 0 && !pad.permissionGranted) {
          if (!pad.permissionRejected && currentPurchasePad !== pad) {
            currentPurchasePad = pad;
            purchaseText.innerText = `Buy ${pad.title} for $${pad.cost}?`;
            purchaseModal.style.display = "flex";
          }
          continue;
        }

        let drain = Math.ceil(pad.cost * 0.04);
        let amt = Math.min(state.money, drain, pad.cost - pad.paid);
        if (amt < 1) amt = 1;

        state.money -= amt;
        pad.paid += amt;
        updateUI();

        pad.uiElement.querySelector(".pad-cost").innerText =
          "$" + (pad.cost - pad.paid);
        let ratio = pad.paid / pad.cost;
        pad.fillPlane.scale.set(ratio, ratio, 1);

        if (Math.random() < 0.2)
          spawnFloatingText(
            player.position.x,
            4,
            player.position.z,
            "$",
            "#4CAF50",
          );

        // Payment complete - STUCK STATE (don't finalize yet)
        if (pad.paid >= pad.cost) {
          pad.paid = pad.cost;
          playSfx("success", 180);
          pad.isStuck = true;
          pad.uiElement.querySelector(".pad-title").classList.add("stuck");
          pad.uiElement.querySelector(".pad-cost").classList.add("stuck");
          pad.uiElement.querySelector(".pad-title").innerText =
            "RETURN TO COLLECT!";
          pad.uiElement.querySelector(".pad-cost").innerText = "TAP AGAIN";
          pad.fillPlane.scale.set(1.0, 1.0, 1);

          // Change glow color to brighter orange when stuck
          if (pad.padGlow && pad.padGlow.material) {
            pad.padGlow.material.color.setHex(0xffb300);
            pad.padGlow.material.opacity = 0.8;
          }

          spawnFloatingText(
            pad.position.x,
            8,
            pad.position.z,
            "STUCK",
            "#FF6F00",
          );
        }
      }
    } else {
      if (pad.permissionRejected) pad.permissionRejected = false;
      if (currentPurchasePad === pad) {
        purchaseModal.style.display = "none";
        currentPurchasePad = null;
      }
    }
  }

  // 5. SERVER DROP OFF & PROCESSING LOGIC
  servers.forEach((server) => {
    let dist = Math.hypot(
      player.position.x - server.position.x,
      player.position.z - server.position.z,
    );

    if (dist < 10 && state.dataCount > 0) {
      const s = server.stats;
      if (!player.lastDrop) player.lastDrop = 0;

      if (s.storedData < s.capacity && time - player.lastDrop > 0.15) {
        s.storedData++;
        state.dataCount--;
        updateUI();
        updateServerUI(server);
        player.lastDrop = time;
        spawnFloatingText(
          player.position.x,
          3,
          player.position.z,
          "[]",
          "#FFC107",
        );
      }
    }

    server.ring.rotation.z -= dt * 2.0;

    const s = server.stats;
    let isProcessing = s.storedData > 0;

    // --- REAL LIGHTING ANIMATIONS ---
    server.leds.forEach((led) => {
      if (isProcessing) {
        // High-speed computing blinking
        led.mat.emissiveIntensity =
          0.2 + Math.abs(Math.sin(time * 15 + led.offset)) * 0.8;
        led.mat.emissive.setHex(0xffc107); // Data Yellow Active
      } else {
        // Idle slow heartbeat
        led.mat.emissiveIntensity =
          Math.max(0, Math.sin(time * 2 + led.offset)) * 0.4;
        led.mat.emissive.setHex(0x1976d2); // Cool Blue Idle
      }
    });

    // Top Heat Exhaust Animation
    if (isProcessing) {
      server.coreMat.emissiveIntensity =
        0.3 + Math.abs(Math.sin(time * 8)) * 0.7;
      server.exhaust.scale.y = 1.0 + Math.abs(Math.sin(time * 20)) * 0.3; // Physical venting squash/stretch
    } else {
      server.coreMat.emissiveIntensity = 0.1;
      server.exhaust.scale.y = 1.0;
    }

    if (isProcessing) {
      s.processTimer += dt;
      const processThreshold =
        s.processSpeed * getEffectiveProcessSpeedMultiplier();
      if (s.processTimer >= processThreshold) {
        s.processTimer = 0;
        s.storedData--;
        const payout = Math.max(
          1,
          Math.floor(s.moneyValue * getEffectiveIncomeMultiplier()),
        );
        state.money += payout;
        updateUI();
        updateServerUI(server);
        spawnFloatingText(
          server.position.x,
          18,
          server.position.z,
          `+$${payout}`,
          "#4CAF50",
        );
      }
    }
  });

  // 6. WORKER AI LOGIC
  // Calculate if there is any data outside the HQ room (HQ room starts at Z=20)
  const validDataPackets = dataPackets.filter((d) => d.active);
  const dataAvailable = validDataPackets.length > 0;

  workers.forEach((w) => {
    let isFull = w.dataCount >= w.dataMax;
    if (!dataAvailable && w.dataCount > 0) isFull = true;

    let wSpeedObj = 0;

    if (!isFull) {
      if (!w.targetData || !w.targetData.active) {
        let closest = null;
        let minDist = Infinity;
        for (let d of dataPackets) {
          if (d.active && !d.isTargeted) {
            let dist = Math.hypot(
              w.position.x - d.position.x,
              w.position.z - d.position.z,
            );
            if (dist < minDist) {
              minDist = dist;
              closest = d;
            }
          }
        }
        if (closest) {
          w.targetData = closest;
          closest.isTargeted = true;
        } else {
          w.targetData = null;
        }
      }

      if (w.targetData && w.targetData.active) {
        let dist = Math.hypot(
          w.position.x - w.targetData.position.x,
          w.position.z - w.targetData.position.z,
        );
        if (dist < 2.0) {
          w.targetData.active = false;
          w.targetData = null;
          w.dataCount++;
          spawnFloatingText(w.position.x, 3, w.position.z, "+1", "#1976D2");
        } else {
          let dx = w.targetData.position.x - w.position.x;
          let dz = w.targetData.position.z - w.position.z;
          let mag = Math.hypot(dx, dz);
          wSpeedObj = w.speed * dt;
          w.position.x += (dx / mag) * wSpeedObj;
          w.position.z += (dz / mag) * wSpeedObj;
          w.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
    } else {
      if (
        !w.targetServer ||
        w.targetServer.stats.storedData >= w.targetServer.stats.capacity
      ) {
        let closest = null;
        let minDist = Infinity;
        for (let s of servers) {
          if (s.stats.storedData < s.stats.capacity) {
            let dist = Math.hypot(
              w.position.x - s.position.x,
              w.position.z - s.position.z,
            );
            if (dist < minDist) {
              minDist = dist;
              closest = s;
            }
          }
        }
        w.targetServer = closest;
      }

      if (w.targetServer) {
        let dist = Math.hypot(
          w.position.x - w.targetServer.position.x,
          w.position.z - (w.targetServer.position.z + 5),
        );
        if (dist < 8) {
          let srv = w.targetServer;
          let maxDrop = Math.min(
            w.dataCount,
            srv.stats.capacity - srv.stats.storedData,
          );
          srv.stats.storedData += maxDrop;
          w.dataCount -= maxDrop;

          if (w.dataCount <= 0) w.targetServer = null;

          updateServerUI(srv);
          spawnFloatingText(
            w.position.x,
            3,
            w.position.z,
            `-${maxDrop} DROP`,
            "#1976D2",
          );
        } else {
          let dx = w.targetServer.position.x - w.position.x;
          let dz = w.targetServer.position.z + 5 - w.position.z;
          let mag = Math.hypot(dx, dz);
          wSpeedObj = w.speed * dt;
          w.position.x += (dx / mag) * wSpeedObj;
          w.position.z += (dz / mag) * wSpeedObj;
          w.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
    }

    updateCharacterAnim(w.mesh, wSpeedObj, time);

    // Sync worker glow position
    if (w.glowMesh) {
      w.glowMesh.position.copy(w.position);
    }
  });

  // 7. SYNC WORKER GLOW POSITIONS & UPDATE MINIMAP
  // (glow sync done above in worker loop)
  updateMinimap(player.position);

  // 8. NETWORK SYNC FOR MULTIPLAYER / LEADERBOARD
  if (
    !multiplayer.playerId &&
    performance.now() - multiplayer.lastJoinAt > 5000
  ) {
    joinMultiplayer();
  }
  pushMultiplayerState();
  pullMultiplayerState();

  // 9. SYNC 2D UI TO 3D GAME
  syncHTMLOverlays();

  renderer.render(scene, camera);
}

// Start Engine
animate();

export {
  addCollider,
  ambientLight,
  animate,
  apiRoot,
  camera,
  checkCollision,
  clock,
  colliders,
  container,
  createGlowHalo,
  createGrassTexture,
  createHuman,
  createNameTag,
  createPurchaseZone,
  createServer,
  dataPackets,
  dirLight,
  escapeHtml,
  floor,
  floorGeo,
  floorMat,
  hireWorker,
  initMap,
  jBase,
  joinMultiplayer,
  jStart,
  jStick,
  keys,
  labelsBox,
  leaderboardList,
  minimapCanvas,
  minimapCtx,
  minimapScale,
  minimapSize,
  multiplayer,
  multiplayerStatus,
  packetGeo,
  packetMat,
  pads,
  player,
  pullMultiplayerState,
  pushMultiplayerState,
  removeRemotePlayer,
  renderer,
  renderLeaderboard,
  ringGeo,
  ringMat,
  savedState,
  scene,
  serverPositions,
  servers,
  setMultiplayerStatus,
  spawnFloatingText,
  state,
  syncHTMLOverlays,
  syncRemotePlayers,
  syncWorldLabel,
  touchEnd,
  touchVector,
  unlockServer,
  updateCharacterAnim,
  updateMinimap,
  updateServerUI,
  updateUI,
  workers
};

