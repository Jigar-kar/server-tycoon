/**
 * blockchain-leaderboard.js
 * Client-side module: fetches and renders the on-chain leaderboard.
 *
 * Injects a dedicated "CHAIN" panel next to the existing leaderboard.
 * Polls /api/blockchain-leaderboard every 30s (server caches the RPC calls).
 */

import { apiRoot } from "../main.js";

const POLL_INTERVAL = 30_000;
const MAX_DISPLAY   = 10;

// ── DOM Bootstrap ──────────────────────────────────────────────────────────
function buildPanel() {
  const panel = document.createElement("div");
  panel.id    = "blockchain-leaderboard-panel";
  panel.innerHTML = `
    <div class="bl-header">
      <span class="bl-chain-icon">⛓</span>
      <span class="bl-title">CHAIN BOARD</span>
      <span class="bl-badge" id="bl-status-badge">•</span>
    </div>
    <div class="bl-subtitle">All-time · Sepolia ETH</div>
    <div id="bl-list" class="bl-list">
      <div class="bl-loading">
        <div class="bl-spinner"></div>
        <span>Fetching from chain…</span>
      </div>
    </div>
    <div class="bl-footer">
      <a id="bl-etherscan-link" href="#" target="_blank" rel="noopener" class="bl-etherscan">
        View on Etherscan ↗
      </a>
      <button id="bl-refresh-btn" class="bl-refresh-btn" title="Force refresh">↺</button>
    </div>
  `;
  document.body.appendChild(panel);
  return panel;
}

// ── Medal rendering ────────────────────────────────────────────────────────
const MEDALS = ["🥇", "🥈", "🥉"];

function formatScore(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

function timeAgo(ms) {
  const d = Date.now() - ms;
  if (d < 60_000)        return "just now";
  if (d < 3_600_000)     return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000)    return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

function renderEntries(entries, listEl) {
  if (!entries || entries.length === 0) {
    listEl.innerHTML = `
      <div class="bl-empty">
        <div class="bl-empty-icon">📭</div>
        <div>No scores yet.<br>Be the first to make history!</div>
      </div>`;
    return;
  }

  listEl.innerHTML = entries
    .slice(0, MAX_DISPLAY)
    .map((e, i) => {
      const medal   = MEDALS[i] || `#${i + 1}`;
      const isTop3  = i < 3;
      return `
        <div class="bl-entry ${isTop3 ? "bl-entry--top3" : ""}">
          <span class="bl-rank">${medal}</span>
          <div class="bl-player-info">
            <span class="bl-name" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span>
            <span class="bl-time">${e.timestamp ? timeAgo(e.timestamp) : ""}</span>
          </div>
          <span class="bl-score ${isTop3 ? "bl-score--gold" : ""}">${formatScore(e.score)}</span>
        </div>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Fetch & Update ─────────────────────────────────────────────────────────
let lastConnected = false;

async function fetchAndRender(listEl, badgeEl) {
  try {
    const res  = await fetch(`${apiRoot}/api/blockchain-leaderboard`, { headers: { "ngrok-skip-browser-warning": "true" } });
    const data = await res.json();

    // Status badge
    const connected  = !!data.connected;
    badgeEl.textContent = connected ? "●" : "○";
    badgeEl.className   = `bl-badge ${connected ? "bl-badge--live" : "bl-badge--offline"}`;
    badgeEl.title       = connected
      ? `Live · cached ${data.cachedAt ? timeAgo(data.cachedAt) : "—"}`
      : `Offline · ${data.lastError || "no contract address"}`;

    if (!connected) {
      listEl.innerHTML = `
        <div class="bl-empty">
          <div class="bl-empty-icon">🔌</div>
          <div style="color:#f44336">Not connected<br><small>${data.lastError || "Set up .env"}</small></div>
        </div>`;
      return;
    }

    renderEntries(data.entries || [], listEl);
  } catch (err) {
    listEl.innerHTML = `
      <div class="bl-empty">
        <div class="bl-empty-icon">⚠️</div>
        <div style="color:#ff9800">Server unreachable</div>
      </div>`;
  }
}

// ── Etherscan link ─────────────────────────────────────────────────────────
async function setEtherscanLink(linkEl) {
  try {
    const res  = await fetch(`${apiRoot}/api/blockchain-status`, { headers: { "ngrok-skip-browser-warning": "true" } });
    const data = await res.json();
    if (data.contractAddress && data.contractAddress !== "PENDING_DEPLOY") {
      linkEl.href = `https://sepolia.etherscan.io/address/${data.contractAddress}`;
    } else {
      linkEl.style.display = "none";
    }
  } catch {
    linkEl.style.display = "none";
  }
}

// ── Init (called from main.js after the game loads) ────────────────────────
export function initBlockchainLeaderboard() {
  const panel   = buildPanel();
  const listEl  = panel.querySelector("#bl-list");
  const badgeEl = panel.querySelector("#bl-status-badge");
  const linkEl  = panel.querySelector("#bl-etherscan-link");
  const refreshBtn = panel.querySelector("#bl-refresh-btn");

  setEtherscanLink(linkEl);

  // Initial fetch
  fetchAndRender(listEl, badgeEl);

  // Polling
  setInterval(() => fetchAndRender(listEl, badgeEl), POLL_INTERVAL);

  // Manual refresh button
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.textContent = "⟳";
    refreshBtn.disabled    = true;
    try {
      await fetch(`${apiRoot}/api/blockchain-refresh`, { method: "POST", headers: { "ngrok-skip-browser-warning": "true" } });
      await new Promise((r) => setTimeout(r, 1500)); // give server time to fetch
      await fetchAndRender(listEl, badgeEl);
    } finally {
      refreshBtn.textContent = "↺";
      refreshBtn.disabled    = false;
    }
  });

  return panel;
}
