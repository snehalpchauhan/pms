import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, jsonb, json, serial, integer, primaryKey, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/** Single-tenant workspace branding (one row; created on first read). */
export const companySettings = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull().default(""),
  /** Shown in the browser tab when set; empty uses the app default. */
  browserTitle: text("browser_title"),
  workspaceSlug: text("workspace_slug"),
  logoUrl: text("logo_url"),
  ms365Enabled: boolean("ms365_enabled").notNull().default(false),
  ms365TenantId: text("ms365_tenant_id"),
  ms365ClientId: text("ms365_client_id"),
  /** Optional; env MS365_CLIENT_SECRET overrides when set. */
  ms365ClientSecret: text("ms365_client_secret"),
  ms365AllowedDomains: text("ms365_allowed_domains"),
  /** Fixed workflow id: column tasks move to when staff marks complete (default done). */
  taskMarkCompleteStatus: text("task_mark_complete_status").notNull().default("done"),
  /** Fixed workflow id: column tasks move to when a client requests revision / reopens (default in-progress). */
  taskClientReopenStatus: text("task_client_reopen_status").notNull().default("in-progress"),
  /**
   * Minimum word count for the time log narrative (text after work type); 0 = no minimum.
   * Work type prefix `[Label]` is excluded from the count.
   */
  timeLogMinDescriptionWords: integer("time_log_min_description_words").notNull().default(10),
  /** If set, a single time entry cannot exceed this many hours (split longer work across entries). */
  timeLogMaxHoursPerEntry: numeric("time_log_max_hours_per_entry", { precision: 8, scale: 2 }),
  /**
   * Display format for timecard-related emails (e.g. DD/MM/YYYY). See shared/timecardDateFormat.ts presets.
   */
  timecardDateDisplayFormat: text("timecard_date_display_format").notNull().default("DD/MM/YYYY"),
  /**
   * Recipients of the consolidated "admin" timecard gap summary email (JSON array of email strings).
   */
  timecardSummaryRecipientEmails: jsonb("timecard_summary_recipient_emails").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /**
   * IANA timezone for timecard-related cron schedules (e.g. Asia/Kolkata).
   * When null/empty, node-cron uses the process default (usually the server OS timezone).
   */
  emailDigestTimezone: text("email_digest_timezone"),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("employee"),
  avatar: text("avatar"),
  /** Last explicit presence ping / login; UI treats as online while recent. */
  lastSeenAt: timestamp("last_seen_at"),
  status: text("status").default("offline"),
  email: text("email"),
  /** Per-user order of project ids for the left sidebar (same ids as visible projects API). */
  projectSidebarOrder: jsonb("project_sidebar_order"),
  /** Subset shown as chips on the collapsed rail; null = all visible projects. */
  projectQuickMenuIds: jsonb("project_quick_menu_ids"),
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("bg-blue-500"),
  description: text("description"),
  columns: jsonb("columns").notNull().default(sql`'[]'::jsonb`),
  /** Creator / owner; only this user (and admins) may add, rename, remove, or reorder board sections. */
  ownerId: integer("owner_id").references(() => users.id),
  /** When set, project is closed; hidden from workspace for non-admin flows (admin manages via /api/admin/projects). */
  closedAt: timestamp("closed_at"),
  closureDescription: text("closure_description"),
  closurePaymentReceived: boolean("closure_payment_received").notNull().default(false),
});

export const projectMembers = pgTable("project_members", {
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientShowTimecards: boolean("client_show_timecards").default(false),
  clientTaskAccess: text("client_task_access").default("feedback"),
  /** When true, this manager/employee receives an email whenever a client creates a new task on this project. */
  notifyClientNewTask: boolean("notify_client_new_task").default(false),
}, (t) => [primaryKey({ columns: [t.projectId, t.userId] })]);

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  /** User who created the task; may delete the task and all related data. */
  ownerId: integer("owner_id").references(() => users.id),
  title: text("title").notNull(),
  description: text("description").default(""),
  status: text("status").notNull().default("todo"),
  /** Order within a board column (same status); lower = higher on the board. */
  boardOrder: integer("board_order").notNull().default(0),
  priority: text("priority").notNull().default("medium"),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  startDate: text("start_date"),
  dueDate: text("due_date"),
  recurrence: jsonb("recurrence"),
  coverImage: text("cover_image"),
  /** Planned effort (hours); compare to sum of time entries for budget / over-invested UI. */
  estimatedHours: numeric("estimated_hours", { precision: 10, scale: 2 }),
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
  /** Set when the author edits the comment text (shown as "edited" in the UI). */
  editedAt: timestamp("edited_at"),
});

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("public"),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "cascade" }),
  /** User who created the channel; may delete it (and admins/managers). */
  createdByUserId: integer("created_by_user_id").references(() => users.id),
});

export const channelMembers = pgTable("channel_members", {
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.channelId, t.userId] })]);

/** Per-user read cursor for a channel (public, private, or direct). */
export const channelUserReadState = pgTable(
  "channel_user_read_state",
  {
    channelId: integer("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] })],
);

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  channelId: integer("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  /** Set when author edits content; shown as "edited" in UI. */
  editedAt: timestamp("edited_at"),
  /** Soft-delete timestamp; UI shows "Message deleted". */
  deletedAt: timestamp("deleted_at"),
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
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  projectSidebarOrder: true,
  projectQuickMenuIds: true,
});
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
export const insertChecklistItemSchema = createInsertSchema(checklistItems).omit({ id: true });
export const insertAttachmentSchema = createInsertSchema(attachments).omit({ id: true });
export const insertCommentSchema = createInsertSchema(comments).omit({ id: true, createdAt: true, editedAt: true });
export const insertChannelSchema = createInsertSchema(channels).omit({ id: true });
export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
});
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
