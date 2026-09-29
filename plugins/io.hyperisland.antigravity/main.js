// @ts-check
// Antigravity — how many of its conversations you've been in today, its latest task's checklist
// (the task list the agent keeps as it works), and whether it's open.
//
// It reads Antigravity's own files on this Mac (~/.gemini/antigravity — or wherever you point it in
// Settings › Plugins): when each conversation last changed — not what's in it — and the task lists.
// Nothing is sent anywhere. Antigravity keeps no token counts or quota on the Mac, so those aren't
// shown.

var open = false, running = false;
/** @type {{today: number, total: number, task: {title: string, done: number, all: number, at: number} | null}} */
var seen = { today: 0, total: 0, task: null };
/** The latest task list as last read: its path and size, so it's read again only when it changes. */
var taskKey = "";

function startOfToday() { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }

/** A task list: its title (the first heading) and its checklist — "- [x]" done, "- [ ]" or "- [/]" not yet. @param {string} text */
function readTask(text) {
  var lines = text.split("\n"), title = "", done = 0, all = 0;
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i].replace(/^\s+/, "");
    if (!title && /^#+\s/.test(l)) title = l.replace(/^#+\s+/, "").trim();
    var m = /^[-*]\s+\[([ xX\/])\]/.exec(l);
    if (m) { all += 1; if (m[1] === "x" || m[1] === "X") done += 1; }
  }
  return { title: title, done: done, all: all };
}

/** @param {HyperIsland.Context} ctx */
/** When it last looked: opening the island looks again only after 15 s, so hovering past the
 *  notch over and over doesn't rescan the logs each time (the alarms keep it current while open). */
var lastLook = 0;

function look(ctx) {
  lastLook = Date.now();
  var since = startOfToday();
  try {
    running = local.running("app") > 0;
    var all = local.list("data");
    var today = 0, total = 0, latest = null;
    for (var i = 0; i < all.length; i++) {
      var f = all[i];
      if (/^conversations\//.test(f.path)) { total += 1; if (f.modified >= since) today += 1; }
      else if (!latest) latest = f;                           // newest first, so the first task list is the latest
    }
    seen.today = today; seen.total = total;
    if (latest) {
      var key = latest.root + "/" + latest.path + "@" + latest.size + "/" + latest.modified;
      if (key !== taskKey) {
        var t = readTask(local.read("data", latest, { max: 65536 }).text || "");
        seen.task = { title: t.title, done: t.done, all: t.all, at: latest.modified };
        taskKey = key;
      }
    } else seen.task = null;
  } catch (e) {
    console.log("couldn't read: " + e);
  }
  ctx.refresh("work");
}

/** @param {number} n @param {string} one @param {string} many */
function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

/** Its picture in the picker (ctx.preview): a believable day, nobody's real one. */
var SAMPLE = { today: 3, total: 41, task: { title: "Settings page", done: 5, all: 8 } };

HyperIsland.register({
  activate: function (ctx) { schedule.every("look", { minutes: 1 }); look(ctx); },
  alarms: { look: function (ctx) { if (open) look(ctx); } },
  events: {
    islandOpen: function (ctx) { open = true; if (Date.now() - lastLook > 15000) look(ctx); },
    islandClose: function () { open = false; }
  },

  widgets: {
    work: {
      render: function (ctx) {
        var size = ctx.size || { rows: 2, columns: 3 };
        var reads = ctx.reads || {};
        var preview = !!ctx.preview;
        if (!preview && reads.data && !reads.data.found) {
          if (size.rows === 1) return ui.card({}, [ui.spacer(), ui.row([ui.icon("orbit", 16), ui.text("Antigravity isn't on this Mac", "caption")], { spacing: 8 }), ui.spacer()]);
          return ui.card({ title: "Antigravity", icon: "orbit" }, [
            ui.text("Not on this Mac", "body"),
            ui.text("Somewhere else? Point to it in Settings › Plugins.", "caption")
          ]);
        }
        var got = preview ? SAMPLE : seen;
        var appOpen = preview ? false : running;
        var task = got.task;
        if (size.rows === 1) {
          return ui.card({}, [
            ui.spacer(),
            ui.row([ui.icon("orbit", 16), ui.text(plural(got.today, "conversation", "conversations") + " today", "body"), ui.spacer(),
                    ui.text(task && task.all ? task.done + "/" + task.all : appOpen ? "open" : "", "mono")], { spacing: 8 }),
            ui.spacer()
          ]);
        }
        var kids = [
          ui.row([ui.text(String(got.today), "title"), ui.text((got.today === 1 ? "conversation" : "conversations") + " today · " + got.total + " in all", "caption")], { spacing: 5 })
        ];
        if (task && task.all) {
          kids.push(ui.meter({ label: (task.title || "Latest task").toUpperCase(), value: task.done + " of " + task.all, fraction: task.done / task.all }));
        } else {
          kids.push(ui.text(appOpen ? "Antigravity is open" : got.total ? "No task list yet" : "Nothing yet", "caption"));
        }
        return ui.card({ title: "Antigravity", icon: "orbit" }, kids);
      }
    }
  }
});
