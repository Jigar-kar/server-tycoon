import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";
import { savedState, state, pads, servers, dataPackets, workers, colliders, apiRoot, multiplayer, leaderboardList, multiplayerStatus, container, labelsBox, scene, camera, renderer, ambientLight, dirLight, floorGeo, floorMat, floor, keys, touchVector, jStart, jBase, jStick, touchEnd, player, packetGeo, packetMat, ringGeo, ringMat, minimapCanvas, minimapCtx, minimapScale, minimapSize, serverPositions, initMap, clock, animate, addCollider, checkCollision, createGrassTexture, createHuman, updateCharacterAnim, createGlowHalo, updateMinimap, updateUI, escapeHtml, setMultiplayerStatus, renderLeaderboard, createNameTag, removeRemotePlayer, syncRemotePlayers, joinMultiplayer, pushMultiplayerState, pullMultiplayerState, spawnFloatingText, syncHTMLOverlays, syncWorldLabel, createPurchaseZone, unlockServer, createServer, updateServerUI } from "../main.js";

export function hireWorker(x, z) {
  const wMesh = createHuman(0xffeb3b, 0xf44336, false);
  wMesh.position.set(x, 0, z);
  scene.add(wMesh);

  // Add glow halo to worker
  const workerGlow = createGlowHalo(3, 0xffeb3b, 0.4);
  workerGlow.position.copy(wMesh.position);
  scene.add(workerGlow);

  workers.push({
    mesh: wMesh,
    position: wMesh.position,
    speed: state.globalWorkerSpeed,
    dataCount: 0,
    dataMax: state.globalWorkerMax,
    targetData: null,
    targetServer: null,
    uiElement: null,
    isWorker: true,
    glowMesh: workerGlow,
  });
}

