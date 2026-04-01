import { Sidebar, Header } from "@/components/Layout";
import ProjectTasksView from "@/components/ProjectTasksView";
import MessagesView from "@/components/MessagesView";
import TeamView from "@/components/TeamView";
import CompanySettingsView from "@/components/CompanySettingsView";
import UserProfileView from "@/components/UserProfileView";
import TimecardsView from "@/components/TimecardsView";
import { NewTaskModal } from "@/components/NewTaskModal";
import { NewProjectModal } from "@/components/NewProjectModal";
import { NewChannelModal } from "@/components/NewChannelModal";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect, createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppDataProvider, useAppData, convertTask } from "@/hooks/useAppData";
import { getQueryFn } from "@/lib/queryClient";
import LoginPage from "@/pages/LoginPage";
import type { Task } from "@/lib/mockData";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ClientPermissions {
  role: string;
  clientShowTimecards: boolean;
  clientTaskAccess: string;
}

interface ClientPermissionsContextType {
  permissions: ClientPermissions | null;
  isLoadingPermissions: boolean;
}

export const ClientPermissionsContext = createContext<ClientPermissionsContextType>({
  permissions: null,
  isLoadingPermissions: false,
});

export function useClientPermissions() {
  return useContext(ClientPermissionsContext);
}

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const { user, logout } = useAuth();
  const { projects, channels, isLoading: appDataLoading } = useAppData();

  const [currentView, setCurrentView] = useState<"tasks" | "messages" | "team" | "settings" | "profile" | "timecards">("tasks");
  const [currentProjectId, setCurrentProjectId] = useState<string>("");
  const [currentChannelId, setCurrentChannelId] = useState<string | undefined>(undefined);

  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [newTaskDefaultStatus, setNewTaskDefaultStatus] = useState<string>("");
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isNewChannelOpen, setIsNewChannelOpen] = useState(false);

  useEffect(() => {
    if (projects.length > 0 && !currentProjectId) {
      setCurrentProjectId(projects[0].id);
    }
  }, [projects, currentProjectId]);

  const currentProject = projects.find(p => p.id === currentProjectId) || projects[0];
  const numericProjectId = currentProject ? Number(currentProject.id) : null;

  // Fetch client permissions for the current project
  const { data: permissionsData, isLoading: isLoadingPermissions } = useQuery<ClientPermissions>({
    queryKey: ["/api/projects", numericProjectId, "my-permissions"],
    queryFn: async () => {
      if (!numericProjectId) return null;
      const res = await fetch(`/api/projects/${numericProjectId}/my-permissions`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!numericProjectId,
  });

  const { data: rawTasks } = useQuery<any[]>({
    queryKey: ["/api/projects", numericProjectId, "tasks"],
    queryFn: async () => {
      if (!numericProjectId) return [];
      const res = await fetch(`/api/projects/${numericProjectId}/tasks`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
    enabled: !!numericProjectId,
  });

  const tasks: Task[] = (rawTasks || []).map(convertTask);

  const isClient = user?.role === "client";
  const clientPermissions: ClientPermissions | null = permissionsData || null;

  // For non-clients, always allow all access
  const effectivePermissions: ClientPermissions = isClient
    ? (clientPermissions || { role: "client", clientShowTimecards: false, clientTaskAccess: "feedback" })
    : { role: user?.role || "employee", clientShowTimecards: true, clientTaskAccess: "full" };

  useEffect(() => {
    const handleOpenNewTask = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.status) {
        setNewTaskDefaultStatus(detail.status);
      } else {
        setNewTaskDefaultStatus("");
      }
      setIsNewTaskOpen(true);
    };
    window.addEventListener('openNewTaskModal', handleOpenNewTask);
    return () => window.removeEventListener('openNewTaskModal', handleOpenNewTask);
  }, []);

  const handleTaskCreate = async (newTask: Partial<Task>) => {
    try {
      await apiRequest("POST", "/api/tasks", {
        projectId: Number(currentProjectId),
        title: newTask.title,
        description: newTask.description,
        status: newTask.status || "todo",
        priority: newTask.priority || "medium",
        tags: newTask.tags || [],
        startDate: newTask.startDate,
        dueDate: newTask.dueDate,
        coverImage: newTask.coverImage,
        assignees: (newTask.assignees || []).map(Number),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", numericProjectId, "tasks"] });
    } catch (e) {
      console.error("Failed to create task:", e);
    }
  };

  const handleProjectCreate = async (newProject: any) => {
    try {
      await apiRequest("POST", "/api/projects", {
        name: newProject.name,
        color: newProject.color || "bg-blue-500",
        description: newProject.description,
        columns: newProject.columns || [
          { id: "todo", title: "To Do", color: "bg-slate-500" },
          { id: "in-progress", title: "In Progress", color: "bg-blue-500" },
          { id: "review", title: "Review", color: "bg-orange-500" },
          { id: "done", title: "Done", color: "bg-emerald-500" },
        ],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    } catch (e) {
      console.error("Failed to create project:", e);
    }
  };

  const handleChannelCreate = async (newChannel: any) => {
    try {
      await apiRequest("POST", "/api/channels", {
        name: newChannel.name,
        type: newChannel.type || "public",
        projectId: Number(currentProjectId),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
    } catch (e) {
      console.error("Failed to create channel:", e);
    }
  };

  const handleViewChange = (view: "tasks" | "messages" | "team" | "settings" | "profile" | "timecards", channelId?: string) => {
    setCurrentView(view);
    if (channelId) {
      setCurrentChannelId(channelId);
    }
  };

  if (appDataLoading) {
    return <LoadingScreen />;
  }

  if (projects.length === 0) {
    const canCreateProject = user?.role === "admin" || user?.role === "manager";
    return (
      <>
        <div className="flex h-screen items-center justify-center bg-background p-6">
          <div className="max-w-md text-center space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">No projects yet</h1>
              <p className="text-muted-foreground text-sm">
                {canCreateProject
                  ? "Create a project to start using the workspace."
                  : "You are not a member of any project yet. Ask an administrator to invite you."}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {canCreateProject && (
                <Button type="button" onClick={() => setIsNewProjectOpen(true)}>
                  Create your first project
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => logout()}>
                Sign out
              </Button>
            </div>
          </div>
        </div>
        <NewProjectModal
          open={isNewProjectOpen}
          onOpenChange={setIsNewProjectOpen}
          onSave={handleProjectCreate}
        />
        <Toaster />
      </>
    );
  }

  if (!currentProject) {
    return <LoadingScreen />;
  }

  const currentUserRole = user?.role || "employee";

  return (
    <ClientPermissionsContext.Provider value={{ permissions: effectivePermissions, isLoadingPermissions }}>
      <>
        <div className="flex h-screen bg-background overflow-hidden font-sans text-foreground selection:bg-primary/20">
          <Sidebar
            currentView={currentView}
            currentChannelId={currentChannelId}
            onViewChange={handleViewChange}
            currentProject={currentProject}
            onProjectChange={(id) => {
              setCurrentProjectId(id);
              setCurrentView("tasks");
            }}
            onAddProject={() => setIsNewProjectOpen(true)}
            onAddChannel={() => setIsNewChannelOpen(true)}
            currentUserRole={currentUserRole}
            clientPermissions={effectivePermissions}
          />

          <div className="flex-1 flex flex-col h-full overflow-hidden relative z-0">
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay z-[1]" />

            {currentView !== "settings" && currentView !== "profile" && currentView !== "timecards" && (
              <Header
                title={currentProject.name}
                view={currentView}
                currentUserRole={currentUserRole}
                onRoleChange={() => {}}
              />
            )}

            <main className="flex-1 overflow-hidden relative z-[2]">
              {currentView === "settings" && <CompanySettingsView />}
              {currentView === "profile" && <UserProfileView currentUserRole={currentUserRole} />}
              {currentView === "messages" && <MessagesView project={currentProject} channelId={currentChannelId} />}
              {currentView === "team" && <TeamView project={currentProject} currentUserRole={currentUserRole} />}
              {currentView === "tasks" && (
                <ProjectTasksView
                  project={currentProject}
                  tasks={tasks}
                  clientPermissions={effectivePermissions}
                />
              )}
              {currentView === "timecards" && (
                <TimecardsView
                  currentUserRole={currentUserRole}
                  currentProject={currentProject}
                  clientPermissions={effectivePermissions}
                />
              )}
            </main>
          </div>
        </div>

        <NewTaskModal
          open={isNewTaskOpen}
          onOpenChange={(open) => {
            setIsNewTaskOpen(open);
            if (!open) setNewTaskDefaultStatus("");
          }}
          project={currentProject}
          onSave={handleTaskCreate}
          defaultStatus={newTaskDefaultStatus}
        />

        <NewProjectModal
          open={isNewProjectOpen}
          onOpenChange={setIsNewProjectOpen}
          onSave={handleProjectCreate}
        />

        <NewChannelModal
          open={isNewChannelOpen}
          onOpenChange={setIsNewChannelOpen}
          projectId={currentProjectId}
          onSave={handleChannelCreate}
        />

        <Toaster />
      </>
    </ClientPermissionsContext.Provider>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!user) return <LoginPage />;

  return (
    <AppDataProvider>
      <AuthenticatedApp />
    </AppDataProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
