import { Sidebar, Header } from "@/components/Layout";
import Board from "@/components/Board";
import MessagesView from "@/components/MessagesView";
import TeamView from "@/components/TeamView";
import TaskListView from "@/components/TaskListView";
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
  const [currentView, setCurrentView] = useState<"board" | "list" | "messages" | "team">("board");
  const [currentProjectId, setCurrentProjectId] = useState("p1");
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isNewChannelOpen, setIsNewChannelOpen] = useState(false);
  
  // In a real app we'd fetch these
  const [allTasks, setAllTasks] = useState<Task[]>(INITIAL_TASKS);

  const currentProject = PROJECTS.find(p => p.id === currentProjectId) || PROJECTS[0];

  useEffect(() => {
      const handleOpenNewTask = () => setIsNewTaskOpen(true);
      window.addEventListener('openNewTaskModal', handleOpenNewTask);
      return () => window.removeEventListener('openNewTaskModal', handleOpenNewTask);
  }, []);

  const handleTaskCreate = (newTask: Partial<Task>) => {
      console.log("Creating new task:", newTask);
      // Mock update to show it in UI
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

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex h-screen bg-background overflow-hidden font-sans text-foreground selection:bg-primary/20">
          <Sidebar 
            currentView={currentView} 
            onViewChange={setCurrentView}
            currentProject={currentProject}
            onProjectChange={(id) => {
                setCurrentProjectId(id);
                // Optional: Reset view to board when changing projects?
                // setCurrentView("board");
            }}
            onAddProject={() => setIsNewProjectOpen(true)}
            onAddChannel={() => setIsNewChannelOpen(true)}
          />
          <div className="flex-1 flex flex-col h-full overflow-hidden relative z-0">
             <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay z-[1]" />
             
             <Header title={currentProject.name} view={currentView} />
             
             <main className="flex-1 overflow-hidden relative z-[2]">
                {currentView === "messages" && <MessagesView project={currentProject} />}
                {currentView === "team" && <TeamView project={currentProject} />}
                {currentView === "board" && <Board key={currentProjectId} project={currentProject} tasks={allTasks.filter(t => t.projectId === currentProjectId)} />}
                {currentView === "list" && <TaskListView project={currentProject} tasks={allTasks.filter(t => t.projectId === currentProjectId)} />}
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
