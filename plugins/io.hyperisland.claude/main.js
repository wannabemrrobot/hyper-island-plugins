// @ts-check
// Claude Code — today's sessions, tokens, turns and tool calls, and the sessions running now.
//
// Everything comes from Claude Code's own files on this Mac (its manifest's `reads`), wherever this
// Mac keeps them: $CLAUDE_CONFIG_DIR, ~/.config/claude or ~/.claude — or wherever you point it in
// Settings › Plugins. Nothing is sent anywhere; plugins have no network.
//
// Each transcript is a JSON line per event; replies from the model carry `message.usage`. Only the
// bytes added since the last look are read, and only the lines with "usage" in them reach the
// script. It looks when the island opens and once a minute while it stays open.

/** Where each transcript has been read to, and what it held today. @type {Record<string, {offset: number, turns: number, input: number, output: number, tools: number, top: boolean}>} */
var files = {};
/** Replies already counted (a reply can be written on several lines). @type {Record<string, true>} */
var seen = {};
/** @type {Record<string, number>} */
var models = {};
var day = "";
var open = false;
/** @type {{count: number, names: string[]}} */
var live = { count: 0, names: [] };
var behind = false;

function startOfToday() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
function dayKey() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }

/** 1234 → "1.2K", 2400000 → "2.4M". @param {number} n */
function compact(n) {
  /** @param {number} v @param {string} u */
  function trim(v, u) { var s = v.toFixed(1); return (s.slice(-2) === ".0" ? s.slice(0, -2) : s) + u; }
  return n >= 1e9 ? trim(n / 1e9, "B") : n >= 1e6 ? trim(n / 1e6, "M") : n >= 1e3 ? trim(n / 1e3, "K") : String(n);
}

/** "claude-opus-4-8" → "Opus 4.8", "claude-haiku-4-5-20251001" → "Haiku 4.5". @param {string} id */
function shortModel(id) {
  var parts = id.split("-");
  if (parts[0] === "claude") parts.shift();
  if (!parts.length) return id;
  var family = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  var version = parts.slice(1).filter(function (p) { return p.length < 8 && /^\d+$/.test(p); }).join(".");
  return version ? family + " " + version : family;
}

/** Reads what's new in today's transcripts, within its time; what's left waits for the next look. */
/** @param {number} budget ms: more for the first look, so it opens complete */
function scan(budget) {
  if (day !== dayKey()) { files = {}; seen = {}; models = {}; day = dayKey(); }
  var since = startOfToday(), t0 = Date.now();
  behind = false;
  var list = local.list("projects", { since: since });
  for (var i = 0; i < list.length; i++) {
    var f = list[i], key = f.root + "/" + f.path;
    var st = files[key];
    if (!st) st = files[key] = { offset: seek(f, since), turns: 0, input: 0, output: 0, tools: 0, top: f.path.split("/").length === 2 };
    while (st.offset < f.size) {
      if (Date.now() - t0 > budget) { behind = true; break; }
      var r = local.read("projects", f, { from: st.offset, max: 524288, contains: '"usage"' });
      for (var j = 0; j < r.lines.length; j++) take(r.lines[j], st, since);
      if (r.next <= st.offset) break;
      st.offset = r.next;
    }
    if (behind) break;
  }
  scanLive();
}

/**
 * Where today starts in a transcript. A session can run for days, and its file keeps growing, so
 * rather than read days of it, this looks at a few small pieces — lines are in time order — and
 * starts just before the first of today's.
 * @param {HyperIsland.LocalFile} f @param {number} since
 */
function seek(f, since) {
  var lo = 0, hi = f.size;
  while (hi - lo > 262144) {
    var mid = Math.floor((lo + hi) / 2);
    var at = timeAt(f, mid);
    if (isNaN(at)) break;
    if (at < since) lo = mid; else hi = mid;
  }
  return lo;
}

/** The first time written after a point in a transcript — found by the island, which hands back only
 *  the timestamp, not the (possibly huge) line it's in. @param {HyperIsland.LocalFile} f @param {number} from */
function timeAt(f, from) {
  var r = local.read("projects", f, { from: from, find: '"timestamp":"' });
  var hit = r.found && r.found[0];
  return hit ? Date.parse(hit.text.split('"')[0]) : NaN;
}

