#!/bin/bash

# RoonController Raspberry Pi Setup Script
# This script sets up RoonController to run on boot with a touchscreen display

set -e

echo "========================================="
echo "RoonController Raspberry Pi Setup"
echo "========================================="
echo ""

# Check if running on Raspberry Pi
if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
    echo "Warning: This doesn't appear to be a Raspberry Pi"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Update system
echo "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "Node.js already installed: $(node --version)"
fi

# Install required packages
echo "Installing required packages..."
sudo apt-get install -y \
    chromium-browser \
    unclutter \
    xdotool \
    x11-xserver-utils

# Install npm dependencies
echo "Installing npm dependencies..."
npm install

# Create autostart directory if it doesn't exist
mkdir -p ~/.config/autostart

# Create desktop autostart file for X session
echo "Creating autostart configuration..."
cat > ~/.config/autostart/rooncontroller.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=RoonController
Exec=/home/pi/RoonController/start-display.sh
X-GNOME-Autostart-enabled=true
EOF

# Create startup script
echo "Creating startup script..."
cat > ~/RoonController/start-display.sh << 'EOF'
#!/bin/bash

# Wait for X server to be ready
sleep 5

# Disable screen blanking and power management
xset s off
xset -dpms
xset s noblank

# Hide mouse cursor
unclutter -idle 0.1 &

# Start RoonController server
cd ~/RoonController
node backend/server.js &

# Wait for server to start
sleep 5

# Start Chromium in kiosk mode
chromium-browser \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --no-first-run \
    --enable-features=OverlayScrollbar \
    --start-fullscreen \
    --window-position=0,0 \
    --app=http://localhost:3000 &

# Keep script running
wait
EOF

chmod +x ~/RoonController/start-display.sh

# Create systemd user service (alternative to autostart)
echo "Creating systemd service..."
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/rooncontroller.service << EOF
[Unit]
Description=RoonController Display
After=network.target

[Service]
Type=simple
WorkingDirectory=$HOME/RoonController
ExecStart=/usr/bin/node $HOME/RoonController/backend/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF

# Enable systemd service
systemctl --user daemon-reload
systemctl --user enable rooncontroller.service

# Configure boot to desktop
echo "Configuring boot settings..."
sudo raspi-config nonint do_boot_behaviour B4 2>/dev/null || true

# Disable screen blanking in boot config
if ! grep -q "^hdmi_blanking=1" /boot/config.txt 2>/dev/null; then
    echo "hdmi_blanking=1" | sudo tee -a /boot/config.txt > /dev/null
fi

# Configure Chromium preferences to prevent restore dialog
mkdir -p ~/.config/chromium/Default
cat > ~/.config/chromium/Default/Preferences << 'EOF'
{
   "browser": {
      "check_default_browser": false
   },
   "session": {
      "restore_on_startup": 4
   },
   "profile": {
      "exit_type": "Normal"
   }
}
EOF

echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "RoonController has been configured to:"
echo "  • Start automatically on boot"
echo "  • Run in full-screen kiosk mode"
echo "  • Prevent screen blanking"
echo "  • Hide mouse cursor"
echo ""
echo "To manually control the service:"
echo "  systemctl --user start rooncontroller"
echo "  systemctl --user stop rooncontroller"
echo "  systemctl --user status rooncontroller"
echo ""
echo "To view logs:"
echo "  journalctl --user -u rooncontroller -f"
echo ""
echo "IMPORTANT: After rebooting, go to Roon Settings → Extensions"
echo "           and enable 'RoonController Display'"
echo ""
read -p "Reboot now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo reboot
else
    echo ""
    echo "Please reboot when ready: sudo reboot"
fi
