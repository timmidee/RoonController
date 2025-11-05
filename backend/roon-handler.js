const RoonApi = require('node-roon-api');
const RoonApiStatus = require('node-roon-api-status');
const RoonApiTransport = require('node-roon-api-transport');
const RoonApiImage = require('node-roon-api-image');

class RoonHandler {
  constructor() {
    this.core = null;
    this.transport = null;
    this.image = null;
    this.zones = [];
    this.currentZone = null;
    this.updateCallback = null;
    this.zonesUpdateCallback = null;

    // Initialize Roon API
    this.roon = new RoonApi({
      extension_id: 'com.timcornelissen.rooncontroller',
      display_name: 'RoonController Display',
      display_version: '1.0.0',
      publisher: 'Tim Cornelissen',
      email: 'tim@example.com',
      website: 'https://github.com/timcornelissen/rooncontroller',
      log_level: 'none',

      core_paired: (core) => {
        this.core = core;
        this.transport = core.services.RoonApiTransport;
        this.image = core.services.RoonApiImage;

        console.log('Paired with Roon Core:', core.display_name);
        this.svcStatus.set_status('Connected to Roon Core', false);

        // Subscribe to zone updates
        this.subscribeToZones();
      },

      core_unpaired: (core) => {
        console.log('Unpaired from Roon Core:', core.display_name);
        this.svcStatus.set_status('Disconnected from Roon Core', true);
        this.core = null;
        this.transport = null;
        this.image = null;
        this.zones = [];
        this.currentZone = null;
      }
    });

    // Status service
    this.svcStatus = new RoonApiStatus(this.roon);

    // Initialize services
    this.roon.init_services({
      required_services: [RoonApiTransport, RoonApiImage],
      provided_services: [this.svcStatus]
    });
  }

  start() {
    this.svcStatus.set_status('Starting...', false);
    this.roon.start_discovery();
  }

  subscribeToZones() {
    if (!this.transport) return;

    this.transport.subscribe_zones((cmd, data) => {
      if (cmd === 'Subscribed') {
        this.zones = data.zones || [];

        // Select first zone by default or restore saved zone
        if (this.zones.length > 0) {
          const savedZoneId = this.roon.load_config('selected_zone_id');
          const savedZone = this.zones.find(z => z.zone_id === savedZoneId);
          this.currentZone = savedZone || this.zones[0];
        }

        console.log(`Subscribed to ${this.zones.length} zones`);
        this.notifyUpdate();
        this.notifyZonesUpdate();
      } else if (cmd === 'Changed') {
        let zonesListChanged = false;

        // Update zones
        if (data.zones_changed) {
          data.zones_changed.forEach(changedZone => {
            const index = this.zones.findIndex(z => z.zone_id === changedZone.zone_id);
            if (index !== -1) {
              this.zones[index] = changedZone;

              // Update current zone if it changed
              if (this.currentZone && this.currentZone.zone_id === changedZone.zone_id) {
                this.currentZone = changedZone;
              }
            }
          });
          this.notifyUpdate();
          zonesListChanged = true;
        }

        if (data.zones_added) {
          this.zones.push(...data.zones_added);
          zonesListChanged = true;
        }

        if (data.zones_removed) {
          const removedIds = data.zones_removed.map(z => z.zone_id);
          this.zones = this.zones.filter(z => !removedIds.includes(z.zone_id));

          // If current zone was removed, select first available
          if (this.currentZone && removedIds.includes(this.currentZone.zone_id)) {
            this.currentZone = this.zones.length > 0 ? this.zones[0] : null;
          }

          this.notifyUpdate();
          zonesListChanged = true;
        }

        // Send updated zones list if anything changed
        if (zonesListChanged) {
          this.notifyZonesUpdate();
        }
      }
    });
  }

