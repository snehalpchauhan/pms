import { Plus, LayoutGrid, CheckSquare, Settings, Users, MessageSquare, Bell, Search, Hash, Lock, ListTodo, FolderKanban, LogOut, Briefcase } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import avatar1 from "@/assets/avatar-1.png";
import { PROJECTS, CHANNELS, Project, USERS } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
    currentView: "tasks" | "messages" | "team";
    onViewChange: (view: "tasks" | "messages" | "team") => void;
    currentProject: Project;
    onProjectChange: (projectId: string) => void;
    onAddProject: () => void;
    onAddChannel: () => void;
    currentUserRole: string;
}

export function Sidebar({ currentView, onViewChange, currentProject, onProjectChange, onAddProject, onAddChannel, currentUserRole }: SidebarProps) {
  const projectChannels = CHANNELS.filter(c => c.projectId === currentProject.id);

  return (
    <div className="flex h-screen bg-sidebar border-r border-border shadow-2xl z-20">
        {/* Primary Rail - Project Switcher */}
        <div className="w-[70px] bg-background border-r border-border flex flex-col items-center py-6 gap-4 shrink-0">
             <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20 mb-2">
                <LayoutGrid className="w-6 h-6" />
             </div>
             
             <Separator className="w-8" />

             <ScrollArea className="flex-1 w-full px-3 gap-3 flex flex-col items-center">
                 <div className="flex flex-col gap-3 items-center w-full">
                    {PROJECTS.map(project => (
                        <Tooltip key={project.id}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => onProjectChange(project.id)}
                                    className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 relative group",
                                        currentProject.id === project.id 
                                            ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary ring-offset-2 ring-offset-background" 
                                            : "bg-muted hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <span className="font-bold text-sm">{project.name.substring(0, 2).toUpperCase()}</span>
                                    {currentProject.id === project.id && (
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[18px] w-1 h-8 bg-primary rounded-r-full" />
                                    )}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                <p>{project.name}</p>
                            </TooltipContent>
                        </Tooltip>
                    ))}
                    
                    {currentUserRole === 'manager' && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button 
                                    onClick={onAddProject}
                                    className="w-10 h-10 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </TooltipTrigger>
                             <TooltipContent side="right">
                                <p>Create Project</p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                 </div>
             </ScrollArea>

             <div className="mt-auto pb-4">
                 <Tooltip>
                     <TooltipTrigger asChild>
                        <div className="relative group cursor-pointer">
                            <Avatar className="h-10 w-10 border-2 border-background ring-1 ring-border/20 group-hover:ring-primary/50 transition-all">
                                <AvatarImage src={avatar1} />
                                <AvatarFallback>JD</AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-1 -right-1 bg-background rounded-full px-1.5 py-0.5 border border-border shadow-sm">
                                <span className="text-[8px] font-bold uppercase text-foreground">{currentUserRole[0]}</span>
                            </div>
                        </div>
                     </TooltipTrigger>
                     <TooltipContent side="right">
                         <p className="capitalize">Role: {currentUserRole}</p>
                     </TooltipContent>
                 </Tooltip>
             </div>
        </div>

        {/* Secondary Sidebar - Project Context */}
        <div className="w-60 flex flex-col bg-muted/5">
             <div className="h-16 flex items-center px-5 border-b border-border/40 shrink-0">
                 <div className="flex flex-col overflow-hidden">
                    <h2 className="font-display font-bold text-lg truncate leading-tight">
                        {currentProject.name}
                    </h2>
                    <span className="text-xs text-muted-foreground truncate">{currentProject.description}</span>
                 </div>
             </div>

             <div className="p-3">
                 <Button className="w-full justify-start gap-2 shadow-sm" onClick={() => {
                     const event = new CustomEvent('openNewTaskModal');
                     window.dispatchEvent(event);
                 }}>
                     <Plus className="w-4 h-4" /> New Task
                 </Button>
             </div>

             <ScrollArea className="flex-1 px-3">
                 <div className="space-y-6 py-2">
                     <div className="space-y-1">
                        <Button 
                            variant={currentView === "tasks" ? "secondary" : "ghost"} 
                            className={cn("w-full justify-start font-medium h-9", currentView === "tasks" && "bg-background shadow-sm text-primary")}
                            onClick={() => onViewChange("tasks")}
                        >
                            <Briefcase className="w-4 h-4 mr-2 opacity-70" />
                            Tasks & Board
                        </Button>
                         <Button 
                            variant={currentView === "team" ? "secondary" : "ghost"} 
                            className={cn("w-full justify-start font-medium h-9", currentView === "team" && "bg-background shadow-sm text-primary")}
                            onClick={() => onViewChange("team")}
                        >
                            <Users className="w-4 h-4 mr-2 opacity-70" />
                            Members & Access
                        </Button>
                     </div>

                     <div>
                        <div className="flex items-center justify-between px-2 mb-2 group">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Channels</h3>
                            <Plus 
                                className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-pointer hover:text-primary transition-opacity" 
                                onClick={onAddChannel}
                            />
                        </div>
                        <div className="space-y-0.5">
                            {projectChannels.length > 0 ? projectChannels.map(channel => (
                                <Button 
                                    key={channel.id}
                                    variant={currentView === "messages" ? "secondary" : "ghost"} 
                                    className={cn("w-full justify-start h-8 font-normal text-muted-foreground hover:text-foreground px-2", currentView === "messages" && "bg-background shadow-sm text-primary font-medium")}
                                    onClick={() => onViewChange("messages")}
                                >
                                    {channel.type === 'private' ? <Lock className="w-3.5 h-3.5 mr-2 opacity-70" /> : <Hash className="w-3.5 h-3.5 mr-2 opacity-70" />}
                                    <span className="truncate">{channel.name}</span>
                                </Button>
                            )) : (
                                <p className="text-[10px] text-muted-foreground px-2 italic">No channels yet</p>
                            )}
                        </div>
                    </div>
                 </div>
             </ScrollArea>
             
             <div className="p-4 border-t border-border/40 text-xs text-muted-foreground flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors">
                 <LogOut className="w-3.5 h-3.5" />
                 Log out
             </div>
        </div>
    </div>
  );
}

