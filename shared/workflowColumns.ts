/**
 * Fixed workflow column ids (standard board template). Custom project columns are not listed in
 * company task-routing settings so targets stay stable if custom columns are removed.
 */
export const WORKFLOW_COLUMN_PRESETS = [
  { id: "todo", title: "To Do" },
  { id: "in-progress", title: "In Progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" },
] as const;

export type WorkflowColumnId = (typeof WORKFLOW_COLUMN_PRESETS)[number]["id"];

/** Board / calendar status dot (Tailwind bg-*). Standard ids ignore stored JSON color so older DB rows still match the palette. */
export const WORKFLOW_COLUMN_DOT_CLASS: Record<WorkflowColumnId, string> = {
  todo: "bg-red-500",
  "in-progress": "bg-blue-500",
  review: "bg-yellow-500",
  done: "bg-green-500",
};

const WORKFLOW_ID_SET = new Set<string>(WORKFLOW_COLUMN_PRESETS.map((c) => c.id));

export function isWorkflowColumnId(id: string): id is WorkflowColumnId {
  return WORKFLOW_ID_SET.has(id);
}

/** Dot next to column title or on calendar chips: fixed colors for standard workflow columns. */
export function boardColumnDotClass(columnId: string, storedColor?: string | null): string {
  if (isWorkflowColumnId(columnId)) {
    return WORKFLOW_COLUMN_DOT_CLASS[columnId];
  }
  const s = typeof storedColor === "string" ? storedColor.trim() : "";
  return s || "bg-slate-500";
}

export function parseWorkflowColumnId(v: string | null | undefined): WorkflowColumnId | null {
  const s = String(v ?? "").trim();
  return isWorkflowColumnId(s) ? s : null;
}

export const DEFAULT_TASK_MARK_COMPLETE_STATUS: WorkflowColumnId = "done";
export const DEFAULT_TASK_CLIENT_REOPEN_STATUS: WorkflowColumnId = "in-progress";

export type ProjectColumn = { id: string; title?: string };

/**
 * Resolve a fixed workflow id to a column id present on this project's board when possible.
 * Falls back so tasks remain visible if a standard column was renamed/removed.
 */
export function resolveWorkflowStatusForProject(
  projectColumns: ProjectColumn[],
  workflowId: WorkflowColumnId,
  mode: "markComplete" | "clientReopen",
): string {
  const cols =
    projectColumns.length > 0
      ? projectColumns
      : WORKFLOW_COLUMN_PRESETS.map((p) => ({ id: p.id, title: p.title }));
  const direct = cols.find((c) => String(c.id) === workflowId);
  if (direct) return String(direct.id);

  if (mode === "markComplete") {
    const doneLike = cols.find((c) => String(c.id) === "done");
    if (doneLike) return String(doneLike.id);
    const last = cols[cols.length - 1];
    return last ? String(last.id) : workflowId;
  }

  const inProgress = cols.find((c) => String(c.id) === "in-progress");
  if (inProgress) return String(inProgress.id);
  const todo = cols.find((c) => String(c.id) === "todo");
  if (todo) return String(todo.id);
  const first = cols[0];
  return first ? String(first.id) : workflowId;
}
