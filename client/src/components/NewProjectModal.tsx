import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Project } from "@/lib/mockData";
import { ProjectColorPicker } from "@/components/ProjectColorPicker";
import { sanitizeProjectColor } from "@shared/projectColors";

interface NewProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (project: Partial<Project>) => void;
}

export function NewProjectModal({ open, onOpenChange, onSave }: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("bg-blue-500");

  const handleSave = () => {
    onSave({
      name,
      description,
      color: sanitizeProjectColor(color),
      columns: [
        { id: "todo", title: "To Do", color: "bg-red-500" },
        { id: "in-progress", title: "In Progress", color: "bg-blue-500" },
        { id: "review", title: "Review", color: "bg-yellow-500" },
        { id: "done", title: "Done", color: "bg-green-500" },
      ],
      members: ["u1"],
    });
    setName("");
    setDescription("");
    setColor("bg-blue-500");
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setName("");
          setDescription("");
          setColor("bg-blue-500");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[500px] bg-card/95 backdrop-blur-xl border-border/60">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Create New Project</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs uppercase font-semibold text-muted-foreground">
              Project Name
            </Label>
            <Input
              id="name"
              placeholder="e.g. Website Redesign"
              className="bg-background/50 border-border/50"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc" className="text-xs uppercase font-semibold text-muted-foreground">
              Description
            </Label>
            <Textarea
              id="desc"
              placeholder="Briefly describe the project..."
              className="resize-none bg-background/50 border-border/50"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <ProjectColorPicker idPrefix="new-project" value={color} onChange={setColor} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Create Project</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
