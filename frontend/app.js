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
  volumeContainer: document.getElementById('volume-container')
};

// Connect to WebSocket server
function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Connected to server');
    updateConnectionStatus(true);
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

  ws.onclose = () => {
    console.log('Disconnected from server');
    updateConnectionStatus(false);

    // Attempt to reconnect after 3 seconds
    reconnectTimeout = setTimeout(() => {
      console.log('Attempting to reconnect...');
      connect();
    }, 3000);
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
      state = message.data;
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
  if (state.volume) {
    const volume = state.volume.value;
    const isMuted = state.volume.is_muted;

    // Enable volume controls
    elements.volumeContainer.classList.remove('disabled');
    elements.volumeSlider.disabled = false;
    elements.btnVolumeDown.disabled = false;
    elements.btnVolumeUp.disabled = false;
    elements.btnMute.disabled = false;

    elements.volumeSlider.value = volume;
    elements.volumeSlider.min = state.volume.min;
    elements.volumeSlider.max = state.volume.max;
    elements.volumeFill.style.width = `${((volume - state.volume.min) / (state.volume.max - state.volume.min)) * 100}%`;
    elements.volumeValue.textContent = `${Math.round(volume)}%`;

    // Update mute icon
    if (isMuted) {
      elements.iconMute.classList.remove('hidden');
      elements.iconUnmute.classList.add('hidden');
    } else {
      elements.iconMute.classList.add('hidden');
      elements.iconUnmute.classList.remove('hidden');
    }
  } else {
    // Disable volume controls for fixed volume zones
    elements.volumeContainer.classList.add('disabled');
    elements.volumeSlider.disabled = true;
    elements.btnVolumeDown.disabled = true;
    elements.btnVolumeUp.disabled = true;
    elements.btnMute.disabled = true;
    elements.volumeValue.textContent = 'Fixed';

    // Set slider to 100% and hide thumb
    elements.volumeSlider.value = 100;
    elements.volumeFill.style.width = '100%';
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

function setVolume(value) {
  sendCommand('volume', { mode: 'absolute', value: parseInt(value) });
}

function adjustVolume(delta) {
  if (!state || !state.volume) return;
  const newValue = Math.max(state.volume.min, Math.min(state.volume.max, state.volume.value + delta));
  setVolume(newValue);
}

function toggleMute() {
  const action = state && state.volume && state.volume.is_muted ? 'unmute' : 'mute';
  sendCommand('mute', { action });
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
  if (state && state.volume) {
    const percentage = ((value - state.volume.min) / (state.volume.max - state.volume.min)) * 100;
    elements.volumeFill.style.width = `${percentage}%`;
    elements.volumeValue.textContent = `${Math.round(value)}%`;

    // Send volume change in real-time as user drags
    setVolume(value);
  }
});

elements.btnVolumeDown.addEventListener('click', () => adjustVolume(-2.5));
elements.btnVolumeUp.addEventListener('click', () => adjustVolume(2.5));
elements.btnMute.addEventListener('click', toggleMute);

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

  console.log('Seeking to:', Math.floor(seekPosition), 'seconds');
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
window.addEventListener('beforeunload', () => {
  stopProgressUpdates();
  if (ws) {
    ws.close();
  }
});
