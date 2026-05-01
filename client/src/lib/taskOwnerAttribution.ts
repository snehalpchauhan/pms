import type { Task, User } from "@/lib/mockData";

/**
 * Task `ownerId` is the user who created the task (same as API / schema).
 * Shown as "who assigned" when there are assignees; otherwise "Created by".
 */
export function formatTaskOwnerAttribution(
  task: Pick<Task, "ownerId" | "assignees">,
  users: Record<string, User>,
  currentUserId?: string | number | null,
): string | null {
  if (task.ownerId == null) return null;
  const u = users[String(task.ownerId)];
  const name = u?.name?.trim();
  const isYou = currentUserId != null && String(task.ownerId) === String(currentUserId);
  const who = isYou ? "you" : name || "Unknown";
  return task.assignees.length > 0 ? `Assigned by ${who}` : `Created by ${who}`;
}
