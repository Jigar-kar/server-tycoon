import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";
import { savedState, state, pads, servers, dataPackets, workers, colliders, apiRoot, multiplayer, leaderboardList, multiplayerStatus, container, labelsBox, scene, camera, renderer, ambientLight, dirLight, floorGeo, floorMat, floor, keys, touchVector, jStart, jBase, jStick, touchEnd, player, packetGeo, packetMat, ringGeo, ringMat, minimapCanvas, minimapCtx, minimapScale, minimapSize, serverPositions, initMap, clock, animate, addCollider, checkCollision, createHuman, updateCharacterAnim, updateMinimap, updateUI, escapeHtml, setMultiplayerStatus, renderLeaderboard, createNameTag, removeRemotePlayer, syncRemotePlayers, joinMultiplayer, pushMultiplayerState, pullMultiplayerState, spawnFloatingText, syncHTMLOverlays, syncWorldLabel, createPurchaseZone, unlockServer, createServer, updateServerUI, hireWorker } from "../main.js";

export function createGrassTexture() {
  const cvs = document.createElement("canvas");
  cvs.width = 512;
  cvs.height = 512;
  const ctx = cvs.getContext("2d");

  ctx.fillStyle = "#2e7d32";
  ctx.fillRect(0, 0, 512, 512);

  const patchCount = window.innerWidth < 768 ? 15000 : 40000;
  for (let i = 0; i < patchCount; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? "#43a047" : "#66bb6a";
    ctx.fillRect(
      Math.random() * 512,
      Math.random() * 512,
      2 + Math.random() * 3,
      6 + Math.random() * 12,
    );
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  tex.anisotropy = window.innerWidth < 768 ? 2 : renderer.capabilities.getMaxAnisotropy();
  return tex;
}

export function createGlowHalo(radius, color, emissiveIntensity = 0.4) {
  const haloGeo = new THREE.RingGeometry(radius * 0.8, radius * 1.2, 32);
  const haloMat = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.1;
  return halo;
}

