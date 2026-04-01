import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, jsonb, json, serial, integer, primaryKey, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/** Single-tenant workspace branding (one row; created on first read). */
export const companySettings = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull().default(""),
  workspaceSlug: text("workspace_slug"),
  logoUrl: text("logo_url"),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("employee"),
  avatar: text("avatar"),
  status: text("status").default("online"),
  email: text("email"),
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("bg-blue-500"),
  description: text("description"),
  columns: jsonb("columns").notNull().default(sql`'[]'::jsonb`),
});

export const projectMembers = pgTable("project_members", {
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientShowTimecards: boolean("client_show_timecards").default(false),
  clientTaskAccess: text("client_task_access").default("feedback"),
}, (t) => [primaryKey({ columns: [t.projectId, t.userId] })]);

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").default(""),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  startDate: text("start_date"),
  dueDate: text("due_date"),
  recurrence: jsonb("recurrence"),
  coverImage: text("cover_image"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const taskAssignees = pgTable("task_assignees", {
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.taskId, t.userId] })]);

export const checklistItems = pgTable("checklist_items", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  completed: boolean("completed").default(false),
});

export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  commentId: integer("comment_id"),
  name: text("name").notNull(),
  type: text("type").notNull().default("file"),
  url: text("url"),
  size: text("size"),
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  parentId: integer("parent_id"),
  type: text("type").default("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("public"),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "cascade" }),
});

export const channelMembers = pgTable("channel_members", {
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.channelId, t.userId] })]);

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const timeEntries = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
  description: text("description"),
  logDate: text("log_date").notNull(),
  clientVisible: boolean("client_visible").default(true),
});

/** connect-pg-simple / express-session store (see DBSCHEMA.sql) */
export const expressSession = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (t) => [index("IDX_session_expire").on(t.expire)],
);

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
export const insertChecklistItemSchema = createInsertSchema(checklistItems).omit({ id: true });
export const insertAttachmentSchema = createInsertSchema(attachments).omit({ id: true });
export const insertCommentSchema = createInsertSchema(comments).omit({ id: true, createdAt: true });
export const insertChannelSchema = createInsertSchema(channels).omit({ id: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({ id: true });

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type CompanySettings = typeof companySettings.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type ProjectMember = typeof projectMembers.$inferSelect;

// Login schema
export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
