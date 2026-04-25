import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";
import { pads, colliders } from "./state-globals.js";
import { savedState, state, servers, dataPackets, workers, apiRoot, multiplayer, leaderboardList, multiplayerStatus, container, labelsBox, scene, camera, renderer, ambientLight, dirLight, floorGeo, floorMat, floor, keys, touchVector, jStart, jBase, jStick, touchEnd, player, packetGeo, packetMat, ringGeo, ringMat, minimapCanvas, minimapCtx, minimapScale, minimapSize, serverPositions, initMap, clock, animate, createGrassTexture, createHuman, updateCharacterAnim, createGlowHalo, updateMinimap, updateUI, escapeHtml, setMultiplayerStatus, renderLeaderboard, createNameTag, removeRemotePlayer, syncRemotePlayers, joinMultiplayer, pushMultiplayerState, pullMultiplayerState, spawnFloatingText, syncHTMLOverlays, syncWorldLabel, createPurchaseZone, unlockServer, createServer, updateServerUI, hireWorker } from "../main.js";

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

  // Check against solid objects (servers, trees, etc.)
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

  // Check against purchase pads (to keep them clear of data packets)
  for (let i = 0; i < pads.length; i++) {
    let pad = pads[i];
    if (!pad.active) continue; // Only check active pads

    // Add a slightly larger buffer to keep data away from the pad edges
    const padBuffer = 1.0;
    let minX = pad.position.x - pad.width / 2 - padBuffer;
    let maxX = pad.position.x + pad.width / 2 + padBuffer;
    let minZ = pad.position.z - pad.length / 2 - padBuffer;
    let maxZ = pad.position.z + pad.length / 2 + padBuffer;

    if (
      x + pr > minX &&
      x - pr < maxX &&
      z + pr > minZ &&
      z - pr < maxZ
    ) {
      return true;
    }
  }

  return false;
}

