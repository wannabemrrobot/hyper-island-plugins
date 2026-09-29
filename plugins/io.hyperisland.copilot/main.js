// @ts-check
// Copilot CLI — premium requests today and this month (what Copilot's monthly allowance counts),
// today's sessions, and the lines its sessions changed.
//
// It reads the CLI's own session logs on this Mac ($COPILOT_HOME or ~/.copilot — or wherever you
// point it in Settings › Plugins); nothing is sent anywhere. Each session's log carries its running
// totals as it goes ("usage checkpoints") and its final ones when it ends, so a session that ran
// across midnight is split at midnight. Copilot in VS Code or JetBrains keeps no such log, so
// they aren't counted.

/** Each log: where it's read to, and its running totals — at the start of today and of the month, and now.
 * @type {Record<string, {offset: number, beforeToday: number, beforeMonth: number, now: number, activeToday: boolean, added: number, removed: number, model: string}>} */
var logs = {};
var month = "";
var open = false, behind = false;
var running = 0;

function startOf(what) {
  var d = new Date(); d.setHours(0, 0, 0, 0);
  if (what === "month") d.setDate(1);
  return d.getTime();
}
function monthKey() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1); }

/** @param {number} budget ms: more for the first look, so it opens complete */
function scan(budget) {
  if (month !== monthKey()) { logs = {}; month = monthKey(); }
  var today = startOf("day"), since = startOf("month"), t0 = Date.now();
  behind = false;
  try {
    var list = local.list("sessions", { since: since });
    for (var i = 0; i < list.length; i++) {
      var f = list[i], key = f.root + "/" + f.path;
      var st = logs[key] || (logs[key] = { offset: 0, beforeToday: 0, beforeMonth: 0, now: 0, activeToday: false, added: 0, removed: 0, model: "" });
      if (f.modified >= today) st.activeToday = st.activeToday || f.modified >= today;
      while (st.offset < f.size) {
        if (Date.now() - t0 > budget) { behind = true; return; }
        var r = local.read("sessions", f, { from: st.offset, contains: '"session.' });
        for (var j = 0; j < r.lines.length; j++) take(r.lines[j], st, today, since);
        if (r.next <= st.offset) break;
        st.offset = r.next;
      }
    }
    running = local.running("cli");
  } catch (e) {
    behind = true;                     // its reads' allowance for this look ran out: the rest next time
  }
}

/** @param {string} line @param {any} st @param {number} today @param {number} since */
function take(line, st, today, since) {
  var o;
  try { o = JSON.parse(line); } catch (e) { return; }
  if (!o || !o.data) return;
  var at = Date.parse(o.timestamp);
  if (o.type === "session.start") {
    if (o.data.selectedModel) st.model = o.data.selectedModel;
    return;
  }
  if (o.type !== "session.usage_checkpoint" && o.type !== "session.shutdown") return;
  var total = o.data.totalPremiumRequests || 0;
  if (at < since) st.beforeMonth = total;
  if (at < today) st.beforeToday = total; else st.activeToday = true;
  st.now = total;
  if (o.type === "session.shutdown") {
    if (o.data.currentModel) st.model = o.data.currentModel;
    if (at >= today && o.data.codeChanges) { st.added += o.data.codeChanges.linesAdded || 0; st.removed += o.data.codeChanges.linesRemoved || 0; }
  }
}

function totals() {
  var t = { today: 0, month: 0, sessions: 0, added: 0, removed: 0, model: "" };
  /** @type {Record<string, number>} */
  var models = {};
  for (var key in logs) {
    var st = logs[key];
    t.month += Math.max(0, st.now - st.beforeMonth);
    t.today += Math.max(0, st.now - st.beforeToday);
    if (st.activeToday) {
      t.sessions += 1; t.added += st.added; t.removed += st.removed;
      if (st.model) models[st.model] = (models[st.model] || 0) + 1;
    }
  }
  var best = 0;
  for (var m in models) if (models[m] > best) { best = models[m]; t.model = m; }
  return t;
}

/** @param {HyperIsland.Context} ctx @param {number} [budget] */
/** When it last looked: opening the island looks again only after 15 s, so hovering past the
 *  notch over and over doesn't rescan the logs each time (the alarms keep it current while open). */
var lastLook = 0;

function look(ctx, budget) {
  lastLook = Date.now(); scan(budget || 60); ctx.refresh("usage"); }

/** @param {number} n @param {string} one @param {string} many */
function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

/** Its picture in the picker (ctx.preview): a believable day, nobody's real one. */
var SAMPLE = { today: 12, month: 164, sessions: 3, added: 482, removed: 97, model: "GPT-5" };

HyperIsland.register({
  activate: function (ctx) { schedule.every("look", { minutes: 1 }); look(ctx, 150); },
  alarms: { look: function (ctx) { if (open || behind) look(ctx); } },
  events: {
    islandOpen: function (ctx) { open = true; if (Date.now() - lastLook > 15000) look(ctx); },
    islandClose: function () { open = false; }
  },

  widgets: {
    usage: {
      render: function (ctx) {
        var size = ctx.size || { rows: 2, columns: 3 };
        var reads = ctx.reads || {};
        var preview = !!ctx.preview;
        if (!preview && reads.sessions && !reads.sessions.found) {
          if (size.rows === 1) return ui.card({}, [ui.spacer(), ui.row([ui.icon("bot", 16), ui.text("Copilot CLI isn't on this Mac", "caption")], { spacing: 8 }), ui.spacer()]);
          return ui.card({ title: "Copilot CLI", icon: "bot" }, [
            ui.text("Not on this Mac", "body"),
            ui.text("Somewhere else? Point to it in Settings › Plugins.", "caption")
          ]);
        }
        var t = preview ? SAMPLE : totals();
        var run = preview ? 0 : running;
        if (size.rows === 1) {
          return ui.card({}, [
            ui.spacer(),
            ui.row([ui.icon("bot", 16),
                    ui.text(size.columns >= 4 ? plural(t.today, "premium request", "premium requests") : t.today + " today", "body"), ui.spacer(),
                    ui.text(t.month + " this month", "mono")], { spacing: 8 }),
            ui.spacer()
          ]);
        }
        var last = run ? plural(run, "session running", "sessions running")
          : t.added || t.removed ? "+" + t.added + " −" + t.removed + " lines today" : t.model;
        return ui.card({ title: "Copilot CLI", icon: "bot" }, [
          ui.row([ui.text(String(t.today), "title"), ui.text(t.today === 1 ? "premium request today" : "premium requests today", "caption")], { spacing: 5 }),
          ui.text(t.month + " this month · " + plural(t.sessions, "session", "sessions") + " today", "mono"),
          ui.text(last || (behind && !preview ? "Still reading its logs…" : "Nothing yet today"), "caption")
        ]);
      }
    }
  }
});
