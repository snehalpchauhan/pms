import avatar1 from "@/assets/avatar-1.png";
import avatar2 from "@/assets/avatar-2.png";
import avatar3 from "@/assets/avatar-3.png";

export type Status = "todo" | "in-progress" | "review" | "done" | string;

export type Priority = "low" | "medium" | "high";

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
  attachments?: Attachment[];
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  role: string;
  status?: "online" | "offline" | "busy";
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  tags: string[];
  assignees: string[];
  dueDate?: string;
  comments: Comment[];
  attachments: Attachment[];
  coverImage?: string;
  projectId: string;
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
}

export interface Message {
    id: string;
    channelId: string;
    authorId: string;
    content: string;
    createdAt: string;
}

export interface Channel {
    id: string;
    name: string;
    type: "public" | "private" | "direct";
    members: string[];
}

export const USERS: Record<string, User> = {
  "u1": { id: "u1", name: "Jane Doe", avatar: avatar1, role: "Frontend Dev", status: "online" },
  "u2": { id: "u2", name: "John Smith", avatar: avatar2, role: "Designer", status: "busy" },
  "u3": { id: "u3", name: "Alice Brown", avatar: avatar3, role: "Project Manager", status: "offline" },
};

export const PROJECTS: Project[] = [
    {
        id: "p1",
        name: "Website Redesign",
        color: "bg-blue-500",
        columns: [
            { id: "todo", title: "To Do", color: "bg-slate-500" },
            { id: "in-progress", title: "In Progress", color: "bg-blue-500" },
            { id: "review", title: "QA Review", color: "bg-orange-500" },
            { id: "done", title: "Done", color: "bg-emerald-500" },
        ]
    },
    {
        id: "p2",
        name: "Mobile App",
        color: "bg-orange-500",
        columns: [
            { id: "backlog", title: "Backlog", color: "bg-slate-400" },
            { id: "design", title: "Design", color: "bg-purple-500" },
            { id: "dev", title: "Development", color: "bg-blue-500" },
            { id: "testing", title: "Testing", color: "bg-amber-500" },
            { id: "deployed", title: "Deployed", color: "bg-emerald-500" },
        ]
    }
];

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
    dueDate: "2024-03-20",
    attachments: [],
    comments: [
      {
        id: "c1",
        authorId: "u3",
        content: "Make sure to include the new brand colors we discussed.",
        createdAt: "2h ago"
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
      comments: [],
      attachments: []
  }
];

export const CHANNELS: Channel[] = [
    { id: "general", name: "general", type: "public", members: ["u1", "u2", "u3"] },
    { id: "design", name: "design-team", type: "public", members: ["u1", "u2"] },
    { id: "random", name: "random", type: "public", members: ["u1", "u2", "u3"] },
    { id: "project-x", name: "project-x-secret", type: "private", members: ["u1", "u3"] },
];

export const MESSAGES: Message[] = [
    { id: "m1", channelId: "general", authorId: "u3", content: "Welcome to the new project management tool! 🚀", createdAt: "Yesterday" },
    { id: "m2", channelId: "general", authorId: "u1", content: "Looks great! Love the new dark mode.", createdAt: "Yesterday" },
    { id: "m3", channelId: "design", authorId: "u2", content: "I've uploaded the new assets to the task.", createdAt: "2h ago" },
];
