import avatar1 from "@/assets/avatar-1.png";
import avatar2 from "@/assets/avatar-2.png";
import avatar3 from "@/assets/avatar-3.png";
import { addDays, format, subDays } from "date-fns";

export type Status = "todo" | "in-progress" | "review" | "done" | string;

export type Priority = "low" | "medium" | "high";

export type UserRole = "admin" | "manager" | "employee" | "client";

export interface Attachment {
  id: string;
  name: string;
  type: "image" | "file";
  url?: string;
  size?: string;
}

export interface Comment {
  id: string;
  authorId: string;
  content: string;
  createdAt: string;
  /** Present after the author edits the comment (server timestamp). */
  editedAt?: string;
  attachments?: Attachment[];
  parentId?: string; // For threaded replies
  type?: "comment" | "system"; // Distinguish between user comments and system logs (e.g. status changes)
}

/** Activity / automation rows (not user discussion); replies stay type "comment" and are included in discussion counts. */
export function isSystemTaskComment(c: { type?: string }): boolean {
  return String(c.type ?? "").toLowerCase() === "system";
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  role: UserRole;
  status?: "online" | "offline" | "busy";
  email?: string;
  /** Login username from API (empty for mock-only users). */
  username?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Recurrence {
  frequency: "daily" | "weekly" | "monthly" | "custom";
  interval?: number;
  daysOfWeek?: number[]; // 0-6 where 0 is Sunday
  customType?: "days" | "weeks" | "months" | "years";
}

/** Fields accepted when creating a task from the new-task dialog. */
export type CreateTaskInput = Partial<Task> & { estimatedHours?: number };

export interface Task {
  id: string;
  /** Server user id of the creator; admins may delete any task; otherwise only the owner (unless legacy null owner). */
  ownerId?: number | null;
  title: string;
  description: string;
  status: Status;
  /** Order within the board column (same status). */
  boardOrder?: number;
  priority: Priority;
  tags: string[];
  assignees: string[];
  startDate?: string;
  dueDate?: string;
  recurrence?: Recurrence;
  comments: Comment[];
  checklist?: ChecklistItem[];
  attachments: Attachment[];
  coverImage?: string;
  projectId: string;
  /** Planned effort (hours); compare to totalHours from time entries. */
  estimatedHours?: number;
  totalHours?: number;
  /** ISO timestamp when task was created (from server). */
  createdAt?: string;
}

export interface Column {
  id: string;
  title: string;
  color: string;
}

export interface Project {
    id: string;
    name: string;
    color: string;
    columns: Column[];
    description?: string;
    members?: string[];
    /** Server user id of project owner (creator); board sections only they + admins may change. */
    ownerId?: string;
    /** ISO timestamp when project was closed (admin-only listing uses full project APIs). */
    closedAt?: string;
    closureDescription?: string;
    closurePaymentReceived?: boolean;
}

export interface Message {
    id: string;
    channelId: string;
    authorId: string;
    content: string;
    createdAt: string;
    /** ISO timestamp or null; when set, UI shows "(edited)". */
    editedAt?: string | null;
    /** ISO timestamp or null; when set, UI shows "Message deleted". */
    deletedAt?: string | null;
}

export interface Channel {
    id: string;
    name: string;
    type: "public" | "private" | "direct";
    members: string[];
    projectId?: string;
    /** Public: all project members; private/direct: channel member count. From API for headers. */
    memberCountDisplay?: number;
    /** Messages from others after last read; from GET /api/channels. */
    unreadCount?: number;
    /** Server user id of creator; may delete or edit (with role rules). */
    createdByUserId?: string | null;
}

export const USERS: Record<string, User> = {
  "u0": { id: "u0", name: "Super Admin", avatar: "", role: "admin", status: "online", email: "admin@company.com" },
  "u1": { id: "u1", name: "Jane Doe", avatar: avatar1, role: "manager", status: "online", email: "jane@example.com" },
  "u2": { id: "u2", name: "John Smith", avatar: avatar2, role: "employee", status: "busy", email: "john@example.com" },
  "u3": { id: "u3", name: "Alice Brown", avatar: avatar3, role: "client", status: "offline", email: "alice@example.com" },
};

export const PROJECTS: Project[] = [
    {
        id: "p1",
        name: "Website Redesign",
        color: "bg-blue-500",
        description: "Overhaul of the main corporate website.",
        members: ["u1", "u2", "u3"],
        columns: [
            { id: "todo", title: "To Do", color: "bg-red-500" },
            { id: "in-progress", title: "In Progress", color: "bg-blue-500" },
            { id: "review", title: "QA Review", color: "bg-yellow-500" },
            { id: "done", title: "Done", color: "bg-green-500" },
        ]
    },
    {
        id: "p2",
        name: "Mobile App",
        color: "bg-orange-500",
        description: "Native mobile application for iOS and Android.",
        members: ["u1", "u2"],
        columns: [
            { id: "backlog", title: "Backlog", color: "bg-slate-400" },
            { id: "design", title: "Design", color: "bg-purple-500" },
            { id: "dev", title: "Development", color: "bg-blue-500" },
            { id: "testing", title: "Testing", color: "bg-amber-500" },
            { id: "deployed", title: "Deployed", color: "bg-emerald-500" },
        ]
    }
];

const today = new Date();
const tomorrow = addDays(today, 1);
const yesterday = subDays(today, 1);
const twoDaysLater = addDays(today, 2);
const nextWeek = addDays(today, 7);

export const INITIAL_TASKS: Task[] = [
  {
    id: "t1",
    projectId: "p1",
    title: "Design System Implementation",
    description: "Set up the initial typography, color palette, and core components in Figma and sync with the codebase.",
    status: "in-progress",
    priority: "high",
    tags: ["Design", "System"],
    assignees: ["u2", "u1"],
    dueDate: format(today, "yyyy-MM-dd"), // TODAY
    attachments: [],
    comments: [
      {
        id: "c1",
        authorId: "u3",
        content: "Make sure to include the new brand colors we discussed.",
        createdAt: "2h ago",
        type: "comment"
      },
      {
          id: "sys1",
          authorId: "u1",
          content: "changed status from To Do to In Progress",
          createdAt: "1d ago",
          type: "system"
      }
    ]
  },
  {
    id: "t2",
    projectId: "p1",
    title: "User Authentication Flow",
    description: "Implement login, registration, and password recovery screens using the new API endpoints.",
    status: "todo",
    priority: "high",
    tags: ["Backend", "Auth"],
    assignees: ["u1"],
    dueDate: format(tomorrow, "yyyy-MM-dd"), // TOMORROW
    comments: [],
    attachments: []
  },
  {
    id: "t3",
    projectId: "p1",
    title: "Dashboard Analytics Chart",
    description: "Create the main revenue chart for the dashboard home screen using Recharts.",
    status: "review",
    priority: "medium",
    tags: ["Frontend", "Data"],
    assignees: ["u1"],
    coverImage: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop",
    dueDate: format(twoDaysLater, "yyyy-MM-dd"), // THIS WEEK
    comments: [],
    attachments: [
       { id: "a1", name: "mockup_v2.png", type: "image", url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop", size: "2.4MB" }
    ]
  },
  {
    id: "t4",
    projectId: "p1",
    title: "Mobile Responsiveness",
    description: "Fix layout issues on mobile devices for the settings page.",
    status: "done",
    priority: "low",
    tags: ["Bug", "Mobile"],
    assignees: ["u2"],
    dueDate: format(yesterday, "yyyy-MM-dd"), // OVERDUE
    comments: [],
    attachments: []
  },
  {
      id: "t7",
      projectId: "p2",
      title: "App Icon Design",
      description: "Create app icon variants for iOS and Android.",
      status: "design",
      priority: "high",
      tags: ["Design", "Assets"],
      assignees: ["u2"],
      dueDate: "2026-03-20", // Specific Date requested
      comments: [],
      attachments: []
  }
];

export const CHANNELS: Channel[] = [
    { id: "general", name: "general", type: "public", members: ["u1", "u2", "u3"], projectId: "p1" },
    { id: "design", name: "design-team", type: "public", members: ["u1", "u2"], projectId: "p1" },
    { id: "random", name: "random", type: "public", members: ["u1", "u2", "u3"] }, // Global
    { id: "mobile-dev", name: "mobile-dev", type: "public", members: ["u1", "u3"], projectId: "p2" },
];

export const MESSAGES: Message[] = [
    { id: "m1", channelId: "general", authorId: "u3", content: "Welcome to the new project management tool! 🚀", createdAt: "Yesterday" },
    { id: "m2", channelId: "general", authorId: "u1", content: "Looks great! Love the new dark mode.", createdAt: "Yesterday" },
    { id: "m3", channelId: "design", authorId: "u2", content: "I've uploaded the new assets to the task.", createdAt: "2h ago" },
];
