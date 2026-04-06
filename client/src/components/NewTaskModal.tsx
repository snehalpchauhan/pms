import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Repeat, CheckSquare, Paperclip, X, Trash2, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Task, Project, ChecklistItem, Recurrence, CreateTaskInput } from "@/lib/mockData";
import { useAuth } from "@/hooks/useAuth";
import { getUserInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

interface ProjectMemberRow {
  id: number;
  name: string;
  avatar?: string | null;
  role?: string;
}

interface NewTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  /** Must match the project the task is created in (used only for the assignee list API). */
  membersProjectId: string;
  onSave: (task: CreateTaskInput) => void;
  defaultStatus?: string;
}

function normalizeProjectMemberRows(data: unknown): ProjectMemberRow[] {
  if (!Array.isArray(data)) return [];
  const seen = new Set<number>();
  const out: ProjectMemberRow[] = [];
  for (const raw of data) {
    if (raw == null || typeof raw !== "object") continue;
    const id = Number((raw as { id?: unknown }).id);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    const name = String((raw as { name?: unknown }).name ?? "").trim() || `User ${id}`;
    const avatar = (raw as { avatar?: unknown }).avatar;
    out.push({
      id,
      name,
      avatar: typeof avatar === "string" ? avatar : avatar == null ? null : String(avatar),
    });
  }
  return out;
}

/** Up to 4 digits before decimal, optional . and up to 2 fraction digits; strips other characters. */
function sanitizeEstimatedHoursInput(raw: string): string {
  const normalized = raw.replace(/,/g, ".");
  let intPart = "";
  let afterDot: string | null = null;
  for (const ch of normalized) {
    if (ch >= "0" && ch <= "9") {
      if (afterDot !== null) {
        if (afterDot.length < 2) afterDot += ch;
      } else if (intPart.length < 4) {
        intPart += ch;
      }
    } else if (ch === "." && afterDot === null) {
      afterDot = "";
    }
  }
  if (afterDot === null) return intPart;
  return intPart + "." + afterDot;
}