  getState() {
    if (!this.currentZone) {
      return {
        connected: !!this.core,
        zone: null,
        nowPlaying: null,
        state: 'stopped',
        volume: null
      };
    }

    const output = this.currentZone.outputs && this.currentZone.outputs[0];

    return {
      connected: !!this.core,
      zone: {
        zone_id: this.currentZone.zone_id,
        display_name: this.currentZone.display_name
      },
      nowPlaying: this.currentZone.now_playing ? {
        title: this.currentZone.now_playing.three_line?.line1 || 'Unknown',
        artist: this.currentZone.now_playing.three_line?.line2 || 'Unknown Artist',
        album: this.currentZone.now_playing.three_line?.line3 || '',
        image_key: this.currentZone.now_playing.image_key,
        length: this.currentZone.now_playing.length,
        seek_position: this.currentZone.now_playing.seek_position
      } : null,
      state: this.currentZone.state,
      controls: {
        is_play_allowed: this.currentZone.is_play_allowed,
        is_pause_allowed: this.currentZone.is_pause_allowed,
        is_previous_allowed: this.currentZone.is_previous_allowed,
        is_next_allowed: this.currentZone.is_next_allowed,
        is_seek_allowed: this.currentZone.is_seek_allowed
      },
      volume: output && output.volume ? {
        value: output.volume.value,
        min: output.volume.min,
        max: output.volume.max,
        step: output.volume.step,
        is_muted: output.volume.is_muted,
        type: output.volume.type
      } : null
    };
  }

  getZones() {
    // Deduplicate zones by zone_id (keep the last occurrence)
    const uniqueZones = [];
    const seenIds = new Set();

    // Process in reverse to keep the most recent version of each zone
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zone = this.zones[i];
      if (!seenIds.has(zone.zone_id)) {
        seenIds.add(zone.zone_id);
        uniqueZones.unshift({
          zone_id: zone.zone_id,
          display_name: zone.display_name,
          state: zone.state
        });
      }
    }

    return uniqueZones;
  }

  control(command) {
    if (!this.transport || !this.currentZone) {
      console.warn('Cannot control: not connected or no zone selected');
      return;
    }

    const validCommands = ['play', 'pause', 'playpause', 'stop', 'previous', 'next'];
    if (!validCommands.includes(command)) {
      console.warn('Invalid control command:', command);
      return;
    }

    this.transport.control(this.currentZone, command);
  }

  setVolume(mode, value) {
    if (!this.transport || !this.currentZone) {
      console.warn('Cannot set volume: not connected or no zone selected');
      return;
    }

    const output = this.currentZone.outputs && this.currentZone.outputs[0];
    if (!output || !output.volume) {
      console.warn('No volume control available for this zone');
      return;
    }

    this.transport.change_volume(output, mode, value);
  }

  mute(action) {
    if (!this.transport || !this.currentZone) {
      console.warn('Cannot mute: not connected or no zone selected');
      return;
    }

    const output = this.currentZone.outputs && this.currentZone.outputs[0];
    if (!output || !output.volume) {
      console.warn('No volume control available for this zone');
      return;
    }

    this.transport.mute(output, action);
  }

  selectZone(zoneId) {
    const zone = this.zones.find(z => z.zone_id === zoneId);
    if (zone) {
      this.currentZone = zone;
      this.roon.save_config('selected_zone_id', zoneId);
      this.notifyUpdate();
    }
  }

  seek(seconds) {
    if (!this.transport || !this.currentZone) {
      console.warn('Cannot seek: not connected or no zone selected');
      return;
    }

    if (!this.currentZone.is_seek_allowed) {
      console.warn('Seeking is not allowed for this zone');
      return;
    }

    console.log(`Seeking to ${seconds} seconds in zone: ${this.currentZone.display_name}`);
    this.transport.seek(this.currentZone, 'absolute', seconds);
  }

  getImage(imageKey, options, callback) {
    if (!this.image) {
      callback('Not connected to Roon', null, null);
      return;
    }

    const opts = {
      scale: 'fit',
      width: options.width || 800,
      height: options.height || 800,
      format: 'image/jpeg'
    };

    this.image.get_image(imageKey, opts, callback);
  }

  onUpdate(callback) {
    this.updateCallback = callback;
  }

  onZonesUpdate(callback) {
    this.zonesUpdateCallback = callback;
  }

  notifyUpdate() {
    if (this.updateCallback) {
      this.updateCallback(this.getState());
    }
  }

  notifyZonesUpdate() {
    if (this.zonesUpdateCallback) {
      this.zonesUpdateCallback(this.getZones());
    }
  }
}

module.exports = RoonHandler;
