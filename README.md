# RoonController Display

An always-on display for Roon with a beautiful, iOS-inspired interface. Perfect for Raspberry Pi with a touchscreen.

![RoonController](https://img.shields.io/badge/platform-Raspberry%20Pi-red)
![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)

## Features

- **Now Playing Display**: Large album artwork with song, artist, and album information
- **Playback Controls**: Touch-friendly play/pause, previous, and next buttons
- **Volume Control**: Slider and buttons with mute toggle
- **Zone Picker**: Select which Roon zone to display and control
- **Real-time Updates**: WebSocket-based live synchronization with Roon
- **Touch-Optimized**: Large hit targets for touchscreen displays
- **Always-On**: Dark mode friendly, prevents screen sleep

## Screenshots

The interface features:
- Clean, dark theme optimized for always-on displays
- Large album artwork with rounded corners and shadows
- Clear typography hierarchy for track information
- Smooth progress bar with time display
- Intuitive playback and volume controls

## Requirements

- **Roon Core** running on your network
- **Node.js** 14.0.0 or higher
- **Raspberry Pi** (recommended) or any device with a display
- **Network connection** on the same network as Roon Core

## Installation

### On Your Development Machine (Mac/Linux/Windows)

1. **Install Node.js** (if not already installed)

   **On Mac:**
   ```bash
   # Using Homebrew (recommended)
   brew install node

   # Or download from https://nodejs.org/
   ```

   **On Linux:**
   ```bash
   # Ubuntu/Debian
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

   **On Windows:**
   - Download from https://nodejs.org/
   - Or use `winget install OpenJS.NodeJS`

2. **Navigate to project directory**
   ```bash
   cd /path/to/RoonController
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open in browser**
   - Navigate to `http://localhost:3000`
   - The extension will appear in Roon Settings → Extensions
   - Click "Enable" to authorize the extension

### On Raspberry Pi

See [RASPBERRY_PI_SETUP.md](RASPBERRY_PI_SETUP.md) for detailed instructions.

## Quick Start for Raspberry Pi

1. **Copy files to Raspberry Pi**
   ```bash
   scp -r RoonController pi@raspberrypi.local:~/
   ```

2. **SSH into Raspberry Pi**
   ```bash
   ssh pi@raspberrypi.local
   ```

3. **Run the setup script**
   ```bash
   cd ~/RoonController
   chmod +x setup-pi.sh
   ./setup-pi.sh
   ```

4. **Reboot**
   ```bash
   sudo reboot
   ```

The display will automatically start in full-screen mode on boot.

## Usage

### First Time Setup

1. Start the RoonController server
2. In Roon, go to **Settings** → **Extensions**
3. Find "RoonController Display" and click **Enable**
4. The display will automatically connect

### Selecting a Zone

1. Click the zone selector in the top-right corner
2. Choose the zone you want to control
3. The selection is saved automatically

### Controls

- **Play/Pause**: Tap the large center button
- **Previous/Next**: Tap the side buttons
- **Volume**: Use the slider or +/- buttons
- **Mute**: Tap the mute button on the right

## Configuration

### Changing the Port

Edit `backend/server.js` or set the `PORT` environment variable:

```bash
PORT=8080 npm start
```

### Auto-Start on Raspberry Pi

The setup script configures the app to start automatically. To manage it:

```bash
# Check status
systemctl --user status rooncontroller

# Stop
systemctl --user stop rooncontroller

# Start
systemctl --user start rooncontroller

# Restart
systemctl --user restart rooncontroller

# View logs
journalctl --user -u rooncontroller -f
```

## Project Structure

```
RoonController/
├── backend/
│   ├── server.js           # Express + WebSocket server
│   ├── roon-handler.js     # Roon API integration
│   └── package.json        # Dependencies
├── frontend/
│   ├── index.html          # Main UI
│   ├── styles.css          # iOS-inspired styling
│   └── app.js              # Frontend logic
├── setup-pi.sh             # Raspberry Pi setup script
├── RASPBERRY_PI_SETUP.md   # Detailed Pi setup guide
└── README.md               # This file
```

## Architecture

### Backend (Node.js)
- **Roon API Extension**: Connects to Roon Core via automatic discovery
- **WebSocket Server**: Real-time communication with frontend
- **HTTP Server**: Serves static files and album artwork
- **State Management**: Maintains zone subscriptions and current state

### Frontend (Web App)
- **Single-Page Application**: Vanilla JavaScript for optimal performance
- **WebSocket Client**: Receives real-time updates
- **Touch-Optimized UI**: Large buttons and swipe-friendly controls
- **Responsive Design**: Adapts to different screen sizes

## Customization

### Changing Colors

Edit `frontend/styles.css` and modify the CSS variables:

```css
:root {
  --bg-primary: #000000;        /* Main background */
  --bg-secondary: #1c1c1e;      /* Secondary background */
  --text-primary: #ffffff;       /* Primary text color */
  --accent-color: #007aff;       /* Accent color */
}
```

### Adjusting Layout

The layout is responsive and adapts to:
- Portrait displays (default vertical layout)
- Landscape displays (horizontal layout on short screens)
- Various screen sizes (mobile, tablet, desktop)

## Troubleshooting

### Extension doesn't appear in Roon

1. Make sure the server is running (`npm start`)
2. Check that you're on the same network as Roon Core
3. Look for connection messages in the terminal
4. Restart the RoonController server

### Display shows "Disconnected"

1. Check that Roon Core is running
2. Verify network connectivity
3. Check the browser console for errors (F12)
4. Restart both Roon Core and RoonController

### Controls don't work

1. Make sure you've enabled the extension in Roon Settings
2. Select a zone using the zone picker
3. Ensure the zone has an active output device
4. Check that playback controls are available for the current zone

### Album art doesn't load

1. Check network connectivity
2. Verify the image_key is present in the state
3. Check browser console for 404 errors
4. Ensure Roon Core has artwork for the current track

### Screen goes to sleep on Raspberry Pi

The app uses the Wake Lock API to prevent sleep. If it still sleeps:

```bash
# Disable screen blanking
sudo raspi-config
# Display Options → Screen Blanking → No
```

## Future Enhancements

Planned features for future versions:

- **Library Browsing**: Navigate your music library
- **Search**: Find tracks, albums, and artists
- **Queue Management**: View and edit the play queue
- **Playlist Support**: Browse and play playlists
- **Multi-Zone Control**: Control multiple zones simultaneously
- **Grouping**: Group and ungroup outputs
- **Radio Controls**: Access Roon Radio settings

## Development

### Running in Development Mode

```bash
npm run dev
```

### Testing on Desktop

Just open `http://localhost:3000` in any modern browser.

### Testing on Mobile/Tablet

Find your computer's IP address and navigate to `http://YOUR_IP:3000` from your mobile device.

## Contributing

Contributions are welcome! Feel free to:

- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Credits

Built with:
- [node-roon-api](https://github.com/RoonLabs/node-roon-api) by Roon Labs
- Express.js
- WebSocket (ws)


## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review Roon API documentation: https://roonlabs.github.io/node-roon-api/
3. Visit Roon Community forums: https://community.roonlabs.com/

---

**Enjoy your RoonController display!** 🎵
