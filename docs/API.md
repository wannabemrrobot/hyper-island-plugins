# Writing a Hyper Island plugin

A plugin is a folder: a `manifest.json` that says what it adds, and one JavaScript file that does it.
The island draws everything itself from a small tree your script returns, so every plugin looks and
feels like the island's own cards. Plugins run apart from the island, in a sandbox with no files and
no network, with a time limit on every call.

- **Start:** `hi new io.github.<you>.<name>` makes a folder that passes every check.
- **Develop:** `hi dev <folder>` installs it on the island and reloads it each time you save, showing
  its `console.log` output. Turn on Developer mode first (Settings › Plugins).
- **Types:** with `// @ts-check` at the top of `main.js`, your editor checks the plugin as you type,
  using `hyper-island.d.ts` and `jsconfig.json` (`hi sdk <folder>` adds them). There's no build step.
  TypeScript works too: compile to `main.js`.

## The manifest

```json
{
  "$schema": "./manifest.schema.json",
  "id": "io.github.alice.streak",
  "name": "Hydration Streak",
  "version": "1.2.0",
  "author": { "name": "Alice", "github": "alice" },
  "description": "Today's glasses of water, and a nudge when you're behind.",
  "main": "main.js",
  "icon": "glass-water",
  "contributes": {
    "widgets":     [{ "id": "streak", "title": "Streak", "sizes": ["2x3", "1x3"], "refresh": "60s" }],
    "railActions": [{ "id": "log", "icon": "glass-water", "tooltip": "Log water",
                      "panel": { "title": "Glasses", "choices": [{ "id": "1", "title": "+1" }, { "id": "undo", "icon": "undo-2" }] } }],
    "menuItems":   [{ "id": "log", "title": "Log a glass" }],
    "settings":    [{ "key": "goal", "type": "number", "title": "Daily goal", "default": 8, "min": 1, "max": 20 }]
  },
  "permissions": ["storage", "liveActivity", "schedule", "events:unlock"]
}
```

- **`id`:** reverse-DNS in lower case. The plugin's folder in this repository has the same name.
- **`version`:** major.minor.patch. Every change to a published plugin raises it.
- **`description`:** a sentence, 140 characters at most. The island's plugin gallery shows it.
- **Icons:** Lucide names (lucide.dev). A rail button's icon must come from the rail's reviewed set,
  which `hi check` lists.
- **Widget sizes:** grid spans, rows × columns: `2x4`, `1x3`. They're listed in [SIZES.md](SIZES.md).
  A widget fits any cell of the same height that's at least as wide, and stretches to fill it.

## The script

```js
// @ts-check
HyperIsland.register({
  activate(ctx) { /* after loading: plan alarms, light rail buttons */ },
  widgets: {
    streak: {
      render(ctx) {                       // ctx.size: { rows, columns, label, width, height, class }
        return ui.card({ title: "Streak", icon: "glass-water" }, [
          ui.text(count() + " glasses", "title"),
          ui.meter({ label: "TODAY", value: "50%", fraction: 0.5 }),
          ui.spacer(),
          ui.button({ id: "log", title: "Log a glass", icon: "plus" })
        ]);
      }
    }
  },
  actions: { log(ctx) { storage.set("count", count() + 1); ctx.refresh("streak"); } },
  alarms:  { nudge(ctx) { ctx.liveActivity({ icon: "glass-water", text: "A glass of water?", kind: "alert" }); } },
  events:  { unlock(ctx) { ctx.refresh("streak"); }, settings(ctx) { /* one of its settings changed */ } }
});
function count() { return storage.get("count") || 0; }
```

**Drawing:** `render(ctx)` returns a card built from these parts. At most 60 nodes, 8 deep.

