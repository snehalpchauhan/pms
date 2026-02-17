import { Sidebar, Header } from "@/components/Layout";
import Board from "@/components/Board";
import MessagesView from "@/components/MessagesView";
import TeamView from "@/components/TeamView";
import { NewTaskModal } from "@/components/NewTaskModal";
import { NewProjectModal } from "@/components/NewProjectModal";
import { NewChannelModal } from "@/components/NewChannelModal";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState } from "react";
import { PROJECTS, Task } from "@/lib/mockData";

function App() {
  const [currentView, setCurrentView] = useState<"board" | "messages" | "tasks" | "team">("board");
  const [currentProjectId, setCurrentProjectId] = useState("p1");
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isNewChannelOpen, setIsNewChannelOpen] = useState(false);
  
  const currentProject = PROJECTS.find(p => p.id === currentProjectId) || PROJECTS[0];

  const handleTaskCreate = (newTask: Partial<Task>) => {
      console.log("Creating new task:", newTask);
      // In mockup we can't easily push to immutable constants without a wrapper, 
      // but UI flow is demonstrated.
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
            currentProject={currentProjectId}
            onProjectChange={setCurrentProjectId}
            onAddProject={() => setIsNewProjectOpen(true)}
            onAddChannel={() => setIsNewChannelOpen(true)}
          />
          <div className="flex-1 flex flex-col h-full overflow-hidden relative z-0">
             <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay z-[1]" />
             
             {currentView === "board" && (
                <Header title={currentProject.name} onNewTask={() => setIsNewTaskOpen(true)} />
             )}
             
             <main className="flex-1 overflow-hidden relative z-[2]">
                {currentView === "messages" && <MessagesView />}
                {currentView === "team" && <TeamView />}
                {currentView === "board" && <Board key={currentProjectId} project={currentProject} />}
                {currentView === "tasks" && <div className="p-10 text-center text-muted-foreground">My Tasks View Placeholder</div>}
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
