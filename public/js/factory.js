import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";
import { pads, servers, dataPackets, workers, colliders, state } from "./state-globals.js";
import { savedState, apiRoot, multiplayer, leaderboardList, multiplayerStatus, container, labelsBox, scene, camera, renderer, ambientLight, dirLight, floorGeo, floorMat, floor, keys, touchVector, jStart, jBase, jStick, touchEnd, player, packetGeo, packetMat, ringGeo, ringMat, minimapCanvas, minimapCtx, minimapScale, minimapSize, serverPositions, initMap, clock, animate, addCollider, checkCollision, createGrassTexture, createHuman, updateCharacterAnim, createGlowHalo, updateMinimap, updateUI, escapeHtml, setMultiplayerStatus, renderLeaderboard, createNameTag, removeRemotePlayer, syncRemotePlayers, joinMultiplayer, pushMultiplayerState, pullMultiplayerState, spawnFloatingText, syncHTMLOverlays, syncWorldLabel, hireWorker } from "../main.js";

export function createPurchaseZone(
  x,
  z,
  width,
  depth,
  title,
  cost,
  isRepeatable,
  onComplete,
) {
  const group = new THREE.Group();
  group.position.set(x, 0.1, z);
  scene.add(group);

  const geo = new THREE.PlaneGeometry(width, depth);
  const edgeGeo = new THREE.EdgesGeometry(geo);
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x1976d2,
    linewidth: 2,
  });
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);
  edges.rotation.x = -Math.PI / 2;
  group.add(edges);

  const baseMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
  });
  const baseMesh = new THREE.Mesh(geo, baseMat);
  baseMesh.rotation.x = -Math.PI / 2;
  group.add(baseMesh);

  const fillMat = new THREE.MeshBasicMaterial({
    color: 0xffc107,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  const fillPlane = new THREE.Mesh(geo, fillMat);
  fillPlane.rotation.x = -Math.PI / 2;
  fillPlane.position.y = 0.05;
  fillPlane.scale.set(0.001, 0.001, 1);
  group.add(fillPlane);

  // Add glow halo to purchase pad
  const padGlow = createGlowHalo(Math.max(width, depth) / 1.5, 0xff5722, 0.3);
  group.add(padGlow);

  const ui = document.createElement("div");
  ui.className = "floating-label";
  ui.innerHTML = `<div class="pad-title">${title}</div><div class="pad-cost">$${cost}</div>`;
  labelsBox.appendChild(ui);

  const padData = {
    group,
    fillPlane,
    padGlow,
    uiElement: ui,
    position: new THREE.Vector3(x, 0, z),
    width,
    length: depth,
    title,
    cost,
    paid: 0,
    isRepeatable,
    onComplete,
    active: true,
    isPad: true,
    isStuck: false,
    originalTitle: title,
  };
  pads.push(padData);
  return padData;
}

export function unlockServer(x, z) {
  const s = createServer(x, z);
  s.stats.level = state.serverLevel;
  s.stats.capacity = 10 + (state.serverLevel - 1) * 5;
  s.stats.moneyValue = 3 + (state.serverLevel - 1) * 2;
  s.stats.processSpeed = Math.max(
    0.15,
    1.0 * Math.pow(0.85, state.serverLevel - 1),
  );
  updateServerUI(s);
  spawnFloatingText(s.position.x, 18, s.position.z, "ONLINE!", "#1976D2");
}

export function createServer(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  // Tower Base
  const baseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(9, 1, 7),
    new THREE.MeshLambertMaterial({ color: 0x455a64 }),
  );
  baseMesh.position.y = 0.5;
  baseMesh.castShadow = true;
  group.add(baseMesh);

  // Inner Rack Frame
  const frameMesh = new THREE.Mesh(
    new THREE.BoxGeometry(8.5, 14, 6.5),
    new THREE.MeshLambertMaterial({ color: 0x263238 }),
  );
  frameMesh.position.y = 8;
  frameMesh.castShadow = true;
  group.add(frameMesh);

  // Clean Outer Case Panels
  const sideMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
  const lPanel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 13.5, 6), sideMat);
  lPanel.position.set(-4.0, 8, 0);
  group.add(lPanel);
  const rPanel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 13.5, 6), sideMat);
  rPanel.position.set(4.0, 8, 0);
  group.add(rPanel);
  const topPanel = new THREE.Mesh(
    new THREE.BoxGeometry(8.5, 0.5, 6.5),
    sideMat,
  );
  topPanel.position.set(0, 15.25, 0);
  group.add(topPanel);

  // Sub-Blades and LED Arrays
  const bladeGeo = new THREE.BoxGeometry(6.5, 1.2, 1);
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0xcfd8dc });
  const leds = [];

  for (let i = 0; i < 8; i++) {
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(0, 2.5 + i * 1.6, 3.0);
    group.add(blade);

    // 2 indicator LEDs per blade
    for (let j = 0; j < 2; j++) {
      const ledMat = new THREE.MeshLambertMaterial({
        color: 0x1976d2,
        emissive: 0x1976d2,
        emissiveIntensity: 0,
      });
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.2), ledMat);
      led.position.set(1.5 + j * 1.0, 2.5 + i * 1.6, 3.6);
      group.add(led);
      leds.push({ mat: ledMat, offset: Math.random() * 100 });
    }
  }

  // Processing Core Exhaust
  const coreMat = new THREE.MeshLambertMaterial({
    color: 0x00e5ff,
    emissive: 0x00e5ff,
    emissiveIntensity: 0.2,
  });
  const exhaust = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 4), coreMat);
  exhaust.position.set(0, 15.6, 0);
  group.add(exhaust);

  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;
  group.add(ring);

  // Add glow halo to server
  const serverGlow = createGlowHalo(7, 0x1976d2, 0.3);
  group.add(serverGlow);

  scene.add(group);

  const ui = document.createElement("div");
  ui.className = "floating-label server-ui";
  labelsBox.appendChild(ui);

  const serverData = {
    group,
    position: group.position,
    uiElement: ui,
    ring,
    isServer: true,
    leds,
    coreMat,
    exhaust,
    stats: {
      level: 1,
      capacity: 10,
      storedData: 0,
      processSpeed: 1.0,
      moneyValue: 3,
      processTimer: 0,
    },
  };

  addCollider(x, z, 9.5, 7.5); // Add physical bounding box for the server rack

  servers.push(serverData);
  updateServerUI(serverData);
  return serverData;
}

export function updateServerUI(server) {
  const s = server.stats;
  server.uiElement.innerText = `[${s.storedData}/${s.capacity}] L${s.level}`;
}

