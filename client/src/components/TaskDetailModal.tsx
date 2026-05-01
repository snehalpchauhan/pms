import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Task } from "@/lib/mockData";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/hooks/useAuth";
import { getTaskPeopleMeta } from "@/lib/taskOwnerAttribution";
import { Calendar, Paperclip, Tag, User as UserIcon, CheckCircle2, MoreHorizontal, MessageSquare, Plus, X, Reply } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface TaskDetailModalProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailModal({ task, open, onOpenChange }: TaskDetailModalProps) {
  const { users } = useAppData();
  const { user: currentUser } = useAuth();
  const [commentInput, setCommentInput] = useState("");
  const people = getTaskPeopleMeta(task?.ownerId, task?.assignees ?? [], users, currentUser?.id ?? null);

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] p-0 flex flex-col gap-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border/60 shadow-2xl sm:rounded-xl">
        <div className="flex flex-1 h-full overflow-hidden">
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col h-full overflow-hidden relative">
             <div className="absolute top-4 right-4 z-10 md:hidden">
                <DialogClose asChild>
                    <Button variant="ghost" size="icon">
                        <X className="w-4 h-4" />
                    </Button>
                </DialogClose>
             </div>
             
             {/* Header */}
             <div className="p-6 pb-4 border-b border-border/40 shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                         <Badge variant="outline" className="text-muted-foreground border-border bg-muted/20 font-mono text-xs">
                            {task.id.toUpperCase()}
                         </Badge>
                         <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none dark:bg-blue-900/30 dark:text-blue-300">
                            {task.status.replace('-', ' ')}
                         </Badge>
                    </div>
                    <div className="hidden md:flex items-center gap-2">
                         <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                             <MoreHorizontal className="w-4 h-4" />
                         </Button>
                    </div>
                </div>
                <h2 className="text-2xl font-display font-semibold text-foreground leading-tight tracking-tight">
                    {task.title}
                </h2>
             </div>

             <ScrollArea className="flex-1">
                 <div className="p-6 space-y-8 pb-20">
                    {/* Description */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            Description
                        </h3>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed p-4 bg-muted/20 rounded-lg border border-border/30">
                            <p>{task.description}</p>
                        </div>
                    </div>

                    {/* Attachments Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                <Paperclip className="w-3.5 h-3.5" /> Attachments
                            </h3>
                            <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-foreground">
                                <Plus className="w-3 h-3 mr-1" /> Add
                            </Button>
                        </div>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {task.attachments.length > 0 ? (
                                task.attachments.map(att => (
                                    <div key={att.id} className="group relative aspect-[4/3] bg-muted/30 rounded-lg border border-border/50 overflow-hidden flex flex-col items-center justify-center hover:bg-muted/50 transition-all hover:border-primary/30 cursor-pointer shadow-sm hover:shadow-md">
                                        {att.type === 'image' && att.url ? (
                                            <div className="w-full h-full relative">
                                                <img src={att.url} className="w-full h-full object-cover" alt={att.name} />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <Button variant="secondary" size="sm" className="h-7 text-xs">View</Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center p-4 w-full">
                                                <div className="w-10 h-10 mx-auto bg-background rounded-full flex items-center justify-center shadow-sm mb-2 text-primary">
                                                    <Paperclip className="w-5 h-5" />
                                                </div>
                                                <p className="text-xs font-medium text-foreground truncate w-full px-2">{att.name}</p>
                                                <p className="text-[10px] text-muted-foreground">{att.size || '1.2 MB'}</p>
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-full border-2 border-dashed border-border/50 rounded-lg p-8 flex flex-col items-center justify-center text-center hover:bg-muted/10 transition-colors cursor-pointer group">
                                    <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mb-3 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                        <Paperclip className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                                    </div>
                                    <p className="text-sm text-foreground font-medium">No attachments</p>
                                    <p className="text-xs text-muted-foreground mt-1">Click to upload or drag and drop</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <Separator />

                    {/* Activity / Comments */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                 <MessageSquare className="w-3.5 h-3.5" /> Activity
                            </h3>
                            <span className="text-xs text-muted-foreground">Only visible to team</span>
                        </div>
                        
                        <div className="space-y-6">
                            {/* New Comment Input */}
                            <div className="flex gap-4">
                                <Avatar className="h-9 w-9 border border-border">
                                    <AvatarImage src={users["u1"]?.avatar} />
                                    <AvatarFallback>ME</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-3">
                                    <div className="relative">
                                        <Textarea 
                                            value={commentInput}
                                            onChange={(e) => setCommentInput(e.target.value)}
                                            placeholder="Write a comment..." 
                                            className="min-h-[100px] resize-none bg-background focus:ring-1 focus:ring-primary/20 border-border shadow-sm p-3 pr-12" 
                                        />
                                        <div className="absolute bottom-2 right-2 flex gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full">
                                                <Paperclip className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button size="sm" className="px-6">Post Comment</Button>
                                    </div>
                                </div>
                            </div>

                            {/* Comment Stream */}
                            <div className="space-y-6 pl-4 border-l-2 border-border/40 ml-4">
                                {task.comments.map(comment => {
                                    const author = users[comment.authorId];
                                    
                                    if (comment.type === 'system') {
                                        return (
                                            <div key={comment.id} className="relative pl-6 pb-2">
                                                 <div className="absolute -left-[21px] top-1 bg-background rounded-full p-0.5 border border-border/60">
                                                    <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <span className="font-medium text-foreground/80">{author?.name}</span>
                                                    <span>{comment.content}</span>
                                                    <span className="opacity-50">• {comment.createdAt}</span>
                                                </div>
                                            </div>
                                        )
                                    }

                                    return (
                                        <div key={comment.id} className="relative pl-6 pb-2 group">
                                            <div className="absolute -left-[29px] top-0 bg-background rounded-full p-1 border border-border/60 shadow-sm">
                                                <Avatar className="h-6 w-6">
                                                    <AvatarImage src={author?.avatar} />
                                                    <AvatarFallback className="text-[10px]">UA</AvatarFallback>
                                                </Avatar>
                                            </div>
                                            
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-sm text-foreground">{author?.name}</span>
                                                    <span className="text-xs text-muted-foreground">{comment.createdAt}</span>
                                                </div>
                                                <div className="bg-muted/20 p-3 rounded-lg border border-border/30 text-sm text-foreground/90 leading-relaxed shadow-sm">
                                                    {comment.content}
                                                </div>
                                                
                                                {comment.attachments && comment.attachments.length > 0 && (
                                                    <div className="flex gap-2 mt-2 flex-wrap">
                                                        {comment.attachments.map(att => (
                                                            <div key={att.id} className="flex items-center gap-2 bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground shadow-sm hover:border-primary/40 cursor-pointer transition-colors">
                                                                <Paperclip className="w-3 h-3 text-muted-foreground" />
                                                                <span className="font-medium">{att.name}</span>
                                                                {att.size && <span className="text-muted-foreground opacity-60">({att.size})</span>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                
                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                                                        <Reply className="w-3 h-3" /> Reply
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                 </div>
             </ScrollArea>
          </div>

          {/* Sidebar Area */}
          <div className="hidden md:block w-80 border-l border-border bg-muted/10 p-6 space-y-8 overflow-y-auto shrink-0">
             <div className="flex justify-end">
                <DialogClose asChild>
                    <Button variant="ghost" size="icon" className="-mr-2 -mt-2">
                        <X className="w-4 h-4" />
                    </Button>
                </DialogClose>
             </div>
             
             {/* People: created / assigned by / assigned to */}
             <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">People</h4>
                <div className="rounded-lg border border-border/50 bg-background/80 p-3 space-y-3 text-sm">
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Created by</div>
                        <p className="font-medium text-foreground mt-0.5">
                            {people.createdByName ?? (task.ownerId != null ? "Unknown" : "—")}
                        </p>
                    </div>
                    {people.hasAssignees ? (
                        <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Assigned by</div>
                            <p className="font-medium text-foreground mt-0.5">
                                {people.assignedByName ?? (task.ownerId != null ? "Unknown" : "—")}
                            </p>
                        </div>
                    ) : null}
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Assigned to</div>
                        {!people.hasAssignees ? (
                            <Badge variant="secondary" className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Unassigned
                            </Badge>
                        ) : (
                            <div className="space-y-2 mt-1.5">
                                {task.assignees.map((id) => {
                                    const user = users[id];
                                    if (!user) return null;
                                    return (
                                        <div key={id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer group border border-transparent hover:border-border/50">
                                            <Avatar className="h-7 w-7">
                                                <AvatarImage src={user.avatar} />
                                                <AvatarFallback>{user.name[0]}</AvatarFallback>
                                            </Avatar>
                                            <span className="text-sm font-medium">{user.name}</span>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                                                <X className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
                <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground h-9 border-dashed hover:bg-background hover:border-primary/50 hover:text-primary transition-all">
                    <Plus className="w-3 h-3 mr-2" /> Add Assignee
                </Button>
             </div>

             <Separator />

             {/* Metadata */}
             <div className="space-y-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</h4>
                
                <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-3 items-center gap-2">
                        <span className="text-muted-foreground col-span-1 flex items-center gap-2 text-xs">
                            <Calendar className="w-3.5 h-3.5" /> Due Date
                        </span>
                        <div className="col-span-2 font-medium bg-background border border-border/50 rounded px-2 py-1 shadow-sm text-xs">
                            {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "No date"}
                        </div>
                    </div>

                     <div className="grid grid-cols-3 items-start gap-2">
                        <span className="text-muted-foreground col-span-1 flex items-center gap-2 text-xs mt-1.5">
                            <Tag className="w-3.5 h-3.5" /> Tags
                        </span>
                        <div className="col-span-2 flex flex-wrap gap-1.5">
                            {task.tags.map(tag => (
                                <Badge key={tag} variant="secondary" className="px-1.5 py-0.5 text-[10px] font-medium bg-background border border-border shadow-sm hover:border-primary/50 transition-colors cursor-pointer">
                                    {tag}
                                </Badge>
                            ))}
                            <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full border border-dashed border-border text-muted-foreground">
                                <Plus className="w-3 h-3" />
                            </Button>
                        </div>
                    </div>
                </div>
             </div>

             <Separator />

             <div className="space-y-3 pt-2">
                 <Button variant="secondary" className="w-full justify-start shadow-sm bg-background hover:bg-muted border border-border/50">
                    <Paperclip className="w-4 h-4 mr-2" /> Copy Link
                 </Button>
                 <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/20 hover:border-destructive/40">
                    Archive Task
                 </Button>
             </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