export function NewTaskModal({ open, onOpenChange, project, membersProjectId, onSave, defaultStatus }: NewTaskModalProps) {
    const { user: authUser } = useAuth();
    const [startDate, setStartDate] = useState<Date>(new Date());
    const [endDate, setEndDate] = useState<Date>(new Date());
    const [title, setTitle] = useState("");
    const [desc, setDesc] = useState("");
    const [priority, setPriority] = useState("medium");
    const [status, setStatus] = useState(defaultStatus || project.columns[0]?.id || "todo");
    
    useEffect(() => {
      if (open) {
        setStatus(defaultStatus || project.columns[0]?.id || "todo");
      }
    }, [open, defaultStatus, project.columns]);
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

    const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<Set<string>>(() => new Set());
    const [estimatedHoursInput, setEstimatedHoursInput] = useState("");

    const [projectMembers, setProjectMembers] = useState<ProjectMemberRow[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);

    useEffect(() => {
      if (!open || !membersProjectId?.trim()) {
        setProjectMembers([]);
        setMembersLoading(false);
        return;
      }
      const pid = membersProjectId.trim();
      const n = Number(pid);
      if (!Number.isInteger(n) || n <= 0) {
        setProjectMembers([]);
        setMembersLoading(false);
        return;
      }
      let cancelled = false;
      setMembersLoading(true);
      void (async () => {
        try {
          const res = await fetch(`/api/projects/${encodeURIComponent(pid)}/members`, {
            credentials: "include",
          });
          if (!res.ok) {
            if (!cancelled) setProjectMembers([]);
            return;
          }
          const json: unknown = await res.json();
          const rows = normalizeProjectMemberRows(json);
          if (!cancelled) setProjectMembers(rows);
        } catch {
          if (!cancelled) setProjectMembers([]);
        } finally {
          if (!cancelled) setMembersLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [open, membersProjectId]);

    const sortedMembers = useMemo(
      () => [...projectMembers].sort((a, b) => a.name.localeCompare(b.name)),
      [projectMembers],
    );

    const selectedMembersOrdered = useMemo(() => {
      return Array.from(selectedAssigneeIds)
        .map((id) => projectMembers.find((m) => String(m.id) === id))
        .filter((m): m is ProjectMemberRow => m != null)
        .sort((a, b) => a.name.localeCompare(b.name));
    }, [selectedAssigneeIds, projectMembers]);

    const assignableProjectMembers = useMemo(
      () => sortedMembers.filter((m) => !selectedAssigneeIds.has(String(m.id))),
      [sortedMembers, selectedAssigneeIds],
    );

    useEffect(() => {
      if (!open) return;
      setSelectedAssigneeIds(new Set());
      setEstimatedHoursInput("");
    }, [open]);

    const toggleAssignee = (userId: string) => {
      setSelectedAssigneeIds((prev) => {
        const next = new Set(prev);
        if (next.has(userId)) next.delete(userId);
        else next.add(userId);
        return next;
      });
    };

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

        const hoursParsed = parseFloat(estimatedHoursInput.replace(",", "."));
        const estimatedHours =
          estimatedHoursInput.trim() !== "" && !Number.isNaN(hoursParsed) && hoursParsed >= 0
            ? hoursParsed
            : undefined;

        onSave({
            title,
            description: desc,
            priority: priority as Task["priority"],
            status: status,
            startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
            dueDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
            recurrence: recurrenceConfig,
            checklist: checklistItems,
            projectId: project.id,
            assignees: Array.from(selectedAssigneeIds),
            estimatedHours,
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
        setStartDate(new Date());
        setEndDate(new Date());
        setIsRecurring(false);
        setRecurrenceFreq("weekly");
        setChecklistItems([]);
        setAttachments([]);
        setSelectedAssigneeIds(new Set());
        setEstimatedHoursInput("");
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
            <DialogContent className="sm:max-w-[700px] bg-card/95 backdrop-blur-xl border-border/60 h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b border-border/40 shrink-0">
                    <DialogTitle className="font-display text-xl">Create New Task</DialogTitle>
                </DialogHeader>
                
                <ScrollArea className="flex-1">
                    <div className="p-6 grid gap-6">
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
                                            required
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
                                            required
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

                        {/* Assignees */}
                        <div className="space-y-3 rounded-lg border border-border/50 bg-muted/15 p-4">
                            <div className="space-y-2">
                                <Label className="text-xs uppercase font-semibold text-muted-foreground">
                                    Assignees (optional)
                                </Label>
                                <p className="text-[11px] text-muted-foreground">
                                  Only people on this project (Members &amp; Access). Use + to add more.
                                </p>
                                {membersLoading ? (
                                    <p className="text-xs text-muted-foreground">Loading project members…</p>
                                ) : sortedMembers.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">No members on this project.</p>
                                ) : (
                                    <div className="flex flex-wrap items-center gap-2">
                                        {selectedMembersOrdered.map((m) => {
                                            const id = String(m.id);
                                            const isSelf = authUser?.id != null && String(authUser.id) === id;
                                            return (
                                                <div
                                                    key={id}
                                                    className="flex items-center gap-2 bg-background border border-border/50 rounded-full pl-1 pr-2 py-1 shadow-sm"
                                                >
                                                    <Avatar className="h-6 w-6">
                                                        <AvatarImage src={m.avatar?.trim() || undefined} />
                                                        <AvatarFallback className="text-[10px]">
                                                            {getUserInitials(m.name, undefined)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-xs font-medium truncate max-w-[120px]">
                                                        {m.name}
                                                        {isSelf ? (
                                                            <span className="text-muted-foreground font-normal"> (you)</span>
                                                        ) : null}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleAssignee(id)}
                                                        className="text-muted-foreground hover:text-destructive p-0.5 rounded"
                                                        aria-label={`Remove ${m.name}`}
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 shrink-0 rounded-full border border-dashed border-border/50"
                                                    aria-label="Add assignees"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-60 p-2" align="start">
                                                <div className="space-y-1">
                                                    <div className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
                                                        Add assignee
                                                    </div>
                                                    <p className="px-2 pb-1 text-[10px] text-muted-foreground">
                                                        Only people on this project can be assigned.
                                                    </p>
                                                    <div className="max-h-56 overflow-y-auto space-y-0.5">
                                                        {assignableProjectMembers.map((m) => (
                                                            <button
                                                                key={m.id}
                                                                type="button"
                                                                onClick={() => toggleAssignee(String(m.id))}
                                                                className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-muted rounded-md text-sm transition-colors text-left"
                                                            >
                                                                <Avatar className="h-6 w-6">
                                                                    <AvatarImage src={m.avatar?.trim() || undefined} />
                                                                    <AvatarFallback className="text-[10px]">
                                                                        {getUserInitials(m.name, undefined)}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <span className="truncate">
                                                                    {m.name}
                                                                    {authUser?.id != null && String(authUser.id) === String(m.id) ? (
                                                                        <span className="text-muted-foreground"> (you)</span>
                                                                    ) : null}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                    {assignableProjectMembers.length === 0 && (
                                                        <div className="text-xs text-muted-foreground px-2 py-2 italic">
                                                            {projectMembers.length === 0
                                                                ? "No members on this project yet."
                                                                : "Everyone on this project is already assigned."}
                                                        </div>
                                                    )}
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Estimated hours — separate card; narrow text field (no number spinners) */}
                        <div className="space-y-3 rounded-lg border border-border/50 bg-muted/15 p-4">
                            <Label
                                htmlFor="estimated-hours"
                                className="text-xs uppercase font-semibold text-muted-foreground"
                            >
                                Estimated hours (optional)
                            </Label>
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                    <Input
                                        id="estimated-hours"
                                        type="text"
                                        inputMode="decimal"
                                        autoComplete="off"
                                        placeholder="e.g. 4"
                                        className="h-9 w-[5.5rem] tabular-nums bg-background/50 border-border/50 sm:w-24"
                                        value={estimatedHoursInput}
                                        onChange={(e) => setEstimatedHoursInput(sanitizeEstimatedHoursInput(e.target.value))}
                                    />
                                </div>
                                <p className="text-[11px] text-muted-foreground min-w-0 flex-1 basis-full sm:basis-auto sm:pb-0.5">
                                    Planned effort for this task. Actual time comes from logged time entries.
                                </p>
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
