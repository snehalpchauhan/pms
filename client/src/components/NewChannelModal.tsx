import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Channel } from "@/lib/mockData";

interface NewChannelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  onSave: (channel: Partial<Channel>) => void;
}

export function NewChannelModal({ open, onOpenChange, projectId, onSave }: NewChannelModalProps) {
    const [name, setName] = useState("");
    const [type, setType] = useState<"public" | "private">("public");

    const handleSave = () => {
        onSave({
            name: name.toLowerCase().replace(/\s+/g, '-'),
            type,
            projectId,
            members: ["u1"]
        });
        setName("");
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[400px] bg-card/95 backdrop-blur-xl border-border/60">
                <DialogHeader>
                    <DialogTitle className="font-display text-xl">Create New Channel</DialogTitle>
                </DialogHeader>
                
                <div className="grid gap-6 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-xs uppercase font-semibold text-muted-foreground">Channel Name</Label>
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
                        <Select value={type} onValueChange={(v: any) => setType(v)}>
                            <SelectTrigger className="bg-background/50 border-border/50">
                                <SelectValue placeholder="Select visibility" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="public">Public - Anyone in project</SelectItem>
                                <SelectItem value="private">Private - Invite only</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Create Channel</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
