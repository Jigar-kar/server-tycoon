import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";
import {
    createHuman,
    createNameTag,
    multiplayer,
    player,
    scene,
    setMultiplayerStatus,
    state,
    updateCharacterAnim
} from "../main.js";

let socket = null;

export function initSocket(apiRoot) {
    if (socket) return;
    
    // Connect to the backend
    socket = io(apiRoot, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socket.on("connect", () => {
        console.log("[Multiplayer] Connected to Socket.io server");
    });

    socket.on("connect_error", (err) => {
        console.error("[Multiplayer] Connection Error:", err.message);
        multiplayer.connected = false;
        setMultiplayerStatus("OFFLINE", false);
    });

    socket.on("stateUpdate", (payload) => {
        if (!multiplayer.playerId || !multiplayer.connected) return;
        
        syncRemotePlayers(payload.players || []);
        multiplayer.leaderboard = payload.leaderboard || payload.players || [];
        setMultiplayerStatus(
            `ONLINE • ${multiplayer.playerName} • ${payload.roomId || "room-1"} • ${payload.roomPlayers || payload.players?.length || 0}/${payload.roomCapacity || 10} PLAYERS`,
            true
        );
    });
}

export function removeRemotePlayer(playerId) {
  const remote = multiplayer.remotePlayers.get(playerId);
  if (!remote) return;
  if (remote.mesh) scene.remove(remote.mesh);
  if (remote.labelElement) remote.labelElement.remove();
  multiplayer.remotePlayers.delete(playerId);
}

export function syncRemotePlayers(remoteEntries) {
  const activeIds = new Set();
  remoteEntries.forEach((entry) => {
    if (entry.id === multiplayer.playerId) return;
    activeIds.add(entry.id);

    let remote = multiplayer.remotePlayers.get(entry.id);
    if (!remote) {
      const charGroup = createHuman(
        0xffffff,
        entry.shirtColor || entry.color || 0xff0000,
        false
      );
      charGroup.position.set(entry.x || 0, 0, entry.z || 0);
      scene.add(charGroup);
      const label = createNameTag(
        entry.name || "Player",
        entry.shirtColor || entry.color || "#ff0000",
        false
      );
      remote = {
        mesh: charGroup,
        color: entry.shirtColor || entry.color,
        name: entry.name,
        labelElement: label,
      };
      multiplayer.remotePlayers.set(entry.id, remote);
    } else {
      const dx = (entry.x || 0) - remote.mesh.position.x;
      const dz = (entry.z || 0) - remote.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.1) {
        remote.mesh.position.x += dx * 0.3;
        remote.mesh.position.z += dz * 0.3;
        remote.mesh.rotation.y = entry.rotation || 0;
        updateCharacterAnim(remote.mesh, true, 0.3);
      } else {
        updateCharacterAnim(remote.mesh, false, 0.3);
      }
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
  if (multiplayer.joining || !socket) return;
  multiplayer.joining = true;
  multiplayer.lastJoinAt = performance.now();

  try {
    socket.emit("join", {
        id: multiplayer.playerId,
        name: multiplayer.playerName,
        color: multiplayer.color,
    }, (payload) => {
        if (!payload || !payload.ok) {
            multiplayer.connected = false;
            setMultiplayerStatus("OFFLINE", false);
            multiplayer.joining = false;
            return;
        }

        multiplayer.playerId = payload.player.id;
        multiplayer.playerName = payload.player.name || multiplayer.playerName;
        multiplayer.color = payload.player.shirtColor || payload.player.color || multiplayer.color;
        
        if (payload.player.money !== undefined) state.money = payload.player.money;
        if (payload.player.dataMax !== undefined) state.dataMax = payload.player.dataMax;
        if (payload.player.dataCount !== undefined) state.dataCount = payload.player.dataCount;
        if (payload.player.serverLevel !== undefined) state.serverLevel = payload.player.serverLevel;
        if (payload.player.activeServers !== undefined) state.activeServers = payload.player.activeServers;
        if (payload.player.workerCount !== undefined) state.workerCount = payload.player.workerCount;

        localStorage.setItem("playerId", multiplayer.playerId);
        localStorage.setItem("playerName", multiplayer.playerName);
        localStorage.setItem("playerColor", multiplayer.color);
        localStorage.setItem("gameState", JSON.stringify(state));

        multiplayer.connected = true;
        if (!player.labelElement) {
            player.labelElement = createNameTag(multiplayer.playerName, multiplayer.color, true);
        }
        player.labelElement.innerText = multiplayer.playerName;
        player.labelElement.style.borderColor = multiplayer.color;
        setMultiplayerStatus(`ONLINE • ${multiplayer.playerName}`, true);
        
        multiplayer.joining = false;
    });
  } catch (err) {
    multiplayer.connected = false;
    setMultiplayerStatus("OFFLINE", false);
    multiplayer.joining = false;
  }
}

let isPushing = false;
export async function pushMultiplayerState() {
  if (!multiplayer.playerId || isPushing || !socket) return;

  const now = performance.now();
  // Throttle to 20Hz (50ms)
  if (now - multiplayer.lastSyncAt < 50) return;
  multiplayer.lastSyncAt = now;
  isPushing = true;

  localStorage.setItem("gameState", JSON.stringify(state));

  socket.emit("update", {
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
  });
  
  multiplayer.connected = true;
  isPushing = false;
}

export async function pullMultiplayerState(force = false) {
    // Handled by the socket.on("stateUpdate") event listener
}

window.addEventListener("beforeunload", () => {
  if (!multiplayer.playerId || !socket) return;
  socket.emit("leave", { id: multiplayer.playerId });
});
