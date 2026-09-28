// @ts-check
// Cursor — today's chats, your prompts and its replies, and the lines those chats changed.
//
// It reads Cursor's own chat history on this Mac (its local database — or wherever you point it in
// Settings › Plugins), and only the table the chats are in: not Cursor's settings or sign-in,
// which the island doesn't let it open. Nothing is sent anywhere. Cursor doesn't keep token counts
// or plan usage on the Mac, so those aren't shown.
//
// The history is one big table, so it's read in order of when things were written: a quick search
// finds where today starts, and each look reads only what's been written since.

var open = false, behind = false, running = false;
/**
 * The last row read, and today's messages by key (1 your prompt, 2 its reply) — kept in its storage,
 * so after a restart, or the next morning, it goes on from where it was rather than searching again.
 * @type {{day: string, row: number, messages: Record<string, number>}}
 */
var state = storage.get("state") || { day: "", row: -1, messages: {} };
/** Today's chats, by id: its lines changed and model. @type {Record<string, {added: number, removed: number, model: string}>} */
var chats = {};

function startOfToday() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
function dayKey() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
var BUBBLES = "key >= 'bubbleId:' AND key < 'bubbleId;'";

/**
 * Where to start reading today: rows are in the order they were written, and so mostly in time
 * order — but Cursor writes an old message again when its chat is opened, so an old time can sit
 * among today's. The search looks at a few rows each step, and reading starts 1000 rows early; old
 * messages are left out by their time, and one written twice counts once. It's only needed the first
 * time: after that it goes on from the last row it read.
 */
function firstRowToday() {
  var since = new Date(startOfToday()).toISOString();
  var edge = local.query("db", "SELECT min(rowid) lo, max(rowid) hi FROM cursorDiskKV WHERE " + BUBBLES)[0];
  if (!edge || edge.hi == null) return 0;
  var lo = edge.lo, hi = edge.hi + 1;
  while (lo < hi) {
    var mid = Math.floor((lo + hi) / 2);
    var rows = local.query("db", "SELECT rowid id, json_extract(value, '$.createdAt') at FROM cursorDiskKV WHERE rowid >= ? AND " + BUBBLES + " ORDER BY rowid LIMIT 4", [mid]);
    if (!rows.length) { hi = mid; continue; }
    var today = rows.some(function (r) { return String(r.at) >= since; });
    if (today) hi = mid; else lo = rows[rows.length - 1].id + 1;
  }
  var back = local.query("db", "SELECT rowid id FROM cursorDiskKV WHERE rowid < ? AND " + BUBBLES + " ORDER BY rowid DESC LIMIT 1 OFFSET 999", [lo])[0];
  return back ? back.id - 1 : edge.lo - 1;
}

/** @param {number} budget ms */
function scan(budget) {
  var t0 = Date.now();
  if (state.day !== dayKey()) { state = { day: dayKey(), row: state.row, messages: {} }; chats = {}; }   // a new day goes on from the last row
  behind = false;
  try {
    running = local.running("app") > 0;
    if (state.row < 0) state.row = firstRowToday();
    var since = new Date(startOfToday()).toISOString(), touched = {};
    while (true) {
      if (Date.now() - t0 > budget) { behind = true; break; }
      // Both fields in one go: SQLite reads each message's JSON once.
      var rows = local.query("db", "SELECT rowid id, key, json_extract(value, '$.type', '$.createdAt') tc FROM cursorDiskKV WHERE rowid > ? AND " + BUBBLES + " ORDER BY rowid LIMIT 150", [state.row]);
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i], tc;
        state.row = r.id;
        try { tc = JSON.parse(r.tc); } catch (e) { continue; }
        if (!tc || String(tc[1]) < since || (tc[0] !== 1 && tc[0] !== 2)) continue;
        state.messages[r.key] = tc[0];                      // rewritten messages come again, under the same key
        /** @type {any} */ (touched)[String(r.key).split(":")[1]] = true;
      }
      if (rows.length < 150) break;
    }
    storage.set("state", state);
    var ids = Object.keys(touched);
    if (ids.length) {
      var marks = ids.map(function () { return "?"; }).join(",");
      var info = local.query("db", "SELECT key, json_extract(value, '$.totalLinesAdded') a, json_extract(value, '$.totalLinesRemoved') r, json_extract(value, '$.modelConfig.modelName') m FROM cursorDiskKV WHERE key IN (" + marks + ")",
        ids.map(function (id) { return "composerData:" + id; }));
      for (var j = 0; j < info.length; j++) {
        chats[String(info[j].key).slice(13)] = { added: info[j].a || 0, removed: info[j].r || 0, model: info[j].m || "" };
      }
    }
  } catch (e) {
    behind = true;
  }
}

