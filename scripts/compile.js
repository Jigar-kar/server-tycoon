/**
 * compile.js — Compiles GameStore.sol using solc-js (no Hardhat needed).
 *
 * Usage (from project root):
 *   node scripts/compile.js
 *
 * Output: contracts/GameStore.artifact.json  (ABI + bytecode)
 */

const solc = require("solc");
const fs   = require("fs");
const path = require("path");

const SRC_PATH      = path.join(__dirname, "../contracts/GameStore.sol");
const ARTIFACT_PATH = path.join(__dirname, "../contracts/GameStore.artifact.json");

const source = fs.readFileSync(SRC_PATH, "utf-8");

const input = {
  language: "Solidity",
  sources: {
    "GameStore.sol": { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object"] },
    },
  },
};

console.log("⚙️   Compiling GameStore.sol …");
const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const errors = output.errors.filter((e) => e.severity === "error");
  if (errors.length) {
    console.error("❌  Compilation errors:");
    errors.forEach((e) => console.error(e.formattedMessage));
    process.exit(1);
  }
  output.errors
    .filter((e) => e.severity === "warning")
    .forEach((w) => console.warn("⚠️  ", w.formattedMessage));
}

const contract = output.contracts["GameStore.sol"]["GameStore"];
const artifact = {
  abi:      contract.abi,
  bytecode: "0x" + contract.evm.bytecode.object,
};

fs.writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2));
console.log("✅  Compiled! Artifact saved to:", ARTIFACT_PATH);
console.log(
  `   ABI entries: ${artifact.abi.length}  |  Bytecode size: ${Math.round(artifact.bytecode.length / 2)} bytes`
);
