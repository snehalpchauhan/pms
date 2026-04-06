import { createContext, useContext, ReactNode, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import type { User, Project, Channel, Task } from "@/lib/mockData";
import { sanitizeProjectColor } from "@shared/projectColors";
import { getEstimatedHoursFromTaskPayload, parseTaskHoursField } from "@/lib/taskHours";
import { useAuth } from "@/hooks/useAuth";
import {
  filterProjectsForQuickMenu,
  partitionProjectsCheckedFirst,
  sortProjectsBySidebarOrder,
} from "@/lib/projectSidebarOrder";

/** Show as online only while lastSeenAt is within this window (matches client heartbeat). */
const PRESENCE_TTL_MS = 90_000;

export function effectivePresenceStatus(
  raw: string | undefined,
  lastSeenAt: string | Date | null | undefined,
): NonNullable<User["status"]> {
  const last =
    lastSeenAt != null && lastSeenAt !== ""
      ? new Date(lastSeenAt).getTime()
      : 0;
  const recent = last > 0 && Date.now() - last < PRESENCE_TTL_MS;
  if (!recent) return "offline";
  if (raw === "busy") return "busy";
  return "online";
}

interface AppDataContextType {
  users: Record<string, User>;
  usersArray: User[];
  projects: Project[];
  /** Subset shown as icons on the collapsed left rail (per-user quick menu). */
  quickMenuProjects: Project[];
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
    status: effectivePresenceStatus(u.status, u.lastSeenAt),
    email: u.email || "",
    username: u.username ?? "",
  };
}

function convertProject(p: any): Project {
  return {
    id: String(p.id),
    name: p.name,
    color: sanitizeProjectColor(typeof p.color === "string" ? p.color : ""),
    description: p.description != null && p.description !== "" ? p.description : undefined,
    columns: (p.columns as any[]) || [],
    members: [],
    ownerId: p.ownerId != null ? String(p.ownerId) : undefined,
  };
}

function convertChannel(c: any): Channel {
  return {
    id: String(c.id),
    name: c.name,
    type: c.type as "public" | "private" | "direct",
    members: (c.members || []).map((m: any) => String(m.id)),
    projectId: c.projectId ? String(c.projectId) : undefined,
    memberCountDisplay: typeof c.memberCountDisplay === "number" ? c.memberCountDisplay : undefined,
    unreadCount: typeof c.unreadCount === "number" ? c.unreadCount : undefined,
    createdByUserId:
      c.createdByUserId != null && c.createdByUserId !== ""
        ? String(c.createdByUserId)
        : c.createdByUserId === null
          ? null
          : undefined,
  };
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user: authUser } = useAuth();
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
    refetchInterval: 12_000,
  });

  const usersArray = (rawUsers || []).map(convertUser);
  const usersMap: Record<string, User> = {};
  usersArray.forEach(u => { usersMap[u.id] = u; });

  const projectsList = useMemo(() => {
    const list = (rawProjects || []).map(convertProject);
    const ordered = sortProjectsBySidebarOrder(list, authUser?.projectSidebarOrder ?? null);
    return partitionProjectsCheckedFirst(ordered, authUser?.projectQuickMenuIds ?? null);
  }, [rawProjects, authUser?.projectSidebarOrder, authUser?.projectQuickMenuIds]);
  const quickMenuProjects = useMemo(
    () => filterProjectsForQuickMenu(projectsList, authUser?.projectQuickMenuIds ?? null),
    [projectsList, authUser?.projectQuickMenuIds],
  );
  const channelsList = (rawChannels || []).map(convertChannel);

  return (
    <AppDataContext.Provider value={{
      users: usersMap,
      usersArray,
      projects: projectsList,
      quickMenuProjects,
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
  type AttRow = { id: string; name: string; type: "image" | "file"; url?: string; size?: string; commentId: number | null };
  const rawAttachments: AttRow[] = (t.attachments || []).map((a: any) => ({
    id: String(a.id),
    name: a.name,
    type: a.type === "image" ? "image" : "file",
    url: a.url,
    size: a.size,
    commentId: a.commentId != null ? Number(a.commentId) : null,
  }));

  const taskLevelAttachments = rawAttachments
    .filter((a) => a.commentId == null)
    .map(({ commentId: _c, ...rest }) => rest);

  const attachmentsByCommentId = new Map<number, { id: string; name: string; type: "image" | "file"; url?: string; size?: string }[]>();
  for (const a of rawAttachments) {
    if (a.commentId == null) continue;
    const { commentId, ...row } = a;
    const list = attachmentsByCommentId.get(commentId) || [];
    list.push(row);
    attachmentsByCommentId.set(commentId, list);
  }

  return {
    id: String(t.id),
    ownerId: t.ownerId != null ? Number(t.ownerId) : null,
    projectId: String(t.projectId),
    title: t.title,
    description: t.description || "",
    status: t.status,
    boardOrder: typeof t.boardOrder === "number" ? t.boardOrder : 0,
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
      editedAt: c.editedAt != null ? String(c.editedAt) : undefined,
      parentId: c.parentId ? String(c.parentId) : undefined,
      type: c.type || "comment",
      attachments: attachmentsByCommentId.get(Number(c.id)) || [],
    })),
    checklist: (t.checklist || []).map((ci: any) => ({
      id: String(ci.id),
      text: ci.text,
      completed: ci.completed,
    })),
    attachments: taskLevelAttachments,
    estimatedHours: getEstimatedHoursFromTaskPayload(t),
    totalHours: parseTaskHoursField(t.totalHours) ?? 0,
  };
}
