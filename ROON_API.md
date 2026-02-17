# Roon API Reference

Reference for the Node.js Roon API libraries used in this project. Based on the official docs at https://roonlabs.github.io/node-roon-api/.

NPM packages (all installed from GitHub):
- `node-roon-api` — Core API, discovery, pairing
- `node-roon-api-transport` — Playback control, zones, volume
- `node-roon-api-image` — Album artwork
- `node-roon-api-status` — Extension status display in Roon UI
- `node-roon-api-browse` — Library browsing (not yet used)

---

## RoonApi (core)

```js
const RoonApi = require('node-roon-api');

const roon = new RoonApi({
  extension_id:    'com.example.myextension',  // unique ID
  display_name:    'My Extension',
  display_version: '1.0.0',
  publisher:       'Your Name',
  website:         'https://example.com',
  email:           'you@example.com',
  log_level:       'none',  // 'all' | 'none'

  core_paired:   (core) => { /* core.services.RoonApiTransport, etc. */ },
  core_unpaired: (core) => { /* cleanup */ },
});

roon.init_services({
  required_services: [RoonApiTransport, RoonApiImage],
  provided_services: [svcStatus],
});

roon.start_discovery();
```

### Methods
- `start_discovery()` — Auto-discover Roon Core on the network
- `ws_connect({ host, port })` — Connect directly instead of discovering
- `save_config(key, value)` — Persist data to `config.json`
- `load_config(key)` — Read persisted data

### Callbacks
- `core_paired(core)` — Roon authorized the extension. Access services via `core.services.*`
- `core_unpaired(core)` — Extension was disabled or Roon Core went away
- `core_found(core)` / `core_lost(core)` — Lower-level discovery events (less commonly used)

---

## RoonApiTransport

Manages zones, playback, volume. Access via `core.services.RoonApiTransport`.

### subscribe_zones(callback)

Primary way to get zone state. Callback receives `(cmd, data)`:

```js
transport.subscribe_zones((cmd, data) => {
  if (cmd === 'Subscribed') {
    // data.zones = Zone[]  (initial full list, may be empty)
  }
  if (cmd === 'Changed') {
    // data.zones_added    = Zone[]           (new zones appeared)
    // data.zones_removed  = string[]         (zone_id strings, NOT objects)
    // data.zones_changed  = Zone[]           (updated zone objects, full replacement)
    // data.zones_seek_changed = [{ zone_id, seek_position }]  (lightweight seek updates)
  }
});
```

**Important:** `zones_removed` is an array of zone_id strings, not Zone objects.

**Important:** `zones_seek_changed` is a lightweight event that only carries seek position, not a full zone update. This was added in API v2 to avoid sending full zone updates every second.

### Control Methods

All callbacks are optional `(error) => {}`.

```js
transport.control(zone, command, cb)
// command: 'play' | 'pause' | 'playpause' | 'stop' | 'previous' | 'next'

transport.seek(zone, how, seconds, cb)
// how: 'absolute' | 'relative'

transport.change_volume(output, how, value, cb)
// how: 'absolute' | 'relative' | 'relative_step'
// NOTE: operates on an Output, not a Zone

transport.mute(output, how, cb)
// how: 'mute' | 'unmute'

transport.pause_all(cb)
transport.mute_all(how, cb)
```

### Zone Management

```js
transport.group_outputs(outputs, cb)      // Group outputs into one zone
transport.ungroup_outputs(outputs, cb)    // Separate grouped outputs
transport.transfer_zone(from, to, cb)     // Move queue from one zone to another
transport.standby(output, opts, cb)       // Put output in standby
transport.convenience_switch(output, opts, cb)  // Wake output from standby
```

### Zone Settings

```js
transport.change_settings(zone, settings, cb)
// settings: { shuffle: bool, auto_radio: bool, loop: 'loop'|'loop_one'|'disabled'|'next' }
```

---

## Data Structures

### Zone

```js
{
  zone_id:                string,
  display_name:           string,
  state:                  'playing' | 'paused' | 'loading' | 'stopped',
  outputs:                Output[],
  seek_position:          number | undefined,     // seconds
  is_play_allowed:        boolean,
  is_pause_allowed:       boolean,
  is_previous_allowed:    boolean,
  is_next_allowed:        boolean,
  is_seek_allowed:        boolean,
  queue_items_remaining:  number | undefined,
  queue_time_remaining:   number | undefined,     // seconds
  settings: {
    loop:       'loop' | 'loop_one' | 'disabled',
    shuffle:    boolean,
    auto_radio: boolean,
  } | undefined,
  now_playing: {
    seek_position: number | undefined,            // seconds into track
    length:        number | undefined,            // track duration in seconds
    image_key:     string | undefined,            // pass to RoonApiImage
    one_line:   { line1: string },
    two_line:   { line1: string, line2?: string },
    three_line: { line1: string, line2?: string, line3?: string },
    // line1 = track title, line2 = artist, line3 = album
  } | undefined,
}
```

