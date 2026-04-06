import { Plus, LayoutGrid, CheckSquare, Settings, Users, MessageSquare, Bell, Search, Hash, Lock, ListTodo, FolderKanban, LogOut, Briefcase, Building2, User, Shield, Key, Clock, LogIn, MoreVertical, X, Menu } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Channel, Project } from "@/lib/mockData";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/hooks/useAuth";
import { cn, getUserInitials } from "@/lib/utils";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { COMPANY_SETTINGS_TAB_EVENT } from "@/lib/companySettingsNav";
import { Badge } from "@/components/ui/badge";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import type { ClientPermissions } from "@/App";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditProjectModal } from "@/components/EditProjectModal";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { resolveProjectChipAppearance } from "@shared/projectColors";
import { ProjectNavSheet } from "@/components/ProjectNavSheet";

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

function directChannelWithPeer(
  channels: Channel[],
  projectId: string,
  myId: string | undefined,
  peerId: string,
): Channel | undefined {
  if (!myId) return undefined;
  return channels.find(
    (c) =>
      c.type === "direct" &&
      c.projectId === projectId &&
      c.members.includes(myId) &&
      c.members.includes(peerId),
  );
}

function settingsSidebarTabFromHash(): (typeof SETTINGS_SIDEBAR_TABS)[number] {
  if (typeof window === "undefined") return "general";
  const h = window.location.hash.replace(/^#/, "");
  return SETTINGS_SIDEBAR_TABS.includes(h as (typeof SETTINGS_SIDEBAR_TABS)[number])
    ? (h as (typeof SETTINGS_SIDEBAR_TABS)[number])
    : "general";
}

export function Sidebar({ currentView, currentChannelId, onViewChange, currentProject, onProjectChange, onAddProject, onAddChannel, currentUserRole, clientPermissions }: SidebarProps) {
  const { users, projects, channels, usersArray } = useAppData();
  const { user: authUser, logout } = useAuth();
  const sidebarInitials = getUserInitials(authUser?.name, authUser?.username);
  const sidebarAvatar = authUser?.avatar?.trim() || undefined;
  const [projectSearchOpen, setProjectSearchOpen] = useState(false);
  const [projectNavOpen, setProjectNavOpen] = useState(false);
  const [settingsSidebarTab, setSettingsSidebarTab] = useState(settingsSidebarTabFromHash);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deleteProjectLoading, setDeleteProjectLoading] = useState(false);

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
  const isClient = currentUserRole === "client";

  const isProjectOwner =
    currentProject?.ownerId != null && String(currentProject.ownerId) === String(authUser?.id);
  const canEditProjectMeta =
    !isClient &&
    !!currentProject &&
    (currentUserRole === "admin" || currentUserRole === "manager" || isProjectOwner);
  const canDeleteProject =
    !isClient && !!currentProject && (currentUserRole === "admin" || isProjectOwner);

  const projectChannels = currentProject
    ? channels.filter((c) => c.projectId === currentProject.id && c.type !== "direct")
    : [];

  const dmMembersProjectId =
    !isClient && currentProject ? Number(currentProject.id) : null;
  const { data: projectMembersForDm = [] } = useQuery<Array<{ id: string | number }>>({
    queryKey: ["/api/projects", dmMembersProjectId, "members-with-settings"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${dmMembersProjectId}/members`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch project members");
      return res.json();
    },
    enabled: dmMembersProjectId != null && !Number.isNaN(dmMembersProjectId),
  });

  const projectMemberIdSet = useMemo(
    () => new Set(projectMembersForDm.map((m) => String(m.id))),
    [projectMembersForDm],
  );

  const dmEligibleMembers = useMemo(() => {
    return usersArray
      .filter((u) => String(u.id) !== String(authUser?.id))
      .filter((u) => projectMemberIdSet.has(String(u.id)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [usersArray, authUser?.id, projectMemberIdSet]);

  const showTimecards = !isClient || (clientPermissions?.clientShowTimecards === true);
  const showTeam = !isClient;
  const showSettings = !isClient && currentUserRole === "admin";
  const showNewProject = !isClient && (currentUserRole === "manager" || currentUserRole === "admin");
  const showNewChannel = !isClient;

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

             {projects.length > 0 && (
               <>
                 <Tooltip>
                   <TooltipTrigger asChild>
                     <button
                       type="button"
                       onClick={() => setProjectNavOpen(true)}
                       className="w-10 h-10 rounded-xl bg-muted/50 hover:bg-muted text-muted-foreground hover:text-primary transition-all flex items-center justify-center"
                       aria-label="Projects menu and order"
                     >
                       <Menu className="w-5 h-5" />
                     </button>
                   </TooltipTrigger>
                   <TooltipContent side="right">Projects list & order</TooltipContent>
                 </Tooltip>
                 <ProjectNavSheet
                   open={projectNavOpen}
                   onOpenChange={setProjectNavOpen}
                   projects={projects}
                   currentProjectId={currentProject?.id}
                   onSelectProject={onProjectChange}
                   leaveGlobalView={
                     isGlobalView ? () => onViewChange("tasks") : undefined
                   }
                 />
               </>
             )}

             {/* Projects List */}
             <ScrollArea className="flex-1 w-full px-3 gap-3 flex flex-col items-center">
                 <div className="flex flex-col gap-3 items-center w-full py-2">
                    {projects.map((project) => {
                        const chip = resolveProjectChipAppearance(project.color);
                        return (
                        <Tooltip key={project.id}>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => {
                                        onProjectChange(project.id);
                                        if (isGlobalView) onViewChange("tasks");
                                    }}
                                    className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 relative group font-bold text-sm text-white shadow-md box-border",
                                        chip.tailwindClass || undefined,
                                        !isGlobalView && currentProject?.id === project.id
                                            ? "ring-2 ring-neutral-950 dark:ring-neutral-100 ring-offset-2 ring-offset-background scale-105 opacity-100"
                                            : "ring-2 ring-transparent ring-offset-2 ring-offset-background opacity-80 hover:opacity-100 hover:scale-[1.02]",
                                    )}
                                    style={chip.style}
                                >
                                    <span>{getUserInitials(project.name, undefined)}</span>
                                    {!isGlobalView && currentProject?.id === project.id && (
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-[18px] w-1 h-8 bg-neutral-950 dark:bg-neutral-100 rounded-r-full" />
                                    )}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                <p>{project.name}</p>
                            </TooltipContent>
                        </Tooltip>
                        );
                    })}
                    
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
                                <AvatarImage src={sidebarAvatar} />
                                <AvatarFallback>{sidebarInitials}</AvatarFallback>
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
                    <div className="h-16 flex items-center gap-2 px-5 border-b border-border/40 shrink-0 min-w-0">
                        <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                            <h2 className="font-display font-bold text-lg truncate leading-tight">
                                {currentProject.name}
                            </h2>
                            {currentProject.description ? (
                                <span className="text-xs text-muted-foreground truncate">{currentProject.description}</span>
                            ) : null}
                        </div>
                        {canEditProjectMeta && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
                                        aria-label="Project menu"
                                    >
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onSelect={() => setEditProjectOpen(true)}>
                                        Edit project details
                                    </DropdownMenuItem>
                                    {canDeleteProject && (
                                        <DropdownMenuItem
                                            className="text-destructive focus:text-destructive"
                                            onSelect={() => setDeleteProjectOpen(true)}
                                        >
                                            Delete project
                                        </DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
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
                                                    {channel.type === 'private' ? <Lock className="w-3.5 h-3.5 mr-2 shrink-0 opacity-70" /> : <Hash className="w-3.5 h-3.5 mr-2 shrink-0 opacity-70" />}
                                                    <span className="flex min-w-0 flex-1 items-center gap-2">
                                                      <span className="truncate">{channel.name}</span>
                                                      {(channel.unreadCount ?? 0) > 0 ? (
                                                        <span
                                                          className="h-2 w-2 shrink-0 rounded-full bg-primary"
                                                          title={`${channel.unreadCount} unread`}
                                                          aria-label={`${channel.unreadCount} unread messages`}
                                                        />
                                                      ) : null}
                                                    </span>
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
                                            {dmEligibleMembers.map((dmUser) => {
                                                const dmCh =
                                                  currentProject &&
                                                  directChannelWithPeer(
                                                    channels,
                                                    currentProject.id,
                                                    authUser?.id != null ? String(authUser.id) : undefined,
                                                    dmUser.id,
                                                  );
                                                const dmUnread = dmCh?.unreadCount ?? 0;
                                                return (
                                                <Button
                                                    key={dmUser.id}
                                                    variant={currentView === "messages" && currentChannelId === `dm-${dmUser.id}` ? "secondary" : "ghost"} 
                                                    className={cn(
                                                        "w-full justify-start h-8 font-normal text-muted-foreground hover:text-foreground px-2", 
                                                        currentView === "messages" && currentChannelId === `dm-${dmUser.id}` && "bg-background shadow-sm text-primary font-medium"
                                                    )}
                                                    onClick={() => onViewChange("messages", `dm-${dmUser.id}`)}
                                                >
                                                    <div className="relative mr-2 shrink-0">
                                                        <Avatar className="h-4 w-4">
                                                            <AvatarImage src={dmUser.avatar} />
                                                            <AvatarFallback>{dmUser.name[0]}</AvatarFallback>
                                                        </Avatar>
                                                        <span className={cn(
                                                            "absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-background",
                                                            dmUser.status === 'online' ? "bg-green-500" : 
                                                            dmUser.status === 'busy' ? "bg-red-500" : "bg-slate-400"
                                                        )} />
                                                    </div>
                                                    <span className="flex min-w-0 flex-1 items-center gap-2">
                                                      <span className="truncate">{dmUser.name}</span>
                                                      {dmUnread > 0 ? (
                                                        <span
                                                          className="h-2 w-2 shrink-0 rounded-full bg-primary"
                                                          title={`${dmUnread} unread`}
                                                          aria-label={`${dmUnread} unread direct messages`}
                                                        />
                                                      ) : null}
                                                    </span>
                                                </Button>
                                                );
                                            })}
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

        <EditProjectModal
            open={editProjectOpen}
            onOpenChange={setEditProjectOpen}
            project={currentProject}
            onSave={async (updates) => {
                if (!currentProject) return;
                await apiRequest("PATCH", `/api/projects/${currentProject.id}`, updates);
                await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                toast({ title: "Project updated" });
            }}
        />

        <AlertDialog open={deleteProjectOpen} onOpenChange={(open) => !open && setDeleteProjectOpen(false)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete this project?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This permanently removes {currentProject ? `“${currentProject.name}”` : "the project"}, including
                        tasks, channels, and messages. This cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleteProjectLoading}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={deleteProjectLoading}
                        onClick={(e) => {
                            e.preventDefault();
                            if (!currentProject) return;
                            setDeleteProjectLoading(true);
                            void (async () => {
                                try {
                                    await apiRequest("DELETE", `/api/projects/${currentProject.id}`);
                                    await queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
                                    await queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
                                    setDeleteProjectOpen(false);
                                    toast({ title: "Project deleted" });
                                } catch (err) {
                                    toast({
                                        title: "Could not delete project",
                                        description: err instanceof Error ? err.message : "Try again.",
                                        variant: "destructive",
                                    });
                                } finally {
                                    setDeleteProjectLoading(false);
                                }
                            })();
                        }}
                    >
                        {deleteProjectLoading ? "Deleting…" : "Delete"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}

interface HeaderProps {
    title: string;
    view: string;
    currentUserRole: string;
    onRoleChange: (role: string) => void;
    /** When provided, shows task search (title + description) for the board/list/calendar. */
    taskSearch?: string;
    onTaskSearchChange?: (query: string) => void;
}

export function Header({ title, view, currentUserRole, onRoleChange, taskSearch, onTaskSearchChange }: HeaderProps) {
    const viewName = view === 'tasks' ? 'Tasks' : view.charAt(0).toUpperCase() + view.slice(1);
    const showTaskSearch = taskSearch !== undefined && onTaskSearchChange !== undefined;
    const hasQuery = showTaskSearch && taskSearch.trim().length > 0;

  return (
    <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-10 px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-4">
          <div className="flex flex-col">
             <h1 className="text-sm font-medium text-muted-foreground">{title}</h1>
             <h2 className="text-lg font-display font-bold text-foreground tracking-tight leading-none">{viewName}</h2>
          </div>
      </div>

      <div className="flex items-center gap-3">
        {showTaskSearch ? (
          <>
            <div className="relative w-56 min-w-0 hidden lg:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={taskSearch}
                onChange={(e) => onTaskSearchChange(e.target.value)}
                placeholder="Search tasks…"
                className={cn(
                  "h-9 border-border/50 bg-background pl-9 text-sm",
                  hasQuery ? "pr-9" : "pr-3",
                )}
                aria-label="Search tasks by title or description"
              />
              {hasQuery ? (
                <button
                  type="button"
                  className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => onTaskSearchChange("")}
                  aria-label="Clear task search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <Separator orientation="vertical" className="h-6" />
          </>
        ) : null}

        <NotificationsPopover />
      </div>
    </header>
  );
}
