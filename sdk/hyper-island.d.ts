// Hyper Island's plugin API: the globals a plugin's script gets (docs/PLUGIN_SYSTEM.md §6).
// Keep this file and jsconfig.json beside main.js, start main.js with `// @ts-check`, and the
// editor checks the plugin as you type — no build step. TypeScript works too: compile to main.js.
// Written by `hi`: run `hi sdk .` again after updating it.

declare namespace HyperIsland {
  /** A span on the island's grid: rows × columns (docs/PLUGIN_SIZES.md). */
  interface Size {
    /** 1 (half height, 71 pt) or 2 (full height, 158 pt). */
    rows: 1 | 2;
    /** 1–18 grid columns. */
    columns: number;
    /** Like "2×4". */
    label: string;
    /** In points. */
    width: number;
    height: number;
    class: "compact" | "regular" | "wide";
  }
  type SettingValue = boolean | number | string;
  /** Its settings: the manifest's defaults, with what the user changed in Settings › Plugins. */
  type Settings = Record<string, SettingValue>;

  /** What render() gets. Drawing has no other effects: no live activities, schedules or lights. */
  interface RenderContext {
    size: Size;
    settings: Settings;
  }

  interface LiveActivity {
    /** A Lucide icon name. */
    icon?: string;
    /** 80 characters at most. */
    text: string;
    /** "done" ends in the check (the default); "alert" shows the alarm clock. */
    kind?: "done" | "alert";
  }

  /** What actions, alarms, events and activate get. */
  interface Context {
    settings: Settings;
    /** Which panel choice ran this action (a rail button with a panel). */
    choice?: string;
    /** An event: { name, … }. trackChange has { playing }, and title, artist, app with events:nowPlaying. */
    event?: { name: string; [key: string]: unknown };
    /** Draws one of its widgets again. */
    refresh(widgetId: string): void;
    /** Needs the "liveActivity" permission; one every 20 s at most. */
    liveActivity(activity: LiveActivity): void;
    /** Lights up (or dims) one of its rail buttons. */
    railActive(buttonId: string, on: boolean): void;
    /** Marks a rail panel's selected choice (null clears it). */
    railChoice(buttonId: string, choiceId: string | null): void;
    /** Checks (or clears) one of its menu toggles. */
    menuChecked(itemId: string, on: boolean): void;
  }

  type TextStyle = "title" | "body" | "caption" | "mono";
  interface CardNode { type: "card"; title?: string; icon?: string; children: Node[] }
  interface StackNode { type: "row" | "column"; spacing?: number; children: Node[] }
  interface TextNode { type: "text"; text: string; style: TextStyle }
  interface IconNode { type: "icon"; name: string; size: number }
  interface MeterNode { type: "meter"; label: string; value: string; fraction: number }
  interface ButtonNode { type: "button"; id: string; title?: string; icon?: string; style?: "secondary" }
  interface SpacerNode { type: "spacer" }
  interface RuleNode { type: "rule" }
  /** 60 nodes a widget at most, 8 deep. */
  type Node = CardNode | StackNode | TextNode | IconNode | MeterNode | ButtonNode | SpacerNode | RuleNode;

  interface Widget {
    /** Its card for a cell — called when it comes on screen, after its actions, and on its refresh. */
    render(ctx: RenderContext): CardNode;
  }
  type Handler = (ctx: Context) => void;
  type EventName = "lock" | "unlock" | "wake" | "islandOpen" | "islandClose" | "trackChange" | "settings";

  interface Definition {
    /** After it loads: plan its alarms, light its buttons. */
    activate?: Handler;
    /** By the ids in its manifest's contributes.widgets. */
    widgets?: Record<string, Widget>;
    /** Buttons in its widgets, its rail buttons and menu items, by id. */
    actions?: Record<string, Handler>;
    /** By the names it gave schedule.every / schedule.at. */
    alarms?: Record<string, Handler>;
    /** Each needs "events:<name>" in its permissions — except "settings", its own settings changing. */
    events?: Partial<Record<EventName, Handler>>;
  }

  /** Hands the island its widgets and handlers. Call it once. */
  function register(definition: Definition): void;
}

declare const ui: {
  card(props: { title?: string; icon?: string }, children?: HyperIsland.Node[]): HyperIsland.CardNode;
  row(children: HyperIsland.Node[], props?: { spacing?: number }): HyperIsland.StackNode;
  column(children: HyperIsland.Node[], props?: { spacing?: number }): HyperIsland.StackNode;
  text(text: string | number, style?: HyperIsland.TextStyle): HyperIsland.TextNode;
  /** A Lucide icon, 8–28 pt (14 by default). */
  icon(name: string, size?: number): HyperIsland.IconNode;
  /** fraction: 0–1. */
  meter(props: { label: string; value: string; fraction: number }): HyperIsland.MeterNode;
  /** Runs the action with its id. */
  button(props: { id: string; title?: string; icon?: string; style?: "secondary" }): HyperIsland.ButtonNode;
  spacer(): HyperIsland.SpacerNode;
  rule(): HyperIsland.RuleNode;
};

/** Its own storage: JSON values, kept in a file of its own. */
declare const storage: {
  /** What was stored (untyped in plain JavaScript; in TypeScript, say what: storage.get<number>("count")). */
  get<T = any>(key: string): T | undefined;
  set(key: string, value: unknown): void;
};

/** Needs the "schedule" permission. The island keeps alarms on the wall clock, across relaunches and sleep. */
declare const schedule: {
  /** A minute apart at least. */
  every(name: string, period: { seconds?: number; minutes?: number; hours?: number }): void;
  at(name: string, when: Date | number): void;
  cancel(name: string): void;
};

/** Changes Hyper Island's own options — switched off for now; each needs "commands:<name>". */
declare const commands: {
  run(name: "lyrics" | "glass", value?: boolean): void;
};

declare const console: {
  /** Shown by `hi dev` and `hi check`. */
  log(...values: unknown[]): void;
};
