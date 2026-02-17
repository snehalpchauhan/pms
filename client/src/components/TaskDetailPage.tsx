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
import { Calendar, Paperclip, Tag, User as UserIcon, CheckCircle2, MoreHorizontal, MessageSquare, Plus, X, Reply, Clock, History, AlertCircle, FileText, Activity } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
                        </div>
                     </div>

                     {/* Metadata Bar - Moved to Top */}
                     <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-5 bg-muted/20 border border-border/50 rounded-xl">
                        {/* Assignees */}
                        <div className="space-y-2">
                             <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Assignees</div>
                             <div className="flex flex-wrap gap-2">
                                {task.assignees.map(id => {
                                    const user = USERS[id];
                                    return user ? (
                                        <div key={id} className="flex items-center gap-2 bg-background border border-border/50 rounded-full pl-1 pr-3 py-1 shadow-sm">
                                            <Avatar className="h-5 w-5">
                                                <AvatarImage src={user.avatar} />
                                                <AvatarFallback>{user.name[0]}</AvatarFallback>
                                            </Avatar>
                                            <span className="text-xs font-medium truncate max-w-[80px]">{user.name}</span>
                                        </div>
                                    ) : null;
                                })}
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full border border-dashed border-border/50">
                                    <Plus className="w-3 h-3" />
                                </Button>
                             </div>
                        </div>

                        {/* Due Date */}
                        <div className="space-y-2">
                             <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Due Date</div>
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start text-left font-normal h-9 bg-background border-border/50 shadow-sm text-xs">
                                        <Calendar className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                                        {task.dueDate ? format(new Date(task.dueDate), "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <CalendarComponent mode="single" initialFocus />
                                </PopoverContent>
                            </Popover>
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

                         {/* Attachments */}
                         <div className="space-y-2">
                             <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Attachments</div>
                             <div className="flex flex-wrap gap-2">
                                {task.attachments.length > 0 ? (
                                    task.attachments.map(att => (
                                        <div key={att.id} className="flex items-center gap-2 bg-background border border-border/50 rounded-md px-2 py-1 shadow-sm text-xs max-w-full truncate cursor-pointer hover:bg-muted/50 transition-colors">
                                            <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
                                            <span className="truncate">{att.name}</span>
                                        </div>
                                    ))
                                ) : (
                                    <span className="text-xs text-muted-foreground italic">None</span>
                                )}
                             </div>
                        </div>
                     </div>

                     {/* Description */}
                     <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            Description
                        </h3>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed p-6 bg-background rounded-xl border border-border/50 shadow-sm">
                            <p>{task.description}</p>
                        </div>
                    </div>

                     {/* Tabs for Comments vs Logs */}
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

                        <TabsContent value="comments" className="space-y-6 mt-0">
                             {/* Comment Input */}
                             <div className="flex gap-3">
                                <Avatar className="h-8 w-8 mt-1">
                                    <AvatarImage src={USERS["u1"].avatar} />
                                    <AvatarFallback>ME</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-2">
                                    <div className="relative group">
                                        <Textarea 
                                            value={commentInput}
                                            onChange={(e) => setCommentInput(e.target.value)}
                                            placeholder="Write a comment..." 
                                            className="min-h-[80px] resize-none bg-muted/20 focus:bg-background focus:ring-1 focus:ring-primary/20 border-border/60 shadow-sm p-3 pr-12 text-sm rounded-lg transition-all" 
                                        />
                                        <div className="absolute bottom-2 right-2 flex gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-full">
                                                <Paperclip className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <Button size="sm" className="h-8 px-4 text-xs font-medium">Comment</Button>
                                    </div>
                                </div>
                            </div>

                            {/* Comment Stream - Compact FB Style */}
                            <div className="space-y-4">
                                {task.comments.filter(c => c.type !== 'system').map((comment) => {
                                    const author = USERS[comment.authorId];
                                    return (
                                        <div key={comment.id} className="flex gap-3 group">
                                            <Avatar className="h-8 w-8 mt-0.5">
                                                <AvatarImage src={author?.avatar} />
                                                <AvatarFallback className="text-[10px]">UA</AvatarFallback>
                                            </Avatar>
                                            
                                            <div className="flex-1 space-y-1">
                                                <div className="bg-muted/30 px-3 py-2 rounded-2xl rounded-tl-sm inline-block max-w-[90%] border border-border/30">
                                                    <div className="font-semibold text-xs text-foreground mb-0.5">
                                                        {author?.name}
                                                    </div>
                                                    <div className="text-sm text-foreground/90 leading-snug">
                                                        {comment.content}
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center gap-3 pl-1">
                                                    <span className="text-[10px] text-muted-foreground font-medium hover:underline cursor-pointer">Like</span>
                                                    <span className="text-[10px] text-muted-foreground font-medium hover:underline cursor-pointer">Reply</span>
                                                    <span className="text-[10px] text-muted-foreground">{comment.createdAt}</span>
                                                </div>

                                                {/* Attachments in comment */}
                                                {comment.attachments && comment.attachments.length > 0 && (
                                                    <div className="flex gap-2 mt-1 flex-wrap pl-1">
                                                        {comment.attachments.map(att => (
                                                            <div key={att.id} className="flex items-center gap-2 bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground shadow-sm cursor-pointer hover:bg-muted/50">
                                                                <Paperclip className="w-3 h-3 text-muted-foreground" />
                                                                <span className="font-medium truncate max-w-[150px]">{att.name}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </TabsContent>

                        <TabsContent value="logs" className="space-y-4 mt-0 pt-2">
                             <div className="relative pl-6 ml-3 space-y-6 border-l-2 border-border/40 pb-4">
                                {task.comments.filter(c => c.type === 'system').map((log) => {
                                    const author = USERS[log.authorId];
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
