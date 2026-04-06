import { Project } from "@/lib/mockData";
import { useAppData } from "@/hooks/useAppData";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Mail, MoreHorizontal, Plus, Shield, User, Briefcase, Trash2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface TeamViewProps {
    project: Project;
    currentUserRole: string;
}

interface MemberWithSettings {
  id: string;
  name: string;
  role: string;
  email?: string;
  avatar?: string;
  status?: string;
  clientShowTimecards?: boolean;
  clientTaskAccess?: string;
}

export default function TeamView({ project, currentUserRole }: TeamViewProps) {
    const { usersArray } = useAppData();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(() => new Set());
    const [addMemberLoading, setAddMemberLoading] = useState(false);

    const canManageTeam = currentUserRole === 'manager' || currentUserRole === 'admin';

    const numericProjectId = Number(project.id);

    // Fetch project members with client settings from the API
    const { data: membersWithSettings = [] } = useQuery<MemberWithSettings[]>({
      queryKey: ["/api/projects", numericProjectId, "members-with-settings"],
      queryFn: async () => {
        const res = await fetch(`/api/projects/${numericProjectId}/members`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch members");
        return res.json();
      },
    });

    const memberIdSet = useMemo(() => new Set(membersWithSettings.map((m) => String(m.id))), [membersWithSettings]);

    const workspaceUsersNotOnProject = useMemo(
      () =>
        usersArray
          .filter((u) => !memberIdSet.has(String(u.id)))
          .sort((a, b) => a.name.localeCompare(b.name)),
      [usersArray, memberIdSet],
    );

    const toggleUserSelected = (userId: string) => {
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        if (next.has(userId)) next.delete(userId);
        else next.add(userId);
        return next;
      });
    };

    const handleAddSelectedMembers = async () => {
      if (selectedUserIds.size === 0) {
        toast({ title: "Select at least one user", variant: "destructive" });
        return;
      }
      setAddMemberLoading(true);
      const ids = Array.from(selectedUserIds);
      try {
        const results = await Promise.allSettled(
          ids.map((id) =>
            apiRequest("POST", `/api/projects/${numericProjectId}/members`, { userId: Number(id) }),
          ),
        );
        const failed = results.filter((r) => r.status === "rejected");
        queryClient.invalidateQueries({ queryKey: ["/api/projects", numericProjectId, "members-with-settings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", numericProjectId, "members"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        if (failed.length === 0) {
          const n = ids.length;
          toast({
            title: n === 1 ? "Member added to project" : `${n} members added to project`,
          });
          setSelectedUserIds(new Set());
          setIsInviteOpen(false);
        } else if (failed.length === results.length) {
          const msg = failed[0]?.status === "rejected" && failed[0].reason instanceof Error
            ? failed[0].reason.message
            : "Failed to add members";
          toast({ title: "Could not add members", description: msg, variant: "destructive" });
        } else {
          toast({
            title: "Some members could not be added",
            description: `${failed.length} of ${ids.length} failed. Others were added.`,
            variant: "destructive",
          });
          setSelectedUserIds(new Set());
          setIsInviteOpen(false);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to add members";
        toast({ title: "Could not add members", description: msg, variant: "destructive" });
      } finally {
        setAddMemberLoading(false);
      }
    };

    const getRoleBadge = (role: string) => {
        switch(role) {
            case 'admin': return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><Shield className="w-3 h-3 mr-1" /> Admin</Badge>;
            case 'manager': return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200"><Shield className="w-3 h-3 mr-1" /> Manager</Badge>;
            case 'client': return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200"><User className="w-3 h-3 mr-1" /> Client</Badge>;
            default: return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><Briefcase className="w-3 h-3 mr-1" /> Employee</Badge>;
        }
    };

    const handleClientSettingChange = async (userId: string, settings: { clientShowTimecards?: boolean; clientTaskAccess?: string }) => {
      try {
        await apiRequest("PATCH", `/api/projects/${numericProjectId}/members/${userId}/client-settings`, settings);
        queryClient.invalidateQueries({ queryKey: ["/api/projects", numericProjectId, "members-with-settings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", numericProjectId, "has-client-timecards"] });
        toast({ title: "Client settings updated" });
      } catch {
        toast({ title: "Failed to update client settings", variant: "destructive" });
      }
    };

    return (
    <div className="p-8 space-y-8 bg-background/50 h-full overflow-y-auto">
        <div className="flex items-center justify-between">
            <div>
                <h2 className="text-3xl font-display font-bold text-foreground">Project Team</h2>
                <p className="text-muted-foreground mt-1">Members working on <span className="font-medium text-foreground">{project.name}</span></p>
            </div>
            {canManageTeam && (
                <Button onClick={() => setIsInviteOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Invite Member
                </Button>
            )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {membersWithSettings.map(user => (
                <div key={user.id} className="space-y-0">
                    <Card className={cn("hover:shadow-md transition-shadow border-border/60 relative group", user.role === 'client' && canManageTeam && "rounded-b-none border-b-0")}>
                        <CardHeader className="flex flex-row items-center gap-4 pb-2">
                            <Avatar className="h-12 w-12 border border-border">
                                <AvatarImage src={user.avatar} />
                                <AvatarFallback>{user.name[0]}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                                <h3 className="font-semibold text-lg">{user.name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    {getRoleBadge(user.role)}
                                </div>
                            </div>
                            {canManageTeam && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                                    <MoreHorizontal className="w-4 h-4" />
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center text-sm text-muted-foreground mb-4">
                                <Mail className="w-4 h-4 mr-2" />
                                {user.email || 'No email'}
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${
                                        user.status === 'online' ? 'bg-emerald-500' : 
                                        user.status === 'busy' ? 'bg-red-500' : 'bg-slate-400'
                                    }`} />
                                    <span className="text-xs font-medium capitalize">{user.status}</span>
                                </div>
                                
                                {canManageTeam && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Client settings row — visible to admin/manager only */}
                    {user.role === 'client' && canManageTeam && (
                        <div className="bg-muted/40 border border-border/60 border-t-0 rounded-b-xl px-4 py-3 space-y-2" data-testid={`client-settings-${user.id}`}>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Client Access Settings</p>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="text-xs font-medium">Timecards</span>
                                </div>
                                <Switch
                                    checked={user.clientShowTimecards === true}
                                    onCheckedChange={(checked) => handleClientSettingChange(user.id, { clientShowTimecards: checked })}
                                    data-testid={`switch-client-timecards-${user.id}`}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="text-xs font-medium">Task Access</span>
                                </div>
                                <Select
                                    value={user.clientTaskAccess || "feedback"}
                                    onValueChange={(v) => handleClientSettingChange(user.id, { clientTaskAccess: v })}
                                >
                                    <SelectTrigger className="w-[130px] h-7 text-xs" data-testid={`select-client-task-access-${user.id}`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="view-only">View Only</SelectItem>
                                        <SelectItem value="feedback">Feedback</SelectItem>
                                        <SelectItem value="contribute">Contribute</SelectItem>
                                        <SelectItem value="full">Full</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </div>
            ))}
            
            {canManageTeam && (
                <button onClick={() => setIsInviteOpen(true)} className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border/50 rounded-xl hover:bg-muted/10 transition-colors h-full min-h-[160px] gap-2 group">
                    <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        <Plus className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                    </div>
                    <span className="font-medium text-muted-foreground group-hover:text-primary transition-colors">Add Team Member</span>
                </button>
            )}
        </div>

        <Dialog
          open={isInviteOpen}
          onOpenChange={(open) => {
            setIsInviteOpen(open);
            if (!open) setSelectedUserIds(new Set());
          }}
        >
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle>Add team members</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <p className="text-sm text-muted-foreground">
                Choose people who already have an account in this workspace. Their role stays the same as in Company
                Settings.
              </p>
              <div className="space-y-2">
                <Label>Workspace users</Label>
                {workspaceUsersNotOnProject.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Everyone is already on this project.</p>
                ) : (
                  <ScrollArea className="h-[min(280px,50vh)] rounded-md border border-border/60 bg-muted/20 p-2">
                    <div className="space-y-1 pr-2">
                      {workspaceUsersNotOnProject.map((u) => {
                        const checked = selectedUserIds.has(u.id);
                        return (
                          <label
                            key={u.id}
                            className={cn(
                              "flex items-center gap-3 rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-muted/60",
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleUserSelected(u.id)}
                              data-testid={`checkbox-add-member-${u.id}`}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium text-foreground">{u.name}</span>
                              {u.email ? (
                                <span className="block text-xs text-muted-foreground truncate">{u.email}</span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
                {selectedUserIds.size > 0 && (
                  <p className="text-xs text-muted-foreground">{selectedUserIds.size} selected</p>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" type="button" onClick={() => setIsInviteOpen(false)} disabled={addMemberLoading}>
                Cancel
              </Button>
              <Button
                type="button"
                data-testid="button-add-members-to-project"
                onClick={() => void handleAddSelectedMembers()}
                disabled={addMemberLoading || selectedUserIds.size === 0 || workspaceUsersNotOnProject.length === 0}
              >
                {addMemberLoading
                  ? "Adding…"
                  : selectedUserIds.size <= 1
                    ? "Add to project"
                    : `Add ${selectedUserIds.size} to project`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}
