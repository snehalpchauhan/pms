import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Task, ChecklistItem, Attachment } from "@/lib/mockData";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Calendar, Paperclip, Tag, User as UserIcon, CheckCircle2, MoreHorizontal, MessageSquare, Plus, X, Reply, Clock, History, AlertCircle, FileText, Activity, Repeat, CalendarCheck, ArrowRight, CheckSquare, Trash2, Download } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

function CommentItem({ comment, users, currentUserId }: { comment: any; users: any; currentUserId: string }) {
  const author = users[comment.authorId];
  const [isReplying, setIsReplying] = useState(false);
  const [replyInput, setReplyInput] = useState("");
  
  const formattedDate = comment.createdAt ? (() => {
    try {
      const d = new Date(comment.createdAt);
      if (!isNaN(d.getTime())) return format(d, "MMM d, h:mm a");
      return comment.createdAt;
    } catch { return comment.createdAt; }
  })() : "Just now";

  return (
    <div className="flex gap-3 group">
      <Avatar className="h-8 w-8 mt-0.5">
        <AvatarImage src={author?.avatar} />
        <AvatarFallback className="text-[10px]">{author?.name?.[0] || "U"}</AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-1">
        <div className="bg-muted/30 px-3 py-2 rounded-2xl rounded-tl-sm inline-block max-w-[90%] border border-border/30">
          <div className="font-semibold text-xs text-foreground mb-0.5">{author?.name || "Unknown"}</div>
          <div className="text-sm text-foreground/90 leading-snug">{comment.content}</div>
        </div>
        <div className="flex items-center gap-3 pl-1">
          <span className="text-[10px] text-muted-foreground font-medium hover:underline cursor-pointer">Like</span>
          <span className="text-[10px] text-muted-foreground font-medium hover:underline cursor-pointer" onClick={() => setIsReplying(!isReplying)}>Reply</span>
          <span className="text-[10px] text-muted-foreground">{formattedDate}</span>
        </div>
        {comment.attachments && comment.attachments.length > 0 && (
          <div className="flex gap-2 mt-1 flex-wrap pl-1">
            {comment.attachments.map((att: any) => (
              <div key={att.id} className="flex items-center gap-2 bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground shadow-sm cursor-pointer hover:bg-muted/50">
                <Paperclip className="w-3 h-3 text-muted-foreground" />
                <span className="font-medium truncate max-w-[150px]">{att.name}</span>
              </div>
            ))}
          </div>
        )}
        {isReplying && (
          <div className="flex gap-2 mt-2 pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
            <Avatar className="h-6 w-6">
              <AvatarImage src={users[currentUserId]?.avatar} />
              <AvatarFallback>ME</AvatarFallback>
            </Avatar>
            <div className="flex-1 flex gap-2">
              <Input value={replyInput} onChange={(e) => setReplyInput(e.target.value)} placeholder="Write a reply..." className="h-8 text-xs bg-muted/20" autoFocus />
              <Button size="sm" className="h-8 px-3 text-xs">Reply</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface TaskDetailPageProps {
  task: Task;
  onClose: () => void;
}

export function TaskDetailPage({ task, onClose }: TaskDetailPageProps) {
  const { users } = useAppData();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [commentInput, setCommentInput] = useState("");
  const [comments, setComments] = useState(task.comments || []);
  const [status, setStatus] = useState(task.status);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task.checklist || []);
  const [newChecklistInput, setNewChecklistInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>(task.attachments || []);
  const [assignees, setAssignees] = useState<string[]>(task.assignees || []);

  const numericTaskId = Number(task.id);
  const numericProjectId = Number(task.projectId);

  const invalidateTasks = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", numericProjectId, "tasks"] });
  };

  const [timeHours, setTimeHours] = useState("");
  const [timeDate, setTimeDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [timeDescription, setTimeDescription] = useState("");
  const [timeLogging, setTimeLogging] = useState(false);

  const { data: timeEntries = [], refetch: refetchTimeEntries } = useQuery<any[]>({
    queryKey: ["/api/tasks", numericTaskId, "time-entries"],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${numericTaskId}/time-entries`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch time entries");
      return res.json();
    },
  });

  const totalHours = timeEntries.reduce((sum: number, e: any) => sum + parseFloat(e.hours || "0"), 0);

  const handleLogTime = async () => {
    if (!timeHours || isNaN(Number(timeHours)) || Number(timeHours) <= 0) return;
    setTimeLogging(true);
    try {
      await apiRequest("POST", `/api/tasks/${numericTaskId}/time-entries`, {
        hours: Number(timeHours),
        description: timeDescription || null,
        logDate: timeDate,
      });
      setTimeHours("");
      setTimeDescription("");
      refetchTimeEntries();
      invalidateTasks();
    } catch (e) {
      console.error("Failed to log time:", e);
    } finally {
      setTimeLogging(false);
    }
  };

  const handleDeleteTimeEntry = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/time-entries/${id}`);
      refetchTimeEntries();
      invalidateTasks();
    } catch (e) {
      console.error("Failed to delete time entry:", e);
    }
  };

  const toggleChecklistItem = async (id: string) => {
      const item = checklist.find(i => i.id === id);
      if (!item) return;
      const newCompleted = !item.completed;
      setChecklist(checklist.map(i => 
          i.id === id ? { ...i, completed: newCompleted } : i
      ));
      try {
        await apiRequest("PATCH", `/api/checklist/${id}`, { completed: newCompleted });
        invalidateTasks();
      } catch (e) {
        setChecklist(checklist);
      }
  };

  const addChecklistItem = async () => {
      if (!newChecklistInput.trim()) return;
      try {
        const res = await apiRequest("POST", `/api/tasks/${numericTaskId}/checklist`, { text: newChecklistInput.trim() });
        const created = await res.json();
        const newItem: ChecklistItem = {
          id: String(created.id),
          text: created.text,
          completed: created.completed,
        };
        setChecklist([...checklist, newItem]);
        setNewChecklistInput("");
        invalidateTasks();
      } catch (e) {
        console.error("Failed to add checklist item:", e);
      }
  };

  const removeChecklistItem = async (id: string) => {
      setChecklist(checklist.filter(item => item.id !== id));
      try {
        await apiRequest("DELETE", `/api/checklist/${id}`);
        invalidateTasks();
      } catch (e) {
        console.error("Failed to remove checklist item:", e);
      }
  };

  const handlePostComment = async () => {
      if (!commentInput.trim()) return;
      try {
        const res = await apiRequest("POST", `/api/tasks/${numericTaskId}/comments`, {
          content: commentInput.trim(),
          type: "comment",
        });
        const created = await res.json();
        setComments(prev => [...prev, {
          id: String(created.id),
          authorId: String(created.authorId),
          content: created.content,
          createdAt: created.createdAt || "Just now",
          type: created.type || "comment",
        }]);
        setCommentInput("");
        invalidateTasks();
      } catch (e) {
        console.error("Failed to post comment:", e);
      }
  };

  const currentUserId = currentUser ? String(currentUser.id) : "";

  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          const newFiles = Array.from(e.target.files).map((file, i) => ({
              id: `att-new-${Date.now()}-${i}`,
              name: file.name,
              type: file.type.includes('image') ? 'image' as const : 'file' as const,
              size: `${(file.size / 1024).toFixed(1)} KB`
          }));
          setAttachments([...attachments, ...newFiles]);
      }
  };

  const toggleAssignee = (userId: string) => {
      if (assignees.includes(userId)) {
          setAssignees(assignees.filter(id => id !== userId));
      } else {
          setAssignees([...assignees, userId]);
      }
  };
  
  return (
    <div className="absolute inset-0 z-50 bg-background flex flex-col animate-in slide-in-from-right duration-300">
         {/* Page Header */}
         <div className="h-16 border-b border-border px-6 flex items-center justify-between bg-background/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
             <div className="flex items-center gap-4">
                 <Button variant="ghost" size="icon" onClick={onClose} className="-ml-2">
                     <X className="w-5 h-5" />
                 </Button>
                 <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-muted-foreground font-mono">
                        {task.id.toUpperCase()}
                    </Badge>
                    <Separator orientation="vertical" className="h-4" />
                    <span className="text-sm text-muted-foreground">Last updated 2 hours ago</span>
                 </div>
             </div>
             
             <div className="flex items-center gap-2">
                 <Button variant="outline" size="sm" className="hidden sm:flex">
                     <AlertCircle className="w-4 h-4 mr-2" /> Report Issue
                 </Button>
                 <Button variant="ghost" size="icon">
                     <MoreHorizontal className="w-5 h-5" />
                 </Button>
                 <Button size="sm" className="bg-primary text-primary-foreground">
                    Mark Complete
                 </Button>
             </div>
         </div>

         <div className="flex-1 overflow-hidden flex flex-col">
             <ScrollArea className="flex-1">
                 <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-8 pb-32">
                     
                     {/* Title & Status Block */}
                     <div className="space-y-4">
                        <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground leading-tight tracking-tight">
                            {task.title}
                        </h1>
                        <div className="flex flex-wrap items-center gap-3">
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger className={cn("w-[140px] h-8 border-none font-medium transition-colors", 
                                    status === 'done' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                    status === 'in-progress' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                                    "bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-400"
                                )}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="todo">To Do</SelectItem>
                                    <SelectItem value="in-progress">In Progress</SelectItem>
                                    <SelectItem value="review">Review</SelectItem>
                                    <SelectItem value="done">Done</SelectItem>
                                </SelectContent>
                            </Select>

                            <Badge 
                                className={cn(
                                    "text-[10px] uppercase font-bold border-none h-8 px-3",
                                    task.priority === 'high' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                    task.priority === 'medium' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                )}
                            >
                                {task.priority} Priority
                            </Badge>

                            {task.recurrence && (
                                <Badge variant="secondary" className="h-8 px-3 gap-1.5 font-medium border-primary/20 bg-primary/5 text-primary">
                                    <Repeat className="w-3.5 h-3.5" />
                                    <span className="capitalize">
                                        {task.recurrence.frequency === 'custom' 
                                            ? `Every ${task.recurrence.interval} ${task.recurrence.customType}` 
                                            : task.recurrence.frequency}
                                    </span>
                                </Badge>
                            )}
                        </div>
                     </div>

                     {/* Metadata Bar - Updated with Start/End Dates */}
                     <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-5 bg-muted/20 border border-border/50 rounded-xl">
                        {/* Assignees */}
                        <div className="space-y-2">
                             <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Assignees</div>
                             <div className="flex flex-wrap gap-2">
                                {assignees.map(id => {
                                    const user = users[id];
                                    return user ? (
                                        <div key={id} className="flex items-center gap-2 bg-background border border-border/50 rounded-full pl-1 pr-3 py-1 shadow-sm">
                                            <Avatar className="h-5 w-5">
                                                <AvatarImage src={user.avatar} />
                                                <AvatarFallback>{user.name[0]}</AvatarFallback>
                                            </Avatar>
                                            <span className="text-xs font-medium truncate max-w-[80px]">{user.name}</span>
                                            <button onClick={() => toggleAssignee(id)} className="ml-1 text-muted-foreground hover:text-destructive">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ) : null;
                                })}
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full border border-dashed border-border/50">
                                            <Plus className="w-3 h-3" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-60 p-2" align="start">
                                        <div className="space-y-1">
                                            <div className="text-xs font-semibold text-muted-foreground px-2 py-1.5">Add Assignee</div>
                                            {Object.values(users).filter(u => !assignees.includes(u.id)).map(user => (
                                                <button 
                                                    key={user.id}
                                                    onClick={() => toggleAssignee(user.id)}
                                                    className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-muted rounded-md text-sm transition-colors"
                                                >
                                                    <Avatar className="h-6 w-6">
                                                        <AvatarImage src={user.avatar} />
                                                        <AvatarFallback>{user.name[0]}</AvatarFallback>
                                                    </Avatar>
                                                    <span>{user.name}</span>
                                                </button>
                                            ))}
                                            {Object.values(users).filter(u => !assignees.includes(u.id)).length === 0 && (
                                                <div className="text-xs text-muted-foreground px-2 py-2 italic">All users assigned</div>
                                            )}
                                        </div>
                                    </PopoverContent>
                                </Popover>
                             </div>
                        </div>

                        {/* Dates - Start & Due */}
                        <div className="space-y-2 md:col-span-2">
                             <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Timeline</div>
                             <div className="flex items-center gap-2 flex-wrap">
                                 {task.startDate ? (
                                     <div className="flex items-center gap-2 bg-background border border-border/50 px-3 py-1.5 rounded-md shadow-sm text-xs font-medium">
                                        <CalendarCheck className="w-3.5 h-3.5 text-muted-foreground" />
                                        <span>{format(new Date(task.startDate), "MMM d")}</span>
                                     </div>
                                 ) : (
                                    <div className="flex items-center gap-2 bg-background border border-dashed border-border/50 px-3 py-1.5 rounded-md text-xs text-muted-foreground opacity-70">
                                        <CalendarCheck className="w-3.5 h-3.5" />
                                        <span>Start</span>
                                    </div>
                                 )}
                                 
                                 <ArrowRight className="w-3 h-3 text-muted-foreground/50" />

                                 <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className={cn("h-[30px] px-3 bg-background border-border/50 shadow-sm text-xs font-medium", !task.dueDate && "text-muted-foreground border-dashed")}>
                                            <Calendar className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                                            {task.dueDate ? format(new Date(task.dueDate), "MMM d") : <span>Due Date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0">
                                        <CalendarComponent mode="single" initialFocus />
                                    </PopoverContent>
                                </Popover>
                             </div>
                        </div>

                         {/* Tags */}
                         <div className="space-y-2">
                             <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tags</div>
                             <div className="flex flex-wrap gap-2">
                                {task.tags.map(tag => (
                                    <Badge key={tag} variant="secondary" className="bg-background hover:bg-muted border-border/50 shadow-sm cursor-pointer font-medium">
                                        {tag}
                                    </Badge>
                                ))}
                                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full border border-dashed border-border/50">
                                    <Plus className="w-3 h-3" />
                                </Button>
                            </div>
                        </div>
                     </div>
                     
                     {/* Attachments */}
                     <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <Paperclip className="w-4 h-4 text-primary" /> Attachments
                            </h3>
                            <div className="relative">
                                <input 
                                    type="file" 
                                    multiple 
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                                    onChange={handleAttachmentUpload}
                                />
                                <Button variant="ghost" size="sm" className="h-7 text-xs">
                                    <Plus className="w-3 h-3 mr-1" /> Add File
                                </Button>
                            </div>
                        </div>
                        
                        {attachments.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {attachments.map(att => (
                                    <div key={att.id} className="flex items-center gap-3 bg-background border border-border/50 rounded-lg p-3 shadow-sm hover:bg-muted/30 transition-colors group">
                                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                                            {att.type === 'image' ? (
                                                <img src={att.url || "https://placehold.co/100x100"} alt="" className="w-full h-full object-cover rounded" />
                                            ) : (
                                                <FileText className="w-5 h-5 text-muted-foreground" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{att.name}</div>
                                            <div className="text-xs text-muted-foreground">{att.size}</div>
                                        </div>
                                        <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                                                <Download className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setAttachments(attachments.filter(a => a.id !== att.id))}>
                                                <X className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="border-2 border-dashed border-border/50 rounded-lg p-6 text-center text-muted-foreground text-sm bg-muted/10">
                                No attachments yet. Click "Add File" to upload.
                            </div>
                        )}
                     </div>

                     {/* Description */}
                     <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            Description
                        </h3>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed p-6 bg-background rounded-xl border border-border/50 shadow-sm min-h-[100px]">
                            <p>{task.description}</p>
                        </div>
                    </div>

                    {/* Checklist */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <CheckSquare className="w-4 h-4 text-primary" /> Checklist
                        </h3>
                        <div className="bg-background border border-border/50 rounded-xl p-4 space-y-3 shadow-sm">
                            {checklist.length > 0 && checklist.map(item => (
                                <div key={item.id} className="flex items-center gap-3 group">
                                    <Checkbox 
                                        id={item.id} 
                                        checked={item.completed} 
                                        onCheckedChange={() => toggleChecklistItem(item.id)}
                                    />
                                    <label 
                                        htmlFor={item.id}
                                        className={cn("text-sm cursor-pointer select-none transition-all flex-1", item.completed && "text-muted-foreground line-through")}
                                    >
                                        {item.text}
                                    </label>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                        onClick={() => removeChecklistItem(item.id)}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            ))}
                            
                            <div className="flex gap-2 pt-2">
                                <Input 
                                    placeholder="Add an item..." 
                                    className="h-9 text-sm bg-muted/20"
                                    value={newChecklistInput}
                                    onChange={(e) => setNewChecklistInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            addChecklistItem();
                                        }
                                    }}
                                />
                                <Button size="sm" variant="secondary" className="h-9" onClick={addChecklistItem}>Add</Button>
                            </div>
                        </div>
                    </div>

                     {/* Tabs for Comments vs Logs vs Time */}
                     <Tabs defaultValue="comments" className="w-full">
                        <div className="flex items-center justify-between border-b border-border/50 pb-px mb-6">
                            <TabsList className="bg-transparent h-10 p-0 gap-6">
                                <TabsTrigger 
                                    value="comments" 
                                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-all"
                                >
                                    <MessageSquare className="w-4 h-4 mr-2" />
                                    Comments
                                </TabsTrigger>
                                <TabsTrigger 
                                    value="time" 
                                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-all"
                                    data-testid="tab-time"
                                >
                                    <Clock className="w-4 h-4 mr-2" />
                                    Time {totalHours > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">({totalHours.toFixed(1)}h)</span>}
                                </TabsTrigger>
                                <TabsTrigger 
                                    value="logs" 
                                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-all"
                                >
                                    <Activity className="w-4 h-4 mr-2" />
                                    System Logs
                                </TabsTrigger>
                            </TabsList>
                            <div className="text-xs text-muted-foreground hidden sm:block">
                                Visible to team only
                            </div>
                        </div>

                        <TabsContent value="time" className="space-y-6 mt-0">
                            {/* Time total */}
                            <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                                <Clock className="w-5 h-5 text-primary" />
                                <div>
                                    <div className="text-sm font-semibold text-foreground">Total Time Logged</div>
                                    <div className="text-2xl font-bold text-primary">{totalHours.toFixed(1)}h</div>
                                </div>
                            </div>

                            {/* Log time form */}
                            <div className="bg-background border border-border/50 rounded-xl p-4 space-y-3 shadow-sm">
                                <h4 className="text-sm font-semibold text-foreground">Log Time</h4>
                                <div className="flex gap-3 flex-wrap">
                                    <div className="flex-1 min-w-[100px]">
                                        <label className="text-xs text-muted-foreground mb-1 block">Hours</label>
                                        <Input
                                            type="number"
                                            min="0.25"
                                            step="0.25"
                                            placeholder="e.g. 1.5"
                                            value={timeHours}
                                            onChange={e => setTimeHours(e.target.value)}
                                            className="h-9 text-sm"
                                            data-testid="input-time-hours"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-[130px]">
                                        <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                                        <Input
                                            type="date"
                                            value={timeDate}
                                            onChange={e => setTimeDate(e.target.value)}
                                            className="h-9 text-sm"
                                            data-testid="input-time-date"
                                        />
                                    </div>
                                    <div className="flex-[2] min-w-[150px]">
                                        <label className="text-xs text-muted-foreground mb-1 block">Note (optional)</label>
                                        <Input
                                            placeholder="What did you work on?"
                                            value={timeDescription}
                                            onChange={e => setTimeDescription(e.target.value)}
                                            className="h-9 text-sm"
                                            data-testid="input-time-description"
                                        />
                                    </div>
                                    <div className="flex items-end">
                                        <Button
                                            size="sm"
                                            className="h-9 px-4"
                                            onClick={handleLogTime}
                                            disabled={timeLogging || !timeHours}
                                            data-testid="button-log-time"
                                        >
                                            Log Time
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Time entries list */}
                            <div className="space-y-2">
                                {timeEntries.length === 0 ? (
                                    <div className="text-center text-sm text-muted-foreground py-6 border-2 border-dashed border-border/50 rounded-xl">
                                        No time logged yet. Use the form above to track your work.
                                    </div>
                                ) : timeEntries.map((entry: any) => {
                                    const canDelete = (currentUser?.role === "admin" || currentUser?.role === "manager") || String(entry.userId) === currentUserId;
                                    return (
                                        <div key={entry.id} className="flex items-center gap-3 bg-background border border-border/50 rounded-lg p-3 shadow-sm group" data-testid={`time-entry-${entry.id}`}>
                                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                <span className="text-xs font-bold text-primary">{parseFloat(entry.hours).toFixed(1)}h</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-foreground">{entry.userName || "Unknown"}</span>
                                                    <span className="text-xs text-muted-foreground">· {entry.logDate}</span>
                                                </div>
                                                <div className="text-sm text-foreground/80 mt-0.5">{entry.description || <span className="text-muted-foreground italic text-xs">No note</span>}</div>
                                            </div>
                                            {canDelete && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                                    onClick={() => handleDeleteTimeEntry(entry.id)}
                                                    data-testid={`button-delete-time-entry-${entry.id}`}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </TabsContent>

                        <TabsContent value="comments" className="space-y-6 mt-0">
                             {/* Comment Input */}
                             <div className="flex gap-3">
                                <Avatar className="h-8 w-8 mt-1">
                                    <AvatarImage src={users[currentUserId]?.avatar} />
                                    <AvatarFallback>{currentUser?.name?.[0] || "ME"}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-2">
                                    <div className="relative group">
                                        <Textarea 
                                            value={commentInput}
                                            onChange={(e) => setCommentInput(e.target.value)}
                                            placeholder="Write a comment..." 
                                            className="min-h-[80px] resize-none bg-muted/20 focus:bg-background focus:ring-1 focus:ring-primary/20 border-border/60 shadow-sm p-3 pr-12 text-sm rounded-lg transition-all"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                                    e.preventDefault();
                                                    handlePostComment();
                                                }
                                            }}
                                        />
                                        <div className="absolute bottom-2 right-2 flex gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-full">
                                                <Paperclip className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <Button size="sm" className="h-8 px-4 text-xs font-medium" onClick={handlePostComment} data-testid="button-post-comment">Comment</Button>
                                    </div>
                                </div>
                            </div>

                            {/* Comment Stream - Compact FB Style */}
                            <div className="space-y-4">
                                {comments.filter(c => c.type !== 'system').map((comment) => (
                                    <CommentItem key={comment.id} comment={comment} users={users} currentUserId={currentUserId} />
                                ))}
                                {comments.filter(c => c.type !== 'system').length === 0 && (
                                    <div className="text-center text-sm text-muted-foreground py-6">
                                        No comments yet. Be the first to comment.
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="logs" className="space-y-4 mt-0 pt-2">
                             <div className="relative pl-6 ml-3 space-y-6 border-l-2 border-border/40 pb-4">
                                {comments.filter(c => c.type === 'system').map((log) => {
                                    const author = users[log.authorId];
                                    return (
                                        <div key={log.id} className="relative">
                                            <div className="absolute -left-[29px] top-1.5 bg-background rounded-full p-0.5 border border-border">
                                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Avatar className="h-5 w-5 border border-border/50">
                                                    <AvatarImage src={author?.avatar} />
                                                    <AvatarFallback>UA</AvatarFallback>
                                                </Avatar>
                                                <span className="font-medium text-foreground">{author?.name}</span>
                                                <span>{log.content}</span>
                                                <span className="opacity-50">• {log.createdAt}</span>
                                            </div>
                                        </div>
                                    )
                                })}
                                {/* Example logs to fill space since we only have one in mock data */}
                                <div className="relative">
                                    <div className="absolute -left-[29px] top-1.5 bg-background rounded-full p-0.5 border border-border">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <span className="font-medium text-foreground">System</span>
                                        <span>Task created in Website Redesign</span>
                                        <span className="opacity-50">• 2 days ago</span>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                     </Tabs>
                 </div>
             </ScrollArea>
         </div>
    </div>
  );
}
