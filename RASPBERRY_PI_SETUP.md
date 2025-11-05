# Raspberry Pi Setup Guide

This guide will help you set up RoonController as an always-on display on a Raspberry Pi with a touchscreen.

## Hardware Requirements

- **Raspberry Pi**: 3B+, 4, or 5 (recommended)
- **Touchscreen**: Official 7" touchscreen or compatible display
- **Power Supply**: Official Raspberry Pi power supply
- **MicroSD Card**: 16GB or larger, Class 10 or better
- **Network**: WiFi or Ethernet connection to same network as Roon Core

## Recommended Hardware

For the best experience:
- **Raspberry Pi 4** (2GB RAM minimum, 4GB recommended)
- **Raspberry Pi Official 7" Touchscreen** (800x480)
- **3D printed case** (optional, for a clean installation)

## Software Requirements

- **Raspberry Pi OS** with desktop (Lite version not recommended)
- **Node.js** 14.0.0 or higher (installed by setup script)

## Initial Setup

### 1. Prepare the Raspberry Pi

1. **Download Raspberry Pi OS**
   - Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
   - Choose "Raspberry Pi OS (32-bit)" with desktop
   - NOT the Lite version - we need the desktop environment

2. **Configure WiFi and SSH**
   - In Raspberry Pi Imager, click the gear icon
   - Set hostname (e.g., `rooncontroller`)
   - Enable SSH
   - Configure WiFi credentials
   - Set username and password

3. **Write to SD card and boot**
   - Insert SD card into Raspberry Pi
   - Connect touchscreen if using one
   - Power on

### 2. Initial Configuration

SSH into your Pi (or use keyboard/mouse if directly connected):

```bash
ssh pi@rooncontroller.local
# Or: ssh pi@[IP_ADDRESS]
```

Update the system:

```bash
sudo apt-get update
sudo apt-get upgrade -y
```

### 3. Install RoonController

#### Option A: Automated Setup (Recommended)

1. **Transfer files to Raspberry Pi**

   From your computer:
   ```bash
   scp -r /Users/timcornelissen/Desktop/RoonController pi@rooncontroller.local:~/
   ```

2. **Run the setup script**

   On the Raspberry Pi:
   ```bash
   cd ~/RoonController
   chmod +x setup-pi.sh
   ./setup-pi.sh
   ```

3. **Reboot when prompted**
   ```bash
   sudo reboot
   ```

#### Option B: Manual Setup

If you prefer to set up manually:

1. **Install Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Install dependencies**
   ```bash
   cd ~/RoonController
   npm install
   ```

3. **Install required packages**
   ```bash
   sudo apt-get install -y chromium-browser unclutter xdotool x11-xserver-utils
   ```

4. **Create startup script** (see setup-pi.sh for reference)

5. **Configure autostart** (see setup-pi.sh for reference)

### 4. Enable in Roon

After the Pi reboots and the display appears:

1. Open **Roon** on your main device
2. Go to **Settings** → **Extensions**
3. Find **"RoonController Display"**
4. Click **Enable** or **Authorize**

The display should now connect and show your music!

## Configuration

### Screen Orientation

If you need to rotate the display:

```bash
sudo nano /boot/config.txt
```

Add one of these lines:
```
display_rotate=0    # Normal
display_rotate=1    # 90 degrees
display_rotate=2    # 180 degrees
display_rotate=3    # 270 degrees
```

Reboot after changes:
```bash
sudo reboot
```

### Screen Resolution

For the official 7" touchscreen, the resolution is automatically detected (800x480).

For other displays, you may need to set HDMI mode in `/boot/config.txt`:

```bash
sudo nano /boot/config.txt
```

Example for 1920x1080:
```
hdmi_group=2
hdmi_mode=82
```

### Brightness Control

For the official touchscreen, you can control brightness:

```bash
# Set brightness (0-255)
echo 200 | sudo tee /sys/class/backlight/rpi_backlight/brightness

# Maximum brightness
echo 255 | sudo tee /sys/class/backlight/rpi_backlight/brightness

# Minimum brightness
echo 50 | sudo tee /sys/class/backlight/rpi_backlight/brightness
```

To make permanent, add to startup script.

### Touchscreen Calibration

If touch input is misaligned:

```bash
sudo apt-get install xinput-calibrator
DISPLAY=:0 xinput_calibrator
```

Follow the on-screen prompts and save the calibration.

## Managing the Service

### Start/Stop/Restart

```bash
# Check status
systemctl --user status rooncontroller

# Start
systemctl --user start rooncontroller

# Stop
systemctl --user stop rooncontroller

# Restart
systemctl --user restart rooncontroller
```

### View Logs

```bash
# Follow logs in real-time
journalctl --user -u rooncontroller -f

# View recent logs
journalctl --user -u rooncontroller -n 50

# View logs from today
journalctl --user -u rooncontroller --since today
```

### Disable Auto-Start

```bash
systemctl --user disable rooncontroller
```

### Enable Auto-Start

