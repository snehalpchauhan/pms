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
import { Task, USERS } from "@/lib/mockData";
import { Calendar, Paperclip, Tag, User as UserIcon, CheckCircle2, MoreHorizontal, MessageSquare, Plus, X, Reply, Clock, History, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

interface TaskDetailPageProps {
  task: Task;
  onClose: () => void;
}

export function TaskDetailPage({ task, onClose }: TaskDetailPageProps) {
  const [commentInput, setCommentInput] = useState("");
  const [status, setStatus] = useState(task.status);
  
  return (
    <div className="absolute inset-0 z-50 bg-background flex flex-col animate-in slide-in-from-right duration-300">
         {/* Page Header */}
         <div className="h-16 border-b border-border px-6 flex items-center justify-between bg-background/80 backdrop-blur-md sticky top-0 z-10">
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

         <div className="flex-1 flex overflow-hidden">
             {/* Main Content */}
             <ScrollArea className="flex-1">
                 <div className="p-8 max-w-4xl mx-auto pb-32">
                     
                     {/* Title & Status Block */}
                     <div className="mb-8 space-y-4">
                        <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground leading-tight tracking-tight">
                            {task.title}
                        </h1>
                        <div className="flex flex-wrap items-center gap-3">
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger className={cn("w-[140px] h-8 border-none font-medium", 
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
                        </div>
                     </div>

                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                         {/* Left Column: Description & Activity */}
                         <div className="lg:col-span-2 space-y-8">
                             {/* Description */}
                             <div className="space-y-3">
                                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                    Description
                                </h3>
                                <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed p-6 bg-muted/20 rounded-xl border border-border/30 shadow-sm">
                                    <p>{task.description}</p>
                                </div>
                            </div>

                             {/* Activity Feed */}
                             <div className="space-y-6 pt-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                        Activity & Comments
                                    </h3>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded-md">
                                        <History className="w-3 h-3" />
                                        <span>Log enabled</span>
                                    </div>
                                </div>

                                {/* Comment Input */}
                                <div className="flex gap-4">
                                    <Avatar className="h-10 w-10 border border-border">
                                        <AvatarImage src={USERS["u1"].avatar} />
                                        <AvatarFallback>ME</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 space-y-3">
                                        <div className="relative group">
                                            <Textarea 
                                                value={commentInput}
                                                onChange={(e) => setCommentInput(e.target.value)}
                                                placeholder="Write a status update or comment..." 
                                                className="min-h-[120px] resize-none bg-background focus:ring-1 focus:ring-primary/20 border-border shadow-sm p-4 pr-12 text-base rounded-xl transition-all" 
                                            />
                                            <div className="absolute bottom-3 right-3 flex gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full">
                                                    <Paperclip className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <div className="text-xs text-muted-foreground">
                                                Visible to: <span className="font-medium text-foreground">Everyone</span>
                                            </div>
                                            <Button size="sm" className="px-6">Post Update</Button>
                                        </div>
                                    </div>
                                </div>

                                {/* Stream */}
                                <div className="relative pl-6 ml-5 space-y-8 border-l-2 border-border/40 pb-10">
                                    {task.comments.map((comment, i) => {
                                        const author = USERS[comment.authorId];
                                        
                                        if (comment.type === 'system') {
                                            return (
                                                <div key={comment.id} className="relative py-2">
                                                     <div className="absolute -left-[31px] top-4 bg-background rounded-full p-1 border border-border">
                                                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 p-2 rounded-lg inline-block">
                                                        <span className="font-medium text-foreground">{author?.name}</span>
                                                        <span>{comment.content}</span>
                                                        <span className="opacity-50 text-xs">• {comment.createdAt}</span>
                                                    </div>
                                                </div>
                                            )
                                        }

                                        return (
                                            <div key={comment.id} className="relative group">
                                                <div className="absolute -left-[39px] top-0 bg-background rounded-full p-1 border border-border shadow-sm">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={author?.avatar} />
                                                        <AvatarFallback className="text-[10px]">UA</AvatarFallback>
                                                    </Avatar>
                                                </div>
                                                
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-sm text-foreground">{author?.name}</span>
                                                            <span className="text-xs text-muted-foreground">{comment.createdAt}</span>
                                                        </div>
                                                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <MoreHorizontal className="w-3 h-3" />
                                                        </Button>
                                                    </div>
                                                    
                                                    <div className="bg-muted/10 p-4 rounded-r-xl rounded-bl-xl border border-border/40 text-[15px] text-foreground/90 leading-relaxed shadow-sm hover:bg-muted/20 transition-colors">
                                                        {comment.content}
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-4 pt-1 pl-1">
                                                        <button className="text-xs font-medium text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                                                            <Reply className="w-3 h-3" /> Reply
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                             </div>
                         </div>

                         {/* Right Column: Metadata Sidebar */}
                         <div className="space-y-6">
                            {/* Assignees Card */}
                            <div className="bg-muted/10 rounded-xl border border-border/50 p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assignees</h4>
                                    <Button variant="ghost" size="icon" className="h-6 w-6">
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </div>
                                <div className="space-y-3">
                                    {task.assignees.map(id => {
                                        const user = USERS[id];
                                        return user ? (
                                            <div key={id} className="flex items-center gap-3">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={user.avatar} />
                                                    <AvatarFallback>{user.name[0]}</AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 overflow-hidden">
                                                    <div className="text-sm font-medium truncate">{user.name}</div>
                                                    <div className="text-xs text-muted-foreground truncate">{user.role}</div>
                                                </div>
                                            </div>
                                        ) : null;
                                    })}
                                </div>
                            </div>

                            {/* Details Card */}
                            <div className="bg-muted/10 rounded-xl border border-border/50 p-5 space-y-5">
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</h4>
                                
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                                            <Calendar className="w-3.5 h-3.5" /> Due Date
                                        </div>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" className="w-full justify-start text-left font-normal h-9">
                                                    {task.dueDate ? format(new Date(task.dueDate), "PPP") : <span>Pick a date</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
                                                <CalendarComponent mode="single" initialFocus />
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                                            <Tag className="w-3.5 h-3.5" /> Tags
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {task.tags.map(tag => (
                                                <Badge key={tag} variant="secondary" className="bg-background hover:bg-muted border-border cursor-pointer">
                                                    {tag}
                                                </Badge>
                                            ))}
                                            <Button variant="outline" size="icon" className="h-5 w-5 rounded-full border-dashed">
                                                <Plus className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                             {/* Attachments Card */}
                            <div className="bg-muted/10 rounded-xl border border-border/50 p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attachments</h4>
                                    <Button variant="ghost" size="icon" className="h-6 w-6">
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                </div>
                                
                                {task.attachments.length > 0 ? (
                                    <div className="space-y-2">
                                        {task.attachments.map(att => (
                                            <div key={att.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50 cursor-pointer">
                                                <div className="w-10 h-10 bg-background rounded-lg flex items-center justify-center border border-border/50 shadow-sm shrink-0">
                                                    {att.type === 'image' ? (
                                                        <img src={att.url} className="w-full h-full object-cover rounded-lg" />
                                                    ) : (
                                                        <Paperclip className="w-5 h-5 text-muted-foreground" />
                                                    )}
                                                </div>
                                                <div className="flex-1 overflow-hidden">
                                                    <div className="text-sm font-medium truncate">{att.name}</div>
                                                    <div className="text-xs text-muted-foreground">{att.size}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-sm text-muted-foreground italic px-1">No attachments</div>
                                )}
                            </div>
                         </div>
                     </div>
                 </div>
             </ScrollArea>
         </div>
    </div>
  );
}