function totals() {
  var t = { prompts: 0, replies: 0, chats: 0, added: 0, removed: 0, model: "" };
  for (var k in state.messages) { if (state.messages[k] === 1) t.prompts += 1; else t.replies += 1; }
  /** @type {Record<string, number>} */
  var models = {};
  for (var id in chats) {
    t.chats += 1; t.added += chats[id].added; t.removed += chats[id].removed;
    if (chats[id].model && chats[id].model !== "default") models[chats[id].model] = (models[chats[id].model] || 0) + 1;
  }
  var best = 0;
  for (var m in models) if (models[m] > best) { best = models[m]; t.model = m; }
  return t;
}

/** @param {HyperIsland.Context} ctx @param {number} budget */
function look(ctx, budget) { scan(budget); ctx.refresh("usage"); }
/** @param {number} n @param {string} one @param {string} many */
function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

/** Its picture in the picker (ctx.preview): a believable day, nobody's real one. */
var SAMPLE = { prompts: 27, chats: 4, replies: 31, added: 356, removed: 88, model: "GPT-5" };

HyperIsland.register({
  activate: function (ctx) { schedule.every("look", { minutes: 1 }); look(ctx, 150); },
  alarms: { look: function (ctx) { if (open || behind) look(ctx, 60); } },
  events: {
    islandOpen: function (ctx) { open = true; look(ctx, 60); },
    islandClose: function () { open = false; }
  },

  widgets: {
    usage: {
      render: function (ctx) {
        var size = ctx.size || { rows: 2, columns: 3 };
        var reads = ctx.reads || {};
        var preview = !!ctx.preview;
        if (!preview && reads.db && !reads.db.found) {
          if (size.rows === 1) return ui.card({}, [ui.spacer(), ui.row([ui.icon("mouse-pointer-2", 16), ui.text("Cursor isn't on this Mac", "caption")], { spacing: 8 }), ui.spacer()]);
          return ui.card({ title: "Cursor", icon: "mouse-pointer-2" }, [
            ui.text("Not on this Mac", "body"),
            ui.text("Somewhere else? Point to it in Settings › Plugins.", "caption")
          ]);
        }
        var t = preview ? SAMPLE : totals();
        var appOpen = preview ? false : running;
        if (size.rows === 1) {
          return ui.card({}, [
            ui.spacer(),
            ui.row([ui.icon("mouse-pointer-2", 16), ui.text(plural(t.prompts, "prompt", "prompts") + " today", "body"), ui.spacer(),
                    ui.text(plural(t.chats, "chat", "chats"), "mono")], { spacing: 8 }),
            ui.spacer()
          ]);
        }
        if (!t.prompts && !t.replies) {
          return ui.card({ title: "Cursor", icon: "mouse-pointer-2" }, [
            ui.text(behind && !preview ? "Reading its history…" : "Nothing yet today", "body"),
            ui.text(appOpen ? "Cursor is open" : "", "caption")
          ]);
        }
        var last = t.added || t.removed ? "+" + t.added + " −" + t.removed + " lines" + (t.model ? " · " + t.model : "") : t.model || (appOpen ? "Cursor is open" : "");
        return ui.card({ title: "Cursor", icon: "mouse-pointer-2" }, [
          ui.row([ui.text(String(t.prompts), "title"), ui.text(t.prompts === 1 ? "prompt today" : "prompts today", "caption")], { spacing: 5 }),
          ui.text(plural(t.chats, "chat", "chats") + " · " + plural(t.replies, "reply", "replies"), "mono"),
          ui.text(last, "caption")
        ]);
      }
    }
  }
});
