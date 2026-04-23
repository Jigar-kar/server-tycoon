import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";
import { savedState, state, pads, servers, dataPackets, workers, colliders, apiRoot, multiplayer, leaderboardList, multiplayerStatus, container, labelsBox, scene, camera, renderer, ambientLight, dirLight, floorGeo, floorMat, floor, keys, touchVector, jStart, jBase, jStick, touchEnd, player, packetGeo, packetMat, ringGeo, ringMat, minimapCanvas, minimapCtx, minimapScale, minimapSize, serverPositions, initMap, clock, animate, createGrassTexture, createHuman, updateCharacterAnim, createGlowHalo, updateMinimap, updateUI, escapeHtml, setMultiplayerStatus, renderLeaderboard, createNameTag, removeRemotePlayer, syncRemotePlayers, joinMultiplayer, pushMultiplayerState, pullMultiplayerState, spawnFloatingText, syncHTMLOverlays, syncWorldLabel, createPurchaseZone, unlockServer, createServer, updateServerUI, hireWorker } from "../main.js";

export function addCollider(x, z, width, depth) {
  colliders.push({
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  });
}

export function checkCollision(x, z) {
  const pr = 1.0; // Player radius buffer
  for (let i = 0; i < colliders.length; i++) {
    let c = colliders[i];
    if (
      x + pr > c.minX &&
      x - pr < c.maxX &&
      z + pr > c.minZ &&
      z - pr < c.maxZ
    ) {
      return true;
    }
  }
  return false;
}

export function checkPacketSpawn(x, z) {
  const pr = 0.6; // Packet radius (smaller than player)
  for (let i = 0; i < colliders.length; i++) {
    let c = colliders[i];
    if (
      x + pr > c.minX &&
      x - pr < c.maxX &&
      z + pr > c.minZ &&
      z - pr < c.maxZ
    ) {
      return true;
    }
  }
  return false;
}

