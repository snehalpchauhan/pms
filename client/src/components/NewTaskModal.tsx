import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, User, Tag, Plus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { USERS, Task, Project } from "@/lib/mockData";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface NewTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onSave: (task: Partial<Task>) => void;
}

export function NewTaskModal({ open, onOpenChange, project, onSave }: NewTaskModalProps) {
    const [date, setDate] = useState<Date>();
    const [title, setTitle] = useState("");
    const [desc, setDesc] = useState("");
    const [priority, setPriority] = useState("medium");
    const [status, setStatus] = useState(project.columns[0].id);

    const handleSave = () => {
        onSave({
            title,
            description: desc,
            priority: priority as any,
            status: status,
            dueDate: date?.toISOString(),
            projectId: project.id,
            assignees: ["u1"], // Default to current user for demo
            tags: ["New"],
            comments: [],
            attachments: []
        });
        // Reset form
        setTitle("");
        setDesc("");
        setDate(undefined);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] bg-card/95 backdrop-blur-xl border-border/60">
                <DialogHeader>
                    <DialogTitle className="font-display text-xl">Create New Task</DialogTitle>
                </DialogHeader>
                
                <div className="grid gap-6 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="title" className="text-xs uppercase font-semibold text-muted-foreground">Task Title</Label>
                        <Input 
                            id="title" 
                            placeholder="What needs to be done?" 
                            className="font-medium text-lg bg-background/50 border-border/50" 
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs uppercase font-semibold text-muted-foreground">Status</Label>
                             <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger className="bg-background/50 border-border/50">
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    {project.columns.map(col => (
                                        <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs uppercase font-semibold text-muted-foreground">Priority</Label>
                            <Select value={priority} onValueChange={setPriority}>
                                <SelectTrigger className="bg-background/50 border-border/50">
                                    <SelectValue placeholder="Select priority" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">Low</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="desc" className="text-xs uppercase font-semibold text-muted-foreground">Description</Label>
                        <Textarea 
                            id="desc" 
                            placeholder="Add details about this task..." 
                            className="min-h-[100px] resize-none bg-background/50 border-border/50 font-sans" 
                            value={desc}
                            onChange={(e) => setDesc(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs uppercase font-semibold text-muted-foreground">Due Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal bg-background/50 border-border/50",
                                            !date && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={setDate}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs uppercase font-semibold text-muted-foreground">Assignees</Label>
                            <div className="flex items-center gap-2 p-2 border border-border/50 rounded-md bg-background/50 min-h-[40px]">
                                <Avatar className="h-6 w-6">
                                    <AvatarImage src={USERS["u1"].avatar} />
                                    <AvatarFallback>JD</AvatarFallback>
                                </Avatar>
                                <span className="text-sm">Jane Doe</span>
                                <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto rounded-full">
                                    <Plus className="w-3 h-3" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Create Task</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
