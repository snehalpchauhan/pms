/**
 * Remember workspace context across refresh without cluttering the address bar.
 * Uses sessionStorage (same tab/session). Legacy ?view=&project= URLs are read once, saved, then removed.
 */

const STORAGE_KEY = "taskflow-workspace-v1";

const VIEWS = new Set(["tasks", "messages", "team", "settings", "profile", "timecards", "team-summary", "project-settings"]);

export type WorkspaceView =
  | "tasks"
  | "messages"
  | "team"
  | "settings"
  | "profile"
  | "timecards"
  | "team-summary"
  | "project-settings";

export type TaskWorkspaceTab = "board" | "list" | "calendar";

type Stored = {
  view?: string;
  projectId?: string;
  channelId?: string;
  taskTab?: string;
  taskId?: string;
  taskFilter?: string;
};

let legacyUrlIngested = false;

function loadStored(): Stored {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    return typeof o === "object" && o !== null ? (o as Stored) : {};
  } catch {
    return {};
  }
}

function saveStored(s: Stored) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota */
  }
}

function stripQueryFromUrl() {
  const u = new URL(window.location.href);
  if (!u.search) return;
  window.history.replaceState(null, "", `${u.pathname}${u.hash || ""}`);
}

/** One-time: merge old bookmark/query params into storage and clean the URL bar. */
function ingestLegacyUrlParamsOnce() {
  if (legacyUrlIngested || typeof window === "undefined") return;
  legacyUrlIngested = true;

  const sp = new URLSearchParams(window.location.search);
  const view = sp.get("view")?.trim();
  const projectId = sp.get("project")?.trim();
  const channelId = sp.get("channel")?.trim();
  const taskTab = sp.get("taskTab")?.trim();
  const taskId = sp.get("task")?.trim();
  const taskFilter = sp.get("taskFilter")?.trim();

  if (!view && !projectId && !channelId && !taskTab && !taskId && !taskFilter) return;

  const s = loadStored();
  if (view) s.view = view;
  if (projectId) s.projectId = projectId;
  if (channelId) s.channelId = channelId;
  if (taskTab) s.taskTab = taskTab;
  if (taskId) s.taskId = taskId;
  if (taskFilter) s.taskFilter = taskFilter;
  saveStored(s);
  stripQueryFromUrl();
}

export function parseWorkspaceView(raw: string | null | undefined): WorkspaceView {
  if (raw && VIEWS.has(raw)) return raw as WorkspaceView;
  return "tasks";
}

export function parseTaskTab(raw: string | null | undefined): TaskWorkspaceTab {
  if (raw === "board" || raw === "list" || raw === "calendar") return raw;
  return "board";
}

export function readInitialWorkspaceState(): {
  view: WorkspaceView;
  projectId: string;
  channelId: string | undefined;
} {
  if (typeof window === "undefined") {
    return { view: "tasks", projectId: "", channelId: undefined };
  }
  ingestLegacyUrlParamsOnce();
  const s = loadStored();
  return {
    view: parseWorkspaceView(s.view),
    projectId: s.projectId?.trim() ?? "",
    channelId: s.channelId?.trim() || undefined,
  };
}

const VALID_FILTERS = new Set(["all", "mine", "overdue", "completed"]);

export function readTaskWorkspaceSnapshot(): {
  taskTab: TaskWorkspaceTab;
  taskFilter: string;
  taskId: string | null;
} {
  if (typeof window === "undefined") {
    return { taskTab: "board", taskFilter: "all", taskId: null };
  }
  ingestLegacyUrlParamsOnce();
  const s = loadStored();
  const tf = s.taskFilter?.trim();
  return {
    taskTab: parseTaskTab(s.taskTab),
    taskFilter: tf && VALID_FILTERS.has(tf) ? tf : "all",
    taskId: s.taskId?.trim() || null,
  };
}

/** Merge updates into session storage; null/empty removes that field. */
export function persistWorkspaceState(updates: Record<string, string | null | undefined>): void {
  if (typeof window === "undefined") return;
  const s = loadStored();
  for (const [key, val] of Object.entries(updates)) {
    if (val == null || val === "") {
      delete (s as Record<string, unknown>)[key];
    } else {
      (s as Record<string, unknown>)[key] = val;
    }
  }
  saveStored(s);
}

/** Current persisted open-task id (for hydrating the task drawer after tasks load). */
export function getPersistedTaskId(): string | null {
  if (typeof window === "undefined") return null;
  ingestLegacyUrlParamsOnce();
  const id = loadStored().taskId?.trim();
  return id || null;
}
