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
    this.clientZones = new Map(); // Map of clientId -> zoneId
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
        this.clientZones.clear();
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
        console.log(`Subscribed to ${this.zones.length} zones`);
        this.notifyZonesUpdate();
      } else if (cmd === 'Changed') {
        let zonesListChanged = false;

        // Update zones
        if (data.zones_changed) {
          data.zones_changed.forEach(changedZone => {
            const index = this.zones.findIndex(z => z.zone_id === changedZone.zone_id);
            if (index !== -1) {
              this.zones[index] = changedZone;
            }
          });
          // Notify all clients with their respective zones
          this.notifyAllClientsUpdate();
          zonesListChanged = true;
        }

        if (data.zones_added) {
          this.zones.push(...data.zones_added);
          zonesListChanged = true;
        }

        if (data.zones_removed) {
          // zones_removed is an array of zone_id strings, not objects
          const removedIds = data.zones_removed;
          this.zones = this.zones.filter(z => !removedIds.includes(z.zone_id));

          // Remove zone assignments for removed zones and reassign to first zone
          for (const [clientId, zoneId] of this.clientZones.entries()) {
            if (removedIds.includes(zoneId)) {
              if (this.zones.length > 0) {
                this.clientZones.set(clientId, this.zones[0].zone_id);
              } else {
                this.clientZones.delete(clientId);
              }
            }
          }

          this.notifyAllClientsUpdate();
          zonesListChanged = true;
        }

        // Send updated zones list if anything changed
        if (zonesListChanged) {
          this.notifyZonesUpdate();
        }
      }
    });
  }

  getState(clientId) {
    const zoneId = this.clientZones.get(clientId);
    const currentZone = zoneId ? this.zones.find(z => z.zone_id === zoneId) : null;

    if (!currentZone) {
      return {
        connected: !!this.core,
        zone: null,
        nowPlaying: null,
        state: 'stopped',
        volume: null
      };
    }

    const output = currentZone.outputs && currentZone.outputs[0];

    return {
      connected: !!this.core,
      zone: {
        zone_id: currentZone.zone_id,
        display_name: currentZone.display_name
      },
      nowPlaying: currentZone.now_playing ? {
        title: currentZone.now_playing.three_line?.line1 || 'Unknown',
        artist: currentZone.now_playing.three_line?.line2 || 'Unknown Artist',
        album: currentZone.now_playing.three_line?.line3 || '',
        image_key: currentZone.now_playing.image_key,
        length: currentZone.now_playing.length,
        seek_position: currentZone.now_playing.seek_position
      } : null,
      state: currentZone.state,
      controls: {
        is_play_allowed: currentZone.is_play_allowed,
        is_pause_allowed: currentZone.is_pause_allowed,
        is_previous_allowed: currentZone.is_previous_allowed,
        is_next_allowed: currentZone.is_next_allowed,
        is_seek_allowed: currentZone.is_seek_allowed
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

  control(clientId, command) {
    const zoneId = this.clientZones.get(clientId);
    const currentZone = zoneId ? this.zones.find(z => z.zone_id === zoneId) : null;

    if (!this.transport || !currentZone) {
      console.warn('Cannot control: not connected or no zone selected');
      return;
    }

    const validCommands = ['play', 'pause', 'playpause', 'stop', 'previous', 'next'];
    if (!validCommands.includes(command)) {
      console.warn('Invalid control command:', command);
      return;
    }

    this.transport.control(currentZone, command);
  }

  setVolume(clientId, mode, value) {
    const zoneId = this.clientZones.get(clientId);
    const currentZone = zoneId ? this.zones.find(z => z.zone_id === zoneId) : null;

    if (!this.transport || !currentZone) {
      console.warn('Cannot set volume: not connected or no zone selected');
      return;
    }

    const output = currentZone.outputs && currentZone.outputs[0];
    if (!output || !output.volume) {
      console.warn('No volume control available for this zone');
      return;
    }

    this.transport.change_volume(output, mode, value);
  }

  mute(clientId, action) {
    const zoneId = this.clientZones.get(clientId);
    const currentZone = zoneId ? this.zones.find(z => z.zone_id === zoneId) : null;

    if (!this.transport || !currentZone) {
      console.warn('Cannot mute: not connected or no zone selected');
      return;
    }

    const output = currentZone.outputs && currentZone.outputs[0];
    if (!output || !output.volume) {
      console.warn('No volume control available for this zone');
      return;
    }

    this.transport.mute(output, action);
  }

  selectZone(clientId, zoneId) {
    const zone = this.zones.find(z => z.zone_id === zoneId);
    if (zone) {
      this.clientZones.set(clientId, zoneId);
      this.notifyClientUpdate(clientId);
    }
  }

  seek(clientId, seconds) {
    const zoneId = this.clientZones.get(clientId);
    const currentZone = zoneId ? this.zones.find(z => z.zone_id === zoneId) : null;

    if (!this.transport || !currentZone) {
      console.warn('Cannot seek: not connected or no zone selected');
      return;
    }

    if (!currentZone.is_seek_allowed) {
      console.warn('Seeking is not allowed for this zone');
      return;
    }

    console.log(`Seeking to ${seconds} seconds in zone: ${currentZone.display_name}`);
    this.transport.seek(currentZone, 'absolute', seconds);
  }

  registerClient(clientId) {
    // Assign first zone by default if available
    if (this.zones.length > 0 && !this.clientZones.has(clientId)) {
      this.clientZones.set(clientId, this.zones[0].zone_id);
    }
  }

  unregisterClient(clientId) {
    this.clientZones.delete(clientId);
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

  notifyClientUpdate(clientId) {
    if (this.updateCallback) {
      this.updateCallback(clientId, this.getState(clientId));
    }
  }

  notifyAllClientsUpdate() {
    if (this.updateCallback) {
      // Notify all connected clients
      for (const clientId of this.clientZones.keys()) {
        this.updateCallback(clientId, this.getState(clientId));
      }
    }
  }

  notifyZonesUpdate() {
    if (this.zonesUpdateCallback) {
      this.zonesUpdateCallback(this.getZones());
    }
  }
}

module.exports = RoonHandler;
