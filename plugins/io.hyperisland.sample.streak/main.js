// @ts-check
// Hydration Streak — the design doc's example plugin (docs/PLUGIN_SYSTEM.md §6): today's glasses,
// a meter towards the goal, and buttons to log one or take one back. Its count lives in its own
// storage, so it survives a relaunch; a new day starts at zero.
//
// It shows the other hooks too, none of them in your way until you ask: a daily goal and a nudge
// in Settings › Plugins (the nudge is off until you switch it on), a rail button (off until you
// choose it there; it opens a panel: +1, +2, undo), a menu-bar item, a live activity when the
// goal is reached, an alarm, and the unlock event.
function today() {
  var d = new Date();
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}
/** @returns {number} */
function count() {
  return storage.get("day") === today() ? (storage.get("count") || 0) : 0;
}
/** @param {number} n */
function save(n) {
  storage.set("day", today());
  storage.set("count", n);
}
/** @param {HyperIsland.Context | HyperIsland.RenderContext} ctx @returns {number} */
function goal(ctx) {
  var g = ctx && ctx.settings && ctx.settings.goal;
  return typeof g === "number" && g > 0 ? Math.round(g) : 8;
}

// The nudge: every 90 minutes, while it's switched on.
/** @param {HyperIsland.Context} ctx */
function plan(ctx) {
  if (ctx.settings.nudge) schedule.every("nudge", { minutes: 90 });
  else schedule.cancel("nudge");
}

// Its rail button is lit once today's goal is met.
/** @param {HyperIsland.Context} ctx */
function light(ctx) {
  ctx.railActive("log", count() >= goal(ctx));
}

HyperIsland.register({
  activate: function (ctx) { plan(ctx); light(ctx); },

  widgets: {
    streak: {
      // ctx.size: { rows, columns, label: "2×3", width, height, class } — see docs/PLUGIN_SIZES.md.
      // ctx.preview: drawn for its picture in the picker — sample content, not today's count.
      render: function (ctx) {
        var g = goal(ctx), n = ctx.preview ? Math.round(g * 0.6) : count();
        var size = ctx.size || { rows: 2, columns: 3 };
        if (size.rows === 1) {
          // Half height (1×3 and up): one line — the count, and the button — centred in the cell.
          return ui.card({}, [
            ui.spacer(),
            ui.row([
              ui.icon("glass-water", 16),
              ui.text(n + " / " + g, "title"),
              ui.spacer(),
              ui.button({ id: "log", title: size.columns >= 4 ? "Log a glass" : "", icon: "plus" })
            ], { spacing: 8 }),
            ui.spacer()
          ]);
        }
        return ui.card({ title: "Streak", icon: "glass-water" }, [
          ui.text(n + " of " + g + " glasses", "title"),
          ui.meter({ label: "TODAY", value: Math.round(100 * Math.min(n, g) / g) + "%", fraction: n / g }),
          ui.spacer(),
          ui.row([
            ui.button({ id: "log", title: "Log a glass", icon: "plus" }),
            ui.button({ id: "undo", title: "", icon: "undo-2", style: "secondary" })
          ])
        ]);
      }
    }
  },

  actions: {
    // From the widget's button or the menu (+1), or a choice in the rail button's panel.
    log: function (ctx) {
      if (ctx.choice === "undo") { save(Math.max(0, count() - 1)); ctx.refresh("streak"); light(ctx); return; }
      save(count() + (ctx.choice === "2" ? 2 : 1));
      ctx.refresh("streak");
      light(ctx);
      if (count() >= goal(ctx) && count() - (ctx.choice === "2" ? 2 : 1) < goal(ctx)) ctx.liveActivity({ icon: "glass-water", text: "Goal reached · " + count() + " glasses today" });
    },
    undo: function (ctx) {
      save(Math.max(0, count() - 1));
      ctx.refresh("streak");
      light(ctx);
    }
  },

  alarms: {
    nudge: function (ctx) {
      if (count() < goal(ctx)) {
        ctx.liveActivity({ icon: "glass-water", text: "A glass of water? " + count() + " of " + goal(ctx) + " so far", kind: "alert" });
      }
    }
  },

  events: {
    unlock: function (ctx) { ctx.refresh("streak"); light(ctx); },      // a new day may have begun
    settings: function (ctx) { plan(ctx); light(ctx); ctx.refresh("streak"); }
  }
});
