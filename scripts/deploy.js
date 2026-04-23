/**
 * deploy.js — Deploys GameStore.sol to Ethereum Sepolia testnet.
 *
 * Usage (from project root):
 *   node scripts/deploy.js
 *
 * Prerequisites:
 *   - PRIVATE_KEY set in server/.env
 *   - Wallet funded with Sepolia ETH (https://sepoliafaucet.com/)
 *   - Run compile first: node scripts/compile.js
 */

require("dotenv").config({ path: "./server/.env" });
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const ARTIFACT_PATH = path.join(__dirname, "../contracts/GameStore.artifact.json");

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl     = process.env.SEPOLIA_RPC_URL || "https://sepolia.drpc.org";

  if (!privateKey) {
    console.error("❌  PRIVATE_KEY not found in server/.env");
    process.exit(1);
  }
  if (!fs.existsSync(ARTIFACT_PATH)) {
    console.error("❌  Artifact not found — run: node scripts/compile.js first");
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf-8"));

  console.log("🔗  Connecting to Sepolia via:", rpcUrl);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet   = new ethers.Wallet(privateKey, provider);

  console.log("💼  Deployer wallet:", wallet.address);

  const network = await provider.getNetwork();
  console.log("🌐  Network:", network.name || "sepolia", `(chainId ${network.chainId})`);

  const balance = await provider.getBalance(wallet.address);
  const balEth  = ethers.formatEther(balance);
  console.log("💰  Balance:", balEth, "ETH");

  if (balance === 0n) {
    console.error("❌  Wallet has 0 ETH — fund it at https://sepoliafaucet.com/");
    process.exit(1);
  }

  const factory  = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  console.log("🚀  Deploying GameStore.sol …");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("✅  GameStore deployed to:", address);
  console.log("🔍  Etherscan:", `https://sepolia.etherscan.io/address/${address}`);

  // Save address back to .env automatically
  const envPath = path.join(__dirname, "../server/.env");
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

  if (envContent.includes("CONTRACT_ADDRESS=")) {
    envContent = envContent.replace(/CONTRACT_ADDRESS=.*/g, `CONTRACT_ADDRESS=${address}`);
  } else {
    envContent += `\nCONTRACT_ADDRESS=${address}\n`;
  }
  fs.writeFileSync(envPath, envContent);
  console.log("📝  CONTRACT_ADDRESS written to server/.env — restart the server.");
}

main().catch((err) => {
  console.error("Deploy failed:", err.message || err);
  process.exit(1);
});
