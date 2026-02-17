import avatar1 from "@/assets/avatar-1.png";
import avatar2 from "@/assets/avatar-2.png";
import avatar3 from "@/assets/avatar-3.png";

export type Status = "todo" | "in-progress" | "review" | "done";

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
}

export interface Column {
  id: Status;
  title: string;
  color: string;
}

export const USERS: Record<string, User> = {
  "u1": { id: "u1", name: "Jane Doe", avatar: avatar1, role: "Frontend Dev" },
  "u2": { id: "u2", name: "John Smith", avatar: avatar2, role: "Designer" },
  "u3": { id: "u3", name: "Alice Brown", avatar: avatar3, role: "Project Manager" },
};

export const COLUMNS: Column[] = [
  { id: "todo", title: "To Do", color: "bg-slate-500" },
  { id: "in-progress", title: "In Progress", color: "bg-blue-500" },
  { id: "review", title: "Review", color: "bg-orange-500" },
  { id: "done", title: "Done", color: "bg-emerald-500" },
];

export const INITIAL_TASKS: Task[] = [
  {
    id: "t1",
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
    id: "t5",
    title: "API Integration for Profile",
    description: "Connect the profile form to the update user endpoint.",
    status: "todo",
    priority: "medium",
    tags: ["Integration"],
    assignees: ["u1"],
    comments: [],
    attachments: []
  },
  {
    id: "t6",
    title: "Q1 Marketing Assets",
    description: "Prepare banners and social media assets for the upcoming campaign.",
    status: "in-progress",
    priority: "medium",
    tags: ["Marketing", "Design"],
    assignees: ["u2", "u3"],
    coverImage: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1974&auto=format&fit=crop",
    comments: [],
    attachments: []
  }
];
