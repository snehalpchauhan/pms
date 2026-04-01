import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect } from "react";
import { Channel } from "@/lib/mockData";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface ProjectMemberRow {
  id: number;
  name: string;
  role?: string;
}

interface NewChannelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  onSave: (channel: Partial<Channel> & { memberIds?: number[] }) => void;
}

export function NewChannelModal({ open, onOpenChange, projectId, onSave }: NewChannelModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"public" | "private">("public");
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(new Set());
  const { user } = useAuth();

  const numericProjectId = projectId ? Number(projectId) : NaN;

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
    if (!open || !user?.id) return;
    if (type === "private") {
      setSelectedMemberIds(new Set([user.id]));
    } else {
      setSelectedMemberIds(new Set());
    }
  }, [open, type, user?.id]);

  const toggleMember = (memberId: number) => {
    if (!user?.id || memberId === user.id) return;
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const handleSave = () => {
    const slug = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!slug) return;
    onSave({
      name: slug,
      type,
      projectId,
      memberIds: type === "private" ? Array.from(selectedMemberIds) : [],
    });
    setName("");
    onOpenChange(false);
  };

  const canSubmit = name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] bg-card/95 backdrop-blur-xl border-border/60">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Create New Channel</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs uppercase font-semibold text-muted-foreground">
              Channel Name
            </Label>
            <Input
              id="name"
              placeholder="e.g. general-updates"
              className="bg-background/50 border-border/50"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase font-semibold text-muted-foreground">Visibility</Label>
            <Select value={type} onValueChange={(v: "public" | "private") => setType(v)}>
              <SelectTrigger className="bg-background/50 border-border/50">
                <SelectValue placeholder="Select visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public — everyone in the project</SelectItem>
                <SelectItem value="private">Private — only selected members</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {type === "public"
                ? "All current and future project members can read and post."
                : "Only people you select (and you) can see this channel."}
            </p>
          </div>

          {type === "private" && (
            <div className="space-y-2">
              <Label className="text-xs uppercase font-semibold text-muted-foreground">Members</Label>
              <p className="text-xs text-muted-foreground">Choose who can access this channel (project members only).</p>
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
                    <p className="text-sm text-muted-foreground p-2">No project members loaded yet.</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSubmit}>
            Create Channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