```bash
systemctl --user enable rooncontroller
```

## Troubleshooting

### Display doesn't start on boot

1. **Check if service is running**
   ```bash
   systemctl --user status rooncontroller
   ```

2. **Check logs**
   ```bash
   journalctl --user -u rooncontroller -n 50
   ```

3. **Verify autostart file exists**
   ```bash
   ls -la ~/.config/autostart/rooncontroller.desktop
   ```

### "Connection Failed" message

1. **Verify Raspberry Pi is on same network as Roon Core**
   ```bash
   ping [ROON_CORE_IP]
   ```

2. **Check server is running**
   ```bash
   curl http://localhost:3000
   ```

3. **Restart the service**
   ```bash
   systemctl --user restart rooncontroller
   ```

### Touchscreen not working

1. **Check if touchscreen is detected**
   ```bash
   ls /dev/input/
   ```

2. **Test touch input**
   ```bash
   sudo apt-get install evtest
   sudo evtest
   # Select your touch device and test touches
   ```

3. **Calibrate touchscreen** (see Touchscreen Calibration above)

### Display is upside down

Rotate the display (see Screen Orientation above).

### Screen blanks after a while

The setup script should prevent this, but if it still happens:

```bash
# Disable screen blanking
sudo raspi-config
# → Display Options → Screen Blanking → No
```

Or manually:
```bash
xset s off
xset -dpms
xset s noblank
```

### Browser shows error page on startup

This can happen if the server hasn't started yet. The startup script includes a 5-second delay, but you can increase it:

```bash
nano ~/RoonController/start-display.sh
# Change "sleep 5" to "sleep 10"
```

### Want to access desktop/terminal

Press `Alt+F4` to close Chromium and access the desktop.

To exit kiosk mode permanently:
```bash
systemctl --user stop rooncontroller
```

To re-enter kiosk mode:
```bash
systemctl --user start rooncontroller
```

## Performance Optimization

### Reduce Memory Usage

If you experience slowness on Pi 3 or 2GB Pi 4:

```bash
sudo nano /boot/config.txt
```

Add:
```
gpu_mem=256
```

### Disable Unnecessary Services

```bash
sudo systemctl disable bluetooth
sudo systemctl disable hciuart
```

### Overclock (Advanced)

For better performance (at your own risk):

```bash
sudo raspi-config
# → Performance Options → Overclock
```

## Power Management

### Safe Shutdown

```bash
sudo shutdown -h now
```

### Reboot

```bash
sudo reboot
```

### Auto-restart on power loss

The Raspberry Pi will automatically boot when power is restored, and RoonController will auto-start.

## Network Configuration

### Static IP Address (Optional)

To ensure the Raspberry Pi always has the same IP:

```bash
sudo nano /etc/dhcpcd.conf
```

Add at the end:
```
interface wlan0  # or eth0 for ethernet
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=192.168.1.1 8.8.8.8
```

Adjust IPs to match your network.

## Remote Access

### SSH Access

SSH is enabled by the setup. To connect:
```bash
ssh pi@rooncontroller.local
```

### VNC Access (Optional)

To enable graphical remote access:

```bash
sudo raspi-config
# → Interface Options → VNC → Enable
```

Then use a VNC client to connect to `rooncontroller.local`.

## Updates

To update RoonController:

```bash
cd ~/RoonController
git pull  # If using git
# Or manually copy new files

npm install  # Update dependencies
systemctl --user restart rooncontroller
```

## Mounting Options

### Wall Mount

- Use VESA mount adapter for your display
- 3D print custom case for official touchscreen
- Use command strips for temporary mounting

### Desk Stand

- Official Raspberry Pi touchscreen case
- Custom 3D printed stands (many available on Thingiverse)
- Adjustable tablet stand

### In-wall Installation

- Flush mount frame
- Recessed box for wiring
- Consider ventilation for long-term use

## Advanced Customization

### Change Default Zone

The app remembers the last selected zone. To change:
1. Touch zone selector in top-right
2. Select desired zone

### Custom Port

```bash
nano ~/RoonController/backend/server.js
```

Change `PORT` variable, then:
```bash
systemctl --user restart rooncontroller
```

Update Chromium URL in `start-display.sh`.

### Auto-dim at Night

Add to crontab:
```bash
crontab -e
```

Add:
```
# Dim at 10 PM
0 22 * * * echo 50 | sudo tee /sys/class/backlight/rpi_backlight/brightness

# Brighten at 7 AM
0 7 * * * echo 200 | sudo tee /sys/class/backlight/rpi_backlight/brightness
```

## Additional Resources

- [Raspberry Pi Documentation](https://www.raspberrypi.org/documentation/)
- [Roon API Documentation](https://roonlabs.github.io/node-roon-api/)
- [Roon Community Forums](https://community.roonlabs.com/)

## Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Review logs: `journalctl --user -u rooncontroller -f`
3. Verify network connectivity
4. Ensure Roon Core is running
5. Check Roon Extensions settings

---

**Enjoy your RoonController display!** 🎵
