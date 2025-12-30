/**
 * Self-hosted Update Server for Crystal Chat
 *
 * This server provides update information and download URLs to Crystal Chat clients.
 *
 * Deployment:
 * 1. npm install
 * 2. node server.js
 *
 * Environment variables:
 * - PORT: Server port (default: 3000)
 * - UPDATE_CONFIG_PATH: Path to updates.json (default: ./updates.json)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const CONFIG_PATH = process.env.UPDATE_CONFIG_PATH || path.join(__dirname, 'updates.json');

/**
 * Load update configuration from JSON file
 */
function loadUpdatesConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to load updates config from ${CONFIG_PATH}:`, error.message);
    return { latest: null };
  }
}

/**
 * Handle update check request
 */
function handleUpdateCheck(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const config = loadUpdatesConfig();

  if (!config.latest) {
    // No update available
    res.writeHead(200);
    res.end(JSON.stringify(null));
    return;
  }

  // Return latest update info
  res.writeHead(200);
  res.end(JSON.stringify({
    version: config.latest.version,
    releaseName: config.latest.releaseName,
    releaseNotes: config.latest.releaseNotes,
    url: config.latest.url,
    signature: config.latest.signature // Optional: for signing verification
  }));
}

/**
 * Main server
 */
const server = http.createServer((req, res) => {
  // Enable CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/api/updates' && req.method === 'GET') {
    handleUpdateCheck(req, res);
  } else if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`Update server running on http://localhost:${PORT}`);
  console.log(`Update endpoint: http://localhost:${PORT}/api/updates`);
  console.log(`Config file: ${CONFIG_PATH}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
