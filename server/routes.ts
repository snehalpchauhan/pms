import express, { type Express } from "express";
import { createServer, type Server } from "http";
import crypto from "node:crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { notifyChannelMessages } from "./realtime";
import { storage } from "./storage";
import { setupAuth, requireAuth } from "./auth";
import {
  registerMicrosoftAuth,
  clearMicrosoftOidcCache,
  ms365ClientSecretFromEnv,
  ms365FullyConfigured,
} from "./microsoftAuth";
import { seedDatabase } from "./seed";
import {
  DEFAULT_TASK_CLIENT_REOPEN_STATUS,
  DEFAULT_TASK_MARK_COMPLETE_STATUS,
  parseWorkflowColumnId,
  resolveWorkflowStatusForProject,
} from "@shared/workflowColumns";
import { isValidProjectColor, sanitizeProjectColor } from "@shared/projectColors";
import { timeLogNoteMeetsMinWords } from "@shared/timeLogDescription";

const MAX_COMPANY_LOGO_BYTES = 2 * 1024 * 1024;

function persistCompanyLogoFromDataUrl(dataUrl: string, uploadsDir: string): string {
  const trimmed = dataUrl.trim();
  const m = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([\s\S]+)$/i.exec(trimmed);
  if (!m) throw new Error("Logo must be PNG, JPEG, or WebP.");
  const buf = Buffer.from(m[2].replace(/\s/g, ""), "base64");
  if (buf.length > MAX_COMPANY_LOGO_BYTES) throw new Error("Logo must be 2MB or smaller.");
  const mime = m[1].toLowerCase();
  const ext =
    mime === "image/jpeg" || mime === "image/jpg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const filename = `company-logo.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buf);
  return `/uploads/${filename}`;
}

function safeUnlinkCompanyLogo(logoUrl: string | null | undefined, uploadsDir: string) {
  if (!logoUrl || !logoUrl.startsWith("/uploads/")) return;
  const base = path.basename(logoUrl);
  if (!/^company-logo\.(png|jpe?g|webp)$/i.test(base)) return;
  const full = path.join(uploadsDir, base);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    /* ignore */
  }
}

const MAX_USER_AVATAR_BYTES = 800 * 1024;

function persistUserAvatarFromDataUrl(userId: number, dataUrl: string, uploadsDir: string): string {
  const trimmed = dataUrl.trim();
  const m = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([\s\S]+)$/i.exec(trimmed);
  if (!m) throw new Error("Avatar must be PNG, JPEG, or WebP.");
  const buf = Buffer.from(m[2]!.replace(/\s/g, ""), "base64");
  if (buf.length > MAX_USER_AVATAR_BYTES) throw new Error("Avatar must be 800KB or smaller.");
  const mime = m[1]!.toLowerCase();
  const ext =
    mime === "image/jpeg" || mime === "image/jpg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const filename = `user-${userId}-avatar.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buf);
  return `/uploads/${filename}`;
}

function safeUnlinkUserAvatar(avatarUrl: string | null | undefined, uploadsDir: string, userId: number) {
  if (!avatarUrl?.startsWith("/uploads/")) return;
  const base = path.basename(avatarUrl);
  if (!new RegExp(`^user-${userId}-avatar\\.(png|jpe?g|webp)$`, "i").test(base)) return;
  const full = path.join(uploadsDir, base);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    /* ignore */
  }
}

type BoardColumn = { id?: string; title?: string };

function boardColumnTitle(columns: BoardColumn[], statusId: string | null | undefined): string {
  if (statusId == null || statusId === "") return "None";
  const col = columns.find((c) => String(c?.id) === String(statusId));
  if (col?.title && String(col.title).trim()) return String(col.title);
  return String(statusId);
}

function formatTaskDateForLog(v: unknown): string {
  if (v == null || v === "") return "none";
  const s = String(v).trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (ymd) {
    const mo = Number(ymd[2]);
    const d = Number(ymd[3]);
    const y = ymd[1];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${monthNames[mo - 1] ?? ymd[2]} ${d}, ${y}`;
  }
  try {
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  } catch {
    /* ignore */
  }
  return s;
}

function sortedTagList(tags: string[] | null | undefined): string[] {
  return [...(tags || [])].map((t) => String(t)).sort((a, b) => a.localeCompare(b));
}

const MAX_CHAT_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_TASK_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function persistTaskAttachmentFromDataUrl(
  taskId: number,
  dataUrl: string,
  uploadsDir: string,
): { url: string; sizeLabel: string; isImage: boolean } {
  const trimmed = dataUrl.trim();
  const m = /^data:(image\/(?:png|jpeg|jpg|webp)|application\/pdf);base64,([\s\S]+)$/i.exec(trimmed);
  if (!m) throw new Error("File must be PNG, JPEG, WebP, or PDF.");
  const buf = Buffer.from(m[2]!.replace(/\s/g, ""), "base64");
  if (buf.length > MAX_TASK_ATTACHMENT_BYTES) throw new Error("File must be 8MB or smaller.");
  const mime = m[1]!.toLowerCase();
  const ext =
    mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : mime === "image/webp" ? "webp" : mime.includes("pdf") ? "pdf" : "png";
  const filename = `task-${taskId}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buf);
  const isImage = ext !== "pdf";
  return {
    url: `/uploads/${filename}`,
    sizeLabel: `${(buf.length / 1024).toFixed(1)} KB`,
    isImage,
  };
}

function safeUnlinkTaskAttachmentUrl(url: string | null | undefined, uploadsDir: string) {
  if (!url?.startsWith("/uploads/")) return;
  const base = path.basename(url);
  if (!/^task-\d+-[a-f0-9]{16}\.(png|jpe?g|webp|pdf)$/i.test(base)) return;
  const full = path.join(uploadsDir, base);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    /* ignore */
  }
}

