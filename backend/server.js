const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const RoonHandler = require('./roon-handler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Initialize Roon handler
const roonHandler = new RoonHandler();

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

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

  ws.on('close', () => {
    console.log('Client disconnected');
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

// Start server
server.listen(PORT, () => {
  console.log(`RoonController server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});

// Initialize Roon connection
roonHandler.start();
