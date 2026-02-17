import { Sidebar, Header } from "@/components/Layout";
import Board from "@/components/Board";
import MessagesView from "@/components/MessagesView";
import { NewTaskModal } from "@/components/NewTaskModal";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState } from "react";
import { PROJECTS, Task } from "@/lib/mockData";

function App() {
  const [currentView, setCurrentView] = useState<"board" | "messages" | "tasks">("board");
  const [currentProjectId, setCurrentProjectId] = useState("p1");
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  // In a real app, this would be managed by React Query or context
  // but for mockup we'll lift state here or just rely on the Board's internal state + prop drilling key to reset
  
  const currentProject = PROJECTS.find(p => p.id === currentProjectId) || PROJECTS[0];

  const handleTaskCreate = (newTask: Partial<Task>) => {
      // In a real app this would trigger a mutation
      // For the mockup, we'll just log it and maybe the board component would refetch
      console.log("Creating new task:", newTask);
      // To simulate update, we could force a re-render or pass new data down
      // But for this mockup structure, the Board uses local state initialized from mock data
      // So without context/redux, we can't easily push to it from here without lifting ALL board state up.
      // For the prototype, we'll just show the UI flow works.
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
          />
          <div className="flex-1 flex flex-col h-full overflow-hidden relative z-0">
             <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay z-[1]" />
             
             {currentView !== "messages" && (
                <Header title={currentProject.name} onNewTask={() => setIsNewTaskOpen(true)} />
             )}
             
             <main className="flex-1 overflow-hidden relative z-[2]">
                {currentView === "messages" ? (
                    <MessagesView />
                ) : (
                    // We pass a key to force re-mount when project changes, ensuring tasks reload
                    <Board key={currentProjectId} project={currentProject} />
                )}
             </main>
          </div>
        </div>
        
        <NewTaskModal 
            open={isNewTaskOpen} 
            onOpenChange={setIsNewTaskOpen} 
            project={currentProject}
            onSave={handleTaskCreate}
        />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
