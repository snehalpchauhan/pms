import { db } from "./db";
import { users, projects, projectMembers, tasks, taskAssignees, checklistItems, attachments, comments, channels, channelMembers, messages } from "@shared/schema";
import { addDays, subDays, format } from "date-fns";

export async function seedDatabase() {
  const existingUsers = await db.select().from(users);
  if (existingUsers.length > 0) return;

  console.log("Seeding database...");

  const [admin] = await db.insert(users).values({
    username: "admin",
    password: "admin123",
    name: "Super Admin",
    role: "admin",
    status: "online",
    email: "admin@company.com",
  }).returning();

  const [manager] = await db.insert(users).values({
    username: "manager",
    password: "manager123",
    name: "Jane Doe",
    role: "manager",
    status: "online",
    email: "jane@example.com",
  }).returning();

  const [employee] = await db.insert(users).values({
    username: "employee",
    password: "employee123",
    name: "John Smith",
    role: "employee",
    status: "busy",
    email: "john@example.com",
  }).returning();

  const [clientUser] = await db.insert(users).values({
    username: "client",
    password: "client123",
    name: "Alice (Client)",
    role: "client",
    status: "online",
    email: "alice@client.com",
  }).returning();

  const today = new Date();
  const tomorrow = addDays(today, 1);
  const yesterday = subDays(today, 1);
  const twoDaysLater = addDays(today, 2);

  const [project1] = await db.insert(projects).values({
    name: "Website Redesign",
    color: "bg-blue-500",
    description: "Overhaul of the main corporate website.",
    columns: [
      { id: "todo", title: "To Do", color: "bg-slate-500" },
      { id: "in-progress", title: "In Progress", color: "bg-blue-500" },
      { id: "review", title: "QA Review", color: "bg-orange-500" },
      { id: "done", title: "Done", color: "bg-emerald-500" },
    ],
  }).returning();

  const [project2] = await db.insert(projects).values({
    name: "Mobile App",
    color: "bg-orange-500",
    description: "Native mobile application for iOS and Android.",
    columns: [
      { id: "backlog", title: "Backlog", color: "bg-slate-400" },
      { id: "design", title: "Design", color: "bg-purple-500" },
      { id: "dev", title: "Development", color: "bg-blue-500" },
      { id: "testing", title: "Testing", color: "bg-amber-500" },
      { id: "deployed", title: "Deployed", color: "bg-emerald-500" },
    ],
  }).returning();

  await db.insert(projectMembers).values([
    { projectId: project1.id, userId: admin.id },
    { projectId: project1.id, userId: manager.id },
    { projectId: project1.id, userId: employee.id },
    { projectId: project1.id, userId: clientUser.id, clientShowTimecards: true, clientTaskAccess: "feedback" },
    { projectId: project2.id, userId: admin.id },
    { projectId: project2.id, userId: manager.id },
  ]);

  const [task1] = await db.insert(tasks).values({
    projectId: project1.id,
    title: "Design System Implementation",
    description: "Set up the initial typography, color palette, and core components in Figma and sync with the codebase.",
    status: "in-progress",
    priority: "high",
    tags: ["Design", "System"],
    dueDate: format(today, "yyyy-MM-dd"),
  }).returning();

  const [task2] = await db.insert(tasks).values({
    projectId: project1.id,
    title: "User Authentication Flow",
    description: "Implement login, registration, and password recovery screens using the new API endpoints.",
    status: "todo",
    priority: "high",
    tags: ["Backend", "Auth"],
    dueDate: format(tomorrow, "yyyy-MM-dd"),
  }).returning();

  const [task3] = await db.insert(tasks).values({
    projectId: project1.id,
    title: "Dashboard Analytics Chart",
    description: "Create the main revenue chart for the dashboard home screen using Recharts.",
    status: "review",
    priority: "medium",
    tags: ["Frontend", "Data"],
    dueDate: format(twoDaysLater, "yyyy-MM-dd"),
    coverImage: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop",
  }).returning();

  const [task4] = await db.insert(tasks).values({
    projectId: project1.id,
    title: "Mobile Responsiveness",
    description: "Fix layout issues on mobile devices for the settings page.",
    status: "done",
    priority: "low",
    tags: ["Bug", "Mobile"],
    dueDate: format(yesterday, "yyyy-MM-dd"),
  }).returning();

  const [task5] = await db.insert(tasks).values({
    projectId: project2.id,
    title: "App Icon Design",
    description: "Create app icon variants for iOS and Android.",
    status: "design",
    priority: "high",
    tags: ["Design", "Assets"],
    dueDate: "2026-03-20",
  }).returning();

  await db.insert(taskAssignees).values([
    { taskId: task1.id, userId: employee.id },
    { taskId: task1.id, userId: manager.id },
    { taskId: task2.id, userId: manager.id },
    { taskId: task3.id, userId: manager.id },
    { taskId: task4.id, userId: employee.id },
    { taskId: task5.id, userId: employee.id },
  ]);

  await db.insert(checklistItems).values([
    { taskId: task1.id, text: "Define color palette", completed: true },
    { taskId: task1.id, text: "Set up typography scale", completed: false },
    { taskId: task1.id, text: "Create button components", completed: false },
  ]);

  await db.insert(attachments).values([
    { taskId: task3.id, name: "mockup_v2.png", type: "image", url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop", size: "2.4MB" },
  ]);

  await db.insert(comments).values([
    { taskId: task1.id, authorId: employee.id, content: "Make sure to include the new brand colors we discussed.", type: "comment" },
    { taskId: task1.id, authorId: manager.id, content: "changed status from To Do to In Progress", type: "system" },
  ]);

  const [channel1] = await db.insert(channels).values({
    name: "general",
    type: "public",
    projectId: project1.id,
  }).returning();

  const [channel2] = await db.insert(channels).values({
    name: "design-team",
    type: "public",
    projectId: project1.id,
  }).returning();

  const [channel3] = await db.insert(channels).values({
    name: "mobile-dev",
    type: "public",
    projectId: project2.id,
  }).returning();

  await db.insert(channelMembers).values([
    { channelId: channel1.id, userId: admin.id },
    { channelId: channel1.id, userId: manager.id },
    { channelId: channel1.id, userId: employee.id },
    { channelId: channel2.id, userId: manager.id },
    { channelId: channel2.id, userId: employee.id },
    { channelId: channel3.id, userId: admin.id },
    { channelId: channel3.id, userId: manager.id },
  ]);

  await db.insert(messages).values([
    { channelId: channel1.id, authorId: employee.id, content: "Welcome to the new project management tool!" },
    { channelId: channel1.id, authorId: manager.id, content: "Looks great! Love the new dark mode." },
    { channelId: channel2.id, authorId: employee.id, content: "I've uploaded the new assets to the task." },
  ]);

  console.log("Database seeded successfully!");
}
