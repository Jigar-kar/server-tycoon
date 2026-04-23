import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";
import { savedState, state, pads, servers, dataPackets, workers, colliders, apiRoot, multiplayer, leaderboardList, multiplayerStatus, container, labelsBox, scene, camera, renderer, ambientLight, dirLight, floorGeo, floorMat, floor, keys, touchVector, jStart, jBase, jStick, touchEnd, player, packetGeo, packetMat, ringGeo, ringMat, minimapCanvas, minimapCtx, minimapScale, minimapSize, serverPositions, initMap, clock, animate, addCollider, checkCollision, createGrassTexture, createHuman, updateCharacterAnim, createGlowHalo, removeRemotePlayer, syncRemotePlayers, joinMultiplayer, pushMultiplayerState, pullMultiplayerState, createPurchaseZone, unlockServer, createServer, updateServerUI, hireWorker } from "../main.js";

export function updateMinimap(playerPos) {
  const centerX = minimapSize / 2;
  const centerY = minimapSize / 2;

  // Clear canvas
  minimapCtx.fillStyle = "rgba(0, 20, 40, 0.95)";
  minimapCtx.fillRect(0, 0, minimapSize, minimapSize);

  // Draw grid
  minimapCtx.strokeStyle = "rgba(25, 118, 210, 0.2)";
  minimapCtx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    minimapCtx.beginPath();
    minimapCtx.moveTo((minimapSize / 4) * i, 0);
    minimapCtx.lineTo((minimapSize / 4) * i, minimapSize);
    minimapCtx.stroke();
    minimapCtx.beginPath();
    minimapCtx.moveTo(0, (minimapSize / 4) * i);
    minimapCtx.lineTo(minimapSize, (minimapSize / 4) * i);
    minimapCtx.stroke();
  }

  // Draw servers
  servers.forEach((server) => {
    const relX = (server.position.x - playerPos.x) * minimapScale;
    const relZ = (server.position.z - playerPos.z) * minimapScale;
    const x = centerX + relX;
    const z = centerY + relZ;

    if (Math.abs(relX) < minimapSize && Math.abs(relZ) < minimapSize) {
      minimapCtx.fillStyle = "#1976D2";
      minimapCtx.beginPath();
      minimapCtx.arc(x, z, 5, 0, Math.PI * 2);
      minimapCtx.fill();
      minimapCtx.strokeStyle = "#00FFFF";
      minimapCtx.lineWidth = 2;
      minimapCtx.stroke();
    }
  });

  // Draw workers
  workers.forEach((worker) => {
    const relX = (worker.position.x - playerPos.x) * minimapScale;
    const relZ = (worker.position.z - playerPos.z) * minimapScale;
    const x = centerX + relX;
    const z = centerY + relZ;

    if (Math.abs(relX) < minimapSize && Math.abs(relZ) < minimapSize) {
      minimapCtx.fillStyle = "#FFEB3B";
      minimapCtx.beginPath();
      minimapCtx.arc(x, z, 4, 0, Math.PI * 2);
      minimapCtx.fill();
      minimapCtx.strokeStyle = "#FFA000";
      minimapCtx.lineWidth = 1.5;
      minimapCtx.stroke();
    }
  });

  // Draw data packets
  dataPackets.forEach((packet) => {
    if (!packet.active) return;
    const relX = (packet.position.x - playerPos.x) * minimapScale;
    const relZ = (packet.position.z - playerPos.z) * minimapScale;
    const x = centerX + relX;
    const z = centerY + relZ;

    if (Math.abs(relX) < minimapSize && Math.abs(relZ) < minimapSize) {
      minimapCtx.fillStyle = "#FFC107";
      minimapCtx.beginPath();
      minimapCtx.arc(x, z, 3, 0, Math.PI * 2);
      minimapCtx.fill();
    }
  });

  // Draw pads
  pads.forEach((pad) => {
    if (!pad.active) return;
    const relX = (pad.position.x - playerPos.x) * minimapScale;
    const relZ = (pad.position.z - playerPos.z) * minimapScale;
    const x = centerX + relX;
    const z = centerY + relZ;

    if (Math.abs(relX) < minimapSize && Math.abs(relZ) < minimapSize) {
      minimapCtx.fillStyle = "rgba(144, 164, 174, 0.7)";
      minimapCtx.fillRect(x - 3, z - 3, 6, 6);
      minimapCtx.strokeStyle = "#FF5722";
      minimapCtx.lineWidth = 1.5;
      minimapCtx.strokeRect(x - 3, z - 3, 6, 6);
    }
  });

  // Draw remote players
  multiplayer.remotePlayers.forEach((entity) => {
    const mesh = entity.mesh;
    const relX = (mesh.position.x - playerPos.x) * minimapScale;
    const relZ = (mesh.position.z - playerPos.z) * minimapScale;
    const x = centerX + relX;
    const z = centerY + relZ;

    if (Math.abs(relX) < minimapSize && Math.abs(relZ) < minimapSize) {
      minimapCtx.fillStyle = entity.color || "#8e24aa";
      minimapCtx.beginPath();
      minimapCtx.arc(x, z, 4, 0, Math.PI * 2);
      minimapCtx.fill();
      minimapCtx.strokeStyle = "#ffffff";
      minimapCtx.lineWidth = 1.5;
      minimapCtx.stroke();
    }
  });

  // Draw player (center)
  minimapCtx.fillStyle = "#4CAF50";
  minimapCtx.beginPath();
  minimapCtx.arc(centerX, centerY, 6, 0, Math.PI * 2);
  minimapCtx.fill();
  minimapCtx.strokeStyle = "#00FF00";
  minimapCtx.lineWidth = 2;
  minimapCtx.stroke();

  // Draw player direction
  minimapCtx.strokeStyle = "#00FF00";
  minimapCtx.lineWidth = 2;
  minimapCtx.beginPath();
  minimapCtx.moveTo(centerX, centerY);
  minimapCtx.lineTo(centerX + 8, centerY);
  minimapCtx.stroke();
}

