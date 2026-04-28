import { storage } from "../storage";
import { notifyUserNotification } from "../realtime";

function ymdToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function runTaskDueNotifications(now = new Date()): Promise<{ created: number }> {
  void now;
  const today = ymdToday();
  const tomorrow = ymdTomorrow();
  let created = 0;
  const projects = await storage.getProjects();
  for (const project of projects) {
    const tasks = await storage.getTasksByProject(project.id);
    for (const task of tasks) {
      const due = String(task.dueDate ?? "").trim();
      if (!due) continue;
      if (due !== today && due !== tomorrow) continue;
      const assignees = await storage.getTaskAssignees(task.id);
      for (const assignee of assignees) {
        const existing = await storage.getNotifications(assignee.id, 100);
        const dupe = existing.some((n) => {
          if (Number(n.entityId) !== Number(task.id)) return false;
          if (n.type !== (due === today ? "task_overdue" : "task_due_soon")) return false;
          const k = String((n.meta as any)?.dateKey ?? "");
          return k === due;
        });
        if (dupe) continue;
        const row = await storage.createNotification({
          userId: assignee.id,
          type: due === today ? "task_overdue" : "task_due_soon",
          title: due === today ? "Task due today" : "Task due tomorrow",
          message: `"${task.title}" is due ${due === today ? "today" : "tomorrow"}.`,
          entityType: "task",
          entityId: task.id,
          projectId: task.projectId,
          channelId: null,
          actorUserId: null,
          priority: due === today ? "high" : "normal",
          meta: { dueDate: due, dateKey: due },
        });
        if (row) {
          created++;
          notifyUserNotification(assignee.id);
        }
      }
    }
  }
  return { created };
}
