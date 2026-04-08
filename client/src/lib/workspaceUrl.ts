/** Sync workspace navigation with the URL so refresh keeps project / view / task context. */

const VIEWS = new Set(["tasks", "messages", "team", "settings", "profile", "timecards"]);

export type WorkspaceView = "tasks" | "messages" | "team" | "settings" | "profile" | "timecards";

export function parseWorkspaceView(raw: string | null): WorkspaceView {
  if (raw && VIEWS.has(raw)) return raw as WorkspaceView;
  return "tasks";
}

export function getSearchParams(): URLSearchParams {
  return new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
}

/** Merge updates into the current query string (null/empty removes the key). */
export function updateUrlParams(updates: Record<string, string | null | undefined>): void {
  if (typeof window === "undefined") return;
  const u = new URL(window.location.href);
  for (const [key, val] of Object.entries(updates)) {
    if (val == null || val === "") u.searchParams.delete(key);
    else u.searchParams.set(key, val);
  }
  const q = u.searchParams.toString();
  const path = u.pathname || "/";
  const hash = u.hash || "";
  const base = q ? `${path}?${q}` : path;
  window.history.replaceState(null, "", `${base}${hash}`);
}

export function readInitialWorkspaceFromUrl(): {
  view: WorkspaceView;
  projectId: string;
  channelId: string | undefined;
} {
  if (typeof window === "undefined") {
    return { view: "tasks", projectId: "", channelId: undefined };
  }
  const sp = new URLSearchParams(window.location.search);
  return {
    view: parseWorkspaceView(sp.get("view")),
    projectId: sp.get("project")?.trim() ?? "",
    channelId: sp.get("channel")?.trim() || undefined,
  };
}

export type TaskWorkspaceTab = "board" | "list" | "calendar";

export function parseTaskTab(raw: string | null): TaskWorkspaceTab {
  if (raw === "board" || raw === "list" || raw === "calendar") return raw;
  return "board";
}
