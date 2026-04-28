import express, { type Express } from "express";
import { createServer, type Server } from "http";
import crypto from "node:crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { notifyChannelMessages, notifyUsersCall, notifyUsersInviteCleared } from "./realtime";
import { publishCallInvites, peekInvite, dismissInvite, clearInvitesForChannel } from "./callInvites";
import { storage } from "./storage";
import { sendEmail } from "./email";
import { buildClientNewTaskEmail, buildClientReopenTaskEmail } from "./emailTemplates";
import { decryptProjectSecret, encryptProjectSecret } from "./projectSecrets";
import { setupAuth, requireAuth } from "./auth";
import {
  registerMicrosoftAuth,
  clearMicrosoftOidcCache,
  ms365ClientSecretFromEnv,
  ms365FullyConfigured,
  getPublicAppUrl,
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
import type { Project } from "@shared/schema";

/**
 * VoiceLink integration — session-token third-party API.
 *
 *  - VOICELINK_CLIENT_URL — Origin used in the join URL returned to the browser (iframe).
 *    Default: https://voicelink.vnnovate.net
 *  - VOICELINK_INTERNAL_API — Base URL PMS uses **on the server** to POST /api/sessions/token.
 *    Default: same as VOICELINK_CLIENT_URL (works when VoiceLink is only reachable via the public host).
 *    Set explicitly to http://127.0.0.1:5001 (or similar) only when VoiceLink listens on loopback on this machine.
 *  - VOICELINK_API_KEY — required; must match an API key in VoiceLink.
 */
const VL_HOST = (process.env.VOICELINK_CLIENT_URL || "https://voicelink.vnnovate.net").replace(/\/$/, "");
const VL_API = (process.env.VOICELINK_INTERNAL_API || VL_HOST).replace(/\/$/, "");

// ── Privacy helpers ─────────────────────────────────────────────────────────
// Requirement: employees/managers must never see client emails in any API.
function sanitizeUserForViewer(
  viewer: { id: number; role?: string } | undefined,
  user: any,
): any {
  if (!user) return user;
  const viewerRole = viewer?.role ?? "";
  const isAdminViewer = viewerRole === "admin";
  const isSelf = viewer != null && Number(viewer.id) === Number(user.id);
  const isClientTarget = user?.role === "client";
  if (!isAdminViewer && !isSelf && isClientTarget) {
    // Keep shape stable; just remove email for non-admin viewers.
    return { ...user, email: null };
  }
  return user;
}

function sanitizeUsersForViewer(viewer: { id: number; role?: string } | undefined, users: any[]): any[] {
  return users.map((u) => sanitizeUserForViewer(viewer, u));
}

/** Closed projects are hidden from normal API use; admins manage them via /api/admin/projects. */
async function requireOpenProjectForApi(res: express.Response, projectId: number): Promise<Project | null> {
  const project = await storage.getProject(projectId);
  if (!project) {
    res.status(404).json({ message: "Project not found" });
    return null;
  }
  if (project.closedAt != null) {
    res.status(404).json({ message: "Project not found" });
    return null;
  }
  return project;
}

function parsePositiveTimeEntryHours(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(",", "."));
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

/** Company cap from DB row; null or non-positive = no limit. */
function companyTimeLogMaxHoursPerEntry(
  maxFromDb: string | number | null | undefined,
): number | null {
  if (maxFromDb == null || maxFromDb === "") return null;
  const n = Number(maxFromDb);
  if (Number.isNaN(n) || n <= 0) return null;
  return n;
}

/** Returns an error message when hours exceed the cap (or are invalid if a cap exists); null if OK. */
function timeEntryHoursExceedsCompanyMax(
  hoursRaw: unknown,
  maxFromDb: string | number | null | undefined,
): string | null {
  const cap = companyTimeLogMaxHoursPerEntry(maxFromDb);
  if (cap == null) return null;
  const hrs = parsePositiveTimeEntryHours(hoursRaw);
  if (hrs == null) return "Invalid hours value";
  if (hrs > cap + 1e-9) {
    const label = Number.isInteger(cap) ? String(cap) : cap.toFixed(2).replace(/\.?0+$/, "");
    return `Each time entry cannot exceed ${label} hours. Split your time across multiple entries.`;
  }
  return null;
}

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

const CREDENTIAL_VISIBILITY_MODES = ["project_members", "roles", "users"] as const;
const CREDENTIAL_TYPES = ["api_token", "db", "ssh", "git_pat", "other"] as const;
const WORKSPACE_ROLES = ["admin", "manager", "employee", "client"] as const;
type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
type CredentialVisibilityMode = (typeof CREDENTIAL_VISIBILITY_MODES)[number];

function sanitizeRoleList(input: unknown): WorkspaceRole[] {
  if (!Array.isArray(input)) return [];
  const set = new Set<WorkspaceRole>();
  for (const r of input) {
    if (typeof r === "string" && (WORKSPACE_ROLES as readonly string[]).includes(r)) {
      set.add(r as WorkspaceRole);
    }
  }
  return Array.from(set);
}

function sanitizeUserIdList(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<number>();
  for (const id of input) {
    const n = Number(id);
    if (Number.isInteger(n) && n > 0) out.add(n);
  }
  return Array.from(out);
}

function safeParseJsonObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function canManageProjectSettings(
  currentUser: { id: number; role?: string },
  project: Project,
): boolean {
  const role = currentUser.role ?? "";
  if (role === "admin" || role === "manager") return true;
  return project.ownerId != null && Number(project.ownerId) === Number(currentUser.id);
}

function canRevealCredential(
  currentUser: { id: number; role?: string },
  project: Project,
  credential: {
    visibilityMode: string;
    visibilityRoles: string[] | null;
    visibilityUserIds: number[] | null;
  },
): boolean {
  const role = currentUser.role ?? "";
  if (role === "admin") return true;
  if (project.ownerId != null && Number(project.ownerId) === Number(currentUser.id)) return true;
  if (role === "client") return false;
  const mode = credential.visibilityMode as CredentialVisibilityMode;
  if (mode === "project_members") return true;
  if (mode === "roles") {
    const roles = credential.visibilityRoles ?? [];
    return roles.includes(role);
  }
  if (mode === "users") {
    const ids = credential.visibilityUserIds ?? [];
    return ids.includes(Number(currentUser.id));
  }
  return false;
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

function persistProjectDocumentFromDataUrl(projectId: number, dataUrl: string, uploadsDir: string): { url: string; sizeLabel: string } {
  const trimmed = dataUrl.trim();
  const m = /^data:(image\/(?:png|jpeg|jpg|webp)|application\/pdf|text\/plain);base64,([\s\S]+)$/i.exec(trimmed);
  if (!m) throw new Error("File must be PNG, JPEG, WebP, PDF, or TXT.");
  const buf = Buffer.from(m[2]!.replace(/\s/g, ""), "base64");
  if (buf.length > MAX_TASK_ATTACHMENT_BYTES) throw new Error("File must be 8MB or smaller.");
  const mime = m[1]!.toLowerCase();
  const ext =
    mime.includes("jpeg") || mime.includes("jpg")
      ? "jpg"
      : mime === "image/webp"
        ? "webp"
        : mime === "text/plain"
          ? "txt"
          : mime.includes("pdf")
            ? "pdf"
            : "png";
  const filename = `projectdoc-${projectId}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buf);
  return {
    url: `/uploads/${filename}`,
    sizeLabel: `${(buf.length / 1024).toFixed(1)} KB`,
  };
}

function safeUnlinkProjectDocumentUrl(url: string | null | undefined, uploadsDir: string) {
  if (!url?.startsWith("/uploads/")) return;
  const base = path.basename(url);
  if (!/^projectdoc-\d+-[a-f0-9]{16}\.(png|jpe?g|webp|pdf|txt)$/i.test(base)) return;
  const full = path.join(uploadsDir, base);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    /* ignore */
  }
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

  const putProjectSidebarPrefsSchema = z
    .object({
      orderedProjectIds: z.array(z.number().int().positive()).optional(),
      /** null = show all projects on the collapsed quick menu */
      quickMenuProjectIds: z.union([z.array(z.number().int().positive()), z.null()]).optional(),
    })
    .refine((d) => d.orderedProjectIds !== undefined || d.quickMenuProjectIds !== undefined, {
      message: "Provide orderedProjectIds and/or quickMenuProjectIds",
    });

  app.put("/api/auth/me/project-sidebar-order", requireAuth, async (req, res) => {
    const parsed = putProjectSidebarPrefsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid body" });
    }
    const current = req.user as Express.User;
    const allowedIds =
      current.role === "admin"
        ? new Set((await storage.getProjects()).map((p) => p.id))
        : new Set((await storage.getUserProjects(current.id)).map((p) => p.id));

    const updates: {
      projectSidebarOrder?: number[];
      projectQuickMenuIds?: number[] | null;
    } = {};

    if (parsed.data.orderedProjectIds !== undefined) {
      const incoming = parsed.data.orderedProjectIds;
      if (incoming.length !== allowedIds.size) {
        return res.status(400).json({ message: "Order must include each visible project exactly once" });
      }
      const seen = new Set<number>();
      for (const id of incoming) {
        if (!allowedIds.has(id) || seen.has(id)) {
          return res.status(400).json({ message: "Invalid or duplicate project id in order" });
        }
        seen.add(id);
      }
      updates.projectSidebarOrder = incoming;
    }

    if (parsed.data.quickMenuProjectIds !== undefined) {
      const q = parsed.data.quickMenuProjectIds;
      if (q === null) {
        updates.projectQuickMenuIds = null;
      } else {
        const seenQ = new Set<number>();
        for (const id of q) {
          if (!allowedIds.has(id)) {
            return res.status(400).json({ message: "Quick menu contains a project you cannot access" });
          }
          if (seenQ.has(id)) {
            return res.status(400).json({ message: "Duplicate project id in quick menu" });
          }
          seenQ.add(id);
        }
        updates.projectQuickMenuIds = q;
      }
    }

    const updated = await storage.updateUser(current.id, updates);
    if (!updated) return res.status(404).json({ message: "User not found" });
    const { password, ...safe } = updated;
    res.json(safe);
  });

  const workflowTaskStatusSchema = z.enum(["todo", "in-progress", "review", "done"]);

  const companyPatchSchema = z.object({
    companyName: z.string().min(1, "Company name is required").max(200).optional(),
    /** Shown in the browser tab; empty string clears to app default */
    browserTitle: z.string().max(200).optional(),
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
    /** null or 0 = no cap; otherwise max hours per single time entry (0.25–24) */
    timeLogMaxHoursPerEntry: z
      .union([z.coerce.number().min(0.25).max(24), z.literal(0), z.null()])
      .optional(),
    timecardDateDisplayFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]).optional(),
    timecardSummaryRecipientEmails: z.array(z.string().email()).max(50).optional(),
    /** IANA zone for timecard crons, e.g. Asia/Kolkata; empty string clears to server default */
    emailDigestTimezone: z.union([z.string().max(80), z.literal("")]).optional(),
  });

  app.get("/api/company-settings", requireAuth, async (_req, res) => {
    const row = await storage.getCompanySettings();
    res.json({
      companyName: row.companyName || "",
      browserTitle: row.browserTitle?.trim() ?? "",
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
      timeLogMaxHoursPerEntry: companyTimeLogMaxHoursPerEntry(row.timeLogMaxHoursPerEntry),
      timecardDateDisplayFormat: row.timecardDateDisplayFormat ?? "DD/MM/YYYY",
      timecardSummaryRecipientEmails: Array.isArray(row.timecardSummaryRecipientEmails)
        ? row.timecardSummaryRecipientEmails
        : [],
      emailDigestTimezone: row.emailDigestTimezone?.trim() ?? "",
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
      body.browserTitle === undefined &&
      body.workspaceSlug === undefined &&
      body.logoDataUrl === undefined &&
      body.ms365Enabled === undefined &&
      body.ms365TenantId === undefined &&
      body.ms365ClientId === undefined &&
      body.ms365AllowedDomains === undefined &&
      body.ms365ClientSecret === undefined &&
      body.taskMarkCompleteStatus === undefined &&
      body.taskClientReopenStatus === undefined &&
      body.timeLogMinDescriptionWords === undefined &&
      body.timeLogMaxHoursPerEntry === undefined &&
      body.timecardDateDisplayFormat === undefined &&
      body.timecardSummaryRecipientEmails === undefined &&
      body.emailDigestTimezone === undefined
    ) {
      return res.status(400).json({ message: "No changes provided" });
    }

    const current = await storage.getCompanySettings();
    const updates: {
      companyName?: string;
      browserTitle?: string | null;
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
      timeLogMaxHoursPerEntry?: string | null;
      timecardDateDisplayFormat?: string;
      timecardSummaryRecipientEmails?: string[];
      emailDigestTimezone?: string | null;
    } = {};

    if (body.companyName !== undefined) updates.companyName = body.companyName;
    if (body.browserTitle !== undefined) {
      updates.browserTitle = body.browserTitle.trim() === "" ? null : body.browserTitle.trim();
    }
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
    if (body.timeLogMaxHoursPerEntry !== undefined) {
      updates.timeLogMaxHoursPerEntry =
        body.timeLogMaxHoursPerEntry === null || body.timeLogMaxHoursPerEntry === 0
          ? null
          : String(body.timeLogMaxHoursPerEntry);
    }
    if (body.timecardDateDisplayFormat !== undefined) {
      updates.timecardDateDisplayFormat = body.timecardDateDisplayFormat;
    }
    if (body.timecardSummaryRecipientEmails !== undefined) {
      updates.timecardSummaryRecipientEmails = body.timecardSummaryRecipientEmails;
    }
    if (body.emailDigestTimezone !== undefined) {
      updates.emailDigestTimezone = body.emailDigestTimezone.trim() === "" ? null : body.emailDigestTimezone.trim();
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
      browserTitle: updated.browserTitle?.trim() ?? "",
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
      timeLogMaxHoursPerEntry: companyTimeLogMaxHoursPerEntry(updated.timeLogMaxHoursPerEntry),
      timecardDateDisplayFormat: updated.timecardDateDisplayFormat ?? "DD/MM/YYYY",
      timecardSummaryRecipientEmails: Array.isArray(updated.timecardSummaryRecipientEmails)
        ? updated.timecardSummaryRecipientEmails
        : [],
      emailDigestTimezone: updated.emailDigestTimezone?.trim() ?? "",
    });
  });

  // Users
  app.get("/api/users", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const allUsers = await storage.getAllUsers();
    const safe = allUsers.map(({ password, ...u }) => u);
    res.json(sanitizeUsersForViewer(currentUser, safe));
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
    if (currentUser.role === "admin") {
      const allProjects = await storage.getProjects();
      return res.json(allProjects);
    }
    const userProjects = await storage.getUserProjects(currentUser.id);
    res.json(userProjects);
  });

  app.get("/api/admin/projects", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const all = await storage.getProjects({ includeClosed: true });
    res.json(all);
  });

  const closeProjectBodySchema = z.object({
    closureDescription: z.string().min(1).max(10_000),
    paymentReceived: z.boolean(),
  });

  app.post("/api/admin/projects/:id/close", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project id" });
    }
    const parsed = closeProjectBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid body" });
    }
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (project.closedAt != null) {
      return res.status(400).json({ message: "Project is already closed" });
    }
    const updated = await storage.updateProject(projectId, {
      closedAt: new Date(),
      closureDescription: parsed.data.closureDescription.trim(),
      closurePaymentReceived: parsed.data.paymentReceived,
    });
    res.json(updated);
  });

  app.post("/api/admin/projects/:id/reopen", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project id" });
    }
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (project.closedAt == null) {
      return res.status(400).json({ message: "Project is not closed" });
    }
    const updated = await storage.updateProject(projectId, {
      closedAt: null,
      closureDescription: null,
      closurePaymentReceived: false,
    });
    res.json(updated);
  });

  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    const project = await requireOpenProjectForApi(res, projectId);
    if (!project) return;
    if (currentUser.role !== "admin") {
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
    { id: "todo", title: "To Do", color: "bg-red-500" },
    { id: "in-progress", title: "In Progress", color: "bg-blue-500" },
    { id: "review", title: "Review", color: "bg-yellow-500" },
    { id: "done", title: "Done", color: "bg-green-500" },
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
    if (projectRecord.closedAt != null && currentUser.role !== "admin") {
      return res.status(404).json({ message: "Project not found" });
    }

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

  // Transfer project ownership (admin only).
  app.post("/api/projects/:id/transfer-owner", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role !== "admin") {
      return res.status(403).json({ message: "Only admins can transfer project ownership" });
    }
    const projectId = Number(req.params.id);
    const newOwnerId = Number(req.body?.newOwnerId);
    if (!Number.isInteger(projectId) || projectId <= 0) return res.status(400).json({ message: "Invalid project id" });
    if (!Number.isInteger(newOwnerId) || newOwnerId <= 0) return res.status(400).json({ message: "Invalid newOwnerId" });
    const project = await requireOpenProjectForApi(res, projectId);
    if (!project) return;
    const newOwnerUser = await storage.getUser(newOwnerId);
    if (!newOwnerUser) return res.status(404).json({ message: "User not found" });
    await storage.addProjectMember(projectId, newOwnerId);
    const updated = await storage.updateProject(projectId, { ownerId: newOwnerId });
    if (!updated) return res.status(404).json({ message: "Project not found" });
    res.json({ message: "Owner updated", ownerId: newOwnerId });
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
    const project = await requireOpenProjectForApi(res, projectId);
    if (!project) return;
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
    const open = await requireOpenProjectForApi(res, projectId);
    if (!open) return;
    if (currentUser.role !== "admin") {
      const membership = await storage.getProjectMembership(projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Access denied" });
    }
    const projectRow = open;
    const ownerId = projectRow?.ownerId ?? null;
    const members = await storage.getProjectMembersWithSettings(projectId);
    res.json(
      members.map(({ password, ...u }) => {
        const sanitized = sanitizeUserForViewer(currentUser, u);
        return {
        ...sanitized,
        isProjectOwner: ownerId != null && Number(u.id) === Number(ownerId),
        };
      }),
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
    const projectRecord = await requireOpenProjectForApi(res, projectId);
    if (!projectRecord) return;
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
    const projectRecord = await requireOpenProjectForApi(res, projectId);
    if (!projectRecord) return;

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

    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    // Managers/employees/project owners must never remove an admin from project access.
    if (targetUser.role === "admin" && !isAdmin) {
      return res.status(403).json({ message: "Only an admin can remove another admin from a project" });
    }

    const isRemovingOwner = projectRecord.ownerId != null && Number(projectRecord.ownerId) === targetUserId;
    if (isRemovingOwner) {
      // Only admins can remove the project owner; must transfer ownership first.
      if (!isAdmin) {
        return res.status(403).json({ message: "Only an admin can remove the project owner" });
      }

      const requestedNewOwnerIdRaw = (req.body as any)?.newOwnerId;
      const requestedNewOwnerId = Number(requestedNewOwnerIdRaw);
      const newOwnerId =
        Number.isInteger(requestedNewOwnerId) && requestedNewOwnerId > 0 ? requestedNewOwnerId : Number(currentUser.id);

      if (!Number.isInteger(newOwnerId) || newOwnerId <= 0) {
        return res.status(400).json({ message: "Invalid newOwnerId" });
      }
      if (Number(newOwnerId) === Number(targetUserId)) {
        return res.status(400).json({ message: "newOwnerId must be different from the current owner" });
      }

      const newOwnerUser = await storage.getUser(newOwnerId);
      if (!newOwnerUser) return res.status(404).json({ message: "New owner user not found" });

      // Ensure new owner is a member.
      await storage.addProjectMember(projectId, newOwnerId);

      const updated = await storage.updateProject(projectId, { ownerId: newOwnerId });
      if (!updated) return res.status(404).json({ message: "Project not found" });

      await storage.removeProjectMember(projectId, targetUserId);
      return res.json({ message: "Owner removed; ownership transferred", newOwnerId });
    }

    await storage.removeProjectMember(projectId, targetUserId);
    res.json({ message: "Member removed" });
  });

  // Get caller's permissions for a project
  app.get("/api/projects/:id/my-permissions", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    const open = await requireOpenProjectForApi(res, projectId);
    if (!open) return;
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

  const projectSettingsBodySchema = z.object({
    settings: z.record(z.string(), z.unknown()),
  });

  const credentialBodySchema = z.object({
    name: z.string().min(1).max(200),
    type: z.enum(CREDENTIAL_TYPES).default("other"),
    secret: z.string().min(1).max(50_000),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
    visibilityMode: z.enum(CREDENTIAL_VISIBILITY_MODES).default("roles"),
    visibilityRoles: z.array(z.enum(WORKSPACE_ROLES)).optional().default(["admin", "manager"]),
    visibilityUserIds: z.array(z.number().int().positive()).optional().default([]),
  });

  const credentialPatchBodySchema = z.object({
    name: z.string().min(1).max(200).optional(),
    type: z.enum(CREDENTIAL_TYPES).optional(),
    secret: z.string().min(1).max(50_000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    visibilityMode: z.enum(CREDENTIAL_VISIBILITY_MODES).optional(),
    visibilityRoles: z.array(z.enum(WORKSPACE_ROLES)).optional(),
    visibilityUserIds: z.array(z.number().int().positive()).optional(),
  });

  const projectDocumentUploadSchema = z.object({
    fileDataUrl: z.string().min(1),
    name: z.string().min(1).max(240).optional(),
  });

  async function ensureProjectMemberAccess(
    currentUser: { id: number; role?: string },
    projectId: number,
  ): Promise<{ ok: true; project: Project; membershipExists: boolean } | { ok: false; code: number; message: string }> {
    const project = await storage.getProject(projectId);
    if (!project || project.closedAt != null) return { ok: false, code: 404, message: "Project not found" };
    let membership = await storage.getProjectMembership(projectId, currentUser.id);
    if (!membership && currentUser.role === "admin") {
      await storage.addProjectMember(projectId, currentUser.id);
      membership = await storage.getProjectMembership(projectId, currentUser.id);
    }
    if (!membership && currentUser.role !== "admin") return { ok: false, code: 403, message: "Access denied" };
    return { ok: true, project, membershipExists: !!membership };
  }

  app.get("/api/projects/:id/settings", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) return res.status(400).json({ message: "Invalid project id" });
    const access = await ensureProjectMemberAccess(currentUser, projectId);
    if (!access.ok) return res.status(access.code).json({ message: access.message });
    const row = await storage.getProjectSettings(projectId);
    res.json({
      projectId,
      settings: safeParseJsonObject(row?.settings),
      updatedAt: row?.updatedAt ?? null,
      updatedByUserId: row?.updatedByUserId ?? null,
    });
  });

  app.put("/api/projects/:id/settings", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) return res.status(400).json({ message: "Invalid project id" });
    const parsed = projectSettingsBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid body" });
    const access = await ensureProjectMemberAccess(currentUser, projectId);
    if (!access.ok) return res.status(access.code).json({ message: access.message });
    if (!canManageProjectSettings(currentUser, access.project)) {
      return res.status(403).json({ message: "Only owner/admin/manager can edit project settings" });
    }
    const saved = await storage.upsertProjectSettings(projectId, safeParseJsonObject(parsed.data.settings), currentUser.id);
    res.json(saved);
  });

  app.get("/api/projects/:id/credentials", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) return res.status(400).json({ message: "Invalid project id" });
    const access = await ensureProjectMemberAccess(currentUser, projectId);
    if (!access.ok) return res.status(access.code).json({ message: access.message });
    const rows = await storage.getProjectCredentials(projectId);
    const out = rows
      .filter((r) => canRevealCredential(currentUser, access.project, r))
      .map((r) => ({
        id: r.id,
        projectId: r.projectId,
        name: r.name,
        type: r.type,
        metadata: safeParseJsonObject(r.metadata),
        visibilityMode: r.visibilityMode,
        visibilityRoles: r.visibilityRoles ?? [],
        visibilityUserIds: r.visibilityUserIds ?? [],
        createdAt: r.createdAt,
        createdByUserId: r.createdByUserId,
        updatedAt: r.updatedAt,
        updatedByUserId: r.updatedByUserId,
        hasSecret: true,
        maskedSecret: "********",
      }));
    res.json(out);
  });

  app.post("/api/projects/:id/credentials", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) return res.status(400).json({ message: "Invalid project id" });
    const parsed = credentialBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid body" });
    const access = await ensureProjectMemberAccess(currentUser, projectId);
    if (!access.ok) return res.status(access.code).json({ message: access.message });
    if (!canManageProjectSettings(currentUser, access.project)) {
      return res.status(403).json({ message: "Only owner/admin/manager can create credentials" });
    }
    const encrypted = encryptProjectSecret(parsed.data.secret);
    const created = await storage.createProjectCredential({
      projectId,
      name: parsed.data.name.trim(),
      type: parsed.data.type,
      metadata: safeParseJsonObject(parsed.data.metadata),
      secretCiphertext: encrypted.ciphertext,
      secretIv: encrypted.iv,
      secretAuthTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      visibilityMode: parsed.data.visibilityMode,
      visibilityRoles: sanitizeRoleList(parsed.data.visibilityRoles),
      visibilityUserIds: sanitizeUserIdList(parsed.data.visibilityUserIds),
      createdByUserId: currentUser.id,
      updatedByUserId: currentUser.id,
    });
    res.status(201).json({
      id: created.id,
      projectId: created.projectId,
      name: created.name,
      type: created.type,
      metadata: safeParseJsonObject(created.metadata),
      visibilityMode: created.visibilityMode,
      visibilityRoles: created.visibilityRoles ?? [],
      visibilityUserIds: created.visibilityUserIds ?? [],
      hasSecret: true,
      maskedSecret: "********",
      createdAt: created.createdAt,
      createdByUserId: created.createdByUserId,
      updatedAt: created.updatedAt,
      updatedByUserId: created.updatedByUserId,
    });
  });

  app.patch("/api/projects/:id/credentials/:credId", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    const credId = Number(req.params.credId);
    if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(credId) || credId <= 0) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const parsed = credentialPatchBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid body" });
    const access = await ensureProjectMemberAccess(currentUser, projectId);
    if (!access.ok) return res.status(access.code).json({ message: access.message });
    if (!canManageProjectSettings(currentUser, access.project)) {
      return res.status(403).json({ message: "Only owner/admin/manager can edit credentials" });
    }
    const existing = await storage.getProjectCredential(credId);
    if (!existing || existing.projectId !== projectId || existing.deletedAt) {
      return res.status(404).json({ message: "Credential not found" });
    }
    const updates: any = { updatedByUserId: currentUser.id };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
    if (parsed.data.type !== undefined) updates.type = parsed.data.type;
    if (parsed.data.metadata !== undefined) updates.metadata = safeParseJsonObject(parsed.data.metadata);
    if (parsed.data.visibilityMode !== undefined) updates.visibilityMode = parsed.data.visibilityMode;
    if (parsed.data.visibilityRoles !== undefined) updates.visibilityRoles = sanitizeRoleList(parsed.data.visibilityRoles);
    if (parsed.data.visibilityUserIds !== undefined) updates.visibilityUserIds = sanitizeUserIdList(parsed.data.visibilityUserIds);
    if (parsed.data.secret !== undefined) {
      const encrypted = encryptProjectSecret(parsed.data.secret);
      updates.secretCiphertext = encrypted.ciphertext;
      updates.secretIv = encrypted.iv;
      updates.secretAuthTag = encrypted.authTag;
      updates.keyVersion = encrypted.keyVersion;
    }
    const updated = await storage.updateProjectCredential(credId, updates);
    if (!updated) return res.status(404).json({ message: "Credential not found" });
    res.json({
      id: updated.id,
      projectId: updated.projectId,
      name: updated.name,
      type: updated.type,
      metadata: safeParseJsonObject(updated.metadata),
      visibilityMode: updated.visibilityMode,
      visibilityRoles: updated.visibilityRoles ?? [],
      visibilityUserIds: updated.visibilityUserIds ?? [],
      hasSecret: true,
      maskedSecret: "********",
      createdAt: updated.createdAt,
      createdByUserId: updated.createdByUserId,
      updatedAt: updated.updatedAt,
      updatedByUserId: updated.updatedByUserId,
    });
  });

  app.delete("/api/projects/:id/credentials/:credId", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    const credId = Number(req.params.credId);
    if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(credId) || credId <= 0) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const access = await ensureProjectMemberAccess(currentUser, projectId);
    if (!access.ok) return res.status(access.code).json({ message: access.message });
    if (!canManageProjectSettings(currentUser, access.project)) {
      return res.status(403).json({ message: "Only owner/admin/manager can delete credentials" });
    }
    const existing = await storage.getProjectCredential(credId);
    if (!existing || existing.projectId !== projectId || existing.deletedAt) {
      return res.status(404).json({ message: "Credential not found" });
    }
    await storage.updateProjectCredential(credId, { deletedAt: new Date(), updatedByUserId: currentUser.id });
    res.status(204).end();
  });

  app.get("/api/projects/:id/credentials/:credId/reveal", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    const credId = Number(req.params.credId);
    if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(credId) || credId <= 0) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const access = await ensureProjectMemberAccess(currentUser, projectId);
    if (!access.ok) return res.status(access.code).json({ message: access.message });
    const existing = await storage.getProjectCredential(credId);
    if (!existing || existing.projectId !== projectId || existing.deletedAt) {
      return res.status(404).json({ message: "Credential not found" });
    }
    if (!canRevealCredential(currentUser, access.project, existing)) {
      return res.status(403).json({ message: "Access denied" });
    }
    const secret = decryptProjectSecret({
      ciphertext: existing.secretCiphertext,
      iv: existing.secretIv,
      authTag: existing.secretAuthTag,
      keyVersion: existing.keyVersion,
    });
    res.json({ id: existing.id, secret });
  });

  app.get("/api/projects/:id/documents", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) return res.status(400).json({ message: "Invalid project id" });
    const access = await ensureProjectMemberAccess(currentUser, projectId);
    if (!access.ok) return res.status(access.code).json({ message: access.message });
    const docs = await storage.listProjectDocuments(projectId);
    res.json(docs);
  });

  app.post("/api/projects/:id/documents", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) return res.status(400).json({ message: "Invalid project id" });
    const parsed = projectDocumentUploadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid body" });
    const access = await ensureProjectMemberAccess(currentUser, projectId);
    if (!access.ok) return res.status(access.code).json({ message: access.message });
    if (!canManageProjectSettings(currentUser, access.project)) {
      return res.status(403).json({ message: "Only owner/admin/manager can upload project documents" });
    }
    try {
      const persisted = persistProjectDocumentFromDataUrl(projectId, parsed.data.fileDataUrl, uploadsDir);
      const doc = await storage.createProjectDocument({
        projectId,
        name: parsed.data.name?.trim() || path.basename(persisted.url),
        type: "file",
        url: persisted.url,
        size: persisted.sizeLabel,
        createdByUserId: currentUser.id,
      });
      res.status(201).json(doc);
    } catch (e: unknown) {
      return res.status(400).json({ message: e instanceof Error ? e.message : "Upload failed" });
    }
  });

  app.delete("/api/projects/:id/documents/:docId", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    const docId = Number(req.params.docId);
    if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(docId) || docId <= 0) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const access = await ensureProjectMemberAccess(currentUser, projectId);
    if (!access.ok) return res.status(access.code).json({ message: access.message });
    if (!canManageProjectSettings(currentUser, access.project)) {
      return res.status(403).json({ message: "Only owner/admin/manager can delete project documents" });
    }
    const doc = await storage.getProjectDocument(docId);
    if (!doc || doc.projectId !== projectId) return res.status(404).json({ message: "Document not found" });
    safeUnlinkProjectDocumentUrl(doc.url ?? null, uploadsDir);
    await storage.deleteProjectDocument(docId);
    res.status(204).end();
  });

  // Update client settings for a project member (admin/manager only)
  app.patch("/api/projects/:id/members/:userId/client-settings", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role !== "admin" && currentUser.role !== "manager") {
      return res.status(403).json({ message: "Only admin or manager can update client settings" });
    }
    const projectId = Number(req.params.id);
    const userId = Number(req.params.userId);
    const openProj = await requireOpenProjectForApi(res, projectId);
    if (!openProj) return;
    const { clientShowTimecards, clientTaskAccess, notifyClientNewTask } = req.body;

    // Ensure target user is a member of this project
    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }
    const targetMembership = await storage.getProjectMembership(projectId, userId);
    if (!targetMembership) {
      return res.status(404).json({ message: "User is not a member of this project" });
    }

    const isClientTarget = targetUser.role === "client";
    const isStaffTarget = targetUser.role === "manager" || targetUser.role === "employee";

    // clientShowTimecards and clientTaskAccess only apply to client members
    if ((clientShowTimecards !== undefined || clientTaskAccess !== undefined) && !isClientTarget) {
      return res.status(400).json({ message: "clientShowTimecards / clientTaskAccess only apply to client members" });
    }

    // notifyClientNewTask only applies to manager / employee members
    if (notifyClientNewTask !== undefined && !isStaffTarget) {
      return res.status(400).json({ message: "notifyClientNewTask only applies to manager / employee members" });
    }

    // Validate clientTaskAccess enum if provided
    const validAccessValues = ["view-only", "feedback", "contribute", "full"];
    if (clientTaskAccess !== undefined && !validAccessValues.includes(clientTaskAccess)) {
      return res.status(400).json({ message: "Invalid clientTaskAccess value" });
    }

    const settingsToUpdate: { clientShowTimecards?: boolean; clientTaskAccess?: string; notifyClientNewTask?: boolean } = {};
    if (isClientTarget) {
      if (clientShowTimecards !== undefined) settingsToUpdate.clientShowTimecards = clientShowTimecards;
      if (clientTaskAccess !== undefined) settingsToUpdate.clientTaskAccess = clientTaskAccess;
    }
    if (isStaffTarget && notifyClientNewTask !== undefined) {
      settingsToUpdate.notifyClientNewTask = notifyClientNewTask;
    }

    if (Object.keys(settingsToUpdate).length === 0) {
      return res.status(400).json({ message: "No settings to update" });
    }

    await storage.updateProjectMemberClientSettings(projectId, userId, settingsToUpdate);
    res.json({ message: "Settings updated" });
  });

  // Check if project has a client with timecards enabled
  app.get("/api/projects/:id/has-client-timecards", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    const open = await requireOpenProjectForApi(res, projectId);
    if (!open) return;
    if (currentUser.role !== "admin") {
      const membership = await storage.getProjectMembership(projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Access denied" });
    }
    const hasClientTimecards = await storage.projectHasClientWithTimecards(projectId);
    res.json({ hasClientTimecards });
  });

  // Tasks
  app.get("/api/tasks", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projects =
      currentUser.role === "admin"
        ? await storage.getProjects()
        : await storage.getUserProjects(currentUser.id);
    const allTasks: any[] = [];
    for (const project of projects) {
      const projectTasks = await storage.getTasksByProject(project.id);
      projectTasks.forEach((t) =>
        allTasks.push({
          id: t.id,
          title: t.title,
          projectId: t.projectId,
          projectName: project.name,
          status: t.status,
        }),
      );
    }
    res.json(allTasks);
  });

  app.get("/api/projects/:projectId/tasks", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.projectId);
    const open = await requireOpenProjectForApi(res, projectId);
    if (!open) return;
    const isClient = currentUser.role === "client";

    // For client callers, enforce project membership (clients can only see their own projects' tasks)
    let clientMembership: any = null;
    if (isClient) {
      clientMembership = await storage.getProjectMembership(projectId, currentUser.id);
      if (!clientMembership) {
        return res.status(403).json({ message: "Access denied: not a member of this project" });
      }
    } else if (currentUser.role !== "admin") {
      const staffMem = await storage.getProjectMembership(projectId, currentUser.id);
      if (!staffMem) {
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
          assignees: sanitizeUsersForViewer(currentUser, assignees.map(({ password, ...u }) => u)),
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
    const open = await requireOpenProjectForApi(res, task.projectId);
    if (!open) return;
    let clientMembership: any = null;
    if (currentUser.role === "client") {
      clientMembership = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!clientMembership) return res.status(403).json({ message: "Access denied" });
    } else if (currentUser.role !== "admin") {
      const staffMem = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!staffMem) return res.status(403).json({ message: "Access denied" });
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
      assignees: sanitizeUsersForViewer(currentUser, assignees.map(({ password, ...u }) => u)),
      checklist,
      attachments: taskAttachments,
      comments: taskComments,
      totalHours,
    });
  });

  app.post("/api/tasks", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const { assignees, ownerId: _ignoreOwner, initialHours: _legacyInitialHours, ...taskData } = req.body;
    const pidEarly = Number(taskData.projectId);
    if (!Number.isInteger(pidEarly) || pidEarly <= 0) {
      return res.status(400).json({ message: "Invalid project" });
    }
    const openForTask = await requireOpenProjectForApi(res, pidEarly);
    if (!openForTask) return;
    // Clients with "contribute" access can create tasks tagged [Client Request]
    if (currentUser.role === "client") {
      const membership = await storage.getProjectMembership(taskData.projectId, currentUser.id);
      if (!membership || (membership.clientTaskAccess !== "contribute" && membership.clientTaskAccess !== "full")) {
        return res.status(403).json({ message: "Not authorized to create tasks" });
      }
      // Tag client tasks
      taskData.tags = [...(taskData.tags || []), "[Client Request]"];
    }
    if (currentUser.role !== "admin" && currentUser.role !== "client") {
      const m = await storage.getProjectMembership(pidEarly, currentUser.id);
      if (!m) return res.status(403).json({ message: "Access denied" });
    }
    const pid = pidEarly;
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
    // Notify staff when a client creates a task (fire-and-forget after response is sent)
    if (currentUser.role === "client") {
      const submittedChecklist: { text?: string }[] = Array.isArray(req.body.checklist)
        ? req.body.checklist
        : [];
      const checklistItems = submittedChecklist
        .map((c) => (typeof c?.text === "string" ? c.text.trim() : ""))
        .filter(Boolean);

      const { subject, text, html } = buildClientNewTaskEmail({
        clientName: currentUser.name,
        projectName: openForTask.name,
        taskTitle: task.title,
        taskDescription: task.description ?? "",
        checklistItems,
        appUrl: getPublicAppUrl(req),
        projectId: task.projectId,
        taskId: task.id,
      });

      notifyStaffOfClientActivity({ projectId: task.projectId, subject, text, html }).catch(() => {});
    }
  });

  app.delete("/api/tasks/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ message: "Invalid task" });
    }
    const task = await storage.getTask(taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });
    const openDel = await requireOpenProjectForApi(res, task.projectId);
    if (!openDel) return;

    if (currentUser.role !== "admin") {
      const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!membership) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const isOwner = task.ownerId != null && Number(task.ownerId) === Number(currentUser.id);
    const legacyStaffDelete = task.ownerId == null && currentUser.role !== "client";
    const isAdmin = currentUser.role === "admin";

    if (!isOwner && !legacyStaffDelete && !isAdmin) {
      return res.status(403).json({ message: "Only the task owner or an admin can delete this task" });
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

    const before = await storage.getTask(taskId);
    if (!before) return res.status(404).json({ message: "Task not found" });
    const openPatch = await requireOpenProjectForApi(res, before.projectId);
    if (!openPatch) return;

    if (currentUser.role === "client") {
      const membership = await storage.getProjectMembership(before.projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Access denied" });
      const access = membership.clientTaskAccess ?? "feedback";
      const isOwner = before.ownerId != null && Number(before.ownerId) === Number(currentUser.id);
      const isAssigneeOnlyPatch = Array.isArray(assignees) && Object.keys(updates).length === 0;
      const isTagsOnlyPatch =
        !Array.isArray(assignees) &&
        Object.keys(updates).length === 1 &&
        Object.prototype.hasOwnProperty.call(updates, "tags");

      // Clients with full access can edit anything. Clients with contribute access
      // can update assignees or tags on tasks THEY own (so they can assign work and manage labels).
      if (access !== "full") {
        if (!(access === "contribute" && isOwner && (isAssigneeOnlyPatch || isTagsOnlyPatch))) {
          return res.status(403).json({ message: "Not authorized to edit tasks" });
        }
      }
    }

    if (currentUser.role !== "client" && currentUser.role !== "admin") {
      const staffMem = await storage.getProjectMembership(before.projectId, currentUser.id);
      if (!staffMem) return res.status(403).json({ message: "Access denied" });
    }

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
      const toT = boardColumnTitle(boardCols, typeof updates.status === "string" ? updates.status : before.status);
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
    const openAppr = await requireOpenProjectForApi(res, task.projectId);
    if (!openAppr) return;

    const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
    // Only feedback/contribute clients can approve; full clients behave as employees
    if (!membership || (membership.clientTaskAccess !== "feedback" && membership.clientTaskAccess !== "contribute")) {
      return res.status(403).json({ message: "Not authorized to approve tasks" });
    }

    // Fetch project to identify the review column
    const project = openAppr;
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
    const openRev = await requireOpenProjectForApi(res, task.projectId);
    if (!openRev) return;

    const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
    // Only feedback/contribute clients can request revisions; full clients behave as employees
    if (!membership || (membership.clientTaskAccess !== "feedback" && membership.clientTaskAccess !== "contribute")) {
      return res.status(403).json({ message: "Not authorized to request revisions" });
    }

    // Fetch project to identify the review column
    const project = openRev;
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

    // Notify staff when a client reopens / requests revision (fire-and-forget)
    try {
      const { subject, text, html } = buildClientReopenTaskEmail({
        clientName: currentUser.name,
        projectName: openRev.name,
        taskTitle: task.title,
        reason: reason.trim(),
        appUrl: getPublicAppUrl(req),
        projectId: task.projectId,
        taskId: task.id,
      });
      notifyStaffOfClientActivity({ projectId: task.projectId, subject, text, html }).catch(() => {});
    } catch {
      /* ignore */
    }
  });

  /**
   * Fire-and-forget: notify staff members (manager/employee) on a project who have
   * notifyClientNewTask=true whenever a client performs an action that changes task content.
   * Errors are swallowed so they never fail the HTTP response.
   */
  async function notifyStaffOfClientActivity(opts: {
    projectId: number;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void> {
    try {
      const members = await storage.getProjectMembersWithSettings(opts.projectId);
      const toNotify = members.filter(
        (m) =>
          (m.role === "manager" || m.role === "employee") &&
          m.notifyClientNewTask === true &&
          typeof m.email === "string" &&
          m.email.trim() !== "",
      );
      for (const m of toNotify) {
        sendEmail({ to: m.email!.trim(), subject: opts.subject, text: opts.text, html: opts.html }).catch(
          (e) => console.error("[email] notifyStaffOfClientActivity send failed:", e),
        );
      }
    } catch (e) {
      console.error("[email] notifyStaffOfClientActivity failed:", e);
    }
  }

  // Helper: check if a client has full access to a task's project
  async function clientHasFullAccess(userId: number, taskId: number): Promise<boolean> {
    const task = await storage.getTask(taskId);
    if (!task) return false;
    const project = await storage.getProject(task.projectId);
    if (!project || project.closedAt != null) return false;
    const membership = await storage.getProjectMembership(task.projectId, userId);
    return !!(membership && membership.clientTaskAccess === "full");
  }

  /** Returns true for clients with "contribute" OR "full" task access on the project of the given task. */
  async function clientHasContributeOrFullAccess(userId: number, taskId: number): Promise<boolean> {
    const task = await storage.getTask(taskId);
    if (!task) return false;
    const project = await storage.getProject(task.projectId);
    if (!project || project.closedAt != null) return false;
    const membership = await storage.getProjectMembership(task.projectId, userId);
    return !!(membership && (membership.clientTaskAccess === "contribute" || membership.clientTaskAccess === "full"));
  }

  /** Admins bypass membership; clients rely on route-specific rules; closed projects never pass. */
  async function requireStaffProjectMembership(
    user: { id: number; role?: string },
    projectId: number,
  ): Promise<boolean> {
    const project = await storage.getProject(projectId);
    if (!project || project.closedAt != null) return false;
    if (user.role === "admin") return true;
    if (user.role === "client") return true;
    const m = await storage.getProjectMembership(projectId, user.id);
    return !!m;
  }

  // Checklist
  app.post("/api/tasks/:taskId/checklist", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const tid = Number(req.params.taskId);
    if (currentUser.role === "client") {
      const taskRow = await storage.getTask(tid);
      if (!taskRow) return res.status(404).json({ message: "Task not found" });
      const membership = await storage.getProjectMembership(taskRow.projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Not authorized" });
      const access = membership.clientTaskAccess ?? "feedback";
      if (access === "full") {
        // Full access: can add to any task on the project
      } else if (access === "contribute") {
        // Contribute: can only add to tasks they own
        if (taskRow.ownerId == null || Number(taskRow.ownerId) !== Number(currentUser.id)) {
          return res.status(403).json({ message: "Contribute clients can only modify checklists on their own tasks" });
        }
      } else {
        return res.status(403).json({ message: "Not authorized" });
      }
    } else {
      const taskRow = await storage.getTask(tid);
      if (!taskRow) return res.status(404).json({ message: "Task not found" });
      if (!(await requireStaffProjectMembership(currentUser, taskRow.projectId))) {
        return res.status(403).json({ message: "Not authorized" });
      }
    }
    const item = await storage.createChecklistItem(tid, req.body.text);
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
      const taskRow = await storage.getTask(item.taskId);
      if (!taskRow) return res.status(404).json({ message: "Not found" });
      const membership = await storage.getProjectMembership(taskRow.projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Not authorized" });
      const access = membership.clientTaskAccess ?? "feedback";
      if (access === "full") {
        // Full access: can toggle any checklist item
      } else if (access === "contribute") {
        // Contribute: can only toggle items on tasks they own
        if (taskRow.ownerId == null || Number(taskRow.ownerId) !== Number(currentUser.id)) {
          return res.status(403).json({ message: "Contribute clients can only modify checklists on their own tasks" });
        }
      } else {
        return res.status(403).json({ message: "Not authorized" });
      }
    } else {
      const taskRow = await storage.getTask(item.taskId);
      if (!taskRow) return res.status(404).json({ message: "Not found" });
      if (!(await requireStaffProjectMembership(currentUser, taskRow.projectId))) {
        return res.status(403).json({ message: "Not authorized" });
      }
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
      const taskRow = await storage.getTask(item.taskId);
      if (!taskRow) return res.status(404).json({ message: "Not found" });
      const membership = await storage.getProjectMembership(taskRow.projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Not authorized" });
      const access = membership.clientTaskAccess ?? "feedback";
      if (access === "full") {
        // Full access: can remove any checklist item
      } else if (access === "contribute") {
        // Contribute: can only remove items on tasks they own
        if (taskRow.ownerId == null || Number(taskRow.ownerId) !== Number(currentUser.id)) {
          return res.status(403).json({ message: "Contribute clients can only modify checklists on their own tasks" });
        }
      } else {
        return res.status(403).json({ message: "Not authorized" });
      }
    } else {
      const taskRow = await storage.getTask(item.taskId);
      if (!taskRow) return res.status(404).json({ message: "Not found" });
      if (!(await requireStaffProjectMembership(currentUser, taskRow.projectId))) {
        return res.status(403).json({ message: "Not authorized" });
      }
    }
    const snippet = item.text.length > 80 ? `${item.text.slice(0, 77)}...` : item.text;
    const removedText = item.text;
    const removedTaskId = item.taskId;
    await storage.deleteChecklistItem(Number(req.params.id));
    await storage.createComment({
      taskId: removedTaskId,
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
    } else if (!(await requireStaffProjectMembership(currentUser, task.projectId))) {
      return res.status(403).json({ message: "Not authorized" });
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
    } else if (attachment.taskId) {
      const taskRow = await storage.getTask(attachment.taskId);
      if (!taskRow) return res.status(404).json({ message: "Not found" });
      if (!(await requireStaffProjectMembership(currentUser, taskRow.projectId))) {
        return res.status(403).json({ message: "Not authorized" });
      }
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
    } else {
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: "Not found" });
      if (!(await requireStaffProjectMembership(currentUser, task.projectId))) {
        return res.status(403).json({ message: "Access denied" });
      }
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
    } else {
      const task = await storage.getTask(taskId);
      if (!task) return res.status(404).json({ message: "Not found" });
      if (!(await requireStaffProjectMembership(currentUser, task.projectId))) {
        return res.status(403).json({ message: "Access denied" });
      }
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
    } else if (!(await requireStaffProjectMembership(currentUser, task.projectId))) {
      return res.status(403).json({ message: "Access denied" });
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
    } else if (!(await requireStaffProjectMembership(currentUser, task.projectId))) {
      return res.status(403).json({ message: "Access denied" });
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
    const rawProjectId = req.query.projectId;
    let allChannels: Awaited<ReturnType<typeof storage.getChannels>>;
    if (currentUser.role === "admin") {
      const projectId =
        rawProjectId != null && String(rawProjectId).trim() !== ""
          ? Number(rawProjectId)
          : undefined;
      allChannels = await storage.getChannels(projectId);
    } else {
      const userProjects = await storage.getUserProjects(currentUser.id);
      const memberIds = new Set(userProjects.map((p) => p.id));
      if (rawProjectId != null && String(rawProjectId).trim() !== "") {
        const pid = Number(rawProjectId);
        if (!Number.isInteger(pid) || pid <= 0 || !memberIds.has(pid)) {
          return res.json([]);
        }
        allChannels = await storage.getChannels(pid);
      } else {
        const lists = await Promise.all(userProjects.map((p) => storage.getChannels(p.id)));
        const seen = new Set<number>();
        allChannels = [];
        for (const list of lists) {
          for (const ch of list) {
            if (!seen.has(ch.id)) {
              seen.add(ch.id);
              allChannels.push(ch);
            }
          }
        }
      }
    }
    const closedProjectIds = new Set(
      (await storage.getProjects({ includeClosed: true }))
        .filter((p) => p.closedAt != null)
        .map((p) => p.id),
    );
    allChannels = allChannels.filter(
      (c) => c.projectId == null || !closedProjectIds.has(c.projectId),
    );
    const uniqueProjectIds = Array.from(
      new Set(allChannels.map((c) => c.projectId).filter((id): id is number => id != null)),
    );
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
        const memberUsers = sanitizeUsersForViewer(currentUser, members.map(({ password, ...u }) => u));
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
    const openForChannel = await requireOpenProjectForApi(res, projectId);
    if (!openForChannel) return;

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
    if (channel.projectId != null) {
      const proj = await storage.getProject(channel.projectId);
      if (proj?.closedAt != null) return false;
    }
    const channelUser = await storage.getUser(userId);
    if (channelUser?.role === "admin") return true;
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
    const withEditor = Array.from(new Set([...parsed.data.memberIds, currentUser.id]));
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

  const patchMessageBodySchema = z.object({
    content: z.string().min(1).max(20_000),
  });

  app.patch("/api/messages/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const messageId = Number(req.params.id);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ message: "Invalid message" });
    }
    const parsed = patchMessageBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid body" });
    const before = await storage.getMessage(messageId);
    if (!before) return res.status(404).json({ message: "Message not found" });
    if (before.deletedAt) return res.status(400).json({ message: "Message is deleted" });
    if (!(await userCanAccessChannel(currentUser.id, before.channelId))) {
      return res.status(403).json({ message: "Access denied" });
    }
    const isOwner = Number(before.authorId) === Number(currentUser.id);
    const canModerate = currentUser.role === "admin" || currentUser.role === "manager";
    if (!isOwner && !canModerate) {
      return res.status(403).json({ message: "Only the author or an admin/manager can edit this message" });
    }
    const content = parsed.data.content.trim();
    if (!content) return res.status(400).json({ message: "Message content is required" });
    const updated = await storage.updateMessage(messageId, { content, editedAt: new Date() });
    if (!updated) return res.status(404).json({ message: "Message not found" });
    notifyChannelMessages(updated.channelId);
    res.json(updated);
  });

  app.delete("/api/messages/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const messageId = Number(req.params.id);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ message: "Invalid message" });
    }
    const before = await storage.getMessage(messageId);
    if (!before) return res.status(404).json({ message: "Message not found" });
    if (before.deletedAt) return res.status(204).end();
    if (!(await userCanAccessChannel(currentUser.id, before.channelId))) {
      return res.status(403).json({ message: "Access denied" });
    }
    const isOwner = Number(before.authorId) === Number(currentUser.id);
    const canModerate = currentUser.role === "admin" || currentUser.role === "manager";
    if (!isOwner && !canModerate) {
      return res.status(403).json({ message: "Only the author or an admin/manager can delete this message" });
    }
    const deleted = await storage.softDeleteMessage(messageId, new Date());
    notifyChannelMessages(before.channelId);
    res.status(200).json(deleted ?? { ok: true });
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

  /** User ids to ring / clear for VoiceLink (same rules as voice-link notify). */
  async function resolveChannelRingMemberIds(channelId: number): Promise<number[]> {
    const ch = await storage.getChannel(channelId);
    if (!ch) return [];
    const channelMembers = await storage.getChannelMembers(channelId);
    let memberIds = channelMembers.map((m) => m.id);
    if (ch.type === "public" && ch.projectId != null) {
      const projectMembers = await storage.getProjectMembers(ch.projectId);
      memberIds = projectMembers.map((m) => m.id);
    } else if (memberIds.length === 0 && ch.projectId != null) {
      const projectMembers = await storage.getProjectMembers(ch.projectId);
      memberIds = projectMembers.map((m) => m.id);
    }
    return memberIds;
  }

  /** Polling fallback for call invites (works if WebSocket is blocked). */
  app.get("/api/chat/pending-invite", requireAuth, (req, res) => {
    const currentUser = req.user as any;
    const invite = peekInvite(currentUser.id);
    res.json({ invite });
  });

  app.post("/api/chat/pending-invite/dismiss", requireAuth, (req, res) => {
    const currentUser = req.user as any;
    dismissInvite(currentUser.id);
    res.json({ ok: true });
  });

  const clearChannelInvitesBodySchema = z.object({
    channelId: z.coerce.number().int().positive(),
  });

  /** When a call UI closes, drop pending rings for that channel for everyone who was notified. */
  app.post("/api/chat/call-invite-clear-channel", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const parsed = clearChannelInvitesBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid body" });
    }
    const { channelId } = parsed.data;
    if (!(await userCanAccessChannel(currentUser.id, channelId))) {
      return res.status(403).json({ message: "Access denied" });
    }
    const memberIds = await resolveChannelRingMemberIds(channelId);
    clearInvitesForChannel(channelId);
    notifyUsersInviteCleared(memberIds, channelId);
    res.json({ ok: true });
  });

  // ── VoiceLink: create session token & return join URL (no VoiceLink login needed) ──
  const vlBodySchema = z.object({
    channelId: z.coerce.number().int().positive(),
    media: z.enum(["audio", "video"]).default("audio"),
  });

  app.post("/api/chat/voice-link", requireAuth, async (req, res) => {
    const currentUser = req.user as any;

    const parsed = vlBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid body" });
    }
    const { channelId, media } = parsed.data;

    // Verify caller has access to this channel
    if (!(await userCanAccessChannel(currentUser.id, channelId))) {
      return res.status(403).json({ message: "Access denied" });
    }
    const channel = await storage.getChannel(channelId);
    if (!channel) return res.status(404).json({ message: "Channel not found" });

    const apiKey = (process.env.VOICELINK_API_KEY ?? "").trim();
    if (!apiKey) {
      return res.status(503).json({
        message: "VoiceLink is not configured on this server. Add VOICELINK_API_KEY to /var/www/pms/.env and restart the service.",
      });
    }

    // VoiceLink room key: unique per PMS channel (channel PK is global). Different
    // projects/channels → different strings → different VoiceLink rooms. Same
    // channel → same string → same room so all participants mesh together.
    const roomName = channel.projectId != null
      ? `pms-p${channel.projectId}-c${channelId}`
      : `pms-c${channelId}`;

    const me = await storage.getUser(currentUser.id);
    const participantName = (me?.name ?? "User").trim().slice(0, 120);

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      const vl = await fetch(`${VL_API}/api/sessions/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
        },
        body: JSON.stringify({
          participantName,
          roomName,
          // Always allow full capabilities in-room (Phone vs Video is only how we open UI;
          // otherwise "audio" calls block camera/screen in VoiceLink session JWT).
          permissions: { audio: true, video: true, screen: true },
          expiresIn: "2h",
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (!vl.ok) {
        const txt = await vl.text();
        console.error("[voice-link] VoiceLink session API error:", vl.status, txt.slice(0, 200));
        return res.status(502).json({ message: `VoiceLink API error ${vl.status}. Check VOICELINK_API_KEY.` });
      }

      const data = (await vl.json()) as { sessionToken?: string };
      if (!data.sessionToken) {
        return res.status(502).json({ message: "VoiceLink did not return a session token." });
      }

      // Build the public joinUrl ourselves (VoiceLink App.js reads ?sessionToken= and auto-joins)
      const joinUrl = `${VL_HOST}?sessionToken=${encodeURIComponent(data.sessionToken)}`;

      const memberIds = await resolveChannelRingMemberIds(channelId);
      const ringPayload = {
        channelId,
        channelName: channel.name ?? "",
        callerName: participantName,
        media,
      };
      notifyUsersCall(memberIds, currentUser.id, channelId, ringPayload.channelName, ringPayload.callerName, media);
      publishCallInvites(memberIds, currentUser.id, ringPayload);

      // Clear any pending ring for this user (they just joined / started the call)
      dismissInvite(currentUser.id);

      return res.json({ url: joinUrl });

    } catch (e) {
      console.error("[voice-link] fetch to VoiceLink failed:", VL_API, e);
      return res.status(502).json({
        message:
          "Could not reach VoiceLink from this server (session token request failed). " +
          "VOICELINK_CLIENT_URL is only for the iframe; ensure VOICELINK_INTERNAL_API points at your VoiceLink API " +
          `(currently ${VL_API}). Same origin as production (e.g. https://voicelink.vnnovate.net) is fine if the server can reach it.`,
      });
    }
  });

  app.post("/api/projects/:id/task-description-upload", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project" });
    }
    const project = await requireOpenProjectForApi(res, projectId);
    if (!project) return;
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
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ message: "Invalid task" });
    }
    const taskForTime = await storage.getTask(taskId);
    if (!taskForTime) return res.status(404).json({ message: "Task not found" });
    const openTimePost = await requireOpenProjectForApi(res, taskForTime.projectId);
    if (!openTimePost) return;
    if (currentUser.role === "client") {
      const membership = await storage.getProjectMembership(taskForTime.projectId, currentUser.id);
      if (!membership || membership.clientTaskAccess !== "full") {
        return res.status(403).json({ message: "Clients cannot log time" });
      }
    } else if (!(await requireStaffProjectMembership(currentUser, taskForTime.projectId))) {
      return res.status(403).json({ message: "Access denied" });
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
    const maxHoursErr = timeEntryHoursExceedsCompanyMax(hours, csTaskTime.timeLogMaxHoursPerEntry);
    if (maxHoursErr) {
      return res.status(400).json({ message: maxHoursErr });
    }
    const entry = await storage.createTimeEntry({
      taskId: taskId,
      userId,
      hours: String(hours),
      description: descStr,
      logDate,
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
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ message: "Invalid task" });
    }
    const taskForList = await storage.getTask(taskId);
    if (!taskForList) return res.status(404).json({ message: "Task not found" });
    const openTimeList = await requireOpenProjectForApi(res, taskForList.projectId);
    if (!openTimeList) return;
    if (currentUser.role === "client") {
      const membership = await storage.getProjectMembership(taskForList.projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Access denied" });
      if (!membership.clientShowTimecards) return res.json([]);
      const entries = await storage.getTimeEntriesByTask(taskId);
      return res.json(entries.filter((e) => e.clientVisible !== false));
    }
    if (!(await requireStaffProjectMembership(currentUser, taskForList.projectId))) {
      return res.status(403).json({ message: "Access denied" });
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
      const openTe = await requireOpenProjectForApi(res, task.projectId);
      if (!openTe) return;
      const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!membership || membership.clientTaskAccess !== "full") {
        return res.status(403).json({ message: "Clients cannot delete time entries" });
      }
      if (entry.userId !== currentUser.id) {
        return res.status(403).json({ message: "Not authorized to delete this entry" });
      }
    } else {
      const taskForDel = await storage.getTask(entry.taskId);
      if (!taskForDel) return res.status(404).json({ message: "Task not found" });
      const openTeStaff = await requireOpenProjectForApi(res, taskForDel.projectId);
      if (!openTeStaff) return;
      if (currentUser.role !== "admin") {
        const mem = await storage.getProjectMembership(taskForDel.projectId, currentUser.id);
        if (!mem) return res.status(403).json({ message: "Not authorized to delete this entry" });
      }
      const canDelete =
        entry.userId === currentUser.id || currentUser.role === "admin" || currentUser.role === "manager";
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
      const openClientProjects = new Set((await storage.getProjects()).map((p) => p.id));
      const allowedProjectIds: number[] = memberships
        .filter((m) => m.clientShowTimecards && openClientProjects.has(m.projectId))
        .map((m) => m.projectId);

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
      if (req.query.taskId) {
        const tid = Number(req.query.taskId);
        if (Number.isInteger(tid) && tid > 0) filters.taskId = tid;
      }

      const entries = await storage.getAllTimeEntries(filters);
      return res.json(entries);
    }

    const filters: {
      userId?: number;
      projectId?: number;
      taskId?: number;
      startDate?: string;
      endDate?: string;
      allowedProjectIds?: number[];
    } = {};
    if (req.query.startDate) filters.startDate = String(req.query.startDate);
    if (req.query.endDate) filters.endDate = String(req.query.endDate);

    if (currentUser.role === "admin") {
      const adminOpenIds = (await storage.getProjects()).map((p) => p.id);
      if (adminOpenIds.length === 0) {
        return res.json([]);
      }
      filters.allowedProjectIds = adminOpenIds;
      if (req.query.projectId) {
        const pid = Number(req.query.projectId);
        if (!adminOpenIds.includes(pid)) {
          return res.json([]);
        }
        filters.projectId = pid;
      }
      if (isManagerOrAdmin) {
        if (req.query.userId) filters.userId = Number(req.query.userId);
      } else {
        filters.userId = currentUser.id;
      }
    } else {
      const ups = await storage.getUserProjects(currentUser.id);
      filters.allowedProjectIds = ups.map((p) => p.id);
      if (filters.allowedProjectIds.length === 0) {
        return res.json([]);
      }
      if (req.query.projectId) {
        const pid = Number(req.query.projectId);
        if (!filters.allowedProjectIds.includes(pid)) {
          return res.json([]);
        }
        filters.projectId = pid;
      }
      if (isManagerOrAdmin) {
        if (req.query.userId) filters.userId = Number(req.query.userId);
      } else {
        filters.userId = currentUser.id;
      }
    }

    if (req.query.taskId) {
      const tid = Number(req.query.taskId);
      if (Number.isInteger(tid) && tid > 0) filters.taskId = tid;
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
    const openGlobalTe = await requireOpenProjectForApi(res, task.projectId);
    if (!openGlobalTe) return;
    if (currentUser.role !== "admin") {
      const mem = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!mem) return res.status(403).json({ message: "Access denied" });
    }
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
    const maxHoursErrGlobal = timeEntryHoursExceedsCompanyMax(hours, csGlobalTime.timeLogMaxHoursPerEntry);
    if (maxHoursErrGlobal) {
      return res.status(400).json({ message: maxHoursErrGlobal });
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
