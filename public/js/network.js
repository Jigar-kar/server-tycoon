import {
    apiRoot,
    createHuman,
    createNameTag,
    multiplayer,
    player,
    scene,
    setMultiplayerStatus,
    state
} from "../main.js";

export function removeRemotePlayer(playerId) {
  const remote = multiplayer.remotePlayers.get(playerId);
  if (!remote) return;
  scene.remove(remote.mesh);
  if (remote.labelElement) remote.labelElement.remove();
  multiplayer.remotePlayers.delete(playerId);
}

export function syncRemotePlayers(remoteEntries) {
  const activeIds = new Set();

  remoteEntries.forEach((entry) => {
    if (!entry || entry.id === multiplayer.playerId) return;

    activeIds.add(entry.id);
    let remote = multiplayer.remotePlayers.get(entry.id);

    if (!remote) {
      const shirtColor = entry.shirtColor || entry.color || "#8e24aa";
      const pantsColor = entry.pantsColor || "#1976d2";
      const mesh = createHuman(
        Number.parseInt(shirtColor.replace("#", ""), 16),
        Number.parseInt(pantsColor.replace("#", ""), 16),
        false,
      );
      mesh.position.set(entry.x || 0, 0, entry.z || 0);
      scene.add(mesh);
      const labelElement = createNameTag(
        entry.name || "Player",
        shirtColor,
        false,
      );
      remote = {
        mesh,
        color: shirtColor,
        labelElement,
        name: entry.name || "Player",
      };
      multiplayer.remotePlayers.set(entry.id, remote);
    }

    if (remote.targetX === undefined) {
      remote.mesh.position.set(entry.x || 0, 0, entry.z || 0);
      remote.mesh.rotation.y = entry.rotation || 0;
    }
    remote.targetX = entry.x || 0;
    remote.targetZ = entry.z || 0;
    remote.targetRotation = entry.rotation || 0;

    // Snap if too far
    if (
      Math.hypot(
        remote.mesh.position.x - remote.targetX,
        remote.mesh.position.z - remote.targetZ,
      ) > 20
    ) {
      remote.mesh.position.set(remote.targetX, 0, remote.targetZ);
    }
    remote.color = entry.shirtColor || entry.color || remote.color;
    remote.name = entry.name || remote.name;
    if (remote.labelElement) remote.labelElement.innerText = remote.name;
  });

  [...multiplayer.remotePlayers.keys()].forEach((playerId) => {
    if (!activeIds.has(playerId)) removeRemotePlayer(playerId);
  });
}

export async function joinMultiplayer() {
  if (multiplayer.joining) return;
  multiplayer.joining = true;
  multiplayer.lastJoinAt = performance.now();

  try {
    const response = await fetch(`${apiRoot}/api/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify({
        id: multiplayer.playerId,
        name: multiplayer.playerName,
        color: multiplayer.color,
      }),
    });

    if (!response.ok) throw new Error("Join failed");
    const payload = await response.json();

    multiplayer.playerId = payload.id;
    multiplayer.playerName = payload.name || multiplayer.playerName;
    multiplayer.color =
      payload.shirtColor || payload.color || multiplayer.color;

    if (payload.money !== undefined) state.money = payload.money;
    if (payload.dataMax !== undefined) state.dataMax = payload.dataMax;
    if (payload.dataCount !== undefined) state.dataCount = payload.dataCount;
    if (payload.serverLevel !== undefined)
      state.serverLevel = payload.serverLevel;
    if (payload.activeServers !== undefined)
      state.activeServers = payload.activeServers;
    if (payload.workerCount !== undefined)
      state.workerCount = payload.workerCount;

    localStorage.setItem("playerId", multiplayer.playerId);
    localStorage.setItem("playerName", multiplayer.playerName);
    localStorage.setItem("playerColor", multiplayer.color);
    localStorage.setItem("gameState", JSON.stringify(state));
    multiplayer.connected = true;
    if (!player.labelElement) {
      player.labelElement = createNameTag(
        multiplayer.playerName,
        multiplayer.color,
        true,
      );
    }
    player.labelElement.innerText = multiplayer.playerName;
    player.labelElement.style.borderColor = multiplayer.color;
    setMultiplayerStatus(`ONLINE • ${multiplayer.playerName}`, true);
    await pullMultiplayerState(true);
  } catch (error) {
    multiplayer.connected = false;
    setMultiplayerStatus("OFFLINE", false);
  } finally {
    multiplayer.joining = false;
  }
}

let isPushing = false;
export async function pushMultiplayerState() {
  if (!multiplayer.playerId || isPushing) return;

  const now = performance.now();
  if (now - multiplayer.lastSyncAt < 80) return;
  multiplayer.lastSyncAt = now;
  isPushing = true;

  localStorage.setItem("gameState", JSON.stringify(state));

  try {
    await fetch(`${apiRoot}/api/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify({
        id: multiplayer.playerId,
        name: multiplayer.playerName,
        color: multiplayer.color,
        x: player.position.x,
        z: player.position.z,
        rotation: player.rotation.y,
        money: state.money,
        dataCount: state.dataCount,
        dataMax: state.dataMax,
        serverLevel: state.serverLevel,
        activeServers: state.activeServers,
        workerCount: state.workerCount,
      }),
    });
    multiplayer.connected = true;
  } catch (error) {
    multiplayer.connected = false;
  } finally {
    isPushing = false;
  }
}

let isPulling = false;
export async function pullMultiplayerState(force = false) {
  if (!multiplayer.playerId || isPulling) return;

  const now = performance.now();
  if (!force && now - multiplayer.lastStateAt < 80) return;
  multiplayer.lastStateAt = now;
  isPulling = true;

  try {
    const response = await fetch(
      `${apiRoot}/api/state?id=${encodeURIComponent(multiplayer.playerId)}`,
      { headers: { "ngrok-skip-browser-warning": "true" } }
    );
    if (!response.ok) throw new Error("State fetch failed");

    const payload = await response.json();
    multiplayer.connected = true;
    syncRemotePlayers(payload.players || []);
    multiplayer.leaderboard = payload.leaderboard || payload.players || [];
    setMultiplayerStatus(
      `ONLINE • ${multiplayer.playerName} • ${payload.roomId || "room-1"} • ${payload.roomPlayers || payload.players?.length || 0}/${payload.roomCapacity || 10} PLAYERS`,
      true,
    );
  } catch (error) {
    multiplayer.connected = false;
    setMultiplayerStatus("OFFLINE", false);
  } finally {
    isPulling = false;
  }
}
