import express, { type Express } from "express";
import { createServer, type Server } from "http";
import crypto from "node:crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { notifyChannelMessages } from "./realtime";
import { storage } from "./storage";
import { setupAuth, requireAuth } from "./auth";
import { registerMicrosoftAuth, clearMicrosoftOidcCache, ms365ClientSecretFromEnv } from "./microsoftAuth";
import { seedDatabase } from "./seed";

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

const MAX_CHAT_UPLOAD_BYTES = 3 * 1024 * 1024;

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);
  registerMicrosoftAuth(app);
  await seedDatabase();

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
      body.ms365ClientSecret === undefined
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
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
    role: z.enum(["admin", "manager", "employee", "client"], { errorMap: () => ({ message: "Invalid role" }) }),
  });

  const updateUserSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    role: z.enum(["admin", "manager", "employee", "client"]).optional(),
    status: z.string().optional(),
  });

  app.post("/api/users", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role !== "admin") return res.status(403).json({ message: "Only admins can create users" });
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
    const { name, email, username, password, role } = parsed.data;
    const existing = await storage.getUserByUsername(username);
    if (existing) return res.status(409).json({ message: "Username already taken" });
    const created = await storage.createUser({ name, email, username, password, role, status: "online" });
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
    const { role } = parsed.data;
    if (role !== undefined && targetId === currentUser.id) {
      return res.status(400).json({ message: "You cannot change your own role" });
    }
    const updated = await storage.updateUser(targetId, parsed.data);
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

  app.post("/api/projects", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") return res.status(403).json({ message: "Clients cannot create projects" });
    const project = await storage.createProject(req.body);
    await storage.addProjectMember(project.id, currentUser.id);
    res.status(201).json(project);
  });

  const projectColumnSchema = z.object({
    id: z.string().min(1).max(80),
    title: z.string().min(1).max(120),
    color: z.string().min(1).max(80),
  });

  const patchProjectSchema = z.object({
    columns: z.array(projectColumnSchema).min(1).max(24).optional(),
    name: z.string().min(1).max(200).optional(),
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
    if (parsed.data.name !== undefined) {
      if (currentUser.role !== "admin" && currentUser.role !== "manager") {
        return res.status(403).json({ message: "Only admins and managers can rename a project" });
      }
    }
    const updates: { name?: string; columns?: unknown } = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.columns !== undefined) updates.columns = parsed.data.columns;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No changes provided" });
    }
    const updated = await storage.updateProject(projectId, updates);
    if (!updated) return res.status(404).json({ message: "Project not found" });
    res.json(updated);
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
    const members = await storage.getProjectMembersWithSettings(projectId);
    res.json(members.map(({ password, ...u }) => u));
  });

  app.post("/api/projects/:id/members", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") return res.status(403).json({ message: "Clients cannot add members" });
    if (currentUser.role !== "admin" && currentUser.role !== "manager") {
      return res.status(403).json({ message: "Only admins and managers can add members" });
    }
    const projectId = Number(req.params.id);
    const userId = Number(req.body?.userId);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ message: "Invalid project" });
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    let membership = await storage.getProjectMembership(projectId, currentUser.id);
    if (!membership && currentUser.role === "admin") {
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
    // Clients must be members of the task's project
    if (currentUser.role === "client") {
      const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!membership) return res.status(403).json({ message: "Access denied" });
    }
    const assignees = await storage.getTaskAssignees(task.id);
    const checklist = await storage.getChecklistItems(task.id);
    const taskAttachments = await storage.getAttachments(task.id);
    const taskComments = await storage.getComments(task.id);
    res.json({
      ...task,
      assignees: assignees.map(({ password, ...u }) => u),
      checklist,
      attachments: taskAttachments,
      comments: taskComments,
    });
  });

  app.post("/api/tasks", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const { assignees, ...taskData } = req.body;
    // Clients with "contribute" access can create tasks tagged [Client Request]
    if (currentUser.role === "client") {
      const membership = await storage.getProjectMembership(taskData.projectId, currentUser.id);
      if (!membership || (membership.clientTaskAccess !== "contribute" && membership.clientTaskAccess !== "full")) {
        return res.status(403).json({ message: "Not authorized to create tasks" });
      }
      // Tag client tasks
      taskData.tags = [...(taskData.tags || []), "[Client Request]"];
    }
    const task = await storage.createTask(taskData);
    if (assignees && assignees.length > 0) {
      await storage.setTaskAssignees(task.id, assignees);
    }
    res.status(201).json(task);
  });

  app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const { assignees, ...updates } = req.body;

    if (currentUser.role === "client") {
      const task = await storage.getTask(Number(req.params.id));
      if (!task) return res.status(404).json({ message: "Task not found" });
      const membership = await storage.getProjectMembership(task.projectId, currentUser.id);
      if (!membership || membership.clientTaskAccess !== "full") {
        return res.status(403).json({ message: "Not authorized to edit tasks" });
      }
    }

    const task = await storage.updateTask(Number(req.params.id), updates);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (assignees) {
      await storage.setTaskAssignees(task.id, assignees);
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

    const doneColumn = columns.find((c: any) => c.id === "done") || columns[columns.length - 1];

    await storage.updateTask(task.id, { status: doneColumn?.id || "done" });

    // Post auto-comment
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

    // Move to in-progress column
    const inProgressColumn = columns.find((c: any) => c.id === "in-progress") || columns[1] || columns[0];

    await storage.updateTask(task.id, { status: inProgressColumn?.id || "in-progress" });

    // Post auto-comment
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
    res.status(201).json(item);
  });

  app.patch("/api/checklist/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") {
      const item = await storage.getChecklistItem(Number(req.params.id));
      if (!item) return res.status(404).json({ message: "Not found" });
      const ok = await clientHasFullAccess(currentUser.id, item.taskId);
      if (!ok) return res.status(403).json({ message: "Not authorized" });
    }
    await storage.updateChecklistItem(Number(req.params.id), req.body.completed);
    res.json({ message: "Updated" });
  });

  app.delete("/api/checklist/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    if (currentUser.role === "client") {
      const item = await storage.getChecklistItem(Number(req.params.id));
      if (!item) return res.status(404).json({ message: "Not found" });
      const ok = await clientHasFullAccess(currentUser.id, item.taskId);
      if (!ok) return res.status(403).json({ message: "Not authorized" });
    }
    await storage.deleteChecklistItem(Number(req.params.id));
    res.json({ message: "Deleted" });
  });

  // Attachments
  app.post("/api/tasks/:taskId/attachments", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    const taskId = Number(req.params.taskId);
    // Clients without full access cannot add attachments
    if (currentUser.role === "client") {
      const ok = await clientHasFullAccess(currentUser.id, taskId);
      if (!ok) return res.status(403).json({ message: "Not authorized" });
    }
    const attachment = await storage.createAttachment({
      taskId,
      commentId: null,
      ...req.body,
    });
    res.status(201).json(attachment);
  });

  app.delete("/api/attachments/:id", requireAuth, async (req, res) => {
    const currentUser = req.user as any;
    // Clients without full access cannot delete attachments
    if (currentUser.role === "client") {
      const attachment = await storage.getAttachment(Number(req.params.id));
      if (!attachment) return res.status(404).json({ message: "Not found" });
      if (!attachment.taskId) return res.status(403).json({ message: "Not authorized" });
      const ok = await clientHasFullAccess(currentUser.id, attachment.taskId);
      if (!ok) return res.status(403).json({ message: "Not authorized" });
    }
    await storage.deleteAttachment(Number(req.params.id));
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
        return { ...channel, members: memberUsers, memberCountDisplay };
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

    const channel = await storage.createChannel({ name, type, projectId });

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
    if (!userCanManageChannels(req)) {
      return res.status(403).json({ message: "Only admins and managers can edit channels" });
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
    if (!userCanManageChannels(req)) {
      return res.status(403).json({ message: "Only admins and managers can edit channel members" });
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
    const entry = await storage.createTimeEntry({
      taskId, userId, hours: String(hours), description: description || null, logDate,
      clientVisible: clientVisible !== undefined ? clientVisible : true,
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
    await storage.deleteTimeEntry(Number(req.params.id));
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
    const entry = await storage.createTimeEntry({
      taskId: Number(taskId), userId, hours: String(hours), description: description || null, logDate,
      clientVisible: clientVisible !== undefined ? clientVisible : true,
    });
    res.status(201).json(entry);
  });

  return httpServer;
}
