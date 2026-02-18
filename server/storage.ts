import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import {
  users, projects, projectMembers, tasks, taskAssignees,
  checklistItems, attachments, comments, channels, channelMembers, messages,
  type User, type InsertUser, type Project, type InsertProject,
  type Task, type InsertTask, type ChecklistItem, type Attachment,
  type Comment, type InsertComment, type Channel, type InsertChannel,
  type Message, type InsertMessage,
} from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;

  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  getProjectMembers(projectId: number): Promise<User[]>;
  addProjectMember(projectId: number, userId: number): Promise<void>;
  getUserProjects(userId: number): Promise<Project[]>;

  getTasksByProject(projectId: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, updates: Partial<InsertTask>): Promise<Task | undefined>;
  getTaskAssignees(taskId: number): Promise<User[]>;
  setTaskAssignees(taskId: number, userIds: number[]): Promise<void>;

  getChecklistItems(taskId: number): Promise<ChecklistItem[]>;
  createChecklistItem(taskId: number, text: string): Promise<ChecklistItem>;
  updateChecklistItem(id: number, completed: boolean): Promise<void>;
  deleteChecklistItem(id: number): Promise<void>;

  getAttachments(taskId: number): Promise<Attachment[]>;
  createAttachment(attachment: { taskId: number | null; commentId: number | null; name: string; type: string; url?: string; size?: string }): Promise<Attachment>;
  deleteAttachment(id: number): Promise<void>;

  getComments(taskId: number): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;

  getChannels(projectId?: number): Promise<Channel[]>;
  createChannel(channel: InsertChannel): Promise<Channel>;
  getChannelMembers(channelId: number): Promise<User[]>;
  addChannelMember(channelId: number, userId: number): Promise<void>;

  getMessages(channelId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
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

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getProjects(): Promise<Project[]> {
    return db.select().from(projects);
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async getProjectMembers(projectId: number): Promise<User[]> {
    const rows = await db
      .select({ user: users })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, projectId));
    return rows.map(r => r.user);
  }

  async addProjectMember(projectId: number, userId: number): Promise<void> {
    await db.insert(projectMembers).values({ projectId, userId }).onConflictDoNothing();
  }

  async getUserProjects(userId: number): Promise<Project[]> {
    const rows = await db
      .select({ project: projects })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(eq(projectMembers.userId, userId));
    return rows.map(r => r.project);
  }

  async getTasksByProject(projectId: number): Promise<Task[]> {
    return db.select().from(tasks).where(eq(tasks.projectId, projectId));
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

  async createAttachment(attachment: { taskId: number | null; commentId: number | null; name: string; type: string; url?: string; size?: string }): Promise<Attachment> {
    const [created] = await db.insert(attachments).values(attachment).returning();
    return created;
  }

  async deleteAttachment(id: number): Promise<void> {
    await db.delete(attachments).where(eq(attachments.id, id));
  }

  async getComments(taskId: number): Promise<Comment[]> {
    return db.select().from(comments).where(eq(comments.taskId, taskId));
  }

  async createComment(comment: InsertComment): Promise<Comment> {
    const [created] = await db.insert(comments).values(comment).returning();
    return created;
  }

  async getChannels(projectId?: number): Promise<Channel[]> {
    if (projectId) {
      return db.select().from(channels).where(eq(channels.projectId, projectId));
    }
    return db.select().from(channels);
  }

  async createChannel(channel: InsertChannel): Promise<Channel> {
    const [created] = await db.insert(channels).values(channel).returning();
    return created;
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

  async getMessages(channelId: number): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.channelId, channelId)).orderBy(messages.createdAt);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [created] = await db.insert(messages).values(message).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