### Output

```js
{
  output_id:    string,
  zone_id:      string,
  display_name: string,
  state:        'playing' | 'paused' | 'loading' | 'stopped',
  source_controls: {
    display_name:      string,
    status:            'selected' | 'deselected' | 'standby' | 'indeterminate',
    supports_standby:  boolean,
  },
  volume: {                        // undefined for fixed-volume outputs
    type:     'number' | 'db' | 'incremental',
    min:      number | undefined,  // absent for 'incremental'
    max:      number | undefined,
    value:    number | undefined,
    step:     number | undefined,
    is_muted: boolean | undefined,
  } | undefined,
}
```

**Volume notes:**
- Values are floats, not integers
- Ranges can span below and above zero simultaneously (especially for 'db' type)
- `'incremental'` type only supports relative_step, no absolute — no min/max/value
- Volume is per-output, not per-zone. Grouped zones can have different volume systems per output.

---

## RoonApiImage

```js
const image = core.services.RoonApiImage;

image.get_image(image_key, {
  scale:  'fit' | 'fill' | 'stretch',  // omit for original size (can be very large!)
  width:  800,                          // required if scale is set
  height: 800,
  format: 'image/jpeg' | 'image/png',  // optional, Roon picks if omitted
}, (error, content_type, buffer) => {
  // error: string | false
  // content_type: 'image/jpeg' etc.
  // buffer: Buffer with image data
});
```

Also accessible via HTTP: `http://<core-ip>:<core-port>/api/image/<image_key>?scale=fit&width=800&height=800`

---

## RoonApiStatus

Shows extension status in Roon's Settings → Extensions UI.

```js
const RoonApiStatus = require('node-roon-api-status');
const svcStatus = new RoonApiStatus(roon);

svcStatus.set_status('Connected', false);   // message, is_error
svcStatus.set_status('Error!', true);
```

Register as a provided service in `init_services`.

---

## RoonApiBrowse (not yet used in this project)

Hierarchical browsing of the Roon library. Server-side session management — the server tracks your browse stack.

```js
const browse = core.services.RoonApiBrowse;

// Start browsing a hierarchy
browse.browse({
  hierarchy: 'browse',  // 'browse'|'playlists'|'settings'|'internet_radio'|'albums'|'artists'|'genres'|'composers'|'search'
  zone_or_output_id: zone.zone_id,  // needed for playback actions
}, (err, body) => {
  // body.action: 'list' | 'message' | 'none' | 'replace_item' | 'remove_item'
  // body.list: List object (when action is 'list')
});

// Load items from a level
browse.load({
  hierarchy: 'browse',
  level: 0,           // level to load from
  offset: 0,          // pagination start
  count: 100,         // items per page
}, (err, body) => {
  // body.items: Item[]
  // body.offset: number
  // body.list: List metadata
});

// Navigate into an item
browse.browse({
  hierarchy: 'browse',
  item_key: item.item_key,
  zone_or_output_id: zone.zone_id,
}, (err, body) => { ... });

// Search
browse.browse({
  hierarchy: 'search',
  input: 'search query',
}, (err, body) => { ... });

// Pop back
browse.browse({
  hierarchy: 'browse',
  pop_levels: 1,       // go back one level
  // or pop_all: true   // go back to root
}, (err, body) => { ... });
```

### List Object
```js
{
  title:          string,
  count:          number,       // total items at this level
  level:          number,       // depth (0 = root)
  subtitle:       string | undefined,
  image_key:      string | undefined,
  display_offset: number | undefined,
  hint:           null | 'action_list',
}
```

### Item Object
```js
{
  title:     string,
  subtitle:  string | undefined,
  image_key: string | undefined,
  item_key:  string | undefined,   // pass to browse() to navigate into this item
  hint:      null | 'action' | 'action_list' | 'list' | 'header',
  input_prompt: {                  // present when item needs user input (e.g. search)
    prompt:      string,           // e.g. 'Search Albums'
    action:      string,           // button label e.g. 'Go'
    value:       string | undefined,
    is_password: boolean,
  } | undefined,
}
```