interface HeaderProps {
    title: string;
    view: string;
    currentUserRole: string;
    onRoleChange: (role: string) => void;
}

export function Header({ title, view, currentUserRole, onRoleChange }: HeaderProps) {
    const viewName = view === 'tasks' ? 'Tasks' : view.charAt(0).toUpperCase() + view.slice(1);
    
  return (
    <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-10 px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-4">
          <div className="flex flex-col">
             <h1 className="text-sm font-medium text-muted-foreground">{title}</h1>
             <h2 className="text-lg font-display font-bold text-foreground tracking-tight leading-none">{viewName}</h2>
          </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Role Switcher for Demo */}
        <div className="flex items-center gap-2 mr-4 bg-muted/50 p-1 rounded-lg border border-border/50">
            <span className="text-xs font-medium px-2 text-muted-foreground">View as:</span>
            {(['manager', 'employee', 'client'] as const).map(role => (
                <button
                    key={role}
                    onClick={() => onRoleChange(role)}
                    className={cn(
                        "text-[10px] uppercase font-bold px-2 py-1 rounded-md transition-all",
                        currentUserRole === role 
                            ? "bg-primary text-primary-foreground shadow-sm" 
                            : "hover:bg-background text-muted-foreground"
                    )}
                >
                    {role}
                </button>
            ))}
        </div>

        <div className="relative w-48 hidden lg:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
                placeholder="Search..." 
                className="pl-9 bg-background border-border/50 h-9 text-sm" 
            />
        </div>
        
        <Separator orientation="vertical" className="h-6 mx-2" />

        <Button variant="ghost" size="icon" className="text-muted-foreground relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-background"></span>
        </Button>
      </div>
    </header>
  );
}
