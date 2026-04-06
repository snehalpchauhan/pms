import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import type { Project } from "@/lib/mockData";

const COLOR_SWATCHES = ["bg-blue-500", "bg-orange-500", "bg-emerald-500", "bg-purple-500", "bg-pink-500"] as const;

function normalizeProjectColor(color: string | undefined): string {
  const c = color?.trim();
  if (c && /^bg-[a-z0-9-]+$/.test(c)) return c;
  return "bg-blue-500";
}

interface EditProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onSave: (updates: { name: string; description: string | null; color: string }) => Promise<void>;
}

export function EditProjectModal({ open, onOpenChange, project, onSave }: EditProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("bg-blue-500");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !project) return;
    setName(project.name);
    setDescription(project.description ?? "");
    setColor(normalizeProjectColor(project.color));
  }, [open, project?.id, project?.name, project?.description, project?.color]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave({
        name: trimmed,
        description: description.trim() === "" ? null : description.trim(),
        color,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-card/95 backdrop-blur-xl border-border/60">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Edit project</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-project-name" className="text-xs uppercase font-semibold text-muted-foreground">
              Project name
            </Label>
            <Input
              id="edit-project-name"
              className="bg-background/50 border-border/50"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-project-desc" className="text-xs uppercase font-semibold text-muted-foreground">
              Description
            </Label>
            <Textarea
              id="edit-project-desc"
              className="resize-none bg-background/50 border-border/50"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase font-semibold text-muted-foreground">Color</Label>
            <div className="flex gap-2">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Select ${c}`}
                  className={`w-8 h-8 rounded-full ${c} ${color === c ? "ring-2 ring-offset-2 ring-primary" : ""}`}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
