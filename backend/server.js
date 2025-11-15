const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const RoonHandler = require('./roon-handler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  perMessageDeflate: false, // Disable compression for iOS compatibility
  clientTracking: true
});

const PORT = process.env.PORT || 3000;

// Initialize Roon handler
const roonHandler = new RoonHandler();

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} from ${req.ip}`);
  next();
});

// Serve static files from frontend directory with cache control
app.use(express.static(path.join(__dirname, '../frontend'), {
  setHeaders: (res, filepath) => {
    // Prevent caching of HTML, JS, and CSS files
    if (filepath.endsWith('.html') || filepath.endsWith('.js') || filepath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// API endpoint for album artwork
app.get('/api/image/:imageKey', (req, res) => {
  const { imageKey } = req.params;
  const width = parseInt(req.query.width) || 800;
  const height = parseInt(req.query.height) || 800;

  roonHandler.getImage(imageKey, { width, height }, (error, contentType, imageBuffer) => {
    if (error) {
      res.status(404).send('Image not found');
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(imageBuffer);
  });
});

// API endpoint to get current state
app.get('/api/state', (req, res) => {
  res.json(roonHandler.getState());
});

// API endpoint to get zones
app.get('/api/zones', (req, res) => {
  res.json(roonHandler.getZones());
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send initial state
  ws.send(JSON.stringify({
    type: 'init',
    data: roonHandler.getState()
  }));

  // Send zones list
  ws.send(JSON.stringify({
    type: 'zones',
    data: roonHandler.getZones()
  }));

  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleClientMessage(ws, data);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', (code, reason) => {
    console.log('Client disconnected', code, reason.toString());
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Handle client commands
function handleClientMessage(ws, data) {
  const { type, payload } = data;

  switch (type) {
    case 'control':
      roonHandler.control(payload.command);
      break;

    case 'volume':
      roonHandler.setVolume(payload.mode, payload.value);
      break;

    case 'select_zone':
      roonHandler.selectZone(payload.zoneId);
      break;

    case 'mute':
      roonHandler.mute(payload.action);
      break;

    case 'seek':
      roonHandler.seek(payload.seconds);
      break;

    default:
      console.warn('Unknown message type:', type);
  }
}

// Broadcast updates to all connected clients
function broadcastUpdate(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Register callback for Roon state updates
roonHandler.onUpdate((state) => {
  broadcastUpdate({
    type: 'update',
    data: state
  });
});

roonHandler.onZonesUpdate((zones) => {
  broadcastUpdate({
    type: 'zones',
    data: zones
  });
});

// Start server - explicitly bind to 0.0.0.0 to accept connections from any interface
server.listen(PORT, '0.0.0.0', () => {
  console.log(`RoonController server running on port ${PORT}`);
  console.log(`Server is listening on all network interfaces`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});

// Initialize Roon connection
roonHandler.start();
