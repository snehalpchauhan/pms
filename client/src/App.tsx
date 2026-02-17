import { Sidebar, Header } from "@/components/Layout";
import Board from "@/components/Board";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex h-screen bg-background overflow-hidden font-sans text-foreground selection:bg-primary/20">
          <Sidebar />
          <div className="flex-1 flex flex-col h-full overflow-hidden relative z-0">
             <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay z-[1]" />
             <Header />
             <main className="flex-1 overflow-hidden relative z-[2]">
                <Board />
             </main>
          </div>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
