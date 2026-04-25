import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";
import { pads, servers, dataPackets, workers, colliders, state } from "./state-globals.js";
import { savedState, apiRoot, multiplayer, leaderboardList, multiplayerStatus, container, labelsBox, scene, camera, renderer, ambientLight, dirLight, floorGeo, floorMat, floor, keys, touchVector, jStart, jBase, jStick, touchEnd, player, packetGeo, packetMat, ringGeo, ringMat, minimapCanvas, minimapCtx, minimapScale, minimapSize, serverPositions, initMap, clock, animate, addCollider, checkCollision, createGrassTexture, createHuman, updateCharacterAnim, createGlowHalo, removeRemotePlayer, syncRemotePlayers, joinMultiplayer, pushMultiplayerState, pullMultiplayerState, createPurchaseZone, unlockServer, createServer, updateServerUI, hireWorker } from "../main.js";

// Persistent scan angle state (module-level)
let _mmScanAngle = 0;

export function updateMinimap(playerPos) {
  const W = minimapCanvas.width;
  const H = minimapCanvas.height;
  const R = W / 2; // radius
  const cx = W / 2;
  const cy = H / 2;

  // ─── 1. Clip to circle ────────────────────────────────────────────────────
  minimapCtx.clearRect(0, 0, W, H);
  minimapCtx.save();
  minimapCtx.beginPath();
  minimapCtx.arc(cx, cy, R - 1, 0, Math.PI * 2);
  minimapCtx.clip();

  // ─── 2. Deep space background ─────────────────────────────────────────────
  const bgGrad = minimapCtx.createRadialGradient(cx, cy, 0, cx, cy, R);
  bgGrad.addColorStop(0, "rgba(4, 16, 40, 1)");
  bgGrad.addColorStop(0.7, "rgba(2, 10, 26, 1)");
  bgGrad.addColorStop(1, "rgba(0, 5, 15, 1)");
  minimapCtx.fillStyle = bgGrad;
  minimapCtx.fillRect(0, 0, W, H);

  // ─── 3. Concentric range rings ─────────────────────────────────────────────
  [0.25, 0.5, 0.75, 1.0].forEach((frac) => {
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cy, R * frac, 0, Math.PI * 2);
    minimapCtx.strokeStyle = `rgba(0, 200, 255, ${frac === 1.0 ? 0.08 : 0.06})`;
    minimapCtx.lineWidth = frac === 1.0 ? 1 : 0.75;
    minimapCtx.stroke();
  });

  // ─── 4. Cross-hair lines ───────────────────────────────────────────────────
  minimapCtx.strokeStyle = "rgba(0, 180, 255, 0.1)";
  minimapCtx.lineWidth = 0.75;
  minimapCtx.setLineDash([4, 6]);
  minimapCtx.beginPath(); minimapCtx.moveTo(cx, 0); minimapCtx.lineTo(cx, H); minimapCtx.stroke();
  minimapCtx.beginPath(); minimapCtx.moveTo(0, cy); minimapCtx.lineTo(W, cy); minimapCtx.stroke();
  minimapCtx.setLineDash([]);

  // ─── 5. Radar sweep ────────────────────────────────────────────────────────
  _mmScanAngle = (_mmScanAngle + 0.035) % (Math.PI * 2);
  const sweepGrad = minimapCtx.createConicalGradient
    ? null // Only exists in some engines; we fake it with arcs
    : null;
  // Fake conical gradient using a filled arc + radial fade
  const sweepArcLen = Math.PI * 0.55;
  minimapCtx.save();
  minimapCtx.translate(cx, cy);
  minimapCtx.rotate(_mmScanAngle);
  const sweepFill = minimapCtx.createLinearGradient(0, 0, R, 0);
  sweepFill.addColorStop(0, "rgba(0, 255, 160, 0.0)");
  sweepFill.addColorStop(0.5, "rgba(0, 255, 160, 0.08)");
  sweepFill.addColorStop(1, "rgba(0, 255, 160, 0.0)");
  minimapCtx.beginPath();
  minimapCtx.moveTo(0, 0);
  minimapCtx.arc(0, 0, R, -sweepArcLen / 2, sweepArcLen / 2);
  minimapCtx.closePath();
  minimapCtx.fillStyle = sweepFill;
  minimapCtx.fill();

  // Leading bright edge line
  minimapCtx.strokeStyle = "rgba(0, 255, 160, 0.55)";
  minimapCtx.lineWidth = 1.5;
  minimapCtx.beginPath();
  minimapCtx.moveTo(0, 0);
  minimapCtx.lineTo(R, 0);
  minimapCtx.stroke();
  minimapCtx.restore();

  // ─── 6. Purchase Pads (orange diamonds) ────────────────────────────────────
  pads.forEach((pad) => {
    if (!pad.active) return;
    const relX = (pad.position.x - playerPos.x) * minimapScale;
    const relZ = (pad.position.z - playerPos.z) * minimapScale;
    const x = cx + relX; const z = cy + relZ;
    if (x < -8 || x > W + 8 || z < -8 || z > H + 8) return;
    minimapCtx.save();
    minimapCtx.translate(x, z);
    minimapCtx.rotate(Math.PI / 4);
    minimapCtx.fillStyle = "rgba(255, 160, 0, 0.85)";
    minimapCtx.fillRect(-4, -4, 8, 8);
    minimapCtx.strokeStyle = "#FF6D00";
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(-4, -4, 8, 8);
    minimapCtx.restore();
  });

  // ─── 7. Servers (blue server tower icons) ─────────────────────────────────
  servers.forEach((server) => {
    const relX = (server.position.x - playerPos.x) * minimapScale;
    const relZ = (server.position.z - playerPos.z) * minimapScale;
    const x = cx + relX; const z = cy + relZ;
    if (x < -12 || x > W + 12 || z < -12 || z > H + 12) return;

    // Glow halo
    const glowGrad = minimapCtx.createRadialGradient(x, z, 0, x, z, 12);
    glowGrad.addColorStop(0, "rgba(0, 180, 255, 0.35)");
    glowGrad.addColorStop(1, "rgba(0, 180, 255, 0)");
    minimapCtx.fillStyle = glowGrad;
    minimapCtx.beginPath(); minimapCtx.arc(x, z, 12, 0, Math.PI * 2); minimapCtx.fill();

    // Square body
    minimapCtx.fillStyle = "#1565C0";
    minimapCtx.fillRect(x - 5, z - 5, 10, 10);

    // Cyan LED strips
    minimapCtx.fillStyle = "#00E5FF";
    minimapCtx.fillRect(x - 4, z - 3, 8, 1.5);
    minimapCtx.fillRect(x - 4, z,     8, 1.5);
    minimapCtx.fillRect(x - 4, z + 3, 8, 1.5);

    minimapCtx.strokeStyle = "rgba(0, 229, 255, 0.6)";
    minimapCtx.lineWidth = 1.5;
    minimapCtx.strokeRect(x - 5, z - 5, 10, 10);
  });

  // ─── 8. Data packets (tiny pulsing dots) ──────────────────────────────────
  const pulse = 0.5 + Math.sin(_mmScanAngle * 6) * 0.5;
  dataPackets.forEach((packet) => {
    if (!packet.active) return;
    const relX = (packet.position.x - playerPos.x) * minimapScale;
    const relZ = (packet.position.z - playerPos.z) * minimapScale;
    const x = cx + relX; const z = cy + relZ;
    if (x < 0 || x > W || z < 0 || z > H) return;
    minimapCtx.fillStyle = `rgba(41, 182, 246, ${0.6 + pulse * 0.4})`;
    minimapCtx.beginPath(); minimapCtx.arc(x, z, 2.5, 0, Math.PI * 2); minimapCtx.fill();
  });

  // ─── 9. Workers (yellow triangle icons) ────────────────────────────────────
  workers.forEach((worker) => {
    const relX = (worker.position.x - playerPos.x) * minimapScale;
    const relZ = (worker.position.z - playerPos.z) * minimapScale;
    const x = cx + relX; const z = cy + relZ;
    if (x < 0 || x > W || z < 0 || z > H) return;
    minimapCtx.fillStyle = "#FFD600";
    minimapCtx.beginPath();
    minimapCtx.moveTo(x, z - 4);
    minimapCtx.lineTo(x + 3.5, z + 3);
    minimapCtx.lineTo(x - 3.5, z + 3);
    minimapCtx.closePath();
    minimapCtx.fill();
    minimapCtx.strokeStyle = "#FF8F00"; minimapCtx.lineWidth = 0.8; minimapCtx.stroke();
  });

  // ─── 10. Remote players ────────────────────────────────────────────────────
  multiplayer.remotePlayers.forEach((entity) => {
    const mesh = entity.mesh;
    const relX = (mesh.position.x - playerPos.x) * minimapScale;
    const relZ = (mesh.position.z - playerPos.z) * minimapScale;
    const x = cx + relX; const z = cy + relZ;
    if (x < 0 || x > W || z < 0 || z > H) return;
    const c = entity.color || "#8e24aa";
    minimapCtx.fillStyle = c;
    minimapCtx.beginPath(); minimapCtx.arc(x, z, 5, 0, Math.PI * 2); minimapCtx.fill();
    minimapCtx.strokeStyle = "#ffffff"; minimapCtx.lineWidth = 1.5; minimapCtx.stroke();
  });

  // ─── 11. Local player — glowing arrow ─────────────────────────────────────
  const angle = player?.rotation?.y ?? 0;

  minimapCtx.save();
  minimapCtx.translate(cx, cy);
  minimapCtx.rotate(angle);

  // Outer glow pulse around player
  const playerGlow = minimapCtx.createRadialGradient(0, 0, 0, 0, 0, 13);
  playerGlow.addColorStop(0, `rgba(0, 255, 100, ${0.35 + pulse * 0.2})`);
  playerGlow.addColorStop(1, "rgba(0, 255, 100, 0)");
  minimapCtx.fillStyle = playerGlow;
  minimapCtx.beginPath(); minimapCtx.arc(0, 0, 13, 0, Math.PI * 2); minimapCtx.fill();

  // Arrow body
  minimapCtx.fillStyle = "#00FF6A";
  minimapCtx.strokeStyle = "#ffffff";
  minimapCtx.lineWidth = 1.2;
  minimapCtx.beginPath();
  minimapCtx.moveTo(0, -11);      // tip (forward)
  minimapCtx.lineTo(5.5, 6);      // right tail
  minimapCtx.lineTo(0, 2);        // center notch
  minimapCtx.lineTo(-5.5, 6);     // left tail
  minimapCtx.closePath();
  minimapCtx.fill();
  minimapCtx.stroke();

  minimapCtx.restore();

  // ─── 12. Compass labels ────────────────────────────────────────────────────
  minimapCtx.font = "bold 9px 'Orbitron', monospace";
  minimapCtx.textAlign = "center";
  minimapCtx.textBaseline = "middle";
  minimapCtx.shadowColor = "rgba(0,200,255,0.8)";
  minimapCtx.shadowBlur = 6;

  minimapCtx.fillStyle = "#00D4FF";
  minimapCtx.fillText("N", cx, 10);
  minimapCtx.fillStyle = "rgba(0, 200, 255, 0.7)";
  minimapCtx.fillText("S", cx, H - 9);
  minimapCtx.fillText("W", 10, cy);
  minimapCtx.fillText("E", W - 10, cy);
  minimapCtx.shadowBlur = 0;

  // ─── 13. Outer circle border repaint (sharp inner edge) ───────────────────
  minimapCtx.strokeStyle = "rgba(0, 220, 255, 0.25)";
  minimapCtx.lineWidth = 2;
  minimapCtx.beginPath(); minimapCtx.arc(cx, cy, R - 2, 0, Math.PI * 2); minimapCtx.stroke();

  minimapCtx.restore(); // end clip

  // ─── 14. Compact legend (outside clip, on canvas edges) ────────────────────
  const legY = H - 14;
  const legItems = [
    { color: "#1565C0", label: "SRV" },
    { color: "#FF8F00", label: "PAD" },
    { color: "#29B6F6", label: "DATA" },
    { color: "#00FF6A", label: "YOU" },
  ];
  minimapCtx.save();
  minimapCtx.beginPath(); minimapCtx.arc(cx, cy, R - 1, 0, Math.PI * 2); minimapCtx.clip();
  let legX = 4;
  minimapCtx.font = "bold 7px 'Orbitron', monospace";
  legItems.forEach(({ color, label }) => {
    minimapCtx.fillStyle = color;
    minimapCtx.fillRect(legX, legY - 3, 7, 7);
    minimapCtx.fillStyle = "rgba(200,230,255,0.75)";
    minimapCtx.textAlign = "left";
    minimapCtx.textBaseline = "middle";
    minimapCtx.fillText(label, legX + 9, legY + 1);
    legX += 34;
  });
  minimapCtx.restore();
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

