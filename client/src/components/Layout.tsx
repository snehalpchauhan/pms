import { Plus, LayoutGrid, CheckSquare, Settings, Users, MessageSquare, Bell, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import avatar1 from "@/assets/avatar-1.png";
import avatar3 from "@/assets/avatar-3.png";

export function Sidebar() {
  return (
    <div className="w-64 border-r border-border h-screen bg-sidebar flex flex-col hidden md:flex">
      <div className="p-6">
        <div className="flex items-center gap-2 font-display font-bold text-xl text-foreground">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
            <LayoutGrid className="w-5 h-5" />
          </div>
          TaskFlow
        </div>
      </div>

      <div className="px-4 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search tasks..." 
            className="pl-9 bg-background border-border/50 focus-visible:ring-1" 
          />
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-6 overflow-y-auto">
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">Workspace</h3>
          <div className="space-y-1">
            <Button variant="ghost" className="w-full justify-start text-foreground font-medium bg-sidebar-accent/50">
              <LayoutGrid className="w-4 h-4 mr-2" />
              Board
            </Button>
            <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
              <CheckSquare className="w-4 h-4 mr-2" />
              My Tasks
            </Button>
            <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
              <Users className="w-4 h-4 mr-2" />
              Team
            </Button>
            <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
              <MessageSquare className="w-4 h-4 mr-2" />
              Messages
            </Button>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2">Projects</h3>
          <div className="space-y-1">
            <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
              <span className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
              Website Redesign
            </Button>
            <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
              <span className="w-2 h-2 rounded-full bg-orange-500 mr-2" />
              Mobile App
            </Button>
            <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
              Marketing Q1
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 border border-border">
            <AvatarImage src={avatar1} />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate text-foreground">Jane Doe</p>
            <p className="text-xs text-muted-foreground truncate">jane@example.com</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Header() {
  return (
    <header className="h-16 border-b border-border bg-background/50 backdrop-blur-sm sticky top-0 z-10 px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-display font-bold text-foreground">Website Redesign</h1>
        <div className="h-6 w-px bg-border" />
        <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
                <Avatar className="h-8 w-8 border-2 border-background">
                    <AvatarImage src={avatar1} />
                    <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                <Avatar className="h-8 w-8 border-2 border-background">
                    <AvatarImage src={avatar3} />
                    <AvatarFallback>AB</AvatarFallback>
                </Avatar>
                 <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium border-2 border-background text-muted-foreground">
                    +3
                </div>
            </div>
            <Button variant="outline" size="sm" className="ml-2 h-8 text-xs rounded-full border-dashed">
                <Plus className="w-3 h-3 mr-1" /> Invite
            </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Bell className="w-5 h-5" />
        </Button>
        <Button className="h-9 bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-sm">
          <Plus className="w-4 h-4 mr-2" />
          New Task
        </Button>
      </div>
    </header>
  );
}
