import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, User, Tag, Plus, Repeat, CheckSquare, Paperclip, X, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { USERS, Task, Project, ChecklistItem, Recurrence } from "@/lib/mockData";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

interface NewTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onSave: (task: Partial<Task>) => void;
}

export function NewTaskModal({ open, onOpenChange, project, onSave }: NewTaskModalProps) {
    const [startDate, setStartDate] = useState<Date>();
    const [endDate, setEndDate] = useState<Date>();
    const [title, setTitle] = useState("");
    const [desc, setDesc] = useState("");
    const [priority, setPriority] = useState("medium");
    const [status, setStatus] = useState(project.columns[0].id);
    const [attachments, setAttachments] = useState<File[]>([]);
    
    // Checklist State
    const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
    const [newChecklistInput, setNewChecklistInput] = useState("");

    // Recurrence state
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrenceFreq, setRecurrenceFreq] = useState<"daily" | "weekly" | "monthly" | "custom">("weekly");
    const [customInterval, setCustomInterval] = useState(1);
    const [customUnit, setCustomUnit] = useState<"days" | "weeks" | "months" | "years">("weeks");
    const [selectedDays, setSelectedDays] = useState<number[]>([]);

    const handleSave = () => {
        let recurrenceConfig: Recurrence | undefined = undefined;
        
        if (isRecurring) {
            recurrenceConfig = {
                frequency: recurrenceFreq,
                interval: recurrenceFreq === 'custom' ? customInterval : 1,
                customType: recurrenceFreq === 'custom' ? customUnit : undefined,
                daysOfWeek: (recurrenceFreq === 'weekly' || (recurrenceFreq === 'custom' && customUnit === 'weeks')) ? selectedDays : undefined
            };
        }

        onSave({
            title,
            description: desc,
            priority: priority as any,
            status: status,
            startDate: startDate?.toISOString(),
            dueDate: endDate?.toISOString(), // using endDate as dueDate
            recurrence: recurrenceConfig,
            checklist: checklistItems,
            projectId: project.id,
            assignees: ["u1"], // Default to current user for demo
            tags: ["New"],
            comments: [],
            attachments: attachments.map((f, i) => ({
                id: `att-${Date.now()}-${i}`,
                name: f.name,
                type: f.type.includes('image') ? 'image' : 'file',
                size: `${(f.size / 1024).toFixed(1)} KB`
            }))
        });
        
        // Reset form
        setTitle("");
        setDesc("");
        setStartDate(undefined);
        setEndDate(undefined);
        setIsRecurring(false);
        setRecurrenceFreq("weekly");
        setChecklistItems([]);
        setAttachments([]);
        onOpenChange(false);
    };

    const addChecklistItem = () => {
        if (!newChecklistInput.trim()) return;
        setChecklistItems([...checklistItems, {
            id: `cl-${Date.now()}`,
            text: newChecklistInput,
            completed: false
        }]);
        setNewChecklistInput("");
    };

    const removeChecklistItem = (id: string) => {
        setChecklistItems(checklistItems.filter(item => item.id !== id));
    };

    const toggleDay = (dayIndex: number) => {
        if (selectedDays.includes(dayIndex)) {
            setSelectedDays(selectedDays.filter(d => d !== dayIndex));
        } else {
            setSelectedDays([...selectedDays, dayIndex]);
        }
    };

    const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] bg-card/95 backdrop-blur-xl border-border/60 max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b border-border/40 shrink-0">
                    <DialogTitle className="font-display text-xl">Create New Task</DialogTitle>
                </DialogHeader>
                
                <ScrollArea className="flex-1 px-6 py-6">
                    <div className="grid gap-6">
                        {/* 1. Task Title */}
                        <div className="space-y-2">
                            <Label htmlFor="title" className="text-xs uppercase font-semibold text-muted-foreground">Task Title</Label>
                            <Input 
                                id="title" 
                                placeholder="What needs to be done?" 
                                className="font-medium text-lg bg-background/50 border-border/50 h-11" 
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>

                        {/* 2. Description */}
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

                        {/* 3. Start & End Date */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs uppercase font-semibold text-muted-foreground">Start Date</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant={"outline"}
                                            className={cn(
                                                "w-full justify-start text-left font-normal bg-background/50 border-border/50",
                                                !startDate && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={startDate}
                                            onSelect={setStartDate}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs uppercase font-semibold text-muted-foreground">End Date (Due)</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant={"outline"}
                                            className={cn(
                                                "w-full justify-start text-left font-normal bg-background/50 border-border/50",
                                                !endDate && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <Calendar
                                            mode="single"
                                            selected={endDate}
                                            onSelect={setEndDate}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>

                        {/* 4. Priority & Bucket (Status) */}
                        <div className="grid grid-cols-2 gap-4">
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
                            <div className="space-y-2">
                                <Label className="text-xs uppercase font-semibold text-muted-foreground">Bucket (Status)</Label>
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
                        </div>

                         {/* Attachments */}
                         <div className="space-y-2">
                            <Label className="text-xs uppercase font-semibold text-muted-foreground">Attachments</Label>
                            <div className="border-2 border-dashed border-border/50 rounded-lg p-4 bg-muted/10 hover:bg-muted/20 transition-colors text-center cursor-pointer relative group">
                                <Input 
                                    type="file" 
                                    multiple 
                                    className="absolute inset-0 opacity-0 cursor-pointer" 
                                    onChange={(e) => {
                                        if (e.target.files) {
                                            setAttachments([...attachments, ...Array.from(e.target.files)]);
                                        }
                                    }}
                                />
                                <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
                                    <Paperclip className="w-6 h-6" />
                                    <span className="text-sm font-medium">Click to upload or drag and drop</span>
                                </div>
                            </div>
                            {attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {attachments.map((file, i) => (
                                        <div key={i} className="flex items-center gap-2 bg-background border border-border px-2 py-1 rounded text-xs">
                                            <span className="truncate max-w-[150px]">{file.name}</span>
                                            <button onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))}>
                                                <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Checklist */}
                        <div className="space-y-3 bg-muted/20 p-4 rounded-lg border border-border/40">
                             <div className="flex items-center gap-2">
                                <CheckSquare className="w-4 h-4 text-muted-foreground" />
                                <Label className="text-sm font-medium">Checklist</Label>
                             </div>
                             
                             <div className="space-y-2">
                                {checklistItems.map((item) => (
                                    <div key={item.id} className="flex items-center gap-2 group">
                                        <Checkbox checked={item.completed} disabled />
                                        <span className="flex-1 text-sm">{item.text}</span>
                                        <button 
                                            onClick={() => removeChecklistItem(item.id)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                                
                                <div className="flex gap-2">
                                    <Input 
                                        placeholder="Add an item..." 
                                        className="h-8 text-sm bg-background"
                                        value={newChecklistInput}
                                        onChange={(e) => setNewChecklistInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addChecklistItem();
                                            }
                                        }}
                                    />
                                    <Button size="sm" variant="secondary" className="h-8" onClick={addChecklistItem}>Add</Button>
                                </div>
                             </div>
                        </div>

                        {/* Recurring Settings */}
                        <div className="bg-muted/30 p-4 rounded-lg border border-border/50 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Repeat className="w-4 h-4 text-muted-foreground" />
                                    <Label htmlFor="recurring" className="text-sm font-medium">Recurring Task</Label>
                                </div>
                                <Switch 
                                    id="recurring" 
                                    checked={isRecurring}
                                    onCheckedChange={setIsRecurring}
                                />
                            </div>
                            
                            {isRecurring && (
                                <div className="animate-in slide-in-from-top-2 duration-200 pt-2 pl-6 space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs uppercase font-semibold text-muted-foreground">Frequency</Label>
                                        <Select value={recurrenceFreq} onValueChange={(v: any) => setRecurrenceFreq(v)}>
                                            <SelectTrigger className="bg-background/50 border-border/50 h-9 text-sm">
                                                <SelectValue placeholder="Select frequency" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="daily">Daily</SelectItem>
                                                <SelectItem value="weekly">Weekly</SelectItem>
                                                <SelectItem value="monthly">Monthly</SelectItem>
                                                <SelectItem value="custom">Custom</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Custom Interval UI */}
                                    {recurrenceFreq === 'custom' && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm">Every</span>
                                            <Input 
                                                type="number" 
                                                min={1} 
                                                value={customInterval} 
                                                onChange={(e) => setCustomInterval(parseInt(e.target.value) || 1)}
                                                className="w-16 h-8 text-center"
                                            />
                                            <Select value={customUnit} onValueChange={(v: any) => setCustomUnit(v)}>
                                                <SelectTrigger className="w-24 h-8">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="days">Days</SelectItem>
                                                    <SelectItem value="weeks">Weeks</SelectItem>
                                                    <SelectItem value="months">Months</SelectItem>
                                                    <SelectItem value="years">Years</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}

                                    {/* Days of Week Selector (for Weekly or Custom Weekly) */}
                                    {(recurrenceFreq === 'weekly' || (recurrenceFreq === 'custom' && customUnit === 'weeks')) && (
                                        <div className="space-y-2">
                                            <Label className="text-xs uppercase font-semibold text-muted-foreground">Repeat On</Label>
                                            <div className="flex gap-1 flex-wrap">
                                                {daysOfWeek.map((day, idx) => (
                                                    <button
                                                        key={day}
                                                        onClick={() => toggleDay(idx)}
                                                        className={cn(
                                                            "w-8 h-8 rounded-full text-xs font-medium border transition-colors",
                                                            selectedDays.includes(idx) 
                                                                ? "bg-primary text-primary-foreground border-primary" 
                                                                : "bg-background border-border hover:border-primary/50"
                                                        )}
                                                    >
                                                        {day[0]}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="text-[10px] text-muted-foreground bg-muted/50 p-2 rounded">
                                        Summary: Task will repeat 
                                        {recurrenceFreq === 'daily' && " every day."}
                                        {recurrenceFreq === 'weekly' && ` every week${selectedDays.length > 0 ? " on " + selectedDays.map(d => daysOfWeek[d]).join(", ") : ""}.`}
                                        {recurrenceFreq === 'monthly' && " every month."}
                                        {recurrenceFreq === 'custom' && ` every ${customInterval} ${customUnit}.`}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </ScrollArea>

                <DialogFooter className="p-4 border-t border-border/40 shrink-0 bg-muted/20">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Create Task</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
