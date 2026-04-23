const fs = require("fs");
const path = require("path");
const os = require("os");

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };

  const stream = fs.createReadStream(filePath);
  stream.on("open", () => {
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    stream.pipe(response);
  });
  stream.on("error", () => {
    response.writeHead(500);
    response.end("Failed to load file");
  });
}

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const networkDevices of Object.values(interfaces)) {
    if (!networkDevices) continue;
    for (const device of networkDevices) {
      if (device.family === "IPv4" && !device.internal) {
        return device.address;
      }
    }
  }
  return "localhost";
}

module.exports = { readBody, sendJson, sendFile, getLocalIpAddress };
