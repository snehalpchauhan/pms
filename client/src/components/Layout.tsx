import { Plus, LayoutGrid, CheckSquare, Settings, Users, MessageSquare, Bell, Search, Hash, Lock, ListTodo, FolderKanban, LogOut, Briefcase, Building2, User, Shield, Key, Clock, LogIn } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import avatar1 from "@/assets/avatar-1.png";
import { Project } from "@/lib/mockData";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { COMPANY_SETTINGS_TAB_EVENT } from "@/lib/companySettingsNav";
import { Badge } from "@/components/ui/badge";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import type { ClientPermissions } from "@/App";

interface SidebarProps {
    currentView: "tasks" | "messages" | "team" | "settings" | "profile" | "timecards";
    currentChannelId?: string; 
    onViewChange: (view: "tasks" | "messages" | "team" | "settings" | "profile" | "timecards", channelId?: string) => void;
    /** null when there are no projects or none selected yet */
    currentProject: Project | null;
    onProjectChange: (projectId: string) => void;
    onAddProject: () => void;
    onAddChannel: () => void;
    currentUserRole: string;
    clientPermissions?: ClientPermissions;
}

const SETTINGS_SIDEBAR_TABS = ["general", "login", "users", "billing"] as const;

function settingsSidebarTabFromHash(): (typeof SETTINGS_SIDEBAR_TABS)[number] {
  if (typeof window === "undefined") return "general";
  const h = window.location.hash.replace(/^#/, "");
  return SETTINGS_SIDEBAR_TABS.includes(h as (typeof SETTINGS_SIDEBAR_TABS)[number])
    ? (h as (typeof SETTINGS_SIDEBAR_TABS)[number])
    : "general";
}

export function Sidebar({ currentView, currentChannelId, onViewChange, currentProject, onProjectChange, onAddProject, onAddChannel, currentUserRole, clientPermissions }: SidebarProps) {
  const { users, projects, channels } = useAppData();
  const { logout } = useAuth();
  const [projectSearchOpen, setProjectSearchOpen] = useState(false);
  const [settingsSidebarTab, setSettingsSidebarTab] = useState(settingsSidebarTabFromHash);

  useEffect(() => {
    const onHash = () => setSettingsSidebarTab(settingsSidebarTabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onTab = (e: Event) => {
      const d = (e as CustomEvent<string>).detail;
      if (SETTINGS_SIDEBAR_TABS.includes(d as (typeof SETTINGS_SIDEBAR_TABS)[number])) {
        setSettingsSidebarTab(d as (typeof SETTINGS_SIDEBAR_TABS)[number]);
      }
    };
    window.addEventListener(COMPANY_SETTINGS_TAB_EVENT, onTab);
    return () => window.removeEventListener(COMPANY_SETTINGS_TAB_EVENT, onTab);
  }, []);
  const projectChannels = currentProject
    ? channels.filter((c) => c.projectId === currentProject.id)
    : [];
  const projectMembers = Object.values(users);

  const isClient = currentUserRole === "client";
  const showTimecards = !isClient || (clientPermissions?.clientShowTimecards === true);
  const showTeam = !isClient;
  const showSettings = !isClient && currentUserRole === "admin";
  const showNewProject = !isClient && (currentUserRole === "manager" || currentUserRole === "admin");
  const showNewChannel = !isClient;
  const showNewTask = !isClient || (clientPermissions?.clientTaskAccess === "contribute" || clientPermissions?.clientTaskAccess === "full");

  // Determine if we're in a "Global" context (outside a project)
  const isGlobalView = currentView === "settings" || currentView === "profile" || currentView === "timecards";
  const isSettingsView = currentView === "settings";
  const isProfileView = currentView === "profile";
  const isTimecardsView = currentView === "timecards";

  return (
    <div className="flex h-screen bg-sidebar border-r border-border shadow-2xl z-20">
        {/* Primary Rail - Global Navigation & Project Switcher */}
        <div className="w-[70px] bg-background border-r border-border flex flex-col items-center py-4 gap-3 shrink-0">
             {/* Home/Search Quick Action */}
             <Tooltip>
                <TooltipTrigger asChild>
                    <button 
                        onClick={() => setProjectSearchOpen(true)}
                        className="w-10 h-10 rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground hover:text-primary transition-all flex items-center justify-center mb-2"
                    >
                        <Search className="w-5 h-5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="right">Find Project (Ctrl+K)</TooltipContent>
             </Tooltip>

             <Separator className="w-8" />

             {/* Projects List */}
             <ScrollArea className="flex-1 w-full px-3 gap-3 flex flex-col items-center">
                 <div className="flex flex-col gap-3 items-center w-full py-2">
                    {projects.map(project => (
                        <Tooltip key={project.id}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => {
                                        onProjectChange(project.id);
                                        if (isGlobalView) onViewChange("tasks");
                                    }}
                                    className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 relative group",
                                        !isGlobalView && currentProject?.id === project.id
                                            ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary ring-offset-2 ring-offset-background" 
                                            : "bg-muted hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <span className="font-bold text-sm">{project.name.substring(0, 2).toUpperCase()}</span>
                                    {!isGlobalView && currentProject?.id === project.id && (
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[18px] w-1 h-8 bg-primary rounded-r-full" />
                                    )}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                <p>{project.name}</p>
                            </TooltipContent>
                        </Tooltip>
                    ))}
                    
                    {showNewProject && (
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

             {/* Bottom Actions: Admin/Settings & User */}
             <div className="mt-auto pb-4 flex flex-col gap-3 items-center">
                 {showTimecards && (
                     <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={() => onViewChange("timecards")}
                                className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200",
                                    isTimecardsView 
                                        ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-600 ring-offset-2 ring-offset-background" 
                                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                                )}
                                data-testid="button-nav-timecards"
                            >
                                <Clock className="w-5 h-5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">Timecards</TooltipContent>
                     </Tooltip>
                 )}

                 {showSettings && (
                     <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={() => onViewChange("settings")}
                                className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200",
                                    isSettingsView 
                                        ? "bg-purple-600 text-white shadow-md ring-2 ring-purple-600 ring-offset-2 ring-offset-background" 
                                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                                )}
                            >
                                <Building2 className="w-5 h-5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">Company Settings</TooltipContent>
                     </Tooltip>
                 )}

                 <Tooltip>
                     <TooltipTrigger asChild>
                        <div 
                            className="relative group cursor-pointer"
                            onClick={() => onViewChange("profile")}
                        >
                            <Avatar className={cn("h-10 w-10 border-2 transition-all", isProfileView ? "ring-2 ring-primary border-background" : "border-background ring-1 ring-border/20 group-hover:ring-primary/50")}>
                                <AvatarImage src={avatar1} />
                                <AvatarFallback>JD</AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-1 -right-1 bg-background rounded-full px-1.5 py-0.5 border border-border shadow-sm">
                                <span className="text-[8px] font-bold uppercase text-foreground">{currentUserRole[0]}</span>
                            </div>
                        </div>
                     </TooltipTrigger>
                     <TooltipContent side="right">
                         <p className="capitalize">My Profile</p>
                     </TooltipContent>
                 </Tooltip>
             </div>
        </div>

        {/* Secondary Sidebar - Context Aware */}
        <div className="w-60 flex flex-col bg-muted/5 animate-in slide-in-from-left-2 duration-200">
             {isTimecardsView ? (
                <div className="flex-1 flex flex-col">
                    <div className="h-16 flex items-center px-5 border-b border-border/40 shrink-0">
                        <h2 className="font-display font-bold text-lg">Timecards</h2>
                    </div>
                    <ScrollArea className="flex-1 px-3 py-4">
                        <div className="space-y-1">
                            <Button variant="ghost" className="w-full justify-start font-medium bg-background shadow-sm text-primary">
                                <Clock className="w-4 h-4 mr-2" />
                                {isClient ? "Shared Hours" : "Time Log"}
                            </Button>
                        </div>
                    </ScrollArea>
                </div>
             ) : isSettingsView ? (
                 <div className="flex-1 flex flex-col">
                     <div className="h-16 flex items-center px-5 border-b border-border/40 shrink-0">
                         <h2 className="font-display font-bold text-lg">Administration</h2>
                     </div>
                     <ScrollArea className="flex-1 px-3 py-4">
                         <div className="space-y-1">
                             <Button
                                 variant="ghost"
                                 className={cn(
                                     "w-full justify-start font-medium",
                                     settingsSidebarTab === "general"
                                         ? "bg-background shadow-sm text-primary"
                                         : "text-muted-foreground",
                                 )}
                                 onClick={() =>
                                     window.dispatchEvent(new CustomEvent(COMPANY_SETTINGS_TAB_EVENT, { detail: "general" }))
                                 }
                             >
                                 <Settings className="w-4 h-4 mr-2" />
                                 General
                             </Button>
                             <Button
                                 variant="ghost"
                                 className={cn(
                                     "w-full justify-start font-medium",
                                     settingsSidebarTab === "login"
                                         ? "bg-background shadow-sm text-primary"
                                         : "text-muted-foreground",
                                 )}
                                 onClick={() =>
                                     window.dispatchEvent(new CustomEvent(COMPANY_SETTINGS_TAB_EVENT, { detail: "login" }))
                                 }
                             >
                                 <LogIn className="w-4 h-4 mr-2" />
                                 Login options
                             </Button>
                             <Button
                                 variant="ghost"
                                 className={cn(
                                     "w-full justify-start font-medium",
                                     settingsSidebarTab === "users"
                                         ? "bg-background shadow-sm text-primary"
                                         : "text-muted-foreground",
                                 )}
                                 onClick={() =>
                                     window.dispatchEvent(new CustomEvent(COMPANY_SETTINGS_TAB_EVENT, { detail: "users" }))
                                 }
                             >
                                 <Users className="w-4 h-4 mr-2" />
                                 User Management
                             </Button>
                             <Button
                                 variant="ghost"
                                 className={cn(
                                     "w-full justify-start font-medium",
                                     settingsSidebarTab === "billing"
                                         ? "bg-background shadow-sm text-primary"
                                         : "text-muted-foreground",
                                 )}
                                 onClick={() =>
                                     window.dispatchEvent(new CustomEvent(COMPANY_SETTINGS_TAB_EVENT, { detail: "billing" }))
                                 }
                             >
                                 <Briefcase className="w-4 h-4 mr-2" />
                                 Billing
                             </Button>
                         </div>
                     </ScrollArea>
                 </div>
             ) : isProfileView ? (
                <div className="flex-1 flex flex-col">
                    <div className="h-16 flex items-center px-5 border-b border-border/40 shrink-0">
                        <h2 className="font-display font-bold text-lg">Account</h2>
                    </div>
                    <ScrollArea className="flex-1 px-3 py-4">
                        <div className="space-y-1">
                            <Button variant="ghost" className="w-full justify-start font-medium bg-background shadow-sm text-primary">
                                <User className="w-4 h-4 mr-2" />
                                My Profile
                            </Button>
                            <Button variant="ghost" className="w-full justify-start font-medium text-muted-foreground">
                                <Shield className="w-4 h-4 mr-2" />
                                Security
                            </Button>
                            <Button variant="ghost" className="w-full justify-start font-medium text-muted-foreground">
                                <Bell className="w-4 h-4 mr-2" />
                                Notifications
                            </Button>
                        </div>
                    </ScrollArea>
                </div>
             ) : !currentProject ? (
                <div className="flex-1 flex flex-col min-h-0">
                    <div className="h-16 flex items-center px-5 border-b border-border/40 shrink-0">
                        <h2 className="font-display font-bold text-lg">Workspace</h2>
                    </div>
                    <ScrollArea className="flex-1 px-4 py-4">
                        <p className="text-sm text-muted-foreground mb-4">
                            Set up company settings and users first, or create a project when you are ready to track work.
                        </p>
                        {showNewProject && (
                            <Button className="w-full justify-start gap-2" variant="secondary" onClick={onAddProject}>
                                <Plus className="w-4 h-4" />
                                New project
                            </Button>
                        )}
                    </ScrollArea>
                </div>
             ) : (
                 <>
                    <div className="h-16 flex items-center px-5 border-b border-border/40 shrink-0">
                        <div className="flex flex-col overflow-hidden">
                            <h2 className="font-display font-bold text-lg truncate leading-tight">
                                {currentProject.name}
                            </h2>
                            <span className="text-xs text-muted-foreground truncate">{currentProject.description}</span>
                        </div>
                    </div>

                    {showNewTask && (
                        <div className="p-3">
                            <Button className="w-full justify-start gap-2 shadow-sm" onClick={() => {
                                const event = new CustomEvent('openNewTaskModal');
                                window.dispatchEvent(event);
                            }}>
                                <Plus className="w-4 h-4" /> New Task
                            </Button>
                        </div>
                    )}

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
                                {showTeam && (
                                    <Button 
                                        variant={currentView === "team" ? "secondary" : "ghost"} 
                                        className={cn("w-full justify-start font-medium h-9", currentView === "team" && "bg-background shadow-sm text-primary")}
                                        onClick={() => onViewChange("team")}
                                    >
                                        <Users className="w-4 h-4 mr-2 opacity-70" />
                                        Members & Access
                                    </Button>
                                )}
                            </div>

                            {!isClient && (
                                <>
                                    <div>
                                        <div className="flex items-center justify-between px-2 mb-2 group">
                                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Channels</h3>
                                            {showNewChannel && (
                                                <Plus 
                                                    className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-pointer hover:text-primary transition-opacity" 
                                                    onClick={onAddChannel}
                                                />
                                            )}
                                        </div>
                                        <div className="space-y-0.5">
                                            {projectChannels.length > 0 ? projectChannels.map(channel => (
                                                <Button 
                                                    key={channel.id}
                                                    variant={currentView === "messages" && currentChannelId === channel.id ? "secondary" : "ghost"} 
                                                    className={cn(
                                                        "w-full justify-start h-8 font-normal text-muted-foreground hover:text-foreground px-2", 
                                                        currentView === "messages" && currentChannelId === channel.id && "bg-background shadow-sm text-primary font-medium"
                                                    )}
                                                    onClick={() => onViewChange("messages", channel.id)}
                                                >
                                                    {channel.type === 'private' ? <Lock className="w-3.5 h-3.5 mr-2 opacity-70" /> : <Hash className="w-3.5 h-3.5 mr-2 opacity-70" />}
                                                    <span className="truncate">{channel.name}</span>
                                                </Button>
                                            )) : (
                                                <p className="text-[10px] text-muted-foreground px-2 italic">No channels yet</p>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between px-2 mb-2 group">
                                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Direct Messages</h3>
                                        </div>
                                        <div className="space-y-0.5">
                                            {projectMembers.map(user => (
                                                <Button
                                                    key={user.id}
                                                    variant={currentView === "messages" && currentChannelId === `dm-${user.id}` ? "secondary" : "ghost"} 
                                                    className={cn(
                                                        "w-full justify-start h-8 font-normal text-muted-foreground hover:text-foreground px-2", 
                                                        currentView === "messages" && currentChannelId === `dm-${user.id}` && "bg-background shadow-sm text-primary font-medium"
                                                    )}
                                                    onClick={() => onViewChange("messages", `dm-${user.id}`)}
                                                >
                                                    <div className="relative mr-2">
                                                        <Avatar className="h-4 w-4">
                                                            <AvatarImage src={user.avatar} />
                                                            <AvatarFallback>{user.name[0]}</AvatarFallback>
                                                        </Avatar>
                                                        <span className={cn(
                                                            "absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-background",
                                                            user.status === 'online' ? "bg-green-500" : 
                                                            user.status === 'busy' ? "bg-red-500" : "bg-slate-400"
                                                        )} />
                                                    </div>
                                                    <span className="truncate">{user.name}</span>
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {isClient && (
                                <div className="px-2 py-3 bg-muted/30 rounded-lg border border-border/40">
                                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Client Portal</p>
                                    <p className="text-xs text-muted-foreground">{currentProject.name}</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                 </>
             )}
             
             <div className="p-4 border-t border-border/40 text-xs text-muted-foreground flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors" onClick={() => logout()}>
                 <LogOut className="w-3.5 h-3.5" />
                 Log out
             </div>
        </div>

        {/* Command Palette for Quick Project Finding */}
        <CommandDialog open={projectSearchOpen} onOpenChange={setProjectSearchOpen}>
            <CommandInput placeholder="Search projects..." />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup heading="Projects">
                    {projects.map(project => (
                        <CommandItem 
                            key={project.id}
                            onSelect={() => {
                                onProjectChange(project.id);
                                if (isGlobalView) onViewChange("tasks");
                                setProjectSearchOpen(false);
                            }}
                        >
                            <LayoutGrid className="mr-2 h-4 w-4" />
                            <span>{project.name}</span>
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </CommandDialog>
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
        <div className="relative w-48 hidden lg:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
                placeholder="Search..." 
                className="pl-9 bg-background border-border/50 h-9 text-sm" 
            />
        </div>
        
        <Separator orientation="vertical" className="h-6 mx-2" />

        <NotificationsPopover />
      </div>
    </header>
  );
}
