import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth } from "./auth";
import { seedDatabase } from "./seed";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);
  await seedDatabase();

  // Users
  app.get("/api/users", requireAuth, async (_req, res) => {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers.map(({ password, ...u }) => u));
  });

  // Projects
  app.get("/api/projects", requireAuth, async (req, res) => {
    const allProjects = await storage.getProjects();
    res.json(allProjects);
  });

  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.post("/api/projects", requireAuth, async (req, res) => {
    const project = await storage.createProject(req.body);
    res.status(201).json(project);
  });

  app.get("/api/projects/:id/members", requireAuth, async (req, res) => {
    const members = await storage.getProjectMembers(Number(req.params.id));
    res.json(members.map(({ password, ...u }) => u));
  });

  app.post("/api/projects/:id/members", requireAuth, async (req, res) => {
    await storage.addProjectMember(Number(req.params.id), req.body.userId);
    res.status(201).json({ message: "Member added" });
  });

  // Tasks
  app.get("/api/projects/:projectId/tasks", requireAuth, async (req, res) => {
    const projectTasks = await storage.getTasksByProject(Number(req.params.projectId));
    const tasksWithDetails = await Promise.all(
      projectTasks.map(async (task) => {
        const assignees = await storage.getTaskAssignees(task.id);
        const checklist = await storage.getChecklistItems(task.id);
        const taskAttachments = await storage.getAttachments(task.id);
        const taskComments = await storage.getComments(task.id);
        return {
          ...task,
          assignees: assignees.map(({ password, ...u }) => u),
          checklist,
          attachments: taskAttachments,
          comments: taskComments,
        };
      })
    );
    res.json(tasksWithDetails);
  });

  app.get("/api/tasks/:id", requireAuth, async (req, res) => {
    const task = await storage.getTask(Number(req.params.id));
    if (!task) return res.status(404).json({ message: "Task not found" });
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
    const { assignees, ...taskData } = req.body;
    const task = await storage.createTask(taskData);
    if (assignees && assignees.length > 0) {
      await storage.setTaskAssignees(task.id, assignees);
    }
    res.status(201).json(task);
  });

  app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
    const { assignees, ...updates } = req.body;
    const task = await storage.updateTask(Number(req.params.id), updates);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (assignees) {
      await storage.setTaskAssignees(task.id, assignees);
    }
    res.json(task);
  });

  // Checklist
  app.post("/api/tasks/:taskId/checklist", requireAuth, async (req, res) => {
    const item = await storage.createChecklistItem(Number(req.params.taskId), req.body.text);
    res.status(201).json(item);
  });

  app.patch("/api/checklist/:id", requireAuth, async (req, res) => {
    await storage.updateChecklistItem(Number(req.params.id), req.body.completed);
    res.json({ message: "Updated" });
  });

  app.delete("/api/checklist/:id", requireAuth, async (req, res) => {
    await storage.deleteChecklistItem(Number(req.params.id));
    res.json({ message: "Deleted" });
  });

  // Attachments
  app.post("/api/tasks/:taskId/attachments", requireAuth, async (req, res) => {
    const attachment = await storage.createAttachment({
      taskId: Number(req.params.taskId),
      commentId: null,
      ...req.body,
    });
    res.status(201).json(attachment);
  });

  app.delete("/api/attachments/:id", requireAuth, async (req, res) => {
    await storage.deleteAttachment(Number(req.params.id));
    res.json({ message: "Deleted" });
  });

  // Comments
  app.get("/api/tasks/:taskId/comments", requireAuth, async (req, res) => {
    const taskComments = await storage.getComments(Number(req.params.taskId));
    res.json(taskComments);
  });

  app.post("/api/tasks/:taskId/comments", requireAuth, async (req, res) => {
    const comment = await storage.createComment({
      taskId: Number(req.params.taskId),
      authorId: (req.user as any).id,
      content: req.body.content,
      parentId: req.body.parentId || null,
      type: req.body.type || "comment",
    });
    res.status(201).json(comment);
  });

  // Channels
  app.get("/api/channels", requireAuth, async (req, res) => {
    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
    const allChannels = await storage.getChannels(projectId);
    const channelsWithMembers = await Promise.all(
      allChannels.map(async (channel) => {
        const members = await storage.getChannelMembers(channel.id);
        return { ...channel, members: members.map(({ password, ...u }) => u) };
      })
    );
    res.json(channelsWithMembers);
  });

  app.post("/api/channels", requireAuth, async (req, res) => {
    const channel = await storage.createChannel(req.body);
    if (req.body.members) {
      for (const userId of req.body.members) {
        await storage.addChannelMember(channel.id, userId);
      }
    }
    res.status(201).json(channel);
  });

  // Messages
  app.get("/api/channels/:channelId/messages", requireAuth, async (req, res) => {
    const channelMessages = await storage.getMessages(Number(req.params.channelId));
    res.json(channelMessages);
  });

  app.post("/api/channels/:channelId/messages", requireAuth, async (req, res) => {
    const message = await storage.createMessage({
      channelId: Number(req.params.channelId),
      authorId: (req.user as any).id,
      content: req.body.content,
    });
    res.status(201).json(message);
  });

  return httpServer;
}
