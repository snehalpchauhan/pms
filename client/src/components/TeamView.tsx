import { Project } from "@/lib/mockData";
import { useAppData, effectivePresenceStatus } from "@/hooks/useAppData";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Mail, Plus, Shield, User, Briefcase, Trash2, Clock, Crown, MoreHorizontal } from "lucide-react";
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
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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

interface TeamViewProps {
    project: Project;
    currentUserRole: string;
}

interface MemberWithSettings {
  id: string | number;
  name: string;
  role: string;
  email?: string;
  avatar?: string;
  status?: string;
  lastSeenAt?: string | Date | null;
  clientShowTimecards?: boolean;
  clientTaskAccess?: string;
  notifyClientNewTask?: boolean;
  /** Set by GET /api/projects/:id/members when this user is the project creator (owner). */
  isProjectOwner?: boolean;
}

export default function TeamView({ project, currentUserRole }: TeamViewProps) {
    const { usersArray } = useAppData();
    const { user: authUser } = useAuth();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(() => new Set());
    const [addMemberLoading, setAddMemberLoading] = useState(false);
    const [memberToRemove, setMemberToRemove] = useState<MemberWithSettings | null>(null);
    const [removeLoading, setRemoveLoading] = useState(false);
    const [transferOwnerLoadingId, setTransferOwnerLoadingId] = useState<string | null>(null);

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

    /** Prefer server flag on each member; fall back to project.ownerId from app data. */
    const resolvedOwnerIdStr = useMemo(() => {
      const fromMember = membersWithSettings.find((m) => m.isProjectOwner === true);
      if (fromMember != null) return String(fromMember.id);
      if (project.ownerId != null && String(project.ownerId).trim() !== "") {
        return String(project.ownerId);
      }
      return null;
    }, [membersWithSettings, project.ownerId]);

    const isProjectOwnerUser =
      (project.ownerId != null && String(project.ownerId) === String(authUser?.id)) ||
      (resolvedOwnerIdStr != null && String(authUser?.id) === resolvedOwnerIdStr);
    const canManageClientSettings = currentUserRole === "manager" || currentUserRole === "admin";
    const canInviteRemoveMembers =
      currentUserRole === "manager" || currentUserRole === "admin" || isProjectOwnerUser;
    const canTransferOwner = currentUserRole === "admin";

    const groupedMembers = useMemo(() => {
      const isOwner = (m: MemberWithSettings) =>
        m.isProjectOwner === true || (resolvedOwnerIdStr != null && String(m.id) === resolvedOwnerIdStr);

      const owner: MemberWithSettings[] = [];
      const admin: MemberWithSettings[] = [];
      const client: MemberWithSettings[] = [];
      const manager: MemberWithSettings[] = [];
      const employee: MemberWithSettings[] = [];

      for (const m of membersWithSettings) {
        if (isOwner(m)) owner.push(m);
        else if (m.role === "admin") admin.push(m);
        else if (m.role === "client") client.push(m);
        else if (m.role === "manager") manager.push(m);
        else employee.push(m);
      }

      const byName = (a: MemberWithSettings, b: MemberWithSettings) => a.name.localeCompare(b.name);
      owner.sort(byName);
      admin.sort(byName);
      client.sort(byName);
      manager.sort(byName);
      employee.sort(byName);

      return [
        { key: "owner", title: "Owner", members: owner },
        { key: "admin", title: "Admins", members: admin },
        { key: "client", title: "Clients", members: client },
        { key: "manager", title: "Managers", members: manager },
        { key: "employee", title: "Employees", members: employee },
      ].filter((g) => g.members.length > 0);
    }, [membersWithSettings, resolvedOwnerIdStr]);

    const ownerUser = useMemo(() => {
      const ownerMember = membersWithSettings.find((m) => m.isProjectOwner === true);
      if (ownerMember) {
        return {
          id: String(ownerMember.id),
          name: ownerMember.name,
          email: ownerMember.email,
        };
      }
      if (resolvedOwnerIdStr == null) return undefined;
      return usersArray.find((u) => String(u.id) === resolvedOwnerIdStr);
    }, [usersArray, membersWithSettings, resolvedOwnerIdStr]);

    const handleConfirmRemoveMember = async () => {
      if (!memberToRemove) return;
      setRemoveLoading(true);
      try {
        await apiRequest("DELETE", `/api/projects/${numericProjectId}/members/${memberToRemove.id}`);
        queryClient.invalidateQueries({ queryKey: ["/api/projects", numericProjectId, "members-with-settings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", numericProjectId, "members"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        toast({ title: `${memberToRemove.name} removed from this project` });
        setMemberToRemove(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not remove member";
        let detail = msg;
        try {
          const parsed = JSON.parse(msg.replace(/^\d+:\s*/, ""));
          if (typeof parsed?.message === "string") detail = parsed.message;
        } catch {
          /* ignore */
        }
        toast({ title: "Could not remove member", description: detail, variant: "destructive" });
      } finally {
        setRemoveLoading(false);
      }
    };

    const handleTransferOwner = async (newOwnerId: string) => {
      if (!canTransferOwner) return;
      const n = Number(newOwnerId);
      if (!Number.isInteger(n) || n <= 0) return;
      setTransferOwnerLoadingId(String(newOwnerId));
      try {
        await apiRequest("POST", `/api/projects/${numericProjectId}/transfer-owner`, { newOwnerId: n });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", numericProjectId, "members-with-settings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", numericProjectId, "members"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        toast({ title: "Project owner updated" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not change owner";
        toast({ title: "Could not change owner", description: msg, variant: "destructive" });
      } finally {
        setTransferOwnerLoadingId(null);
      }
    };

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

    const handleClientSettingChange = async (userId: string, settings: { clientShowTimecards?: boolean; clientTaskAccess?: string; notifyClientNewTask?: boolean }) => {
      try {
        await apiRequest("PATCH", `/api/projects/${numericProjectId}/members/${userId}/client-settings`, settings);
        queryClient.invalidateQueries({ queryKey: ["/api/projects", numericProjectId, "members-with-settings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", numericProjectId, "has-client-timecards"] });
        toast({ title: "Settings updated" });
      } catch {
        toast({ title: "Failed to update settings", variant: "destructive" });
      }
    };

    return (
    <div className="p-8 space-y-8 bg-background/50 h-full overflow-y-auto">
        <div className="flex items-center justify-between">
            <div>
                <h2 className="text-3xl font-display font-bold text-foreground">Project Team</h2>
                <p className="text-muted-foreground mt-1">Members working on <span className="font-medium text-foreground">{project.name}</span></p>
            </div>
            {canInviteRemoveMembers && (
                <Button onClick={() => setIsInviteOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Invite Member
                </Button>
            )}
        </div>

        {resolvedOwnerIdStr != null && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Crown className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Project owner</p>
              <p className="text-sm text-muted-foreground">
                Created this project
                {ownerUser?.name ? (
                  <>
                    : <span className="font-medium text-foreground">{ownerUser.name}</span>
                    {ownerUser.email ? (
                      <span className="text-muted-foreground"> ({ownerUser.email})</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-foreground"> (user #{resolvedOwnerIdStr})</span>
                )}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-8">
          {groupedMembers.map((group) => (
            <div key={group.key} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.title}
                </div>
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-mono tabular-nums">
                  {group.members.length}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {group.members.map((user) => {
                  const presence = effectivePresenceStatus(user.status, user.lastSeenAt);
                  const isOwnerMember =
                    user.isProjectOwner === true ||
                    (resolvedOwnerIdStr != null && String(user.id) === resolvedOwnerIdStr);
                  const targetIsAdmin = user.role === "admin";
                  const targetIsClient = user.role === "client";
                  const canRemoveThisMember =
                    canInviteRemoveMembers &&
                    !isOwnerMember &&
                    // Managers/employees/owners cannot remove admins; only admins can.
                    (!targetIsAdmin || currentUserRole === "admin");
                  const canOpenMemberMenu = canTransferOwner || canRemoveThisMember;

                  return (
                    <div key={user.id} className="space-y-0">
                    <Card className={cn("hover:shadow-md transition-shadow border-border/60 relative group",
                        ((user.role === 'client' || user.role === 'manager' || user.role === 'employee') && canManageClientSettings) && "rounded-b-none border-b-0"
                    )}>
                        <CardHeader className="flex flex-row items-center gap-4 pb-2">
                            <Avatar className="h-12 w-12 border border-border">
                                <AvatarImage src={user.avatar} />
                                <AvatarFallback>{user.name[0]}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-lg truncate">{user.name}</h3>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    {getRoleBadge(user.role)}
                                    {isOwnerMember ? (
                                      <Badge variant="secondary" className="text-[10px] gap-1 font-medium border-primary/20 bg-primary/10 text-primary">
                                        <Crown className="h-3 w-3" />
                                        Owner
                                      </Badge>
                                    ) : null}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center text-sm text-muted-foreground mb-4">
                                <Mail className="w-4 h-4 mr-2" />
                                {user.email || 'No email'}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${
                                        presence === 'online' ? 'bg-emerald-500' :
                                        presence === 'busy' ? 'bg-red-500' : 'bg-slate-400'
                                    }`} />
                                    <span className="text-xs font-medium capitalize">{presence}</span>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {canOpenMemberMenu && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                          aria-label={`Member actions for ${user.name}`}
                                          disabled={transferOwnerLoadingId === String(user.id)}
                                        >
                                          <MoreHorizontal className="w-4 h-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        {canTransferOwner && (
                                          <>
                                            <DropdownMenuItem
                                              disabled={isOwnerMember || targetIsClient || transferOwnerLoadingId === String(user.id)}
                                              onClick={() => void handleTransferOwner(String(user.id))}
                                            >
                                              Make project owner
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                          </>
                                        )}
                                        <DropdownMenuItem
                                          disabled={!canRemoveThisMember}
                                          className={cn(canRemoveThisMember ? "text-destructive focus:text-destructive" : "")}
                                          onClick={() => {
                                            if (!canRemoveThisMember) return;
                                            setMemberToRemove(user);
                                          }}
                                        >
                                          Remove from project
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Client settings row — visible to admin/manager only */}
                    {user.role === 'client' && canManageClientSettings && (
                        <div className="bg-muted/40 border border-border/60 border-t-0 rounded-b-xl px-4 py-3 space-y-2" data-testid={`client-settings-${user.id}`}>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Client Access Settings</p>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="text-xs font-medium">Timecards</span>
                                </div>
                                <Switch
                                    checked={user.clientShowTimecards === true}
                                    onCheckedChange={(checked) => handleClientSettingChange(String(user.id), { clientShowTimecards: checked })}
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
                                    onValueChange={(v) => handleClientSettingChange(String(user.id), { clientTaskAccess: v })}
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

                    {/* Staff notification settings row — visible to admin/manager only, for manager/employee members */}
                    {(user.role === 'manager' || user.role === 'employee') && canManageClientSettings && (
                        <div className="bg-muted/40 border border-border/60 border-t-0 rounded-b-xl px-4 py-3 space-y-2" data-testid={`staff-settings-${user.id}`}>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Notifications</p>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                                    <div>
                                        <span className="text-xs font-medium">Notify on client task</span>
                                        <p className="text-[10px] text-muted-foreground leading-tight">Email when a client adds a task or updates a checklist</p>
                                    </div>
                                </div>
                                <Switch
                                    checked={user.notifyClientNewTask === true}
                                    onCheckedChange={(checked) => handleClientSettingChange(String(user.id), { notifyClientNewTask: checked })}
                                    data-testid={`switch-notify-client-task-${user.id}`}
                                />
                            </div>
                        </div>
                    )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {canInviteRemoveMembers && (
            <div className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsInviteOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add team member
              </Button>
            </div>
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

        <AlertDialog open={memberToRemove != null} onOpenChange={(open) => !open && setMemberToRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from project?</AlertDialogTitle>
              <AlertDialogDescription>
                {memberToRemove ? (
                  <>
                    <span className="font-medium text-foreground">{memberToRemove.name}</span> will lose access to this
                    project and its tasks. This does not delete their workspace account.
                  </>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removeLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={removeLoading}
                onClick={(e) => {
                  e.preventDefault();
                  void handleConfirmRemoveMember();
                }}
              >
                {removeLoading ? "Removing…" : "Remove"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}
