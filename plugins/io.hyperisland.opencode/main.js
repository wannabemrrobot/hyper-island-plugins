// @ts-check
// opencode — today's sessions, replies, tokens and cost, and whether it's running.
//
// It reads opencode's own database on this Mac ($XDG_DATA_HOME/opencode or ~/.local/share/opencode
// — or wherever you point it in Settings › Plugins), and only its sessions and messages: not the
// accounts or credentials kept beside them, which the island doesn't let it open. Versions before
// the database kept each message in a file of its own; those are read instead. Nothing is sent
// anywhere. The cost is opencode's own estimate from its providers' prices.

/** @type {{sessions: number, replies: number, input: number, output: number, reasoning: number, cache: number, cost: number, model: string}} */
var today = { sessions: 0, replies: 0, input: 0, output: 0, reasoning: 0, cache: 0, cost: 0, model: "" };
var running = 0, open = false;
/** Older versions: each message file read so far today, by path. @type {Record<string, any>} */
var files = {};
var fileDay = "";

function startOfToday() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
function dayKey() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }

/** 1234 → "1.2K". @param {number} n */
function compact(n) {
  /** @param {number} v @param {string} u */
  function trim(v, u) { var s = v.toFixed(1); return (s.slice(-2) === ".0" ? s.slice(0, -2) : s) + u; }
  return n >= 1e9 ? trim(n / 1e9, "B") : n >= 1e6 ? trim(n / 1e6, "M") : n >= 1e3 ? trim(n / 1e3, "K") : String(n);
}

/** The database: one query for the totals, through its (session, time) index; one for the model. */
function fromDatabase(since) {
  var where = "session_id IN (SELECT id FROM session WHERE time_updated >= ?) AND time_created >= ? AND json_extract(data, '$.role') = 'assistant'";
  var t = local.query("db",
    "SELECT count(DISTINCT session_id) sessions, count(*) replies," +
    " sum(json_extract(data, '$.tokens.input')) input, sum(json_extract(data, '$.tokens.output')) output," +
    " sum(json_extract(data, '$.tokens.reasoning')) reasoning," +
    " sum(coalesce(json_extract(data, '$.tokens.cache.read'), 0) + coalesce(json_extract(data, '$.tokens.cache.write'), 0)) cache," +
    " sum(json_extract(data, '$.cost')) cost FROM message WHERE " + where, [since, since])[0] || {};
  var m = local.query("db", "SELECT json_extract(data, '$.modelID') model, count(*) n FROM message WHERE " + where + " GROUP BY model ORDER BY n DESC LIMIT 1", [since, since])[0];
  return { sessions: t.sessions || 0, replies: t.replies || 0, input: t.input || 0, output: t.output || 0, reasoning: t.reasoning || 0,
           cache: t.cache || 0, cost: t.cost || 0, model: (m && m.model) || "" };
}

/** Older versions: today's message files, each read once it's written (they don't change after). */
function fromFiles(since) {
  if (fileDay !== dayKey()) { files = {}; fileDay = dayKey(); }
  var t0 = Date.now();
  var list = local.list("storage", { since: since });
  for (var i = 0; i < list.length && Date.now() - t0 < 60; i++) {
    var f = list[i], key = f.root + "/" + f.path;
    if (files[key] && files[key].size === f.size) continue;
    var o;
    try { o = JSON.parse(local.read("storage", f, { max: 262144 }).text); } catch (e) { continue; }
    files[key] = { size: f.size, m: o };
  }
  var t = { sessions: 0, replies: 0, input: 0, output: 0, reasoning: 0, cache: 0, cost: 0, model: "" };
  /** @type {Record<string, true>} */ var sessions = {};
  /** @type {Record<string, number>} */ var models = {};
  for (var k in files) {
    var m = files[k].m;
    if (!m || m.role !== "assistant" || !m.time || m.time.created < since) continue;
    var tk = m.tokens || {};
    t.replies += 1; sessions[k.split("/")[2]] = true;
    t.input += tk.input || 0; t.output += tk.output || 0; t.reasoning += tk.reasoning || 0;
    t.cache += ((tk.cache && tk.cache.read) || 0) + ((tk.cache && tk.cache.write) || 0);
    t.cost += m.cost || 0;
    if (m.modelID) models[m.modelID] = (models[m.modelID] || 0) + 1;
  }
  t.sessions = Object.keys(sessions).length;
  var best = 0;
  for (var id in models) if (models[id] > best) { best = models[id]; t.model = id; }
  return t;
}