/** One transcript line: a reply from the model, if it's today's and not counted yet. @param {string} line @param {any} st @param {number} since */
function take(line, st, since) {
  var o;
  try { o = JSON.parse(line); } catch (e) { return; }
  if (!o || o.type !== "assistant" || !o.message || !o.message.usage) return;
  if (Date.parse(o.timestamp) < since) return;
  var id = (o.message.id || "") + ":" + (o.requestId || "");
  if (id !== ":" && seen[id]) return;
  seen[id] = true;
  var u = o.message.usage;
  st.turns += 1;
  st.input += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  st.output += u.output_tokens || 0;
  var content = o.message.content;
  if (Array.isArray(content)) for (var k = 0; k < content.length; k++) if (content[k] && content[k].type === "tool_use") st.tools += 1;
  if (o.message.model && o.message.model.charAt(0) !== "<") models[o.message.model] = (models[o.message.model] || 0) + 1;
}

/** The sessions running now: Claude Code lists each in its sessions folder, with its process. */
function scanLive() {
  /** @type {{pid: number, name: string, started: number}[]} */
  var found = [];
  var list = local.list("sessions");
  for (var i = 0; i < list.length && i < 40; i++) {
    var r = local.read("sessions", list[i], { max: 65536 });
    var o;
    try { o = JSON.parse(r.text); } catch (e) { continue; }
    if (!o || typeof o.pid !== "number") continue;
    var name = o.name || (o.cwd ? String(o.cwd).split("/").pop() : "") || "session";
    found.push({ pid: o.pid, name: String(name), started: o.startedAt || 0 });
  }
  var alive = found.length ? local.alive("cli", found.map(function (s) { return s.pid; })) : [];
  var now = found.filter(function (s, i) { return alive[i]; }).sort(function (a, b) { return b.started - a.started; });
  live = { count: now.length, names: now.map(function (s) { return s.name; }) };
}

function totals() {
  var t = { sessions: 0, projects: 0, turns: 0, input: 0, output: 0, tools: 0, model: "" };
  /** @type {Record<string, true>} */
  var projects = {};
  for (var key in files) {
    var st = files[key];
    if (!st.turns) continue;
    t.turns += st.turns; t.input += st.input; t.output += st.output; t.tools += st.tools;
    if (st.top) { t.sessions += 1; projects[key.split("/")[1]] = true; }
  }
  t.projects = Object.keys(projects).length;
  var best = 0;
  for (var m in models) if (models[m] > best) { best = models[m]; t.model = shortModel(m); }
  return t;
}

/** @param {HyperIsland.Context} ctx @param {number} [budget] */
function look(ctx, budget) {
  scan(budget || 60);
  ctx.refresh("usage");
}

HyperIsland.register({
  activate: function (ctx) { schedule.every("look", { minutes: 1 }); look(ctx, 120); },
  alarms: { look: function (ctx) { if (open || behind) look(ctx); } },
  events: {
    islandOpen: function (ctx) { open = true; look(ctx); },
    islandClose: function () { open = false; }
  },

  widgets: {
    usage: {
      render: function (ctx) {
        var size = ctx.size || { rows: 2, columns: 3 };
        var reads = ctx.reads || {};
        if (reads.projects && !reads.projects.found) {
          if (size.rows === 1) return ui.card({}, [ui.spacer(), ui.row([ui.icon("sparkles", 16), ui.text("Claude Code isn't on this Mac", "caption")], { spacing: 8 }), ui.spacer()]);
          return ui.card({ title: "Claude Code", icon: "sparkles" }, [
            ui.text("Not on this Mac", "body"),
            ui.text("Somewhere else? Point to it in Settings › Plugins.", "caption")
          ]);
        }
        var t = totals();
        var tokens = "↑" + compact(t.input) + " ↓" + compact(t.output);
        if (size.rows === 1) {
          return ui.card({}, [
            ui.spacer(),
            ui.row([
              ui.icon("sparkles", 16),
              ui.text(t.sessions + (t.sessions === 1 ? " session" : " sessions"), "body"),
              ui.spacer(),
              ui.text(live.count ? live.count + " live" : tokens, "mono")
            ], { spacing: 8 }),
            ui.spacer()
          ]);
        }
        if (!t.turns && !live.count) {
          return ui.card({ title: "Claude Code", icon: "sparkles" }, [ui.text("Nothing yet today", "body"), ui.spacer()]);
        }
        var head = [ui.text(String(t.sessions), "title"), ui.text((t.sessions === 1 ? "session" : "sessions") + (t.projects > 1 ? " · " + t.projects + " projects" : ""), "caption"), ui.spacer()];
        if (t.model) head.push(ui.text(t.model, "caption"));
        return ui.card({ title: "Claude Code", icon: "sparkles" }, [
          ui.row(head, { spacing: 5 }),
          ui.text(tokens + " · " + t.turns + " turns", "mono"),
          ui.text(live.count ? live.count + " live · " + live.names.slice(0, 3).join(" · ") : t.tools + " tool calls", "caption")
        ]);
      }
    }
  }
});
