import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import type { User, Project, Channel, Task } from "@/lib/mockData";

interface AppDataContextType {
  users: Record<string, User>;
  usersArray: User[];
  projects: Project[];
  channels: Channel[];
  isLoading: boolean;
  refetchUsers: () => void;
  refetchProjects: () => void;
  refetchChannels: () => void;
}

const AppDataContext = createContext<AppDataContextType | null>(null);

function convertUser(u: any): User {
  return {
    id: String(u.id),
    name: u.name,
    avatar: u.avatar || "",
    role: u.role,
    status: u.status || "offline",
    email: u.email || "",
  };
}

function convertProject(p: any): Project {
  return {
    id: String(p.id),
    name: p.name,
    color: p.color,
    description: p.description,
    columns: (p.columns as any[]) || [],
    members: [],
  };
}

function convertChannel(c: any): Channel {
  return {
    id: String(c.id),
    name: c.name,
    type: c.type as "public" | "private" | "direct",
    members: (c.members || []).map((m: any) => String(m.id)),
    projectId: c.projectId ? String(c.projectId) : undefined,
  };
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { data: rawUsers, isLoading: usersLoading, refetch: refetchUsers } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: rawProjects, isLoading: projectsLoading, refetch: refetchProjects } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: rawChannels, isLoading: channelsLoading, refetch: refetchChannels } = useQuery<any[]>({
    queryKey: ["/api/channels"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const usersArray = (rawUsers || []).map(convertUser);
  const usersMap: Record<string, User> = {};
  usersArray.forEach(u => { usersMap[u.id] = u; });

  const projectsList = (rawProjects || []).map(convertProject);
  const channelsList = (rawChannels || []).map(convertChannel);

  return (
    <AppDataContext.Provider value={{
      users: usersMap,
      usersArray,
      projects: projectsList,
      channels: channelsList,
      isLoading: usersLoading || projectsLoading || channelsLoading,
      refetchUsers,
      refetchProjects,
      refetchChannels,
    }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}

export function convertTask(t: any): Task {
  return {
    id: String(t.id),
    projectId: String(t.projectId),
    title: t.title,
    description: t.description || "",
    status: t.status,
    priority: t.priority,
    tags: t.tags || [],
    assignees: (t.assignees || []).map((a: any) => typeof a === 'object' ? String(a.id) : String(a)),
    startDate: t.startDate || undefined,
    dueDate: t.dueDate || undefined,
    recurrence: t.recurrence || undefined,
    coverImage: t.coverImage || undefined,
    comments: (t.comments || []).map((c: any) => ({
      id: String(c.id),
      authorId: String(c.authorId),
      content: c.content,
      createdAt: c.createdAt || "Just now",
      parentId: c.parentId ? String(c.parentId) : undefined,
      type: c.type || "comment",
    })),
    checklist: (t.checklist || []).map((ci: any) => ({
      id: String(ci.id),
      text: ci.text,
      completed: ci.completed,
    })),
    attachments: (t.attachments || []).map((a: any) => ({
      id: String(a.id),
      name: a.name,
      type: a.type,
      url: a.url,
      size: a.size,
    })),
    totalHours: typeof t.totalHours === "number" ? t.totalHours : 0,
  };
}
