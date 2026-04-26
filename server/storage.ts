import { db } from "./db";
import { eq, and, asc, desc, inArray, gte, lte, sql, ne, gt, isNull } from "drizzle-orm";
import {
  users, projects, projectMembers, tasks, taskAssignees,
  checklistItems, attachments, comments, channels, channelMembers, channelUserReadState, messages, timeEntries,
  companySettings,
  type User, type InsertUser, type Project, type InsertProject,
  type Task, type InsertTask, type ChecklistItem, type Attachment,
  type Comment, type InsertComment, type Channel, type InsertChannel,
  type Message, type InsertMessage, type TimeEntry, type InsertTimeEntry,
  type ProjectMember,
  type CompanySettings,
} from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(
    id: number,
    updates: Partial<InsertUser> & {
      projectSidebarOrder?: number[] | null;
      projectQuickMenuIds?: number[] | null;
    },
  ): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;
  getAllUsers(): Promise<User[]>;

  getProjects(opts?: { includeClosed?: boolean }): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(
    id: number,
    updates: Partial<{
      name: string;
      color: string;
      description: string | null;
      columns: unknown;
      closedAt: Date | null;
      closureDescription: string | null;
      closurePaymentReceived: boolean;
    }>,
  ): Promise<Project | undefined>;
  deleteProject(id: number): Promise<void>;
  getProjectMembers(projectId: number): Promise<User[]>;
  getProjectMembersWithSettings(projectId: number): Promise<(User & { clientShowTimecards: boolean; clientTaskAccess: string })[]>;
  addProjectMember(projectId: number, userId: number): Promise<void>;
  removeProjectMember(projectId: number, userId: number): Promise<void>;
  getUserProjects(userId: number): Promise<Project[]>;
  getProjectMembership(projectId: number, userId: number): Promise<ProjectMember | undefined>;
  getUserMemberships(userId: number): Promise<ProjectMember[]>;
  updateProjectMemberClientSettings(projectId: number, userId: number, settings: { clientShowTimecards?: boolean; clientTaskAccess?: string }): Promise<void>;
  projectHasClientWithTimecards(projectId: number): Promise<boolean>;

  getTasksByProject(projectId: number): Promise<Task[]>;
  getMaxBoardOrderForStatus(projectId: number, status: string): Promise<number>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, updates: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<void>;
  getTaskAssignees(taskId: number): Promise<User[]>;
  setTaskAssignees(taskId: number, userIds: number[]): Promise<void>;

  getChecklistItems(taskId: number): Promise<ChecklistItem[]>;
  getChecklistItem(id: number): Promise<ChecklistItem | undefined>;
  createChecklistItem(taskId: number, text: string): Promise<ChecklistItem>;
  updateChecklistItem(id: number, completed: boolean): Promise<void>;
  deleteChecklistItem(id: number): Promise<void>;

  getAttachments(taskId: number): Promise<Attachment[]>;
  getAttachment(id: number): Promise<Attachment | undefined>;
  createAttachment(attachment: { taskId: number | null; commentId: number | null; name: string; type: string; url?: string; size?: string }): Promise<Attachment>;
  deleteAttachment(id: number): Promise<void>;

  getComments(taskId: number): Promise<Comment[]>;
  getComment(id: number): Promise<Comment | undefined>;
  createComment(comment: InsertComment): Promise<Comment>;
  updateComment(id: number, updates: { content: string; editedAt: Date }): Promise<Comment | undefined>;
  /** Root and all nested replies, post-order (children before parent). */
  getCommentSubtreePostOrder(taskId: number, rootId: number): Promise<number[]>;
  deleteCommentsByIds(ids: number[]): Promise<void>;

  getChannels(projectId?: number): Promise<Channel[]>;
  getChannel(id: number): Promise<Channel | undefined>;
  createChannel(channel: InsertChannel): Promise<Channel>;
  getChannelMembers(channelId: number): Promise<User[]>;
  addChannelMember(channelId: number, userId: number): Promise<void>;
  updateChannel(id: number, updates: Partial<{ name: string }>): Promise<Channel | undefined>;
  replaceChannelMembers(channelId: number, userIds: number[]): Promise<void>;
  getOrCreateDirectChannel(projectId: number, userId1: number, userId2: number): Promise<Channel>;
  deleteChannel(id: number): Promise<void>;
  markChannelReadForUser(channelId: number, userId: number): Promise<void>;
  getChannelUnreadCountForUser(channelId: number, userId: number): Promise<number>;

  getMessages(channelId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;

  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry>;
  getTimeEntriesByTask(taskId: number): Promise<(TimeEntry & { userName: string })[]>;
  getTimeEntriesByUser(userId: number): Promise<TimeEntry[]>;
  getAllTimeEntries(filters?: {
    userId?: number;
    projectId?: number;
    taskId?: number;
    startDate?: string;
    endDate?: string;
    clientVisibleOnly?: boolean;
    clientProjectIds?: number[];
    /** If set, only entries whose task belongs to one of these projects */
    allowedProjectIds?: number[];
  }): Promise<(TimeEntry & { taskTitle: string; projectId: number; userName: string })[]>;
  deleteTimeEntry(id: number): Promise<void>;
  getTimeEntry(id: number): Promise<TimeEntry | undefined>;

  getCompanySettings(): Promise<CompanySettings>;
  updateCompanySettings(
    updates: Partial<{
      companyName: string;
      browserTitle: string | null;
      workspaceSlug: string | null;
      logoUrl: string | null;
      ms365Enabled: boolean;
      ms365TenantId: string | null;
      ms365ClientId: string | null;
      ms365ClientSecret: string | null;
      ms365AllowedDomains: string | null;
      taskMarkCompleteStatus: string;
      taskClientReopenStatus: string;
      timeLogMinDescriptionWords: number;
      timeLogMaxHoursPerEntry: string | null;
      timecardDateDisplayFormat: string;
      timecardSummaryRecipientEmails: string[];
      emailDigestTimezone: string | null;
    }>,
  ): Promise<CompanySettings>;

  getUserByEmailIgnoreCase(email: string): Promise<User | undefined>;

  /** Local part of email, sanitized; append -1, -2, … until unique. `excludeUserId` treats that user as not blocking. */
  allocateUniqueUsernameFromEmail(email: string, excludeUserId?: number): Promise<string>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmailIgnoreCase(email: string): Promise<User | undefined> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return undefined;
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(trim(${users.email})) = ${normalized}`)
      .limit(1);
    return user;
  }

  async allocateUniqueUsernameFromEmail(email: string, excludeUserId?: number): Promise<string> {
    const trimmed = email.trim().toLowerCase();
    const at = trimmed.indexOf("@");
    let base =
      (at > 0 ? trimmed.slice(0, at) : trimmed).replace(/[^a-z0-9._-]/g, "") || "user";
    if (base.length > 80) base = base.slice(0, 80);
    for (let n = 0; n < 10_000; n++) {
      const candidate = n === 0 ? base : `${base}-${n}`;
      const existing = await this.getUserByUsername(candidate);
      if (!existing) return candidate;
      if (excludeUserId !== undefined && existing.id === excludeUserId) return candidate;
    }
    throw new Error("Could not allocate a unique username");
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUser(
    id: number,
    updates: Partial<InsertUser> & {
      projectSidebarOrder?: number[] | null;
      projectQuickMenuIds?: number[] | null;
    },
  ): Promise<User | undefined> {
    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return updated;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(comments).where(eq(comments.authorId, id));
    await db.delete(messages).where(eq(messages.authorId, id));
    await db.delete(users).where(eq(users.id, id));
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getProjects(opts?: { includeClosed?: boolean }): Promise<Project[]> {
    if (opts?.includeClosed) {
      return db.select().from(projects);
    }
    return db.select().from(projects).where(isNull(projects.closedAt));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async updateProject(
    id: number,
    updates: Partial<{
      name: string;
      color: string;
      description: string | null;
      columns: unknown;
      closedAt: Date | null;
      closureDescription: string | null;
      closurePaymentReceived: boolean;
    }>,
  ): Promise<Project | undefined> {
    const [updated] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
    return updated;
  }

  async deleteProject(id: number): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  async getProjectMembers(projectId: number): Promise<User[]> {
    const rows = await db
      .select({ user: users })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, projectId));
    return rows.map(r => r.user);
  }

  async getProjectMembersWithSettings(projectId: number): Promise<(User & { clientShowTimecards: boolean; clientTaskAccess: string })[]> {
    const rows = await db
      .select({
        user: users,
        clientShowTimecards: projectMembers.clientShowTimecards,
        clientTaskAccess: projectMembers.clientTaskAccess,
      })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, projectId));
    return rows.map(r => ({
      ...r.user,
      clientShowTimecards: r.clientShowTimecards ?? false,
      clientTaskAccess: r.clientTaskAccess ?? "feedback",
    }));
  }

  async addProjectMember(projectId: number, userId: number): Promise<void> {
    await db.insert(projectMembers).values({ projectId, userId }).onConflictDoNothing();
  }

  async removeProjectMember(projectId: number, userId: number): Promise<void> {
    await db
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  }

  async getUserProjects(userId: number): Promise<Project[]> {
    const rows = await db
      .select({ project: projects })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(and(eq(projectMembers.userId, userId), isNull(projects.closedAt)));
    return rows.map(r => r.project);
  }

  async getProjectMembership(projectId: number, userId: number): Promise<ProjectMember | undefined> {
    const [membership] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    return membership;
  }

  async getUserMemberships(userId: number): Promise<ProjectMember[]> {
    return db.select().from(projectMembers).where(eq(projectMembers.userId, userId));
  }

  async updateProjectMemberClientSettings(projectId: number, userId: number, settings: { clientShowTimecards?: boolean; clientTaskAccess?: string }): Promise<void> {
    await db
      .update(projectMembers)
      .set(settings)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  }

  async projectHasClientWithTimecards(projectId: number): Promise<boolean> {
    const rows = await db
      .select({ pm: projectMembers, u: users })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(users.role, "client"),
        eq(projectMembers.clientShowTimecards, true)
      ));
    return rows.length > 0;
  }

  async getTasksByProject(projectId: number): Promise<Task[]> {
    return db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.boardOrder), asc(tasks.id));
  }

  async getMaxBoardOrderForStatus(projectId: number, status: string): Promise<number> {
    const [row] = await db
      .select({
        m: sql<number>`coalesce(max(${tasks.boardOrder}), -1)`,
      })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.status, status)));
    return Number(row?.m ?? -1);
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async createTask(task: InsertTask): Promise<Task> {
    const [created] = await db.insert(tasks).values(task).returning();
    return created;
  }

  async updateTask(id: number, updates: Partial<InsertTask>): Promise<Task | undefined> {
    const [updated] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();
    return updated;
  }

  async deleteTask(id: number): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async getTaskAssignees(taskId: number): Promise<User[]> {
    const rows = await db
      .select({ user: users })
      .from(taskAssignees)
      .innerJoin(users, eq(taskAssignees.userId, users.id))
      .where(eq(taskAssignees.taskId, taskId));
    return rows.map(r => r.user);
  }

  async setTaskAssignees(taskId: number, userIds: number[]): Promise<void> {
    await db.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
    if (userIds.length > 0) {
      await db.insert(taskAssignees).values(userIds.map(userId => ({ taskId, userId })));
    }
  }

  async getChecklistItems(taskId: number): Promise<ChecklistItem[]> {
    return db.select().from(checklistItems).where(eq(checklistItems.taskId, taskId));
  }

  async getChecklistItem(id: number): Promise<ChecklistItem | undefined> {
    const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, id));
    return item;
  }

  async createChecklistItem(taskId: number, text: string): Promise<ChecklistItem> {
    const [created] = await db.insert(checklistItems).values({ taskId, text }).returning();
    return created;
  }

  async updateChecklistItem(id: number, completed: boolean): Promise<void> {
    await db.update(checklistItems).set({ completed }).where(eq(checklistItems.id, id));
  }

  async deleteChecklistItem(id: number): Promise<void> {
    await db.delete(checklistItems).where(eq(checklistItems.id, id));
  }

  async getAttachments(taskId: number): Promise<Attachment[]> {
    return db.select().from(attachments).where(eq(attachments.taskId, taskId));
  }

  async getAttachment(id: number): Promise<Attachment | undefined> {
    const [attachment] = await db.select().from(attachments).where(eq(attachments.id, id));
    return attachment;
  }

  async createAttachment(attachment: { taskId: number | null; commentId: number | null; name: string; type: string; url?: string; size?: string }): Promise<Attachment> {
    const [created] = await db.insert(attachments).values(attachment).returning();
    return created;
  }

  async deleteAttachment(id: number): Promise<void> {
    await db.delete(attachments).where(eq(attachments.id, id));
  }

  async getComments(taskId: number): Promise<Comment[]> {
    return db
      .select()
      .from(comments)
      .where(eq(comments.taskId, taskId))
      .orderBy(desc(comments.createdAt));
  }

  async getComment(id: number): Promise<Comment | undefined> {
    const [row] = await db.select().from(comments).where(eq(comments.id, id));
    return row;
  }

  async createComment(comment: InsertComment): Promise<Comment> {
    const [created] = await db.insert(comments).values(comment).returning();
    return created;
  }

  async updateComment(id: number, updates: { content: string; editedAt: Date }): Promise<Comment | undefined> {
    const [updated] = await db.update(comments).set(updates).where(eq(comments.id, id)).returning();
    return updated;
  }

  async getCommentSubtreePostOrder(taskId: number, rootId: number): Promise<number[]> {
    const all = await db
      .select({ id: comments.id, parentId: comments.parentId })
      .from(comments)
      .where(eq(comments.taskId, taskId));
    const byParent = new Map<number | null, number[]>();
    for (const c of all) {
      const p = c.parentId;
      const list = byParent.get(p) ?? [];
      list.push(c.id);
      byParent.set(p, list);
    }
    const out: number[] = [];
    const walk = (cid: number) => {
      const kids = byParent.get(cid) ?? [];
      for (const k of kids) walk(k);
      out.push(cid);
    };
    walk(rootId);
    return out;
  }

  async deleteCommentsByIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(comments).where(inArray(comments.id, ids));
  }

  async getChannels(projectId?: number): Promise<Channel[]> {
    if (projectId) {
      return db.select().from(channels).where(eq(channels.projectId, projectId));
    }
    return db.select().from(channels);
  }

  async getChannel(id: number): Promise<Channel | undefined> {
    const [row] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
    return row;
  }

  async createChannel(channel: InsertChannel): Promise<Channel> {
    const [created] = await db.insert(channels).values(channel).returning();
    return created;
  }

  async getOrCreateDirectChannel(projectId: number, userId1: number, userId2: number): Promise<Channel> {
    if (userId1 === userId2) throw new Error("Invalid peer");
    const a = Math.min(userId1, userId2);
    const b = Math.max(userId1, userId2);
    const name = `dm:${a}:${b}`;
    const existing = await db
      .select()
      .from(channels)
      .where(and(eq(channels.projectId, projectId), eq(channels.type, "direct"), eq(channels.name, name)))
      .limit(1);
    if (existing[0]) return existing[0];
    const [created] = await db
      .insert(channels)
      .values({ name, type: "direct", projectId })
      .returning();
    await this.addChannelMember(created.id, userId1);
    await this.addChannelMember(created.id, userId2);
    return created;
  }

  async deleteChannel(id: number): Promise<void> {
    await db.delete(channels).where(eq(channels.id, id));
  }

  async markChannelReadForUser(channelId: number, userId: number): Promise<void> {
    const readAt = new Date();
    await db
      .insert(channelUserReadState)
      .values({ channelId, userId, lastReadAt: readAt })
      .onConflictDoUpdate({
        target: [channelUserReadState.channelId, channelUserReadState.userId],
        set: { lastReadAt: readAt },
      });
  }

  async getChannelUnreadCountForUser(channelId: number, userId: number): Promise<number> {
    const [st] = await db
      .select()
      .from(channelUserReadState)
      .where(and(eq(channelUserReadState.channelId, channelId), eq(channelUserReadState.userId, userId)))
      .limit(1);

    const threshold: Date = st?.lastReadAt ?? new Date(0);

    const [cnt] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(eq(messages.channelId, channelId), ne(messages.authorId, userId), gt(messages.createdAt, threshold)),
      );
    return Number(cnt?.c ?? 0);
  }

  async getChannelMembers(channelId: number): Promise<User[]> {
    const rows = await db
      .select({ user: users })
      .from(channelMembers)
      .innerJoin(users, eq(channelMembers.userId, users.id))
      .where(eq(channelMembers.channelId, channelId));
    return rows.map(r => r.user);
  }

  async addChannelMember(channelId: number, userId: number): Promise<void> {
    await db.insert(channelMembers).values({ channelId, userId }).onConflictDoNothing();
  }

  async updateChannel(id: number, updates: Partial<{ name: string }>): Promise<Channel | undefined> {
    if (Object.keys(updates).length === 0) return this.getChannel(id);
    const [row] = await db.update(channels).set(updates).where(eq(channels.id, id)).returning();
    return row;
  }

  async replaceChannelMembers(channelId: number, userIds: number[]): Promise<void> {
    const unique = userIds.filter((id, idx) => userIds.indexOf(id) === idx);
    await db.transaction(async (tx) => {
      await tx.delete(channelMembers).where(eq(channelMembers.channelId, channelId));
      if (unique.length > 0) {
        await tx.insert(channelMembers).values(unique.map((userId) => ({ channelId, userId })));
      }
    });
  }

  async getMessages(channelId: number): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.channelId, channelId)).orderBy(messages.createdAt);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [created] = await db.insert(messages).values(message).returning();
    return created;
  }

  async createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry> {
    const [created] = await db.insert(timeEntries).values(entry).returning();
    return created;
  }

  async getTimeEntriesByTask(taskId: number): Promise<(TimeEntry & { userName: string })[]> {
    const rows = await db
      .select({
        id: timeEntries.id,
        taskId: timeEntries.taskId,
        userId: timeEntries.userId,
        hours: timeEntries.hours,
        description: timeEntries.description,
        logDate: timeEntries.logDate,
        clientVisible: timeEntries.clientVisible,
        userName: users.name,
      })
      .from(timeEntries)
      .innerJoin(users, eq(timeEntries.userId, users.id))
      .where(eq(timeEntries.taskId, taskId))
      .orderBy(desc(timeEntries.id));
    return rows;
  }

  async getTimeEntriesByUser(userId: number): Promise<TimeEntry[]> {
    return db.select().from(timeEntries).where(eq(timeEntries.userId, userId)).orderBy(desc(timeEntries.id));
  }

  async getAllTimeEntries(filters?: {
    userId?: number;
    projectId?: number;
    taskId?: number;
    startDate?: string;
    endDate?: string;
    clientVisibleOnly?: boolean;
    clientProjectIds?: number[];
    allowedProjectIds?: number[];
  }): Promise<(TimeEntry & { taskTitle: string; projectId: number; userName: string })[]> {
    const rows = await db
      .select({
        id: timeEntries.id,
        taskId: timeEntries.taskId,
        userId: timeEntries.userId,
        hours: timeEntries.hours,
        description: timeEntries.description,
        logDate: timeEntries.logDate,
        clientVisible: timeEntries.clientVisible,
        taskTitle: tasks.title,
        projectId: tasks.projectId,
        userName: users.name,
      })
      .from(timeEntries)
      .innerJoin(tasks, eq(timeEntries.taskId, tasks.id))
      .innerJoin(users, eq(timeEntries.userId, users.id))
      // Ensure newest-first ordering (stable within day by id)
      .orderBy(desc(timeEntries.logDate), desc(timeEntries.id));

    return rows.filter(row => {
      if (filters?.userId && row.userId !== filters.userId) return false;
      if (filters?.projectId && row.projectId !== filters.projectId) return false;
      if (filters?.taskId && row.taskId !== filters.taskId) return false;
      if (filters?.startDate && row.logDate < filters.startDate) return false;
      if (filters?.endDate && row.logDate > filters.endDate) return false;
      if (filters?.clientVisibleOnly && !row.clientVisible) return false;
      if (filters?.clientProjectIds && !filters.clientProjectIds.includes(row.projectId)) return false;
      if (
        filters?.allowedProjectIds &&
        filters.allowedProjectIds.length > 0 &&
        !filters.allowedProjectIds.includes(row.projectId)
      ) {
        return false;
      }
      return true;
    });
  }

  async deleteTimeEntry(id: number): Promise<void> {
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
  }

  async getTimeEntry(id: number): Promise<TimeEntry | undefined> {
    const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
    return entry;
  }

  async getCompanySettings(): Promise<CompanySettings> {
    const rows = await db.select().from(companySettings).limit(1);
    if (rows.length === 0) {
      const [inserted] = await db
        .insert(companySettings)
        .values({ companyName: "My company" })
        .returning();
      return inserted;
    }
    return rows[0];
  }

  async updateCompanySettings(
    updates: Partial<{
      companyName: string;
      browserTitle: string | null;
      workspaceSlug: string | null;
      logoUrl: string | null;
      ms365Enabled: boolean;
      ms365TenantId: string | null;
      ms365ClientId: string | null;
      ms365ClientSecret: string | null;
      ms365AllowedDomains: string | null;
      taskMarkCompleteStatus: string;
      taskClientReopenStatus: string;
      timeLogMinDescriptionWords: number;
      timeLogMaxHoursPerEntry: string | null;
      timecardDateDisplayFormat: string;
      timecardSummaryRecipientEmails: string[];
      emailDigestTimezone?: string | null;
    }>,
  ): Promise<CompanySettings> {
    const current = await this.getCompanySettings();
    const [updated] = await db
      .update(companySettings)
      .set(updates)
      .where(eq(companySettings.id, current.id))
      .returning();
    return updated!;
  }
}

export const storage = new DatabaseStorage();
