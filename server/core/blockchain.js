/**
 * blockchain.js — Server-side bridge to the GameStore smart contract.
 *
 * Responsibilities:
 *  - Connect to Sepolia via RPC using the game wallet (PRIVATE_KEY in .env)
 *  - recordPurchase(playerName, action, cost, balanceAfter) — queued, non-blocking
 *  - getCachedPurchases()  — last N purchases (30s cache)
 *  - getCachedTopSpenders() — sorted top spenders (30s cache)
 *  - refreshCache()        — force fetches both from chain
 */

require("dotenv").config({ path: "./server/.env" });
const { ethers } = require("ethers");
const fs         = require("fs");
const path       = require("path");

const ARTIFACT_PATH   = path.join(__dirname, "../../contracts/GameStore.artifact.json");
const REFRESH_MS      = 30_000; // cache TTL
const SUBMIT_DELAY_MS = 4_000;  // debounce before sending batch to chain

let contract    = null;
let wallet      = null;
let connected   = false;
let lastError   = null;

// Cache objects
let cachedPurchases   = [];
let cachedTopSpenders = [];
let cacheAt           = 0;

// Submit queue: array of { playerName, action, cost, balanceAfter }
const submitQueue = [];
let   submitTimer  = null;

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const privateKey      = process.env.PRIVATE_KEY;
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const rpcUrl          = process.env.SEPOLIA_RPC_URL || "https://sepolia.drpc.org";

  if (!privateKey || privateKey === "YOUR_PRIVATE_KEY_HERE") {
    console.warn("[Blockchain] ⚠️  PRIVATE_KEY not set — on-chain purchases disabled.");
    return;
  }
  if (!contractAddress || contractAddress === "PENDING_DEPLOY") {
    console.warn("[Blockchain] ⚠️  CONTRACT_ADDRESS not set — run: npm run deploy");
    return;
  }
  if (!fs.existsSync(ARTIFACT_PATH)) {
    console.warn("[Blockchain] ⚠️  Artifact missing — run: npm run compile");
    return;
  }

  try {
    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf-8"));
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    wallet         = new ethers.Wallet(privateKey, provider);
    contract       = new ethers.Contract(contractAddress, artifact.abi, wallet);
    connected      = true;

    console.log("[Blockchain] ✅ Connected to GameStore at", contractAddress);
    console.log("[Blockchain] 💼 Game wallet:", wallet.address);

    // Seed cache immediately
    await refreshCache();

    // Periodic background refresh
    setInterval(() => refreshCache().catch(() => {}), REFRESH_MS);
  } catch (err) {
    lastError = err.message;
    console.error("[Blockchain] ❌ Init failed:", err.message);
  }
}

// ── Cache refresh ─────────────────────────────────────────────────────────────
async function refreshCache() {
  if (!connected || !contract) return;
  try {
    // Fetch last 20 purchases + top spenders in parallel
    const [recentRaw, topRaw] = await Promise.all([
      contract.getRecentPurchases(20),
      contract.getTopSpenders(),
    ]);

    // Map recent purchases
    const [names, actions, costs, balances, timestamps] = recentRaw;
    cachedPurchases = names.map((name, i) => ({
      playerName:   name,
      action:       actions[i],
      cost:         Number(costs[i]),
      balanceAfter: Number(balances[i]),
      timestamp:    Number(timestamps[i]) * 1000,
    }));

    // Map top spenders
    const [tNames, tSpent, tCounts, tBals] = topRaw;
    cachedTopSpenders = tNames.map((name, i) => ({
      playerName:    name,
      totalSpent:    Number(tSpent[i]),
      purchaseCount: Number(tCounts[i]),
      lastBalance:   Number(tBals[i]),
    }));

    cacheAt = Date.now();
    console.log(`[Blockchain] 🔄 Cache refreshed — ${cachedPurchases.length} purchases, ${cachedTopSpenders.length} spenders`);
  } catch (err) {
    console.error("[Blockchain] Refresh error:", err.message);
  }
}

// ── Read API ──────────────────────────────────────────────────────────────────
function getCachedPurchases() {
  return {
    purchases:  cachedPurchases,
    cachedAt:   cacheAt,
    connected,
    lastError,
  };
}

function getCachedTopSpenders() {
  return {
    topSpenders: cachedTopSpenders,
    cachedAt:    cacheAt,
    connected,
    lastError,
  };
}

function getStatus() {
  return {
    connected,
    walletAddress:    wallet ? wallet.address : null,
    contractAddress:  process.env.CONTRACT_ADDRESS || null,
    lastError,
    cacheAge:         cacheAt ? Math.round((Date.now() - cacheAt) / 1000) + "s" : "never",
    pendingSubmissions: submitQueue.length,
  };
}

// ── Write API (queued + debounced) ────────────────────────────────────────────
/**
 * Queue a purchase record to be written on-chain.
 * Uses a short debounce so rapid purchases are batched into one flush.
 *
 * @param {string} playerName
 * @param {string} action       e.g. "BUY SERVER", "UPGRADE SERVERS"
 * @param {number} cost         in-game $ cost
 * @param {number} balanceAfter player's in-game $ after purchase
 */
function recordPurchase(playerName, action, cost, balanceAfter) {
  if (!connected || !contract) return;
  if (!playerName || !action || typeof cost !== "number") return;

  submitQueue.push({
    playerName: playerName.trim().slice(0, 32),
    action:     action.trim().slice(0, 64),
    cost:       Math.max(0, Math.round(cost)),
    balanceAfter: Math.max(0, Math.round(balanceAfter)),
  });

  if (!submitTimer) {
    submitTimer = setTimeout(flushQueue, SUBMIT_DELAY_MS);
  }
}

async function flushQueue() {
  submitTimer = null;
  if (submitQueue.length === 0) return;

  const batch = submitQueue.splice(0, submitQueue.length); // take all pending

  for (const item of batch) {
    try {
      console.log(
        `[Blockchain] 📤 Recording: "${item.playerName}" → ${item.action} ($${item.cost})`
      );
      const tx = await contract.recordPurchase(
        item.playerName,
        item.action,
        item.cost,
        item.balanceAfter
      );
      await tx.wait(1);
      console.log(
        `[Blockchain] ✅ On-chain: "${item.playerName}" ${item.action} $${item.cost} (tx: ${tx.hash})`
      );
    } catch (err) {
      console.error(
        `[Blockchain] ❌ Failed "${item.playerName}" ${item.action}:`,
        err.message
      );
      // Re-queue on failure (best-effort)
      submitQueue.unshift(item);
    }
  }

  // Refresh cache after batch so the UI reflects the new records
  await refreshCache();
}

module.exports = {
  init,
  recordPurchase,
  getCachedPurchases,
  getCachedTopSpenders,
  refreshCache,
  getStatus,
};