export function updateUI() {
  document.getElementById("money-text").innerText = "$" + state.money;
  const txtData = document.getElementById("data-text");
  txtData.innerText = `DATA: ${state.dataCount} / ${state.dataMax}`;
  txtData.style.color =
    state.dataCount >= state.dataMax ? "#D32F2F" : "#1976D2";
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function setMultiplayerStatus(text, connected) {
  multiplayerStatus.innerText = text;
  multiplayerStatus.style.color = connected ? "#2e7d32" : "#1976d2";
  multiplayerStatus.style.borderColor = connected
    ? "rgba(76, 175, 80, 0.45)"
    : "rgba(25, 118, 210, 0.35)";
  multiplayerStatus.style.boxShadow = connected
    ? "0 0 18px rgba(76, 175, 80, 0.35)"
    : "0 6px 18px rgba(0, 0, 0, 0.12)";
}

// Stub — the on-chain Top Spenders panel (chain-store.js) is the leaderboard now.
export function renderLeaderboard(_entries = []) {}

export function createNameTag(text, accentColor, isLocal = false) {
  const tag = document.createElement("div");
  tag.className = `floating-label name-tag ${isLocal ? "local-name-tag" : "remote-name-tag"}`;
  tag.style.background = isLocal
    ? "rgba(76, 175, 80, 0.92)"
    : "rgba(255, 255, 255, 0.94)";
  tag.style.border = `2px solid ${accentColor}`;
  tag.style.color = isLocal ? "#ffffff" : "#0d47a1";
  tag.style.padding = "4px 10px";
  tag.style.borderRadius = "999px";
  tag.style.fontSize = "12px";
  tag.style.fontWeight = "900";
  tag.style.letterSpacing = "0.6px";
  tag.style.boxShadow = "0 6px 16px rgba(0,0,0,0.18)";
  tag.innerText = text;
  labelsBox.appendChild(tag);
  return tag;
}

export function spawnFloatingText(x, y, z, textStr, colorHex) {
  const el = document.createElement("div");
  el.className = "floating-label";
  el.style.color = colorHex;
  el.style.fontSize = "24px";
  el.style.textShadow = "0 2px 4px rgba(0,0,0,0.3)";
  el.style.fontWeight = "bold";
  el.innerText = textStr;
  labelsBox.appendChild(el);

  let worldPos = new THREE.Vector3(x, y, z);
  let life = 1.0;

  const loop = () => {
    life -= 0.02;
    worldPos.y += 0.2;

    let screenPos = worldPos.clone().project(camera);
    if (screenPos.z < 1) {
      let sx = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
      let sy = (screenPos.y * -0.5 + 0.5) * window.innerHeight;
      el.style.left = sx + "px";
      el.style.top = sy + "px";
      el.style.opacity = life;
    } else {
      el.style.display = "none";
    }

    if (life <= 0) el.remove();
    else requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export function syncHTMLOverlays() {
  // Sync all objects with UI elements: servers, pads, workers, data packets, and player tags
  [...pads, ...servers, ...workers, ...dataPackets].forEach((obj) => {
    if (!obj.uiElement) return;
    let pos = obj.position.clone();

    // Adjust height based on object type
    if (obj.isServer)
      pos.y += 18; // Server UI above racks
    else if (obj.isPad)
      pos.y += 6; // Pad UI above zones
    else if (obj.isWorker)
      pos.y += 4; // Worker UI above head
    else if (obj.isData) pos.y += 2; // Data packet UI above

    let screenPos = pos.project(camera);
    if (screenPos.z > 1) {
      obj.uiElement.style.display = "none";
      return;
    }

    obj.uiElement.style.display = "block";
    let sx = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    let sy = (screenPos.y * -0.5 + 0.5) * window.innerHeight;
    obj.uiElement.style.left = sx + "px";
    obj.uiElement.style.top = sy + "px";
  });

  if (player.labelElement) {
    syncWorldLabel(player, player.labelElement, 6);
  }

  multiplayer.remotePlayers.forEach((remote) => {
    if (remote.labelElement) {
      syncWorldLabel(remote.mesh, remote.labelElement, 6);
    }
  });
}

export function syncWorldLabel(target, element, offsetY) {
  const pos = target.position.clone();
  pos.y += offsetY;

  const screenPos = pos.project(camera);
  if (screenPos.z > 1) {
    element.style.display = "none";
    return;
  }

  element.style.display = "block";
  const sx = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
  const sy = (screenPos.y * -0.5 + 0.5) * window.innerHeight;
  element.style.left = sx + "px";
  element.style.top = sy + "px";
}