function persistChatUploadFromDataUrl(channelId: number, dataUrl: string, uploadsDir: string): string {
  const trimmed = dataUrl.trim();
  const m = /^data:(image\/(?:png|jpeg|jpg|webp)|application\/pdf);base64,([\s\S]+)$/i.exec(trimmed);
  if (!m) throw new Error("Attachment must be PNG, JPEG, WebP, or PDF.");
  const buf = Buffer.from(m[2]!.replace(/\s/g, ""), "base64");
  if (buf.length > MAX_CHAT_UPLOAD_BYTES) throw new Error("Attachment must be 3MB or smaller.");
  const mime = m[1]!.toLowerCase();
  const ext =
    mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : mime === "image/webp" ? "webp" : mime.includes("pdf") ? "pdf" : "png";
  const filename = `chat-${channelId}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buf);
  return `/uploads/${filename}`;
}

/** Inline images / PDFs for new-task description (same types as task attachments; 8MB cap). */
function persistProjectTaskDescriptionUploadFromDataUrl(projectId: number, dataUrl: string, uploadsDir: string): string {
  const trimmed = dataUrl.trim();
  const m = /^data:(image\/(?:png|jpeg|jpg|webp)|application\/pdf);base64,([\s\S]+)$/i.exec(trimmed);
  if (!m) throw new Error("File must be PNG, JPEG, WebP, or PDF.");
  const buf = Buffer.from(m[2]!.replace(/\s/g, ""), "base64");
  if (buf.length > MAX_TASK_ATTACHMENT_BYTES) throw new Error("File must be 8MB or smaller.");
  const mime = m[1]!.toLowerCase();
  const ext =
    mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : mime === "image/webp" ? "webp" : mime.includes("pdf") ? "pdf" : "png";
  const filename = `taskdesc-${projectId}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buf);
  return `/uploads/${filename}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);
  registerMicrosoftAuth(app);
  try {
    await seedDatabase();
  } catch (e) {
    console.error(
      "[startup] seedDatabase failed — often missing DB columns after a schema change. Run: npm run db:push",
      e,
    );
    throw e;
  }

  const uploadsDir = path.join(process.cwd(), "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use("/uploads", express.static(uploadsDir));

  const patchMeAvatarSchema = z.object({
    avatarDataUrl: z.union([z.string().min(1), z.null()]),
  });

  app.patch("/api/auth/me", requireAuth, async (req, res) => {
    const parsed = patchMeAvatarSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid request" });
    }
    const current = req.user as Express.User;
    try {
      if (parsed.data.avatarDataUrl === null) {
        safeUnlinkUserAvatar(current.avatar, uploadsDir, current.id);
        const updated = await storage.updateUser(current.id, { avatar: null });
        if (!updated) return res.status(404).json({ message: "User not found" });
        const { password, ...safe } = updated;
        return res.json(safe);
      }
      safeUnlinkUserAvatar(current.avatar, uploadsDir, current.id);
      const url = persistUserAvatarFromDataUrl(current.id, parsed.data.avatarDataUrl, uploadsDir);
      const updated = await storage.updateUser(current.id, { avatar: url });
      if (!updated) return res.status(404).json({ message: "User not found" });
      const { password, ...safe } = updated;
      return res.json(safe);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update avatar";
      return res.status(400).json({ message });
    }
  });

  const workflowTaskStatusSchema = z.enum(["todo", "in-progress", "review", "done"]);

  const companyPatchSchema = z.object({
    companyName: z.string().min(1, "Company name is required").max(200).optional(),
    workspaceSlug: z
      .string()
      .max(100)
      .regex(/^[a-z0-9-]*$/, "Slug: lowercase letters, numbers, and hyphens only")
      .optional(),
    logoDataUrl: z.union([z.string().min(1), z.null()]).optional(),
    ms365Enabled: z.boolean().optional(),
    ms365TenantId: z.string().max(200).optional(),
    ms365ClientId: z.string().max(200).optional(),
    ms365AllowedDomains: z
      .string()
      .max(500)
      .regex(
        /^[a-zA-Z0-9.,\s-]*$/,
        "Allowed domains: comma-separated hostnames (e.g. vnnovate.com)",
      )
      .optional(),
    /** Omit to leave unchanged; empty string ignored; null clears stored secret */
    ms365ClientSecret: z.union([z.string().max(4096), z.null()]).optional(),
    taskMarkCompleteStatus: workflowTaskStatusSchema.optional(),
    taskClientReopenStatus: workflowTaskStatusSchema.optional(),
    /** 0 = no minimum; default on create is 10 */
    timeLogMinDescriptionWords: z.coerce.number().int().min(0).max(500).optional(),
  });

  app.get("/api/company-settings", requireAuth, async (_req, res) => {
    const row = await storage.getCompanySettings();
    res.json({
      companyName: row.companyName || "",
      workspaceSlug: row.workspaceSlug ?? "",
      logoUrl: row.logoUrl ?? null,
      ms365Enabled: row.ms365Enabled ?? false,
      ms365TenantId: row.ms365TenantId ?? "",
      ms365ClientId: row.ms365ClientId ?? "",
      ms365AllowedDomains: row.ms365AllowedDomains ?? "",
      ms365ClientSecretConfigured: Boolean(row.ms365ClientSecret?.trim()),
      ms365ClientSecretFromEnv: ms365ClientSecretFromEnv(),
      taskMarkCompleteStatus:
        parseWorkflowColumnId(row.taskMarkCompleteStatus) ?? DEFAULT_TASK_MARK_COMPLETE_STATUS,
      taskClientReopenStatus:
        parseWorkflowColumnId(row.taskClientReopenStatus) ?? DEFAULT_TASK_CLIENT_REOPEN_STATUS,
      timeLogMinDescriptionWords:
        row.timeLogMinDescriptionWords == null ? 10 : Number(row.timeLogMinDescriptionWords),
    });
  });

  app.patch("/api/company-settings", requireAuth, async (req, res) => {
    const currentUser = req.user as { role?: string };
    if (currentUser.role !== "admin") {
      return res.status(403).json({ message: "Only admins can update company settings" });
    }
    const parsed = companyPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid body" });
    }
    const body = parsed.data;
    if (
      body.companyName === undefined &&
      body.workspaceSlug === undefined &&
      body.logoDataUrl === undefined &&
      body.ms365Enabled === undefined &&
      body.ms365TenantId === undefined &&
      body.ms365ClientId === undefined &&
      body.ms365AllowedDomains === undefined &&
      body.ms365ClientSecret === undefined &&
      body.taskMarkCompleteStatus === undefined &&
      body.taskClientReopenStatus === undefined &&
      body.timeLogMinDescriptionWords === undefined
    ) {
      return res.status(400).json({ message: "No changes provided" });
    }

    const current = await storage.getCompanySettings();
    const updates: {
      companyName?: string;
      workspaceSlug?: string | null;
      logoUrl?: string | null;
      ms365Enabled?: boolean;
      ms365TenantId?: string | null;
      ms365ClientId?: string | null;
      ms365ClientSecret?: string | null;
      ms365AllowedDomains?: string | null;
      taskMarkCompleteStatus?: string;
      taskClientReopenStatus?: string;
      timeLogMinDescriptionWords?: number;
    } = {};

    if (body.companyName !== undefined) updates.companyName = body.companyName;
    if (body.workspaceSlug !== undefined) {
      updates.workspaceSlug = body.workspaceSlug === "" ? null : body.workspaceSlug;
    }
    if (body.ms365Enabled !== undefined) updates.ms365Enabled = body.ms365Enabled;
    if (body.ms365TenantId !== undefined) {
      updates.ms365TenantId = body.ms365TenantId.trim() === "" ? null : body.ms365TenantId.trim();
    }
    if (body.ms365ClientId !== undefined) {
      updates.ms365ClientId = body.ms365ClientId.trim() === "" ? null : body.ms365ClientId.trim();
    }
    if (body.ms365AllowedDomains !== undefined) {
      updates.ms365AllowedDomains =
        body.ms365AllowedDomains.trim() === "" ? null : body.ms365AllowedDomains.trim();
    }
    if (body.ms365ClientSecret !== undefined) {
      if (body.ms365ClientSecret === null) {
        updates.ms365ClientSecret = null;
      } else if (body.ms365ClientSecret.trim() !== "") {
        updates.ms365ClientSecret = body.ms365ClientSecret.trim();
      }
    }
    if (body.logoDataUrl !== undefined) {
      if (body.logoDataUrl === null) {
        safeUnlinkCompanyLogo(current.logoUrl, uploadsDir);
        updates.logoUrl = null;
      } else {
        try {
          const newUrl = persistCompanyLogoFromDataUrl(body.logoDataUrl, uploadsDir);
          safeUnlinkCompanyLogo(current.logoUrl, uploadsDir);
          updates.logoUrl = newUrl;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Invalid logo";
          return res.status(400).json({ message: msg });
        }
      }
    }
    if (body.taskMarkCompleteStatus !== undefined) {
      updates.taskMarkCompleteStatus = body.taskMarkCompleteStatus;
    }
    if (body.taskClientReopenStatus !== undefined) {
      updates.taskClientReopenStatus = body.taskClientReopenStatus;
    }
    if (body.timeLogMinDescriptionWords !== undefined) {
      updates.timeLogMinDescriptionWords = body.timeLogMinDescriptionWords;
    }

    const updated = await storage.updateCompanySettings(updates);
    if (
      body.ms365TenantId !== undefined ||
      body.ms365ClientId !== undefined ||
      body.ms365Enabled !== undefined ||
      body.ms365ClientSecret !== undefined
    ) {
      clearMicrosoftOidcCache();
    }
    res.json({
      companyName: updated.companyName || "",
      workspaceSlug: updated.workspaceSlug ?? "",
      logoUrl: updated.logoUrl ?? null,
      ms365Enabled: updated.ms365Enabled ?? false,
      ms365TenantId: updated.ms365TenantId ?? "",
      ms365ClientId: updated.ms365ClientId ?? "",
      ms365AllowedDomains: updated.ms365AllowedDomains ?? "",
      ms365ClientSecretConfigured: Boolean(updated.ms365ClientSecret?.trim()),
      ms365ClientSecretFromEnv: ms365ClientSecretFromEnv(),
      taskMarkCompleteStatus:
        parseWorkflowColumnId(updated.taskMarkCompleteStatus) ?? DEFAULT_TASK_MARK_COMPLETE_STATUS,
      taskClientReopenStatus:
        parseWorkflowColumnId(updated.taskClientReopenStatus) ?? DEFAULT_TASK_CLIENT_REOPEN_STATUS,
      timeLogMinDescriptionWords:
        updated.timeLogMinDescriptionWords == null ? 10 : Number(updated.timeLogMinDescriptionWords),
    });
  });

  // Users
  app.get("/api/users", requireAuth, async (_req, res) => {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers.map(({ password, ...u }) => u));
  });

  const createUserSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Valid email is required"),
    username: z.string().optional(),
    password: z.string().optional(),
    role: z.enum(["admin", "manager", "employee", "client"], { errorMap: () => ({ message: "Invalid role" }) }),
  });

  const updateUserSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    username: z.string().min(1, "Username is required").optional(),
    role: z.enum(["admin", "manager", "employee", "client"]).optional(),
    status: z.string().optional(),
  });

  app.post("/api/users", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role !== "admin") return res.status(403).json({ message: "Only admins can create users" });
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const { name, email, role } = parsed.data;
    const settings = await storage.getCompanySettings();
    const ms365Staff =
      ms365FullyConfigured(settings) && (role === "employee" || role === "manager");

    let username: string;
    let password: string;

    if (ms365Staff) {
      const dupEmail = await storage.getUserByEmailIgnoreCase(email);
      if (dupEmail) {
        return res.status(409).json({ message: "A user with this email already exists" });
      }
      username = await storage.allocateUniqueUsernameFromEmail(email);
      password = crypto.randomBytes(32).toString("hex");
    } else {
      const u = parsed.data.username?.trim();
      const p = parsed.data.password?.trim();
      if (!u || !p) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      const existing = await storage.getUserByUsername(u);
      if (existing) return res.status(409).json({ message: "Username already taken" });
      username = u;
      password = p;
    }

    const created = await storage.createUser({ name, email, username, password, role, status: "offline" });
    const { password: _pw, ...safe } = created;
    res.status(201).json(safe);
  });

  app.patch("/api/users/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role !== "admin") return res.status(403).json({ message: "Only admins can update users" });
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ message: "Invalid user id" });
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const { name, email, username, role, status } = parsed.data;
    if (role !== undefined && targetId === currentUser.id) {
      return res.status(400).json({ message: "You cannot change your own role" });
    }
    const target = await storage.getUser(targetId);
    if (!target) return res.status(404).json({ message: "User not found" });

    const companySettingsRow = await storage.getCompanySettings();
    const roleAfter = role !== undefined ? role : target.role;
    const ms365Staff =
      ms365FullyConfigured(companySettingsRow) &&
      (roleAfter === "employee" || roleAfter === "manager");

    const updates: Partial<{ name: string; email: string; username: string; role: string; status: string }> = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email.trim();
    if (role !== undefined) updates.role = role;
    if (status !== undefined) updates.status = status;
    if (username !== undefined && !ms365Staff) {
      const trimmed = username.trim();
      if (trimmed.length < 1) {
        return res.status(400).json({ message: "Username cannot be empty" });
      }
      if (trimmed !== target.username) {
        const taken = await storage.getUserByUsername(trimmed);
        if (taken && taken.id !== targetId) {
          return res.status(409).json({ message: "Username already taken" });
        }
      }
      updates.username = trimmed;
    }

    if (ms365Staff && email !== undefined) {
      const newEmail = updates.email as string;
      const oldNorm = (target.email ?? "").trim().toLowerCase();
      const newNorm = newEmail.toLowerCase();
      if (newNorm !== oldNorm) {
        const dup = await storage.getUserByEmailIgnoreCase(newEmail);
        if (dup && dup.id !== targetId) {
          return res.status(409).json({ message: "A user with this email already exists" });
        }
        updates.username = await storage.allocateUniqueUsernameFromEmail(newEmail, targetId);
      }
    }

    if (Object.keys(updates).length === 0) {
      const { password: _pw, ...safe } = target;
      return res.json(safe);
    }
    const updated = await storage.updateUser(targetId, updates);
    if (!updated) return res.status(404).json({ message: "User not found" });
    const { password: _pw, ...safe } = updated;
    res.json(safe);
  });

  app.delete("/api/users/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role !== "admin") return res.status(403).json({ message: "Only admins can delete users" });
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ message: "Invalid user id" });
    if (targetId === currentUser.id) return res.status(400).json({ message: "You cannot delete your own account" });
    const target = await storage.getUser(targetId);
    if (!target) return res.status(404).json({ message: "User not found" });
    try {
      await storage.deleteUser(targetId);
      res.json({ message: "User deleted" });
    } catch (err: any) {
      if (err?.code === "23503") {
        return res.status(409).json({ message: "Cannot remove user: they have data linked to them. Remove their project memberships and task assignments first." });
      }
      throw err;
    }
  });

  // Projects
  app.get("/api/projects", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") {
      const userProjects = await storage.getUserProjects(currentUser.id);
      res.json(userProjects);
    } else {
      const allProjects = await storage.getProjects();
      res.json(allProjects);
    }
  });

  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    // Clients can only access their own projects
    if (currentUser.role === "client") {
      const membership = await storage.getProjectMembership(projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Access denied" });
    }
    res.json(project);
  });

  const projectColumnSchema = z.object({
    id: z.string().min(1).max(80),
    title: z.string().min(1).max(120),
    color: z.string().min(1).max(80),
  });

  const projectAccentColorSchema = z
    .string()
    .min(1)
    .max(80)
    .refine((s) => isValidProjectColor(s), { message: "Invalid project color" });

  const createProjectSchema = z.object({
    name: z.string().min(1).max(200),
    color: projectAccentColorSchema.optional(),
    description: z.string().max(10_000).nullable().optional(),
    columns: z.array(projectColumnSchema).min(1).max(24).optional(),
  });

  const patchProjectSchema = z.object({
    columns: z.array(projectColumnSchema).min(1).max(24).optional(),
    name: z.string().min(1).max(200).optional(),
    color: projectAccentColorSchema.optional(),
    description: z.union([z.string().max(10_000), z.null()]).optional(),
  });

  const defaultProjectColumns = [
    { id: "todo", title: "To Do", color: "bg-slate-500" },
    { id: "in-progress", title: "In Progress", color: "bg-blue-500" },
    { id: "review", title: "Review", color: "bg-orange-500" },
    { id: "done", title: "Done", color: "bg-emerald-500" },
  ] as const;

  app.post("/api/projects", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") return res.status(403).json({ message: "Clients cannot create projects" });
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const project = await storage.createProject({
      name: parsed.data.name,
      color: sanitizeProjectColor(parsed.data.color ?? "bg-blue-500"),
      description: parsed.data.description ?? null,
      columns: parsed.data.columns ?? [...defaultProjectColumns],
      ownerId: currentUser.id,
    });
    await storage.addProjectMember(project.id, currentUser.id);
    res.status(201).json(project);
  });

  app.patch("/api/projects/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") {
      return res.status(403).json({ message: "Clients cannot edit board layout" });
    }
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project id" });
    }
    let membership = await storage.getProjectMembership(projectId, currentUser.id);
    if (!membership && (currentUser.role === "admin" || currentUser.role === "manager")) {
      await storage.addProjectMember(projectId, currentUser.id);
      membership = await storage.getProjectMembership(projectId, currentUser.id);
    }
    if (!membership) return res.status(403).json({ message: "Access denied" });
    const parsed = patchProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid body" });
    }
    const projectRecord = await storage.getProject(projectId);
    if (!projectRecord) return res.status(404).json({ message: "Project not found" });

    const wantsDetails =
      parsed.data.name !== undefined ||
      parsed.data.description !== undefined ||
      parsed.data.color !== undefined;
    if (wantsDetails) {
      const isAdmin = currentUser.role === "admin";
      const isManager = currentUser.role === "manager";
      const isOwner =
        projectRecord.ownerId != null && Number(projectRecord.ownerId) === Number(currentUser.id);
      if (!isAdmin && !isManager && !isOwner) {
        return res.status(403).json({
          message: "Only administrators, managers, or the project owner can update project details.",
        });
      }
    }
    if (parsed.data.columns !== undefined) {
      const isAdmin = currentUser.role === "admin";
      const isOwner =
        projectRecord.ownerId != null && Number(projectRecord.ownerId) === Number(currentUser.id);
      if (!isAdmin && !isOwner) {
        return res.status(403).json({
          message: "Only the project owner or an administrator can change board sections",
        });
      }
    }
    const updates: {
      name?: string;
      color?: string;
      description?: string | null;
      columns?: unknown;
    } = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.color !== undefined) updates.color = sanitizeProjectColor(parsed.data.color);
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.columns !== undefined) updates.columns = parsed.data.columns;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No changes provided" });
    }
    const updated = await storage.updateProject(projectId, updates);
    if (!updated) return res.status(404).json({ message: "Project not found" });
    res.json(updated);
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") {
      return res.status(403).json({ message: "Clients cannot delete projects" });
    }
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project id" });
    }
    const projectRecord = await storage.getProject(projectId);
    if (!projectRecord) return res.status(404).json({ message: "Project not found" });

    const isAdmin = currentUser.role === "admin";
    const isOwner =
      projectRecord.ownerId != null && Number(projectRecord.ownerId) === Number(currentUser.id);
    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        message: "Only the project owner or an administrator can delete this project.",
      });
    }

    await storage.deleteProject(projectId);
    res.status(204).end();
  });

  app.post("/api/projects/:id/direct-messages", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") {
      return res.status(403).json({ message: "Clients cannot start direct messages" });
    }
    const projectId = Number(req.params.id);
    const peerUserId = Number(req.body?.peerUserId);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project" });
    }
    if (!Number.isInteger(peerUserId) || peerUserId <= 0) {
      return res.status(400).json({ message: "Invalid peer user" });
    }
    if (peerUserId === currentUser.id) {
      return res.status(400).json({ message: "Cannot message yourself" });
    }
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    let callerMembership = await storage.getProjectMembership(projectId, currentUser.id);
    if (!callerMembership && (currentUser.role === "admin" || currentUser.role === "manager")) {
      await storage.addProjectMember(projectId, currentUser.id);
      callerMembership = await storage.getProjectMembership(projectId, currentUser.id);
    }
    if (!callerMembership) {
      return res.status(403).json({ message: "You must be a member of this project to use direct messages" });
    }
    let peerMembership = await storage.getProjectMembership(projectId, peerUserId);
    if (!peerMembership) {
      if (currentUser.role === "admin" || currentUser.role === "manager") {
        const peer = await storage.getUser(peerUserId);
        if (!peer) return res.status(404).json({ message: "User not found" });
        await storage.addProjectMember(projectId, peerUserId);
        peerMembership = await storage.getProjectMembership(projectId, peerUserId);
      } else {
        return res.status(403).json({
          message: "That person is not on this project yet. Ask an admin or manager to add them under Members & Access.",
        });
      }
    }
    try {
      const channel = await storage.getOrCreateDirectChannel(projectId, currentUser.id, peerUserId);
      res.json({ channelId: channel.id });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to open conversation";
      return res.status(400).json({ message });
    }
  });

  app.get("/api/projects/:id/members", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    // Clients can only view members of their own projects
    if (currentUser.role === "client") {
      const membership = await storage.getProjectMembership(projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Access denied" });
    }
    const projectRow = await storage.getProject(projectId);
    const ownerId = projectRow?.ownerId ?? null;
    const members = await storage.getProjectMembersWithSettings(projectId);
    res.json(
      members.map(({ password, ...u }) => ({
        ...u,
        isProjectOwner: ownerId != null && Number(u.id) === Number(ownerId),
      })),
    );
  });

  app.post("/api/projects/:id/members", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") return res.status(403).json({ message: "Clients cannot add members" });
    const projectId = Number(req.params.id);
    const userId = Number(req.body?.userId);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project" });
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    const projectRecord = await storage.getProject(projectId);
    if (!projectRecord) return res.status(404).json({ message: "Project not found" });
    const isAdmin = currentUser.role === "admin";
    const isManager = currentUser.role === "manager";
    const isProjectOwner =
      projectRecord.ownerId != null && Number(projectRecord.ownerId) === Number(currentUser.id);
    if (!isAdmin && !isManager && !isProjectOwner) {
      return res.status(403).json({
        message: "Only administrators, managers, or the project owner can add members",
      });
    }
    let membership = await storage.getProjectMembership(projectId, currentUser.id);
    if (!membership && isAdmin) {
      await storage.addProjectMember(projectId, currentUser.id);
      membership = await storage.getProjectMembership(projectId, currentUser.id);
    }
    if (!membership) {
      return res.status(403).json({ message: "You must be a member of this project to add people" });
    }
    const target = await storage.getUser(userId);
    if (!target) return res.status(404).json({ message: "User not found" });
    await storage.addProjectMember(projectId, userId);
    res.status(201).json({ message: "Member added" });
  });

  app.delete("/api/projects/:id/members/:userId", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") {
      return res.status(403).json({ message: "Clients cannot remove members" });
    }
    const projectId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project" });
    }
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    const projectRecord = await storage.getProject(projectId);
    if (!projectRecord) return res.status(404).json({ message: "Project not found" });

    if (projectRecord.ownerId != null && Number(projectRecord.ownerId) === targetUserId) {
      return res.status(400).json({ message: "Cannot remove the project owner from the team" });
    }

    const isAdmin = currentUser.role === "admin";
    const isManager = currentUser.role === "manager";
    const isProjectOwner =
      projectRecord.ownerId != null && Number(projectRecord.ownerId) === Number(currentUser.id);
    if (!isAdmin && !isManager && !isProjectOwner) {
      return res.status(403).json({
        message: "Only administrators, managers, or the project owner can remove members",
      });
    }
    if (isManager && !isAdmin && !isProjectOwner) {
      const mem = await storage.getProjectMembership(projectId, currentUser.id);
      if (!mem) {
        return res.status(403).json({ message: "You must be a member of this project to remove people" });
      }
    }

    const targetMembership = await storage.getProjectMembership(projectId, targetUserId);
    if (!targetMembership) {
      return res.status(404).json({ message: "User is not a member of this project" });
    }

    await storage.removeProjectMember(projectId, targetUserId);
    res.json({ message: "Member removed" });
  });

  // Get caller's permissions for a project
  app.get("/api/projects/:id/my-permissions", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    const membership = await storage.getProjectMembership(projectId, currentUser.id);
    if (!membership) {
      if (currentUser.role === "admin") {
        return res.json({
          role: currentUser.role,
          clientShowTimecards: true,
          clientTaskAccess: "full",
        });
      }
      return res.status(404).json({ message: "Not a member of this project" });
    }
    res.json({
      role: currentUser.role,
      clientShowTimecards: membership.clientShowTimecards ?? false,
      clientTaskAccess: membership.clientTaskAccess ?? "feedback",
    });
  });

  // Update client settings for a project member (admin/manager only)
  app.patch("/api/projects/:id/members/:userId/client-settings", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role !== "admin" && currentUser.role !== "manager") {
      return res.status(403).json({ message: "Only admin or manager can update client settings" });
    }
    const projectId = Number(req.params.id);
    const userId = Number(req.params.userId);
    const { clientShowTimecards, clientTaskAccess } = req.body;

    // Validate clientTaskAccess enum if provided
    const validAccessValues = ["view-only", "feedback", "contribute", "full"];
    if (clientTaskAccess !== undefined && !validAccessValues.includes(clientTaskAccess)) {
      return res.status(400).json({ message: "Invalid clientTaskAccess value" });
    }

    // Ensure target user is a client
    const targetUser = await storage.getUser(userId);
    if (!targetUser || targetUser.role !== "client") {
      return res.status(400).json({ message: "Target user must have client role" });
    }

    // Ensure target user is a member of this project
    const targetMembership = await storage.getProjectMembership(projectId, userId);
    if (!targetMembership) {
      return res.status(404).json({ message: "User is not a member of this project" });
    }

    await storage.updateProjectMemberClientSettings(projectId, userId, { clientShowTimecards, clientTaskAccess });
    res.json({ message: "Client settings updated" });
  });

  // Check if project has a client with timecards enabled
  app.get("/api/projects/:id/has-client-timecards", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    // Clients must be members of this project to query its settings
    if (currentUser.role === "client") {
      const membership = await storage.getProjectMembership(projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Access denied" });
    }
    const hasClientTimecards = await storage.projectHasClientWithTimecards(projectId);
    res.json({ hasClientTimecards });
  });

  // Tasks
  app.get("/api/tasks", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") {
      const userProjects = await storage.getUserProjects(currentUser.id);
      const allTasks: any[] = [];
      for (const project of userProjects) {
        const projectTasks = await storage.getTasksByProject(project.id);
        projectTasks.forEach(t => allTasks.push({ id: t.id, title: t.title, projectId: t.projectId, projectName: project.name, status: t.status }));
      }
      return res.json(allTasks);
    }
    const allProjects = await storage.getProjects();
    const allTasks: any[] = [];
    for (const project of allProjects) {
      const projectTasks = await storage.getTasksByProject(project.id);
      projectTasks.forEach(t => allTasks.push({ id: t.id, title: t.title, projectId: t.projectId, projectName: project.name, status: t.status }));
    }
    res.json(allTasks);
  });

  app.get("/api/projects/:projectId/tasks", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.projectId);
    const isClient = currentUser.role === "client";

    // For client callers, enforce project membership (clients can only see their own projects' tasks)
    let clientMembership: any = null;
    if (isClient) {
      clientMembership = await storage.getProjectMembership(projectId, currentUser.id);
      if (!clientMembership) {
        return res.status(403).json({ message: "Access denied: not a member of this project" });
      }
    }

    const projectTasks = await storage.getTasksByProject(projectId);
    const tasksWithDetails = await Promise.all(
      projectTasks.map(async (task) => {
        const assignees = await storage.getTaskAssignees(task.id);
        const checklist = await storage.getChecklistItems(task.id);
        const taskAttachments = await storage.getAttachments(task.id);
        const taskComments = await storage.getComments(task.id);
        const taskTimeEntries = await storage.getTimeEntriesByTask(task.id);

        let totalHours: number;
        if (isClient) {
          // Client sees totalHours only when their membership has clientShowTimecards=true
          if (clientMembership?.clientShowTimecards) {
            totalHours = taskTimeEntries
              .filter(e => e.clientVisible !== false)
              .reduce((sum, e) => sum + parseFloat(e.hours || "0"), 0);
          } else {
            totalHours = 0;
          }
        } else {
          totalHours = taskTimeEntries.reduce((sum, e) => sum + parseFloat(e.hours || "0"), 0);
        }

        return {
          ...task,
          assignees: assignees.map(({ password, ...u }) => u),
          checklist,
          attachments: taskAttachments,
          comments: taskComments,
          totalHours,
        };
      })
    );
    res.json(tasksWithDetails);
  });

  app.get("/api/tasks/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const task = await storage.getTask(Number(req.params.id));
    if (!task) return res.status(404).json({ message: "Task not found" });
    let clientMembership: any = null;
    if (currentUser.role === "client") {
      clientMembership = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!clientMembership) return res.status(403).json({ message: "Access denied" });
    }
    const assignees = await storage.getTaskAssignees(task.id);
    const checklist = await storage.getChecklistItems(task.id);
    const taskAttachments = await storage.getAttachments(task.id);
    const taskComments = await storage.getComments(task.id);
    const taskTimeEntries = await storage.getTimeEntriesByTask(task.id);
    let totalHours: number;
    if (currentUser.role === "client") {
      if (clientMembership?.clientShowTimecards) {
        totalHours = taskTimeEntries
          .filter((e) => e.clientVisible !== false)
          .reduce((sum, e) => sum + parseFloat(e.hours || "0"), 0);
      } else {
        totalHours = 0;
      }
    } else {
      totalHours = taskTimeEntries.reduce((sum, e) => sum + parseFloat(e.hours || "0"), 0);
    }
    res.json({
      ...task,
      assignees: assignees.map(({ password, ...u }) => u),
      checklist,
      attachments: taskAttachments,
      comments: taskComments,
      totalHours,
    });
  });

  app.post("/api/tasks", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const { assignees, ownerId: _ignoreOwner, initialHours: _legacyInitialHours, ...taskData } = req.body;
    // Clients with "contribute" access can create tasks tagged [Client Request]
    if (currentUser.role === "client") {
      const membership = await storage.getProjectMembership(taskData.projectId, currentUser.id);
      if (!membership || (membership.clientTaskAccess !== "contribute" && membership.clientTaskAccess !== "full")) {
        return res.status(403).json({ message: "Not authorized to create tasks" });
      }
      // Tag client tasks
      taskData.tags = [...(taskData.tags || []), "[Client Request]"];
    }
    const pid = Number(taskData.projectId);
    const st = String(taskData.status ?? "todo");
    if (Number.isInteger(pid) && pid > 0) {
      const maxOrder = await storage.getMaxBoardOrderForStatus(pid, st);
      taskData.boardOrder = maxOrder + 1;
    }
    const assigneeIds = Array.isArray(assignees)
      ? assignees
          .map((id: unknown) => Number(id))
          .filter((n: number) => Number.isInteger(n) && n > 0)
      : [];
    if (assigneeIds.length > 0 && Number.isInteger(pid) && pid > 0) {
      for (const uid of assigneeIds) {
        const mem = await storage.getProjectMembership(pid, uid);
        if (!mem) {
          return res.status(400).json({ message: "Assignees must be members of this project" });
        }
      }
    }
    const titleStr = typeof taskData.title === "string" ? taskData.title.trim() : "";
    if (!titleStr) {
      return res.status(400).json({ message: "Task title is required" });
    }
    (taskData as { title: string }).title = titleStr;
    const est = (taskData as { estimatedHours?: unknown }).estimatedHours;
    if (est === null || est === undefined || est === "") {
      delete (taskData as { estimatedHours?: unknown }).estimatedHours;
    } else {
      const n = typeof est === "number" ? est : parseFloat(String(est).replace(",", "."));
      if (Number.isNaN(n) || n < 0) {
        delete (taskData as { estimatedHours?: unknown }).estimatedHours;
      } else {
        (taskData as { estimatedHours?: string }).estimatedHours = String(Math.round(n * 100) / 100);
      }
    }
    const task = await storage.createTask({ ...taskData, ownerId: currentUser.id });
    if (assigneeIds.length > 0) {
      await storage.setTaskAssignees(task.id, assigneeIds);
    }
    res.status(201).json(task);
  });

  app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ message: "Invalid task" });
    }
    const task = await storage.getTask(taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
    if (!membership) {
      return res.status(403).json({ message: "Access denied" });
    }

    const isOwner = task.ownerId != null && Number(task.ownerId) === Number(currentUser.id);
    const legacyStaffDelete = task.ownerId == null && currentUser.role !== "client";

    if (!isOwner && !legacyStaffDelete) {
      return res.status(403).json({ message: "Only the task owner can delete this task" });
    }

    const attachmentRows = await storage.getAttachments(taskId);
    await storage.deleteTask(taskId);
    for (const a of attachmentRows) {
      safeUnlinkTaskAttachmentUrl(a.url, uploadsDir);
    }
    res.status(204).end();
  });

  app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const { assignees, ownerId: _ignoreOwnerPatch, ...rawUpdates } = req.body;
    const updates: Record<string, unknown> = { ...rawUpdates };
    if ("estimatedHours" in updates) {
      const est = updates.estimatedHours;
      if (est === null || est === undefined || est === "") {
        updates.estimatedHours = null;
      } else {
        const n = typeof est === "number" ? est : parseFloat(String(est).replace(",", "."));
        if (Number.isNaN(n) || n < 0) {
          delete updates.estimatedHours;
        } else {
          updates.estimatedHours = String(Math.round(n * 100) / 100);
        }
      }
    }
    const taskId = Number(req.params.id);

    if (currentUser.role === "client") {
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });
      const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!membership || membership.clientTaskAccess !== "full") {
        return res.status(403).json({ message: "Not authorized to edit tasks" });
      }
    }

    const before = await storage.getTask(taskId);
    if (!before) return res.status(404).json({ message: "Task not found" });

    const project = await storage.getProject(before.projectId);
    const boardCols: BoardColumn[] = Array.isArray(project?.columns) ? (project!.columns as BoardColumn[]) : [];

    const trackAssignees = Array.isArray(assignees);
    const assigneesBeforeUsers = trackAssignees ? await storage.getTaskAssignees(before.id) : [];

    let task = before;
    if (Object.keys(updates).length > 0) {
      const updated = await storage.updateTask(taskId, updates as any);
      if (!updated) return res.status(404).json({ message: "Task not found" });
      task = updated;
    }

    if (trackAssignees) {
      const ids = assignees
        .map((id: unknown) => Number(id))
        .filter((n: number) => Number.isInteger(n) && n > 0);
      for (const uid of ids) {
        const mem = await storage.getProjectMembership(before.projectId, uid);
        if (!mem) {
          return res.status(400).json({ message: "Assignees must be members of this project" });
        }
      }
      await storage.setTaskAssignees(task.id, ids);
    }

    const appendSystemLog = (content: string) =>
      storage.createComment({
        taskId: task.id,
        authorId: currentUser.id,
        content,
        type: "system",
      });

    const statusChanged =
      typeof updates.status === "string" && String(updates.status) !== String(before.status);

    if (statusChanged) {
      const fromT = boardColumnTitle(boardCols, before.status);
      const toT = boardColumnTitle(boardCols, updates.status);
      await appendSystemLog(`Moved to ${toT} (from ${fromT}).`);
    }

    if ("dueDate" in updates) {
      const prev = before.dueDate ?? null;
      const next = task.dueDate ?? null;
      if (String(prev ?? "") !== String(next ?? "")) {
        const p = formatTaskDateForLog(prev);
        const n = formatTaskDateForLog(next);
        if (!prev || String(prev).trim() === "") await appendSystemLog(`Due date set to ${n}.`);
        else if (!next || String(next).trim() === "") await appendSystemLog(`Due date cleared (was ${p}).`);
        else await appendSystemLog(`Due date changed from ${p} to ${n}.`);
      }
    }

    if ("startDate" in updates) {
      const prev = before.startDate ?? null;
      const next = task.startDate ?? null;
      if (String(prev ?? "") !== String(next ?? "")) {
        const p = formatTaskDateForLog(prev);
        const n = formatTaskDateForLog(next);
        if (!prev || String(prev).trim() === "") await appendSystemLog(`Start date set to ${n}.`);
        else if (!next || String(next).trim() === "") await appendSystemLog(`Start date cleared (was ${p}).`);
        else await appendSystemLog(`Start date changed from ${p} to ${n}.`);
      }
    }

    if ("priority" in updates && String(before.priority ?? "") !== String(task.priority ?? "")) {
      await appendSystemLog(`Priority changed from ${before.priority} to ${task.priority}.`);
    }

    if ("title" in updates && String(before.title ?? "") !== String(task.title ?? "")) {
      await appendSystemLog(`Title updated.`);
    }

    if ("description" in updates && String(before.description ?? "") !== String(task.description ?? "")) {
      await appendSystemLog(`Description updated.`);
    }

    if ("tags" in updates) {
      const bt = sortedTagList(before.tags as string[]);
      const at = sortedTagList(task.tags as string[]);
      if (JSON.stringify(bt) !== JSON.stringify(at)) {
        const list = at.length ? at.join(", ") : "(none)";
        await appendSystemLog(`Tags updated: ${list}.`);
      }
    }

    if ("recurrence" in updates) {
      const b = JSON.stringify(before.recurrence ?? null);
      const a = JSON.stringify(task.recurrence ?? null);
      if (b !== a) await appendSystemLog(`Recurrence updated.`);
    }

    if ("coverImage" in updates && String(before.coverImage ?? "") !== String(task.coverImage ?? "")) {
      await appendSystemLog(`Cover image updated.`);
    }

    if (
      "boardOrder" in updates &&
      Number(updates.boardOrder) !== Number(before.boardOrder) &&
      !statusChanged
    ) {
      await appendSystemLog(`Reordered within ${boardColumnTitle(boardCols, task.status)}.`);
    }

    if (trackAssignees) {
      const assigneesAfterUsers = await storage.getTaskAssignees(task.id);
      const namesBefore = assigneesBeforeUsers
        .map((u) => u.name)
        .sort((a, b) => a.localeCompare(b))
        .join(", ");
      const namesAfter = assigneesAfterUsers
        .map((u) => u.name)
        .sort((a, b) => a.localeCompare(b))
        .join(", ");
      if (namesBefore !== namesAfter) {
        const afterLabel = namesAfter || "none";
        const beforeLabel = namesBefore || "none";
        await appendSystemLog(`Assignees updated: ${afterLabel} (was: ${beforeLabel}).`);
      }
    }

    res.json(task);
  });

  // Task approve endpoint (client only)
  app.post("/api/tasks/:id/approve", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role !== "client") return res.status(403).json({ message: "Only clients can approve tasks" });

    const task = await storage.getTask(Number(req.params.id));
    if (!task) return res.status(404).json({ message: "Task not found" });

    const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
    // Only feedback/contribute clients can approve; full clients behave as employees
    if (!membership || (membership.clientTaskAccess !== "feedback" && membership.clientTaskAccess !== "contribute")) {
      return res.status(403).json({ message: "Not authorized to approve tasks" });
    }

    // Fetch project to identify the review column
    const project = await storage.getProject(task.projectId);
    const columns = (project?.columns as any[]) || [];

    // Server-side guard: task must be in the review/second-to-last column
    const reviewColumn = columns.length >= 2 ? columns[columns.length - 2] : columns[columns.length - 1];
    if (task.status !== reviewColumn?.id) {
      return res.status(400).json({ message: "Task is not in the review column" });
    }

    const companyRow = await storage.getCompanySettings();
    const markWf =
      parseWorkflowColumnId(companyRow.taskMarkCompleteStatus) ?? DEFAULT_TASK_MARK_COMPLETE_STATUS;
    const nextStatus = resolveWorkflowStatusForProject(columns, markWf, "markComplete");

    const fromT = boardColumnTitle(columns as BoardColumn[], task.status);
    const toT = boardColumnTitle(columns as BoardColumn[], nextStatus);
    await storage.updateTask(task.id, { status: nextStatus });

    await storage.createComment({
      taskId: task.id,
      authorId: currentUser.id,
      content: `Moved to ${toT} (from ${fromT}).`,
      type: "system",
    });

    await storage.createComment({
      taskId: task.id,
      authorId: currentUser.id,
      content: `Approved by ${currentUser.name}`,
      type: "comment",
    });

    res.json({ message: "Task approved" });
  });

  // Task request-revision endpoint (client only)
  app.post("/api/tasks/:id/request-revision", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role !== "client") return res.status(403).json({ message: "Only clients can request revisions" });

    const { reason } = req.body;
    if (!reason || !reason.trim()) return res.status(400).json({ message: "A reason is required for revision requests" });

    const task = await storage.getTask(Number(req.params.id));
    if (!task) return res.status(404).json({ message: "Task not found" });

    const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
    // Only feedback/contribute clients can request revisions; full clients behave as employees
    if (!membership || (membership.clientTaskAccess !== "feedback" && membership.clientTaskAccess !== "contribute")) {
      return res.status(403).json({ message: "Not authorized to request revisions" });
    }

    // Fetch project to identify the review column
    const project = await storage.getProject(task.projectId);
    const columns = (project?.columns as any[]) || [];

    // Server-side guard: task must be in the review/second-to-last column
    const reviewColumn = columns.length >= 2 ? columns[columns.length - 2] : columns[columns.length - 1];
    if (task.status !== reviewColumn?.id) {
      return res.status(400).json({ message: "Task is not in the review column" });
    }

    const companyRow = await storage.getCompanySettings();
    const reopenWf =
      parseWorkflowColumnId(companyRow.taskClientReopenStatus) ?? DEFAULT_TASK_CLIENT_REOPEN_STATUS;
    const nextStatus = resolveWorkflowStatusForProject(columns, reopenWf, "clientReopen");

    const fromT = boardColumnTitle(columns as BoardColumn[], task.status);
    const toT = boardColumnTitle(columns as BoardColumn[], nextStatus);
    await storage.updateTask(task.id, { status: nextStatus });

    await storage.createComment({
      taskId: task.id,
      authorId: currentUser.id,
      content: `Moved to ${toT} (from ${fromT}).`,
      type: "system",
    });

    await storage.createComment({
      taskId: task.id,
      authorId: currentUser.id,
      content: `Revision requested: ${reason.trim()}`,
      type: "comment",
    });

    res.json({ message: "Revision requested" });
  });

  // Helper: check if a client has full access to a task's project
  async function clientHasFullAccess(userId: number, taskId: number): Promise<boolean> {
    const task = await storage.getTask(taskId);
    if (!task) return false;
    const membership = await storage.getProjectMembership(task.projectId, userId);
    return !!(membership && membership.clientTaskAccess === "full");
  }

  // Checklist
  app.post("/api/tasks/:taskId/checklist", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") {
      const ok = await clientHasFullAccess(currentUser.id, Number(req.params.taskId));
      if (!ok) return res.status(403).json({ message: "Not authorized" });
    }
    const item = await storage.createChecklistItem(Number(req.params.taskId), req.body.text);
    const snippet =
      item.text.length > 80 ? `${item.text.slice(0, 77)}...` : item.text;
    await storage.createComment({
      taskId: item.taskId,
      authorId: currentUser.id,
      content: `Checklist item added: ${snippet}`,
      type: "system",
    });
    res.status(201).json(item);
  });

  app.patch("/api/checklist/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const item = await storage.getChecklistItem(Number(req.params.id));
    if (!item) return res.status(404).json({ message: "Not found" });
    if (currentUser.role === "client") {
      const ok = await clientHasFullAccess(currentUser.id, item.taskId);
      if (!ok) return res.status(403).json({ message: "Not authorized" });
    }
    const prevCompleted = item.completed;
    await storage.updateChecklistItem(Number(req.params.id), req.body.completed);
    if (Boolean(req.body.completed) !== Boolean(prevCompleted)) {
      const snippet = item.text.length > 80 ? `${item.text.slice(0, 77)}...` : item.text;
      await storage.createComment({
        taskId: item.taskId,
        authorId: currentUser.id,
        content: req.body.completed
          ? `Checklist item completed: ${snippet}`
          : `Checklist item unchecked: ${snippet}`,
        type: "system",
      });
    }
    res.json({ message: "Updated" });
  });

  app.delete("/api/checklist/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const item = await storage.getChecklistItem(Number(req.params.id));
    if (!item) return res.status(404).json({ message: "Not found" });
    if (currentUser.role === "client") {
      const ok = await clientHasFullAccess(currentUser.id, item.taskId);
      if (!ok) return res.status(403).json({ message: "Not authorized" });
    }
    const snippet = item.text.length > 80 ? `${item.text.slice(0, 77)}...` : item.text;
    await storage.deleteChecklistItem(Number(req.params.id));
    await storage.createComment({
      taskId: item.taskId,
      authorId: currentUser.id,
      content: `Checklist item removed: ${snippet}`,
      type: "system",
    });
    res.json({ message: "Deleted" });
  });

  const taskAttachmentUploadSchema = z.object({
    fileDataUrl: z.string().min(1),
    fileName: z.string().max(260).optional(),
    commentId: z.coerce.number().int().positive().optional(),
  });

  // Attachments
  app.post("/api/tasks/:taskId/attachments", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ message: "Invalid task" });
    }
    const task = await storage.getTask(taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });
    // Clients without full access cannot add attachments
    if (currentUser.role === "client") {
      const ok = await clientHasFullAccess(currentUser.id, taskId);
      if (!ok) return res.status(403).json({ message: "Not authorized" });
    }

    if (req.body?.fileDataUrl != null) {
      const parsed = taskAttachmentUploadSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid upload" });
      let resolvedCommentId: number | null = null;
      if (parsed.data.commentId != null) {
        const c = await storage.getComment(parsed.data.commentId);
        if (!c || c.taskId !== taskId) {
          return res.status(400).json({ message: "Invalid comment for this task" });
        }
        resolvedCommentId = c.id;
      }
      try {
        const { url, sizeLabel, isImage } = persistTaskAttachmentFromDataUrl(taskId, parsed.data.fileDataUrl, uploadsDir);
        const rawName = parsed.data.fileName?.trim() || path.basename(url);
        const safeName = rawName.replace(/[/\\?%*:|"<>]/g, "").slice(0, 240) || "attachment";
        const attachment = await storage.createAttachment({
          taskId,
          commentId: resolvedCommentId,
          name: safeName,
          type: isImage ? "image" : "file",
          url,
          size: sizeLabel,
        });
        if (resolvedCommentId == null) {
          await storage.createComment({
            taskId,
            authorId: currentUser.id,
            content: `Attachment added: ${safeName}`,
            type: "system",
          });
        }
        return res.status(201).json(attachment);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Upload failed";
        return res.status(400).json({ message });
      }
    }

    const attachment = await storage.createAttachment({
      taskId,
      commentId: null,
      name: String(req.body?.name || "file"),
      type: String(req.body?.type || "file"),
      url: req.body?.url,
      size: req.body?.size,
    });
    await storage.createComment({
      taskId,
      authorId: currentUser.id,
      content: `Attachment added: ${attachment.name}`,
      type: "system",
    });
    res.status(201).json(attachment);
  });

  app.delete("/api/attachments/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const attId = Number(req.params.id);
    const attachment = await storage.getAttachment(attId);
    if (!attachment) return res.status(404).json({ message: "Not found" });

    if (currentUser.role === "client") {
      if (!attachment.taskId) return res.status(403).json({ message: "Not authorized" });
      const ok = await clientHasFullAccess(currentUser.id, attachment.taskId);
      if (!ok) return res.status(403).json({ message: "Not authorized" });
    }

    const taskIdForLog = attachment.taskId;
    const attName = attachment.name;
    const isTaskLevel = attachment.commentId == null;

    await storage.deleteAttachment(attId);

    if (taskIdForLog && isTaskLevel) {
      await storage.createComment({
        taskId: taskIdForLog,
        authorId: currentUser.id,
        content: `Attachment removed: ${attName}`,
        type: "system",
      });
    }

    res.json({ message: "Deleted" });
  });

  // Comments
  app.get("/api/tasks/:taskId/comments", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const taskId = Number(req.params.taskId);
    // Clients must be members of the task's project
    if (currentUser.role === "client") {
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: "Not found" });
      const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Access denied" });
    }
    const taskComments = await storage.getComments(taskId);
    res.json(taskComments);
  });

  app.post("/api/tasks/:taskId/comments", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const taskId = Number(req.params.taskId);
    // Clients must be members of the task's project to comment
    if (currentUser.role === "client") {
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: "Not found" });
      const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Access denied" });
    }
    const comment = await storage.createComment({
      taskId,
      authorId: currentUser.id,
      content: req.body.content,
      parentId: req.body.parentId || null,
      type: req.body.type || "comment",
    });
    res.status(201).json(comment);
  });

  const patchCommentBodySchema = z.object({
    content: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1, "Content is required").max(20000)),
  });

  app.patch("/api/comments/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const commentId = Number(req.params.id);
    if (!Number.isInteger(commentId) || commentId <= 0) {
      return res.status(400).json({ message: "Invalid comment" });
    }
    const parsed = patchCommentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.flatten().formErrors.join(", ") || "Invalid body" });
    }
    const comment = await storage.getComment(commentId);
    if (!comment) return res.status(404).json({ message: "Not found" });
    if (comment.type === "system") {
      return res.status(403).json({ message: "System comments cannot be edited" });
    }
    if (Number(comment.authorId) !== Number(currentUser.id)) {
      return res.status(403).json({ message: "You can only edit your own comments" });
    }
    const task = await storage.getTask(comment.taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (currentUser.role === "client") {
      const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Access denied" });
    }
    const nextContent = parsed.data.content;
    if (comment.content === nextContent) {
      return res.json(comment);
    }
    const updated = await storage.updateComment(commentId, { content: nextContent, editedAt: new Date() });
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  });

  app.delete("/api/comments/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const commentId = Number(req.params.id);
    if (!Number.isInteger(commentId) || commentId <= 0) {
      return res.status(400).json({ message: "Invalid comment" });
    }
    const comment = await storage.getComment(commentId);
    if (!comment) return res.status(404).json({ message: "Not found" });
    if (comment.type === "system") {
      return res.status(403).json({ message: "System comments cannot be deleted" });
    }
    if (Number(comment.authorId) !== Number(currentUser.id)) {
      return res.status(403).json({ message: "You can only delete your own comments" });
    }
    const task = await storage.getTask(comment.taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (currentUser.role === "client") {
      const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Access denied" });
    }
    const subtree = await storage.getCommentSubtreePostOrder(comment.taskId, commentId);
    const attachmentRows = await storage.getAttachments(comment.taskId);
    const subtreeSet = new Set(subtree);
    for (const a of attachmentRows) {
      if (a.commentId != null && subtreeSet.has(a.commentId)) {
        safeUnlinkTaskAttachmentUrl(a.url, uploadsDir);
        await storage.deleteAttachment(a.id);
      }
    }
    await storage.deleteCommentsByIds(subtree);
    res.json({ deletedIds: subtree });
  });

  const createChannelBodySchema = z.object({
    name: z.string().min(1).max(200),
    type: z.enum(["public", "private"]),
    projectId: z.coerce.number().int().positive(),
    memberIds: z.array(z.number().int().positive()).optional().default([]),
  });

  // Channels
  app.get("/api/channels", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") {
      // Clients see no channels
      return res.json([]);
    }
    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
    const allChannels = await storage.getChannels(projectId);
    const uniqueProjectIds = [
      ...new Set(allChannels.map((c) => c.projectId).filter((id): id is number => id != null)),
    ];
    const projectMemberCountMap = new Map<number, number>();
    await Promise.all(
      uniqueProjectIds.map(async (pid) => {
        const pm = await storage.getProjectMembers(pid);
        projectMemberCountMap.set(pid, pm.length);
      }),
    );
    const channelsWithMembers = await Promise.all(
      allChannels.map(async (channel) => {
        const members = await storage.getChannelMembers(channel.id);
        const memberUsers = members.map(({ password, ...u }) => u);
        const memberCountDisplay =
          channel.type === "public" && channel.projectId != null
            ? (projectMemberCountMap.get(channel.projectId) ?? 0)
            : memberUsers.length;
        const unreadCount = await storage.getChannelUnreadCountForUser(channel.id, currentUser.id);
        return { ...channel, members: memberUsers, memberCountDisplay, unreadCount };
      }),
    );
    res.json(channelsWithMembers);
  });

  app.post("/api/channels", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") return res.status(403).json({ message: "Clients cannot create channels" });
    const parsed = createChannelBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid channel data" });
    }
    let { name, type, projectId, memberIds } = parsed.data;
    name = name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    if (!name) return res.status(400).json({ message: "Invalid channel name" });

    const myMembership = await storage.getProjectMembership(projectId, currentUser.id);
    if (!myMembership) return res.status(403).json({ message: "You are not a member of this project" });

    const channel = await storage.createChannel({
      name,
      type,
      projectId,
      createdByUserId: currentUser.id,
    });

    if (type === "private") {
      await storage.addChannelMember(channel.id, currentUser.id);
      const seen = new Set<number>([currentUser.id]);
      for (const uid of memberIds) {
        if (seen.has(uid)) continue;
        seen.add(uid);
        const theirMembership = await storage.getProjectMembership(projectId, uid);
        if (!theirMembership) continue;
        await storage.addChannelMember(channel.id, uid);
      }
    }

    res.status(201).json(channel);
  });

  async function userCanAccessChannel(userId: number, channelId: number): Promise<boolean> {
    const channel = await storage.getChannel(channelId);
    if (!channel) return false;
    const members = await storage.getChannelMembers(channelId);
    if (channel.type === "direct") {
      return members.some((m) => m.id === userId);
    }
    if (channel.type === "public" && channel.projectId != null) {
      const m = await storage.getProjectMembership(channel.projectId, userId);
      return !!m;
    }
    if (channel.type === "private") {
      if (members.length === 0 && channel.projectId != null) {
        const m = await storage.getProjectMembership(channel.projectId, userId);
        return !!m;
      }
      return members.some((m) => m.id === userId);
    }
    if (members.length > 0) {
      return members.some((m) => m.id === userId);
    }
    if (channel.projectId != null) {
      const m = await storage.getProjectMembership(channel.projectId, userId);
      return !!m;
    }
    return false;
  }

  function userCanManageChannels(req: express.Request): boolean {
    const u = req.user as { role?: string } | undefined;
    return u?.role === "admin" || u?.role === "manager";
  }

  function isChannelCreator(channel: { createdByUserId: number | null }, userId: number): boolean {
    return channel.createdByUserId != null && Number(channel.createdByUserId) === Number(userId);
  }

  const patchChannelBodySchema = z.object({
    name: z.string().min(1).max(200),
  });

  const patchChannelMembersBodySchema = z.object({
    memberIds: z.array(z.number().int().positive()),
  });

  app.patch("/api/channels/:channelId", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ message: "Invalid channel" });
    }
    const channel = await storage.getChannel(channelId);
    if (!channel) return res.status(404).json({ message: "Channel not found" });
    if (channel.type === "direct") {
      return res.status(400).json({ message: "Direct message channels cannot be edited" });
    }
    const canAccess = await userCanAccessChannel(currentUser.id, channelId);
    if (!canAccess) return res.status(403).json({ message: "Access denied" });
    const canEdit = userCanManageChannels(req) || isChannelCreator(channel, currentUser.id);
    if (!canEdit) {
      return res.status(403).json({ message: "Only the channel creator or an admin/manager can edit this channel" });
    }

    const parsed = patchChannelBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid body" });
    let { name } = parsed.data;
    name = name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    if (!name) return res.status(400).json({ message: "Invalid channel name" });

    const updated = await storage.updateChannel(channelId, { name });
    res.json(updated);
  });

  app.post("/api/channels/:channelId/read", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ message: "Invalid channel" });
    }
    const ok = await userCanAccessChannel(currentUser.id, channelId);
    if (!ok) return res.status(403).json({ message: "Access denied" });
    await storage.markChannelReadForUser(channelId, currentUser.id);
    res.json({ ok: true });
  });

  app.delete("/api/channels/:channelId", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ message: "Invalid channel" });
    }
    const channel = await storage.getChannel(channelId);
    if (!channel) return res.status(404).json({ message: "Channel not found" });
    if (channel.type === "direct") {
      return res.status(400).json({ message: "Direct message threads cannot be deleted" });
    }
    const canAccess = await userCanAccessChannel(currentUser.id, channelId);
    if (!canAccess) return res.status(403).json({ message: "Access denied" });
    const canDelete = userCanManageChannels(req) || isChannelCreator(channel, currentUser.id);
    if (!canDelete) {
      return res.status(403).json({
        message: "Only the channel creator or an admin/manager can delete this channel",
      });
    }
    await storage.deleteChannel(channelId);
    res.status(204).end();
  });

  app.patch("/api/channels/:channelId/members", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ message: "Invalid channel" });
    }
    const channel = await storage.getChannel(channelId);
    if (!channel) return res.status(404).json({ message: "Channel not found" });
    if (channel.type !== "private") {
      return res.status(400).json({ message: "Only private channels have a member list to edit" });
    }
    if (channel.projectId == null) {
      return res.status(400).json({ message: "Channel has no project" });
    }
    const canAccess = await userCanAccessChannel(currentUser.id, channelId);
    if (!canAccess) return res.status(403).json({ message: "Access denied" });
    const canEditMembers = userCanManageChannels(req) || isChannelCreator(channel, currentUser.id);
    if (!canEditMembers) {
      return res.status(403).json({
        message: "Only the channel creator or an admin/manager can edit channel members",
      });
    }

    const parsed = patchChannelMembersBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid body" });

    const projectId = channel.projectId;
    const withEditor = [...new Set([...parsed.data.memberIds, currentUser.id])];
    for (const uid of withEditor) {
      const m = await storage.getProjectMembership(projectId, uid);
      if (!m) {
        return res.status(400).json({ message: `User ${uid} is not a member of this project` });
      }
    }

    await storage.replaceChannelMembers(channelId, withEditor);
    res.json({ ok: true });
  });

  // Messages
  app.get("/api/channels/:channelId/messages", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ message: "Invalid channel" });
    }
    const ok = await userCanAccessChannel(currentUser.id, channelId);
    if (!ok) return res.status(403).json({ message: "Access denied" });
    const channelMessages = await storage.getMessages(channelId);
    res.json(channelMessages);
  });

  app.post("/api/channels/:channelId/messages", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ message: "Invalid channel" });
    }
    const ok = await userCanAccessChannel(currentUser.id, channelId);
    if (!ok) return res.status(403).json({ message: "Access denied" });
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!content) return res.status(400).json({ message: "Message content is required" });
    const message = await storage.createMessage({
      channelId,
      authorId: currentUser.id,
      content,
    });
    notifyChannelMessages(channelId);
    res.status(201).json(message);
  });

  const chatUploadSchema = z.object({
    fileDataUrl: z.string().min(1),
  });

  app.post("/api/channels/:channelId/chat-upload", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const channelId = Number(req.params.channelId);
    if (!Number.isInteger(channelId) || channelId <= 0) {
      return res.status(400).json({ message: "Invalid channel" });
    }
    const ok = await userCanAccessChannel(currentUser.id, channelId);
    if (!ok) return res.status(403).json({ message: "Access denied" });
    const parsed = chatUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid body" });
    }
    try {
      const url = persistChatUploadFromDataUrl(channelId, parsed.data.fileDataUrl, uploadsDir);
      res.status(201).json({ url });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Upload failed";
      return res.status(400).json({ message });
    }
  });

  app.post("/api/projects/:id/task-description-upload", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project" });
    }
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    let membership = await storage.getProjectMembership(projectId, currentUser.id);
    if (!membership && currentUser.role === "admin") {
      await storage.addProjectMember(projectId, currentUser.id);
      membership = await storage.getProjectMembership(projectId, currentUser.id);
    }
    if (!membership) return res.status(403).json({ message: "Access denied" });
    const parsed = chatUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid body" });
    }
    try {
      const url = persistProjectTaskDescriptionUploadFromDataUrl(projectId, parsed.data.fileDataUrl, uploadsDir);
      res.status(201).json({ url });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Upload failed";
      return res.status(400).json({ message });
    }
  });

  // Time Entries
  app.post("/api/tasks/:taskId/time-entries", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const taskId = Number(req.params.taskId);
    if (currentUser.role === "client") {
      // Only full-access clients can log time
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });
      const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!membership || membership.clientTaskAccess !== "full") {
        return res.status(403).json({ message: "Clients cannot log time" });
      }
    }
    const userId = currentUser.id;
    const { hours, description, logDate, clientVisible } = req.body;
    if (!hours || !logDate) return res.status(400).json({ message: "hours and logDate are required" });
    const descStr = description != null && String(description).trim() !== "" ? String(description) : null;
    const csTaskTime = await storage.getCompanySettings();
    const minWordsTask =
      csTaskTime.timeLogMinDescriptionWords == null ? 10 : Number(csTaskTime.timeLogMinDescriptionWords);
    if (minWordsTask > 0 && !timeLogNoteMeetsMinWords(descStr, minWordsTask)) {
      return res.status(400).json({
        message: `Time log work description must be at least ${minWordsTask} words (work type label does not count).`,
      });
    }
    const entry = await storage.createTimeEntry({
      taskId, userId, hours: String(hours), description: descStr, logDate,
      clientVisible: clientVisible !== undefined ? clientVisible : true,
    });
    const hrs = String(hours);
    const dateLabel = formatTaskDateForLog(logDate);
    const descRaw = descStr != null ? descStr.trim() : "";
    const descShort = descRaw.length > 80 ? `${descRaw.slice(0, 77)}...` : descRaw;
    await storage.createComment({
      taskId,
      authorId: currentUser.id,
      content: descShort
        ? `Time logged: ${hrs}h on ${dateLabel} — ${descShort}`
        : `Time logged: ${hrs}h on ${dateLabel}.`,
      type: "system",
    });
    res.status(201).json(entry);
  });

  app.get("/api/tasks/:taskId/time-entries", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const taskId = Number(req.params.taskId);
    if (currentUser.role === "client") {
      // Verify client is a member of the task's project
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });
      const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Access denied" });
      if (!membership.clientShowTimecards) return res.json([]);
      const entries = await storage.getTimeEntriesByTask(taskId);
      return res.json(entries.filter(e => e.clientVisible !== false));
    }
    const entries = await storage.getTimeEntriesByTask(taskId);
    res.json(entries);
  });

  app.delete("/api/time-entries/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const entry = await storage.getTimeEntry(Number(req.params.id));
    if (!entry) return res.status(404).json({ message: "Time entry not found" });
    if (currentUser.role === "client") {
      // Only full-access clients can delete their own time entries
      const task = await storage.getTask(entry.taskId);
      if (!task) return res.status(404).json({ message: "Task not found" });
      const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!membership || membership.clientTaskAccess !== "full") {
        return res.status(403).json({ message: "Clients cannot delete time entries" });
      }
      if (entry.userId !== currentUser.id) {
        return res.status(403).json({ message: "Not authorized to delete this entry" });
      }
    } else {
      const canDelete = entry.userId === currentUser.id || currentUser.role === "admin" || currentUser.role === "manager";
      if (!canDelete) return res.status(403).json({ message: "Not authorized to delete this entry" });
    }
    const taskIdLog = entry.taskId;
    const hoursLog = String(entry.hours);
    const logDateLabel = formatTaskDateForLog(entry.logDate);
    await storage.deleteTimeEntry(Number(req.params.id));
    await storage.createComment({
      taskId: taskIdLog,
      authorId: currentUser.id,
      content: `Time entry removed: ${hoursLog}h on ${logDateLabel}.`,
      type: "system",
    });
    res.json({ message: "Deleted" });
  });

  app.get("/api/time-entries", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const isClient = currentUser.role === "client";
    const isManagerOrAdmin = currentUser.role === "admin" || currentUser.role === "manager";

    if (isClient) {
      // Client: only return entries from projects where they have clientShowTimecards = true, and only clientVisible entries
      // Fetch all memberships in one query (avoid N+1 per project)
      const memberships = await storage.getUserMemberships(currentUser.id);
      const allowedProjectIds: number[] = memberships
        .filter(m => m.clientShowTimecards)
        .map(m => m.projectId);

      if (allowedProjectIds.length === 0) {
        return res.json([]);
      }

      const filters: any = {
        clientVisibleOnly: true,
        clientProjectIds: allowedProjectIds,
      };
      if (req.query.projectId) {
        const pid = Number(req.query.projectId);
        if (!allowedProjectIds.includes(pid)) return res.json([]);
        filters.projectId = pid;
      }

      const entries = await storage.getAllTimeEntries(filters);
      return res.json(entries);
    }

    const filters: { userId?: number; projectId?: number; startDate?: string; endDate?: string } = {};
    if (req.query.projectId) filters.projectId = Number(req.query.projectId);
    if (req.query.startDate) filters.startDate = String(req.query.startDate);
    if (req.query.endDate) filters.endDate = String(req.query.endDate);
    if (isManagerOrAdmin) {
      if (req.query.userId) filters.userId = Number(req.query.userId);
    } else {
      filters.userId = currentUser.id;
    }
    const entries = await storage.getAllTimeEntries(filters);
    res.json(entries);
  });

  app.post("/api/time-entries", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") return res.status(403).json({ message: "Clients cannot log time" });
    const userId = currentUser.id;
    const { taskId, hours, description, logDate, clientVisible } = req.body;
    if (!taskId || !hours || !logDate) return res.status(400).json({ message: "taskId, hours and logDate are required" });
    const task = await storage.getTask(Number(taskId));
    if (!task) return res.status(404).json({ message: "Task not found" });
    const tid = Number(taskId);
    const descStrGlobal = description != null && String(description).trim() !== "" ? String(description) : null;
    const csGlobalTime = await storage.getCompanySettings();
    const minWordsGlobal =
      csGlobalTime.timeLogMinDescriptionWords == null ? 10 : Number(csGlobalTime.timeLogMinDescriptionWords);
    if (minWordsGlobal > 0 && !timeLogNoteMeetsMinWords(descStrGlobal, minWordsGlobal)) {
      return res.status(400).json({
        message: `Time log work description must be at least ${minWordsGlobal} words (work type label does not count).`,
      });
    }
    const entry = await storage.createTimeEntry({
      taskId: tid, userId, hours: String(hours), description: descStrGlobal, logDate,
      clientVisible: clientVisible !== undefined ? clientVisible : true,
    });
    const hrs = String(hours);
    const dateLabel = formatTaskDateForLog(logDate);
    const descRaw = descStrGlobal != null ? descStrGlobal.trim() : "";
    const descShort = descRaw.length > 80 ? `${descRaw.slice(0, 77)}...` : descRaw;
    await storage.createComment({
      taskId: tid,
      authorId: currentUser.id,
      content: descShort
        ? `Time logged: ${hrs}h on ${dateLabel} — ${descShort}`
        : `Time logged: ${hrs}h on ${dateLabel}.`,
      type: "system",
    });
    res.status(201).json(entry);
  });

  return httpServer;
}