| Part | What it is |
|---|---|
| `ui.card({ title, icon }, children)` | The card itself. |
| `ui.row(children, { spacing })` and `ui.column(children, { spacing })` | Stack parts side by side, or top to bottom. |
| `ui.text(text, "title" \| "body" \| "caption" \| "mono")` | Text in one of four styles. |
| `ui.icon(name, size)` | A Lucide icon, 8–28 pt. |
| `ui.meter({ label, value, fraction })` | A meter; `fraction` is 0–1. |
| `ui.button({ id, title, icon, style: "secondary" })` | Runs the action with its `id`. |
| `ui.spacer()` and `ui.rule()` | Space, and a dividing line. |

Drawing has no other effects. Live activities, schedules and rail lights happen in handlers.

**Handlers:**
- **When they run:**
  - `actions`: a button, a rail button or a menu item.
  - `alarms`: when one of its schedules comes due.
  - `events`: what it listens for.
  - `activate`: after it loads.
- **What `ctx` holds:**
  - `ctx.settings`: its settings.
  - `ctx.choice`: which panel choice ran the action.
  - `ctx.event`: `{ name, … }`, for events.
- **What `ctx` can do:**
  - `ctx.refresh(widgetId)`: draw one of its widgets again.
  - `ctx.liveActivity({ icon, text, kind })`: see below.
  - `ctx.railActive(id, on)`: light or dim one of its rail buttons.
  - `ctx.railChoice(id, choice)`: mark a panel's selected choice.
  - `ctx.menuChecked(id, on)`: check or clear a menu toggle.

**Globals:**
- `storage.get(key)` / `storage.set(key, value)`: JSON values, in a file of its own.
- `schedule.every(name, { minutes })`, `schedule.at(name, date)`, `schedule.cancel(name)`.
- `console.log`, shown by `hi dev` and `hi check`.

## What it may do

| Permission | What it allows |
|---|---|
| `storage` | Its own storage. |
| `liveActivity` | The island shows its icon and text, then goes back to rest. One every 20 s at most, after the greeting, never over an open island. |
| `schedule` | Alarms on the wall clock: a minute apart at least, eight at most. They keep going across relaunches and sleep. |
| `events:lock`, `events:unlock`, `events:wake`, `events:islandOpen`, `events:islandClose`, `events:trackChange` | It hears these, at most once a second each. |
| `events:nowPlaying` | Adds the track's title, artist and app to `trackChange`. |
| `commands:lyrics`, `commands:glass` | Changing the island's own options. This is switched off for now. |

## Rail buttons, panels and menu items

- **Rail buttons:** each is off until the user switches it on in Settings › Plugins, and the rail has
  room for two. A button with a `panel` opens it, like Caffeine's: a title and up to 10 choices, each
  a short `title` (12 characters) or an `icon`.
- **Menu items:** three at most, in the menu bar's menu under the plugin's name. `"type": "toggle"`
  shows the check its plugin sets.

## Settings

Types: `toggle`, `number`, `slider`, `choice`, `text`. Settings › Plugins draws them. A change redraws
the plugin's widgets and sends it the `settings` event.

## Limits

- **Time:** every call stops at 200 ms, and most should take well under 4 ms.
- **Memory:** 24 MB of JavaScript heap.
- **CPU:** 0.3 % of a core, averaged over a minute.
- **Redraws:** twice a second at most.

The island measures each plugin (Settings › Plugins shows the meters) and pauses one that keeps going
over. `hi bench` measures a plugin before you ship it.

## The tool: `hi`

`hi` is a closed-source binary. It's pinned in this repository at `tools/hi/`, with its SHA-256 in
`tools/hi.lock`. Unpack it and keep `lucide.ttf` beside it.

- **`hi new`:** start a plugin.
- **`hi dev`:** develop it live on the island.
- **`hi check`:** the manifest, icons and script, with every widget drawn at every size.
- **`hi bench`:** what drawing it costs.
- **`hi render`:** its trees, or images drawn by the island with `--png`.
- **`hi sdk`:** add the typing files to a plugin.
- **`hi pack`:** a zip and its SHA-256.

If macOS won't open a downloaded `hi`, run `xattr -d com.apple.quarantine hi` once.
