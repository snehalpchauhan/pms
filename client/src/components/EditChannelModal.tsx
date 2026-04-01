import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect } from "react";
import type { Channel } from "@/lib/mockData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ProjectMemberRow {
  id: number;
  name: string;
  role?: string;
}

function slugifyChannelName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) {
    if (!b.has(x)) return false;
  }
  return true;
}

export type EditChannelModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  channel: Channel | null;
};

export function EditChannelModal({ open, onOpenChange, projectId, channel }: EditChannelModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const numericProjectId = Number(projectId);
  const channelNumericId = channel ? Number(channel.id) : NaN;

  const { data: projectMembers = [] } = useQuery<ProjectMemberRow[]>({
    queryKey: ["/api/projects", numericProjectId, "members"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${numericProjectId}/members`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && Number.isInteger(numericProjectId) && numericProjectId > 0,
  });

  const sortedMembers = [...projectMembers].sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (!open || !channel) return;
    setName(channel.name);
    if (channel.type === "private") {
      setSelectedMemberIds(new Set(channel.members.map((id) => Number(id))));
    } else {
      setSelectedMemberIds(new Set());
    }
    // Reset when opening or switching channel only (avoid wiping edits when parent refetches same channel).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, channel?.id]);

  const toggleMember = (memberId: number) => {
    if (!user?.id || memberId === user.id) return;
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!channel || !user?.id || !Number.isInteger(channelNumericId)) return;
    const slug = slugifyChannelName(name);
    if (!slug) {
      toast({ title: "Name required", description: "Enter a valid channel name.", variant: "destructive" });
      return;
    }

    const initialMembers = new Set(channel.members.map((id) => Number(id)));
    const nameDirty = slug !== channel.name;
    const membersDirty =
      channel.type === "private" && !setsEqual(selectedMemberIds, initialMembers);

    if (!nameDirty && !membersDirty) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      if (nameDirty) {
        await apiRequest("PATCH", `/api/channels/${channelNumericId}`, { name: name.trim() });
      }
      if (channel.type === "private" && membersDirty) {
        await apiRequest("PATCH", `/api/channels/${channelNumericId}/members`, {
          memberIds: Array.from(selectedMemberIds),
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ title: "Channel updated" });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Could not update channel",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!channel) return null;

  const isPrivate = channel.type === "private";
  const displayMemberCount =
    channel.type === "public"
      ? (channel.memberCountDisplay ?? channel.members.length)
      : channel.members.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] bg-card/95 backdrop-blur-xl border-border/60">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Edit channel</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="edit-channel-name" className="text-xs uppercase font-semibold text-muted-foreground">
              Channel name
            </Label>
            <Input
              id="edit-channel-name"
              className="bg-background/50 border-border/50"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. general-updates"
            />
            <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens.</p>
          </div>

          {channel.type === "public" && (
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
              <p>
                This is a <span className="font-medium text-foreground">public</span> channel.{" "}
                <span className="font-medium text-foreground">{displayMemberCount}</span> project members can access
                it. To add or remove people from the project, use{" "}
                <span className="font-medium text-foreground">Team</span>.
              </p>
            </div>
          )}

          {isPrivate && (
            <div className="space-y-2">
              <Label className="text-xs uppercase font-semibold text-muted-foreground">Who can access</Label>
              <p className="text-xs text-muted-foreground">Project members only. You always stay in the channel.</p>
              <ScrollArea className="h-[220px] rounded-md border border-border/60 bg-muted/20 p-2">
                <div className="space-y-1 pr-2">
                  {sortedMembers.map((m) => {
                    const isYou = user?.id === m.id;
                    const checked = selectedMemberIds.has(m.id);
                    return (
                      <label
                        key={m.id}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-muted/60",
                          isYou && "opacity-90",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={isYou}
                          onCheckedChange={() => toggleMember(m.id)}
                        />
                        <span className="flex-1 truncate">
                          {m.name}
                          {isYou ? <span className="text-muted-foreground"> (you)</span> : null}
                        </span>
                        {m.role ? (
                          <span className="text-[10px] uppercase text-muted-foreground shrink-0">{m.role}</span>
                        ) : null}
                      </label>
                    );
                  })}
                  {sortedMembers.length === 0 && (
                    <p className="text-sm text-muted-foreground p-2">No project members loaded.</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