/** @param {HyperIsland.Context} ctx */
function look(ctx) {
  var since = startOfToday(), reads = ctx.reads || {};
  try {
    if (reads.db && reads.db.found) today = fromDatabase(since);
    else if (reads.storage && reads.storage.found) today = fromFiles(since);
    running = local.running("cli");
  } catch (e) {
    console.log("couldn't read: " + e);
  }
  ctx.refresh("usage");
}

/** @param {number} n @param {string} one @param {string} many */
function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

/** Its picture in the picker (ctx.preview): a believable day, nobody's real one. */
var SAMPLE = { sessions: 4, input: 1.8e6, cache: 3.2e6, output: 142e3, reasoning: 21e3, cost: 3.42, replies: 57, model: "anthropic/claude-sonnet-5" };

HyperIsland.register({
  activate: function (ctx) { schedule.every("look", { minutes: 1 }); look(ctx); },
  alarms: { look: function (ctx) { if (open) look(ctx); } },
  events: {
    islandOpen: function (ctx) { open = true; look(ctx); },
    islandClose: function () { open = false; }
  },

  widgets: {
    usage: {
      render: function (ctx) {
        var size = ctx.size || { rows: 2, columns: 3 };
        var reads = ctx.reads || {};
        var preview = !!ctx.preview;
        var here = preview || (reads.db && reads.db.found) || (reads.storage && reads.storage.found);
        if (!here) {
          if (size.rows === 1) return ui.card({}, [ui.spacer(), ui.row([ui.icon("square-terminal", 16), ui.text("opencode isn't on this Mac", "caption")], { spacing: 8 }), ui.spacer()]);
          return ui.card({ title: "opencode", icon: "square-terminal" }, [
            ui.text("Not on this Mac", "body"),
            ui.text("Somewhere else? Point to it in Settings › Plugins.", "caption")
          ]);
        }
        var t = preview ? SAMPLE : today;
        var run = preview ? 2 : running;
        var tokens = "↑" + compact(t.input + t.cache) + " ↓" + compact(t.output + t.reasoning);
        var cost = t.cost >= 0.01 ? "$" + t.cost.toFixed(2) : "";
        if (size.rows === 1) {
          return ui.card({}, [
            ui.spacer(),
            ui.row([ui.icon("square-terminal", 16), ui.text(plural(t.sessions, "session", "sessions"), "body"), ui.spacer(),
                    ui.text(run ? run + " running" : cost || tokens, "mono")], { spacing: 8 }),
            ui.spacer()
          ]);
        }
        if (!t.replies) {
          return ui.card({ title: "opencode", icon: "square-terminal" }, [
            ui.text("Nothing yet today", "body"),
            ui.text(run ? plural(run, "session running", "sessions running") : "", "caption")
          ]);
        }
        var head = [ui.text(String(t.sessions), "title"), ui.text(t.sessions === 1 ? "session" : "sessions", "caption"), ui.spacer()];
        if (cost) head.push(ui.text(cost, "mono"));
        return ui.card({ title: "opencode", icon: "square-terminal" }, [
          ui.row(head, { spacing: 5 }),
          ui.text(tokens + " · " + plural(t.replies, "reply", "replies"), "mono"),
          ui.text(run ? plural(run, "session running", "sessions running") + (t.model ? " · " + t.model : "") : t.model, "caption")
        ]);
      }
    }
  }
});
