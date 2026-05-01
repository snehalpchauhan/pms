import type { User } from "@/lib/mockData";

/** Display name for a user id; "you" when it matches the current user. */
export function formatUserForTaskMeta(
  users: Record<string, User>,
  userId: number | string | null | undefined,
  currentUserId?: string | number | null,
): string | null {
  if (userId == null || userId === "") return null;
  const isYou = currentUserId != null && String(userId) === String(currentUserId);
  if (isYou) return "you";
  const u = users[String(userId)];
  const name = u?.name?.trim();
  return name && name.length > 0 ? name : null;
}

export type TaskPeopleMeta = {
  /** Resolved creator label, or null if unknown / no owner. */
  createdByName: string | null;
  /** Same as creator in current schema; only meaningful when `hasAssignees`. */
  assignedByName: string | null;
  hasAssignees: boolean;
  assigneeUsers: User[];
};

/**
 * Task `ownerId` is the creator (API). There is no separate "assigned by" field yet;
 * when the task has assignees, we treat the creator as who assigned them.
 */
export function getTaskPeopleMeta(
  ownerId: number | null | undefined,
  assigneeIds: readonly string[],
  users: Record<string, User>,
  currentUserId?: string | number | null,
): TaskPeopleMeta {
  const hasAssignees = assigneeIds.length > 0;
  const createdByName = formatUserForTaskMeta(users, ownerId, currentUserId);
  const assignedByName = hasAssignees ? formatUserForTaskMeta(users, ownerId, currentUserId) : null;
  const assigneeUsers = assigneeIds.map((id) => users[String(id)]).filter((u): u is User => u != null);
  return { createdByName, assignedByName, hasAssignees, assigneeUsers };
}
