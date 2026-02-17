import { Plus, LayoutGrid, CheckSquare, Settings, Users, MessageSquare, Bell, Search, Hash, Lock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import avatar1 from "@/assets/avatar-1.png";
import { PROJECTS, CHANNELS } from "@/lib/mockData";
import { cn } from "@/lib/utils";

interface SidebarProps {
    currentView: "board" | "messages" | "tasks" | "team";
    onViewChange: (view: "board" | "messages" | "tasks" | "team") => void;
    currentProject: string;
    onProjectChange: (projectId: string) => void;
    onAddProject: () => void;
    onAddChannel: () => void;
}

export function Sidebar({ currentView, onViewChange, currentProject, onProjectChange, onAddProject, onAddChannel }: SidebarProps) {
  // Filter channels based on current project or global channels
  const filteredChannels = CHANNELS.filter(c => !c.projectId || c.projectId === currentProject);

  return (
    <div className="w-64 border-r border-border h-screen bg-sidebar flex flex-col hidden md:flex">
      <div className="p-6">
        <div className="flex items-center gap-2 font-display font-bold text-xl text-foreground">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
            <LayoutGrid className="w-5 h-5" />
          </div>
          TaskFlow
        </div>
      </div>

      <div className="px-4 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search..." 
            className="pl-9 bg-background/50 border-border/50 focus-visible:ring-1 h-9 text-sm" 
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-6">
            <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">Workspace</h3>
            <div className="space-y-1">
                <Button 
                    variant={currentView === "board" ? "secondary" : "ghost"} 
                    className={cn("w-full justify-start font-medium", currentView === "board" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground")}
                    onClick={() => onViewChange("board")}
                >
                <LayoutGrid className="w-4 h-4 mr-2" />
                Board
                </Button>
                <Button 
                    variant={currentView === "tasks" ? "secondary" : "ghost"} 
                    className={cn("w-full justify-start font-medium", currentView === "tasks" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground")}
                    onClick={() => onViewChange("tasks")}
                >
                <CheckSquare className="w-4 h-4 mr-2" />
                My Tasks
                </Button>
                <Button 
                    variant={currentView === "messages" ? "secondary" : "ghost"} 
                    className={cn("w-full justify-start font-medium", currentView === "messages" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground")}
                    onClick={() => onViewChange("messages")}
                >
                <MessageSquare className="w-4 h-4 mr-2" />
                Messages
                </Button>
                <Button 
                    variant={currentView === "team" ? "secondary" : "ghost"} 
                    className={cn("w-full justify-start font-medium", currentView === "team" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground")}
                    onClick={() => onViewChange("team")}
                >
                <Users className="w-4 h-4 mr-2" />
                Team
                </Button>
            </div>
            </div>

            <div>
            <div className="flex items-center justify-between px-2 mb-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Projects</h3>
                <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-foreground" onClick={onAddProject}>
                    <Plus className="w-3 h-3" />
                </Button>
            </div>
            <div className="space-y-1">
                {PROJECTS.map(project => (
                    <Button 
                        key={project.id}
                        variant={currentProject === project.id ? "secondary" : "ghost"} 
                        className={cn("w-full justify-start", currentProject === project.id ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground")}
                        onClick={() => {
                            onProjectChange(project.id);
                            onViewChange("board");
                        }}
                    >
                    <span className={cn("w-2 h-2 rounded-full mr-2", project.color)} />
                    {project.name}
                    </Button>
                ))}
            </div>
            </div>

            <div>
                 <div className="flex items-center justify-between px-2 mb-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Channels</h3>
                    <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-foreground" onClick={onAddChannel}>
                        <Plus className="w-3 h-3" />
                    </Button>
                </div>
                <div className="space-y-1">
                    {filteredChannels.map(channel => (
                        <Button 
                            key={channel.id}
                            variant="ghost" 
                            className="w-full justify-start text-muted-foreground hover:text-foreground h-8"
                            onClick={() => onViewChange("messages")}
                        >
                        {channel.type === 'private' ? <Lock className="w-3 h-3 mr-2 opacity-70" /> : <Hash className="w-3 h-3 mr-2 opacity-70" />}
                        {channel.name}
                        </Button>
                    ))}
                </div>
            </div>
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border bg-sidebar/50">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 border border-border shadow-sm">
            <AvatarImage src={avatar1} />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate text-foreground">Jane Doe</p>
            <p className="text-xs text-muted-foreground truncate">Online</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface HeaderProps {
    title: string;
    onNewTask: () => void;
}

export function Header({ title, onNewTask }: HeaderProps) {
  return (
    <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-10 px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-display font-bold text-foreground tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 mr-2">
            <div className="flex -space-x-2">
                <Avatar className="h-8 w-8 border-2 border-background ring-1 ring-border/10">
                    <AvatarImage src={avatar1} />
                    <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium border-2 border-background text-muted-foreground ring-1 ring-border/10">
                    +3
                </div>
            </div>
            <Button variant="outline" size="sm" className="ml-2 h-8 text-xs rounded-full border-dashed px-3">
                <Plus className="w-3 h-3 mr-1" /> Invite
            </Button>
        </div>
        
        <Separator orientation="vertical" className="h-6 mx-1" />

        <Button variant="ghost" size="icon" className="text-muted-foreground relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-background"></span>
        </Button>
        <Button onClick={onNewTask} className="h-9 bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
          <Plus className="w-4 h-4 mr-2" />
          New Task
        </Button>
      </div>
    </header>
  );
}
