// WebSocket connection
let ws = null;
let reconnectTimeout = null;
let state = null;
let zones = [];
let progressInterval = null;

// Inactivity tracking for "away mode"
let inactivityTimeout = null;
let isAwayMode = false;
const INACTIVITY_DELAY = 5000; // 5 seconds

// Volume overlay for away mode
let volumeOverlayTimeout = null;
let lastOutputVolumes = new Map(); // outputId -> last seen volume value

// Volume popup state
let popupBuiltForOutputIds = null;
const popupSlidersActive = new Set();

// Persistent client identification
const CLIENT_ID_KEY = 'roon_controller_client_id';

function getOrCreateClientId() {
  // First, check for URL parameter (survives kiosk app restrictions)
  const urlParams = new URLSearchParams(window.location.search);
  const urlClientId = urlParams.get('client');
  if (urlClientId) {
    return `client_${urlClientId}`;
  }

  // Fall back to localStorage for regular browsers
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

// DOM elements
const elements = {
  status: document.getElementById('connection-status'),
  statusText: document.getElementById('status-text'),
  zoneButton: document.getElementById('zone-button'),
  zoneName: document.getElementById('zone-name'),
  zoneDropdown: document.getElementById('zone-dropdown'),
  zoneList: document.getElementById('zone-list'),
  artwork: document.getElementById('artwork'),
  trackTitle: document.getElementById('track-title'),
  trackArtist: document.getElementById('track-artist'),
  trackAlbum: document.getElementById('track-album'),
  timeElapsed: document.getElementById('time-elapsed'),
  timeRemaining: document.getElementById('time-remaining'),
  progressContainer: document.getElementById('progress-container'),
  progressFill: document.getElementById('progress-fill'),
  btnPrevious: document.getElementById('btn-previous'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  btnNext: document.getElementById('btn-next'),
  iconPlay: document.getElementById('icon-play'),
  iconPause: document.getElementById('icon-pause'),
  volumeSlider: document.getElementById('volume-slider'),
  volumeFill: document.getElementById('volume-fill'),
  volumeValue: document.getElementById('volume-value'),
  btnVolumeDown: document.getElementById('btn-volume-down'),
  btnVolumeUp: document.getElementById('btn-volume-up'),
  btnMute: document.getElementById('btn-mute'),
  iconMute: document.getElementById('icon-mute'),
  iconUnmute: document.getElementById('icon-unmute'),
  volumeContainer: document.getElementById('volume-container'),
  volumeOverlay: document.getElementById('volume-overlay'),
  volumeOverlayFill: document.getElementById('volume-overlay-fill'),
  volumeOverlayText: document.getElementById('volume-overlay-text'),
  volumeOverlayOutput: document.getElementById('volume-overlay-output'),
  volumePopupBtn: document.getElementById('btn-volume-popup'),
  volumePopup: document.getElementById('volume-popup'),
  volumePopupOutputs: document.getElementById('volume-popup-outputs')
};

// Connect to WebSocket server
function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  // Use explicit WebSocket URL if available (for iOS compatibility)
  const wsUrl = window.WEBSOCKET_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

  try {
    ws = new WebSocket(wsUrl);
  } catch (error) {
    console.error('Error creating WebSocket:', error);
    return;
  }

  ws.onopen = () => {
    updateConnectionStatus(true);

    // Send client identification immediately
    ws.send(JSON.stringify({
      type: 'identify',
      payload: { clientId: getOrCreateClientId() }
    }));

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleMessage(message);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  };

  ws.onclose = (event) => {
    updateConnectionStatus(false);
    stopProgressUpdates(); // Stop timer when disconnected

    // Attempt to reconnect after 3 seconds
    if (!reconnectTimeout) {
      reconnectTimeout = setTimeout(() => {
        connect();
      }, 3000);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// Handle incoming messages
function handleMessage(message) {
  switch (message.type) {
    case 'init':
    case 'update':
      // When receiving server update, trust the server's seek position
      // This prevents drift from local increments
      const oldState = state;
      state = message.data;

      // If we're playing and received a new seek position, restart progress from server time
      if (state && state.nowPlaying && oldState && oldState.nowPlaying) {
        if (state.nowPlaying.seek_position !== oldState.nowPlaying.seek_position) {
          // Server sent a different position, sync to it
          if (state.state === 'playing') {
            stopProgressUpdates();
            startProgressUpdates();
          }
        }
      }

      updateUI();
      break;

    case 'zones':
      zones = message.data;
      updateZoneList();
      break;

    default:
      console.warn('Unknown message type:', message.type);
  }
}

// Update connection status
function updateConnectionStatus(connected) {
  if (connected) {
    elements.status.classList.add('connected');
    elements.statusText.textContent = 'Connected';
  } else {
    elements.status.classList.remove('connected');
    elements.statusText.textContent = 'Disconnected';
  }
}

// Update UI with current state
function updateUI() {
  if (!state) return;

  // Update zone name
  if (state.zone) {
    elements.zoneName.textContent = state.zone.display_name;
  }

  // Update zone list to highlight the active zone
  if (zones.length > 0) {
    updateZoneList();
  }

  // Update now playing info
  if (state.nowPlaying) {
    elements.trackTitle.textContent = state.nowPlaying.title;
    elements.trackArtist.textContent = state.nowPlaying.artist;
    elements.trackAlbum.textContent = state.nowPlaying.album || '';

    // Update artwork
    if (state.nowPlaying.image_key) {
      const imgUrl = `/api/image/${state.nowPlaying.image_key}?width=800&height=800`;
      elements.artwork.innerHTML = `<img src="${imgUrl}" alt="Album Art">`;
    } else {
      showPlaceholder();
    }

    // Update progress
    updateProgress();
  } else {
    elements.trackTitle.textContent = 'Not Playing';
    elements.trackArtist.textContent = '—';
    elements.trackAlbum.textContent = '';
    showPlaceholder();
    elements.progressFill.style.width = '0%';
    elements.timeElapsed.textContent = '0:00';
    elements.timeRemaining.textContent = '0:00';
  }

  // Update playback state
  const isPlaying = state.state === 'playing';
  const isPaused = state.state === 'paused';

  if (isPlaying) {
    elements.iconPlay.classList.add('hidden');
    elements.iconPause.classList.remove('hidden');
    startProgressUpdates();
  } else {
    elements.iconPlay.classList.remove('hidden');
    elements.iconPause.classList.add('hidden');
    stopProgressUpdates();
  }

  // Update control buttons
  if (state.controls) {
    elements.btnPlayPause.disabled = !(state.controls.is_play_allowed || state.controls.is_pause_allowed);
    elements.btnPrevious.disabled = !state.controls.is_previous_allowed;
    elements.btnNext.disabled = !state.controls.is_next_allowed;
  }

  // Update volume
  const outputs = state.outputs || [];

  if (outputs.length > 1) {
    // Multiple outputs (grouped zone) - use popup button
    elements.volumeContainer.classList.add('hidden');
    elements.volumePopupBtn.classList.remove('hidden');
    syncVolumePopup();
  } else {
    // Single or zero outputs - use inline controls
    elements.volumeContainer.classList.remove('hidden');
    elements.volumePopupBtn.classList.add('hidden');
    closeVolumePopup();

    const vol = outputs.length === 1 ? outputs[0].volume : null;
    if (vol) {
      elements.volumeContainer.classList.remove('disabled');
      elements.volumeSlider.disabled = false;
      elements.btnVolumeDown.disabled = false;
      elements.btnVolumeUp.disabled = false;
      elements.btnMute.disabled = false;

      elements.volumeSlider.value = vol.value;
      elements.volumeSlider.min = vol.min;
      elements.volumeSlider.max = vol.max;
      elements.volumeFill.style.width = `${((vol.value - vol.min) / (vol.max - vol.min)) * 100}%`;
      elements.volumeValue.textContent = `${Math.round(vol.value)}%`;

      if (vol.is_muted) {
        elements.iconMute.classList.remove('hidden');
        elements.iconUnmute.classList.add('hidden');
      } else {
        elements.iconMute.classList.add('hidden');
        elements.iconUnmute.classList.remove('hidden');
      }
    } else {
      elements.volumeContainer.classList.add('disabled');
      elements.volumeSlider.disabled = true;
      elements.btnVolumeDown.disabled = true;
      elements.btnVolumeUp.disabled = true;
      elements.btnMute.disabled = true;
      elements.volumeValue.textContent = 'Fixed';
      elements.volumeSlider.value = 100;
      elements.volumeFill.style.width = '100%';
    }
  }

  // Away mode overlay: fire for any output volume change
  for (const output of outputs) {
    if (output.volume) {
      const lastVal = lastOutputVolumes.get(output.output_id);
      if (isAwayMode && lastVal !== undefined && lastVal !== output.volume.value) {
        showVolumeOverlay(output, output.volume.value, output.volume.min, output.volume.max);
        break;
      }
    }
  }

  // Update tracked volume values
  for (const output of outputs) {
    if (output.volume) {
      lastOutputVolumes.set(output.output_id, output.volume.value);
    }
  }
}

// Show artwork placeholder
function showPlaceholder() {
  elements.artwork.innerHTML = `
    <div class="artwork-placeholder">
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
        <path d="M40 10C23.43 10 10 23.43 10 40C10 56.57 23.43 70 40 70C56.57 70 70 56.57 70 40C70 23.43 56.57 10 40 10ZM40 65C26.19 65 15 53.81 15 40C15 26.19 26.19 15 40 15C53.81 15 65 26.19 65 40C65 53.81 53.81 65 40 65Z" fill="currentColor" opacity="0.3"/>
        <path d="M40 25C31.72 25 25 31.72 25 40C25 48.28 31.72 55 40 55C48.28 55 55 48.28 55 40C55 31.72 48.28 25 40 25ZM40 50C34.48 50 30 45.52 30 40C30 34.48 34.48 30 40 30C45.52 30 50 34.48 50 40C50 45.52 45.52 50 40 50Z" fill="currentColor" opacity="0.5"/>
        <circle cx="40" cy="40" r="5" fill="currentColor"/>
      </svg>
    </div>
  `;
}

// Update progress bar
function updateProgress() {
  if (!state || !state.nowPlaying) return;

  const { seek_position, length } = state.nowPlaying;

  if (!length) {
    elements.progressFill.style.width = '0%';
    elements.timeElapsed.textContent = '0:00';
    elements.timeRemaining.textContent = '0:00';
    return;
  }

  const currentPosition = seek_position || 0;
  const percentage = (currentPosition / length) * 100;

  elements.progressFill.style.width = `${percentage}%`;
  elements.timeElapsed.textContent = formatTime(currentPosition);
  elements.timeRemaining.textContent = formatTime(length - currentPosition);
}

// Format time in MM:SS
function formatTime(seconds) {
  if (!seconds || seconds < 0) return '0:00';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Start/stop progress updates
function startProgressUpdates() {
  stopProgressUpdates();

  progressInterval = setInterval(() => {
    if (state && state.nowPlaying && state.state === 'playing') {
      // Increment seek position locally
      state.nowPlaying.seek_position = (state.nowPlaying.seek_position || 0) + 1;
      updateProgress();
    }
  }, 1000);
}

function stopProgressUpdates() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

// Update zone list
function updateZoneList() {
  elements.zoneList.innerHTML = '';

  zones.forEach(zone => {
    const item = document.createElement('div');
    item.className = 'zone-item';
    if (state && state.zone && state.zone.zone_id === zone.zone_id) {
      item.classList.add('active');
    }

    item.innerHTML = `
      <div class="zone-item-name">${zone.display_name}</div>
      <div class="zone-item-state">${zone.state}</div>
    `;

    item.addEventListener('click', () => {
      selectZone(zone.zone_id);
      elements.zoneDropdown.classList.add('hidden');
    });

    elements.zoneList.appendChild(item);
  });
}

// Send command to server
function sendCommand(type, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

// Control functions
function playPause() {
  sendCommand('control', { command: 'playpause' });
}

function previous() {
  sendCommand('control', { command: 'previous' });
}

function next() {
  sendCommand('control', { command: 'next' });
}

function setOutputVolume(outputId, value) {
  sendCommand('volume', { outputId, mode: 'absolute', value: parseInt(value) });
}

function toggleOutputMute(outputId, action) {
  sendCommand('mute', { outputId, action });
}

function adjustVolume(delta) {
  if (!state || !state.outputs || state.outputs.length !== 1 || !state.outputs[0].volume) return;
  const vol = state.outputs[0].volume;
  const newValue = Math.max(vol.min, Math.min(vol.max, vol.value + delta));
  setOutputVolume(state.outputs[0].output_id, newValue);
}

function toggleMute() {
  if (!state || !state.outputs || state.outputs.length !== 1) return;
  const action = state.outputs[0].volume && state.outputs[0].volume.is_muted ? 'unmute' : 'mute';
  toggleOutputMute(state.outputs[0].output_id, action);
}

function selectZone(zoneId) {
  sendCommand('select_zone', { zoneId });
}

function seek(seconds) {
  sendCommand('seek', { seconds });
}

// Event listeners
elements.btnPlayPause.addEventListener('click', playPause);
elements.btnPrevious.addEventListener('click', previous);
elements.btnNext.addEventListener('click', next);

elements.volumeSlider.addEventListener('input', (e) => {
  const value = parseInt(e.target.value);
  if (state && state.outputs && state.outputs.length === 1 && state.outputs[0].volume) {
    const vol = state.outputs[0].volume;
    const percentage = ((value - vol.min) / (vol.max - vol.min)) * 100;
    elements.volumeFill.style.width = `${percentage}%`;
    elements.volumeValue.textContent = `${Math.round(value)}%`;
    setOutputVolume(state.outputs[0].output_id, value);
  }
  resetInactivityTimer();
});

elements.btnVolumeDown.addEventListener('click', () => adjustVolume(-1));
elements.btnVolumeUp.addEventListener('click', () => adjustVolume(1));
elements.btnMute.addEventListener('click', toggleMute);

elements.volumePopupBtn.addEventListener('click', openVolumePopup);

// Close popup when clicking the backdrop
elements.volumePopup.addEventListener('click', (e) => {
  if (e.target === elements.volumePopup) {
    closeVolumePopup();
  }
});

elements.zoneButton.addEventListener('click', (e) => {
  e.stopPropagation();
  elements.zoneDropdown.classList.toggle('hidden');
});

// Progress bar drag/click to seek
let isDragging = false;
let dragStarted = false;

function calculateSeekPosition(e, progressBar) {
  const rect = progressBar.getBoundingClientRect();
  const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
  const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const percentage = clickX / rect.width;
  return percentage * state.nowPlaying.length;
}

function handleSeekStart(e) {
  if (!state || !state.nowPlaying || !state.nowPlaying.length) return;
  if (state.controls && state.controls.is_seek_allowed === false) return;

  isDragging = true;
  dragStarted = false;
  stopProgressUpdates();  // Pause automatic progress updates while dragging
  e.preventDefault();
}

function handleSeekMove(e) {
  if (!isDragging || !state || !state.nowPlaying) return;

  dragStarted = true;
  const progressBar = elements.progressContainer.querySelector('.progress-bar');
  const seekPosition = calculateSeekPosition(e, progressBar);

  // Update local state for visual feedback
  state.nowPlaying.seek_position = Math.floor(seekPosition);
  updateProgress();
  e.preventDefault();
}

function handleSeekEnd(e) {
  if (!isDragging) return;

  const wasDragging = dragStarted;
  isDragging = false;
  dragStarted = false;

  if (!state || !state.nowPlaying || !state.nowPlaying.length) return;
  if (state.controls && state.controls.is_seek_allowed === false) return;

  const progressBar = elements.progressContainer.querySelector('.progress-bar');
  const seekPosition = calculateSeekPosition(e.type.includes('touch') ? e.changedTouches[0] : e, progressBar);

  // Update local state immediately for visual feedback
  state.nowPlaying.seek_position = Math.floor(seekPosition);
  updateProgress();

  seek(Math.floor(seekPosition));

  // Resume automatic progress updates if playing
  if (state.state === 'playing') {
    startProgressUpdates();
  }

  e.preventDefault();
}

// Mouse events
elements.progressContainer.addEventListener('mousedown', handleSeekStart);
document.addEventListener('mousemove', handleSeekMove);
document.addEventListener('mouseup', handleSeekEnd);

// Touch events
elements.progressContainer.addEventListener('touchstart', handleSeekStart, { passive: false });
document.addEventListener('touchmove', handleSeekMove, { passive: false });
document.addEventListener('touchend', handleSeekEnd, { passive: false });

// Close zone dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!elements.zoneButton.contains(e.target) && !elements.zoneDropdown.contains(e.target)) {
    elements.zoneDropdown.classList.add('hidden');
  }
});

// Away mode functions
function enterAwayMode() {
  isAwayMode = true;
  document.body.classList.add('away-mode');
}

function exitAwayMode() {
  isAwayMode = false;
  document.body.classList.remove('away-mode');
}

function showVolumeOverlay(output, volume, min, max) {
  const percentage = ((volume - min) / (max - min)) * 100;

  elements.volumeOverlayFill.style.width = `${percentage}%`;
  elements.volumeOverlayText.textContent = `${Math.round(volume)}%`;

  // Show output name for grouped zones (multiple outputs)
  const outputs = (state && state.outputs) || [];
  if (outputs.length > 1) {
    elements.volumeOverlayOutput.textContent = output.display_name;
    elements.volumeOverlayOutput.classList.remove('hidden');
  } else {
    elements.volumeOverlayOutput.classList.add('hidden');
  }

  elements.volumeOverlay.classList.remove('hidden');

  if (volumeOverlayTimeout) {
    clearTimeout(volumeOverlayTimeout);
  }

  volumeOverlayTimeout = setTimeout(() => {
    elements.volumeOverlay.classList.add('hidden');
  }, 2000);
}

function openVolumePopup() {
  syncVolumePopup();
  elements.volumePopup.classList.remove('hidden');
  resetInactivityTimer();
}

function closeVolumePopup() {
  elements.volumePopup.classList.add('hidden');
}

function syncVolumePopup() {
  const outputs = (state && state.outputs) || [];
  const currentIds = outputs.map(o => o.output_id).join(',');
  if (currentIds !== popupBuiltForOutputIds) {
    buildVolumePopup();
    popupBuiltForOutputIds = currentIds;
  } else {
    updateVolumePopupValues();
  }
}

function buildVolumePopup() {
  const outputs = (state && state.outputs) || [];
  elements.volumePopupOutputs.innerHTML = '';
  popupSlidersActive.clear();

  outputs.forEach(output => {
    const outputDiv = document.createElement('div');
    outputDiv.className = 'volume-popup-output';
    outputDiv.dataset.outputId = output.output_id;

    const nameDiv = document.createElement('div');
    nameDiv.className = 'volume-popup-output-name';
    nameDiv.textContent = output.display_name;
    outputDiv.appendChild(nameDiv);

    if (output.volume) {
      const vol = output.volume;
      const pct = ((vol.value - vol.min) / (vol.max - vol.min)) * 100;

      const controlsDiv = document.createElement('div');
      controlsDiv.className = 'volume-popup-output-controls';

      const downBtn = document.createElement('button');
      downBtn.className = 'volume-button';
      downBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 7H7L11 3V17L7 13H3V7Z" fill="currentColor"/><path d="M13 8C13.6 8.6 14 9.3 14 10C14 10.7 13.6 11.4 13 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

      const sliderContainer = document.createElement('div');
      sliderContainer.className = 'volume-slider-container';

      const track = document.createElement('div');
      track.className = 'volume-track';

      const fill = document.createElement('div');
      fill.className = 'volume-fill';
      fill.style.width = `${pct}%`;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'volume-slider';
      slider.min = vol.min;
      slider.max = vol.max;
      slider.value = vol.value;

      sliderContainer.appendChild(track);
      sliderContainer.appendChild(fill);
      sliderContainer.appendChild(slider);

      const upBtn = document.createElement('button');
      upBtn.className = 'volume-button';
      upBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 7H7L11 3V17L7 13H3V7Z" fill="currentColor"/><path d="M13 8C13.6 8.6 14 9.3 14 10C14 10.7 13.6 11.4 13 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 6C16.5 7 17.5 8.5 17.5 10C17.5 11.5 16.5 13 15.5 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

      const muteBtn = document.createElement('button');
      muteBtn.className = 'volume-button';
      muteBtn.dataset.role = 'mute';
      muteBtn.innerHTML = vol.is_muted
        ? `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 7H7L11 3V17L7 13H3V7Z" fill="currentColor"/><path d="M15 7L19 11M19 7L15 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
        : `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 7H7L11 3V17L7 13H3V7Z" fill="currentColor"/></svg>`;

      const valueSpan = document.createElement('span');
      valueSpan.className = 'volume-value';
      valueSpan.textContent = `${Math.round(vol.value)}%`;

      controlsDiv.appendChild(downBtn);
      controlsDiv.appendChild(sliderContainer);
      controlsDiv.appendChild(upBtn);
      controlsDiv.appendChild(muteBtn);
      controlsDiv.appendChild(valueSpan);

      slider.addEventListener('mousedown', () => popupSlidersActive.add(output.output_id));
      slider.addEventListener('touchstart', () => popupSlidersActive.add(output.output_id), { passive: true });
      slider.addEventListener('mouseup', () => popupSlidersActive.delete(output.output_id));
      slider.addEventListener('touchend', () => popupSlidersActive.delete(output.output_id));

      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        const current = state.outputs && state.outputs.find(o => o.output_id === output.output_id);
        if (current && current.volume) {
          const p = ((val - current.volume.min) / (current.volume.max - current.volume.min)) * 100;
          fill.style.width = `${p}%`;
          valueSpan.textContent = `${Math.round(val)}%`;
        }
        setOutputVolume(output.output_id, val);
        resetInactivityTimer();
      });

      downBtn.addEventListener('click', () => {
        const current = state.outputs && state.outputs.find(o => o.output_id === output.output_id);
        if (current && current.volume) {
          setOutputVolume(output.output_id, Math.max(current.volume.min, current.volume.value - 1));
        }
        resetInactivityTimer();
      });

      upBtn.addEventListener('click', () => {
        const current = state.outputs && state.outputs.find(o => o.output_id === output.output_id);
        if (current && current.volume) {
          setOutputVolume(output.output_id, Math.min(current.volume.max, current.volume.value + 1));
        }
        resetInactivityTimer();
      });

      muteBtn.addEventListener('click', () => {
        const current = state.outputs && state.outputs.find(o => o.output_id === output.output_id);
        if (current && current.volume) {
          toggleOutputMute(output.output_id, current.volume.is_muted ? 'unmute' : 'mute');
        }
        resetInactivityTimer();
      });

      outputDiv.appendChild(controlsDiv);
    } else {
      const fixedDiv = document.createElement('div');
      fixedDiv.className = 'volume-popup-output-fixed';
      fixedDiv.textContent = 'Fixed';
      outputDiv.appendChild(fixedDiv);
    }

    elements.volumePopupOutputs.appendChild(outputDiv);
  });
}

function updateVolumePopupValues() {
  const outputs = (state && state.outputs) || [];
  outputs.forEach(output => {
    if (!output.volume) return;
    if (popupSlidersActive.has(output.output_id)) return;

    const outputDiv = elements.volumePopupOutputs.querySelector(`[data-output-id="${CSS.escape(output.output_id)}"]`);
    if (!outputDiv) return;

    const slider = outputDiv.querySelector('input[type="range"]');
    const fill = outputDiv.querySelector('.volume-fill');
    const valueSpan = outputDiv.querySelector('.volume-value');
    const muteBtn = outputDiv.querySelector('[data-role="mute"]');

    if (slider) slider.value = output.volume.value;
    if (fill) {
      const pct = ((output.volume.value - output.volume.min) / (output.volume.max - output.volume.min)) * 100;
      fill.style.width = `${pct}%`;
    }
    if (valueSpan) valueSpan.textContent = `${Math.round(output.volume.value)}%`;
    if (muteBtn) {
      muteBtn.innerHTML = output.volume.is_muted
        ? `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 7H7L11 3V17L7 13H3V7Z" fill="currentColor"/><path d="M15 7L19 11M19 7L15 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
        : `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 7H7L11 3V17L7 13H3V7Z" fill="currentColor"/></svg>`;
    }
  });
}

function resetInactivityTimer() {
  // Clear existing timeout
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
  }

  // Exit away mode if we're in it
  if (isAwayMode) {
    exitAwayMode();
  }

  // Set new timeout
  inactivityTimeout = setTimeout(() => {
    enterAwayMode();
  }, INACTIVITY_DELAY);
}

// Track user activity
document.addEventListener('mousedown', resetInactivityTimer);
document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('touchstart', resetInactivityTimer);
document.addEventListener('keydown', resetInactivityTimer);

// Prevent screen from sleeping
function preventSleep() {
  if ('wakeLock' in navigator) {
    navigator.wakeLock.request('screen').catch(err => {
      console.log('Wake lock error:', err);
    });
  }
}

// Initialize on page load
window.addEventListener('load', () => {
  connect();
  preventSleep();
  resetInactivityTimer(); // Start inactivity tracking
});

// Cleanup on page unload
// Note: Removed ws.close() from beforeunload as it was causing issues on iOS Safari
window.addEventListener('beforeunload', () => {
  stopProgressUpdates();
});
