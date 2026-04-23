/**
 * chain-store.js
 * Renders the on-chain TOP SPENDERS leaderboard (replaces the old room leaderboard).
 * Also hooks purchase completions to write them on-chain.
 *
 * Exports:
 *   initChainStore(multiplayerRef)  — call once when game starts
 *   recordPurchaseOnChain(action, cost, balanceAfter) — call on each purchase
 */

import { apiRoot } from "../main.js";

const POLL_MS = 30_000;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMoney(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MEDALS = ["🥇", "🥈", "🥉"];

// ── Build panel (replaces old #leaderboard-panel) ─────────────────────────────
function buildSpendersPanel() {
  // Hide the old room-based leaderboard panel permanently
  const old = document.getElementById("leaderboard-panel");
  if (old) old.style.display = "none";

  const panel    = document.createElement("aside");
  panel.id       = "chain-spenders-panel";
  panel.innerHTML = `
    <div class="cs-lb-header">
      <span class="cs-lb-icon">⛓</span>
      <span class="cs-lb-title">LEADERBOARD</span>
      <span class="cs-lb-badge" id="cs-badge" title="">●</span>
    </div>
    <div class="cs-lb-sub">All-time · On-chain · Sepolia</div>
    <div id="cs-spenders" class="cs-lb-list">
      <div class="cs-lb-loading"><div class="cs-lb-spinner"></div><span>Loading…</span></div>
    </div>
    <div class="cs-lb-footer">
      <a id="cs-etherscan-link" href="#" target="_blank" rel="noopener" class="cs-lb-etherscan">View contract ↗</a>
      <button id="cs-refresh-btn" class="cs-lb-refresh" title="Refresh">↺</button>
    </div>
  `;
  document.body.appendChild(panel);
  return panel;
}

// ── Render ────────────────────────────────────────────────────────────────────
let _multiplayerRef = null;

function renderSpenders(spenders, listEl, badgeEl) {
  if (!spenders || spenders.length === 0) {
    listEl.innerHTML = `
      <div class="cs-lb-empty">
        <div class="cs-lb-empty-icon">📭</div>
        <div>No purchases yet.<br>Be first to buy!</div>
      </div>`;
    return;
  }

  listEl.innerHTML = spenders
    .slice(0, 8)
    .map((s, i) => {
      const medal  = MEDALS[i] || `#${i + 1}`;
      const isMe   = _multiplayerRef && s.playerName === _multiplayerRef.playerName;
      const isTop3 = i < 3;
      return `
        <div class="cs-lb-row ${isTop3 ? "cs-lb-row--top" : ""} ${isMe ? "cs-lb-row--me" : ""}">
          <span class="cs-lb-rank">${medal}</span>
          <div class="cs-lb-info">
            <span class="cs-lb-name" title="${escHtml(s.playerName)}">${escHtml(s.playerName)}${isMe ? " <span class='cs-lb-you'>(you)</span>" : ""}</span>
            <span class="cs-lb-txs">${s.purchaseCount} purchase${s.purchaseCount !== 1 ? "s" : ""}</span>
          </div>
          <span class="cs-lb-score ${isTop3 ? "cs-lb-score--gold" : ""}">${fmtMoney(s.totalSpent)}</span>
        </div>`;
    })
    .join("");
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchAndRender(listEl, badgeEl) {
  try {
    const res  = await fetch(`${apiRoot}/api/top-spenders`, { headers: { "ngrok-skip-browser-warning": "true" } });
    const data = await res.json();

    if (!data.connected) {
      badgeEl.className = "cs-lb-badge cs-lb-badge--off";
      badgeEl.title     = data.lastError || "Blockchain not connected";
      listEl.innerHTML  = `
        <div class="cs-lb-empty">
          <div class="cs-lb-empty-icon">🔌</div>
          <div style="color:#f87171">Not connected<br><small>${escHtml(data.lastError || "Set PRIVATE_KEY in .env")}</small></div>
        </div>`;
      return;
    }

    badgeEl.className = "cs-lb-badge cs-lb-badge--live";
    renderSpenders(data.topSpenders || [], listEl, badgeEl);
  } catch {
    listEl.innerHTML = `<div class="cs-lb-empty"><div class="cs-lb-empty-icon">⚠️</div><div>Server unreachable</div></div>`;
  }
}

// ── Public: record a purchase on-chain ─────────────────────────────────────────
export async function recordPurchaseOnChain(action, cost, balanceAfter) {
  if (!_multiplayerRef || !_multiplayerRef.playerId) return;
  try {
    await fetch(`${apiRoot}/api/record-purchase`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body:    JSON.stringify({
        playerId:     _multiplayerRef.playerId,
        action,
        cost,
        balanceAfter: Math.round(Math.max(0, balanceAfter)),
      }),
    });
  } catch {
    // non-blocking, ignore
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initChainStore(multiplayerRef) {
  _multiplayerRef = multiplayerRef;

  const panel      = buildSpendersPanel();
  const listEl     = panel.querySelector("#cs-spenders");
  const badgeEl    = panel.querySelector("#cs-badge");
  const linkEl     = panel.querySelector("#cs-etherscan-link");
  const refreshBtn = panel.querySelector("#cs-refresh-btn");

  // Etherscan contract link
  fetch(`${apiRoot}/api/blockchain-status`, { headers: { "ngrok-skip-browser-warning": "true" } })
    .then((r) => r.json())
    .then((d) => {
      if (d.contractAddress && d.contractAddress !== "PENDING_DEPLOY") {
        linkEl.href = `https://sepolia.etherscan.io/address/${d.contractAddress}`;
      } else {
        linkEl.style.display = "none";
      }
    })
    .catch(() => (linkEl.style.display = "none"));

  // Initial load
  fetchAndRender(listEl, badgeEl);

  // Poll every 30s
  setInterval(() => fetchAndRender(listEl, badgeEl), POLL_MS);

  // Also re-render after purchases to show updated rank quickly
  // (called externally via refreshChainLeaderboard())
  window._csRefresh = () => fetchAndRender(listEl, badgeEl);

  // Manual refresh button
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled    = true;
    refreshBtn.textContent = "⟳";
    try {
      await fetch(`${apiRoot}/api/blockchain-refresh`, { method: "POST", headers: { "ngrok-skip-browser-warning": "true" } });
      await new Promise((r) => setTimeout(r, 1800));
      await fetchAndRender(listEl, badgeEl);
    } finally {
      refreshBtn.disabled    = false;
      refreshBtn.textContent = "↺";
    }
  });

  return panel;
}

// Called after a purchase is confirmed, to refresh the board soon after the tx
export async function refreshChainLeaderboard(delayMs = 8000) {
  await new Promise((r) => setTimeout(r, delayMs));
  if (window._csRefresh) window._csRefresh();
}
