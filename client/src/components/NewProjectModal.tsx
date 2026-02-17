import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Project } from "@/lib/mockData";

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
            color,
            columns: [
                { id: "todo", title: "To Do", color: "bg-slate-500" },
                { id: "in-progress", title: "In Progress", color: "bg-blue-500" },
                { id: "done", title: "Done", color: "bg-emerald-500" },
            ],
            members: ["u1"]
        });
        setName("");
        setDescription("");
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] bg-card/95 backdrop-blur-xl border-border/60">
                <DialogHeader>
                    <DialogTitle className="font-display text-xl">Create New Project</DialogTitle>
                </DialogHeader>
                
                <div className="grid gap-6 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-xs uppercase font-semibold text-muted-foreground">Project Name</Label>
                        <Input 
                            id="name" 
                            placeholder="e.g. Website Redesign" 
                            className="bg-background/50 border-border/50" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="desc" className="text-xs uppercase font-semibold text-muted-foreground">Description</Label>
                        <Textarea 
                            id="desc" 
                            placeholder="Briefly describe the project..." 
                            className="resize-none bg-background/50 border-border/50" 
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs uppercase font-semibold text-muted-foreground">Color Theme</Label>
                         <div className="flex gap-2">
                            {["bg-blue-500", "bg-orange-500", "bg-emerald-500", "bg-purple-500", "bg-pink-500"].map((c) => (
                                <div 
                                    key={c}
                                    className={`w-8 h-8 rounded-full cursor-pointer ${c} ${color === c ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                                    onClick={() => setColor(c)}
                                />
                            ))}
                         </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Create Project</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
