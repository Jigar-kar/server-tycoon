const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = require("path").resolve(__dirname, "..");
const STATIC_DIR = require("path").resolve(__dirname, "..", "public");

module.exports = { PORT, HOST, ROOT, STATIC_DIR };
