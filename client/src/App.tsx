import { Sidebar, Header } from "@/components/Layout";
import ProjectTasksView from "@/components/ProjectTasksView";
import MessagesView from "@/components/MessagesView";
import TeamView from "@/components/TeamView";
import { NewTaskModal } from "@/components/NewTaskModal";
import { NewProjectModal } from "@/components/NewProjectModal";
import { NewChannelModal } from "@/components/NewChannelModal";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { PROJECTS, Task, INITIAL_TASKS } from "@/lib/mockData";

function App() {
  const [currentView, setCurrentView] = useState<"tasks" | "messages" | "team">("tasks");
  const [currentProjectId, setCurrentProjectId] = useState("p1");
  const [currentChannelId, setCurrentChannelId] = useState<string | undefined>(undefined);
  const [currentUserRole, setCurrentUserRole] = useState("manager"); // Demo state for role switching
  
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isNewChannelOpen, setIsNewChannelOpen] = useState(false);
  
  const [allTasks, setAllTasks] = useState<Task[]>(INITIAL_TASKS);

  const currentProject = PROJECTS.find(p => p.id === currentProjectId) || PROJECTS[0];

  useEffect(() => {
      const handleOpenNewTask = () => setIsNewTaskOpen(true);
      window.addEventListener('openNewTaskModal', handleOpenNewTask);
      return () => window.removeEventListener('openNewTaskModal', handleOpenNewTask);
  }, []);

  const handleTaskCreate = (newTask: Partial<Task>) => {
      const task: Task = {
          ...newTask as Task,
          id: `t-${Date.now()}`,
          attachments: newTask.attachments || [],
          comments: [],
          tags: newTask.tags || [],
          assignees: newTask.assignees || []
      };
      setAllTasks([...allTasks, task]);
  };

  const handleProjectCreate = (newProject: any) => {
      console.log("Creating new project:", newProject);
  };

  const handleChannelCreate = (newChannel: any) => {
      console.log("Creating new channel:", newChannel);
  };

  const handleViewChange = (view: "tasks" | "messages" | "team", channelId?: string) => {
      setCurrentView(view);
      if (channelId) {
          setCurrentChannelId(channelId);
      }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex h-screen bg-background overflow-hidden font-sans text-foreground selection:bg-primary/20">
          <Sidebar 
            currentView={currentView} 
            currentChannelId={currentChannelId}
            onViewChange={handleViewChange}
            currentProject={currentProject}
            onProjectChange={(id) => {
                setCurrentProjectId(id);
                setCurrentView("tasks"); // Default to tasks when switching project
            }}
            onAddProject={() => setIsNewProjectOpen(true)}
            onAddChannel={() => setIsNewChannelOpen(true)}
            currentUserRole={currentUserRole}
          />
          <div className="flex-1 flex flex-col h-full overflow-hidden relative z-0">
             <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay z-[1]" />
             
             <Header 
                title={currentProject.name} 
                view={currentView} 
                currentUserRole={currentUserRole}
                onRoleChange={setCurrentUserRole}
             />
             
             <main className="flex-1 overflow-hidden relative z-[2]">
                {currentView === "messages" && <MessagesView project={currentProject} channelId={currentChannelId} />}
                {currentView === "team" && <TeamView project={currentProject} currentUserRole={currentUserRole} />}
                {currentView === "tasks" && <ProjectTasksView project={currentProject} tasks={allTasks.filter(t => t.projectId === currentProjectId)} />}
             </main>
          </div>
        </div>
        
        <NewTaskModal 
            open={isNewTaskOpen} 
            onOpenChange={setIsNewTaskOpen} 
            project={currentProject}
            onSave={handleTaskCreate}
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
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
