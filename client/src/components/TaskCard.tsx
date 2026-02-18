import { Task, User, Priority } from "@/lib/mockData";
import { useAppData } from "@/hooks/useAppData";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Paperclip, Calendar, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
}

const PriorityBadge = ({ priority }: { priority: Priority }) => {
  const colors = {
    low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  };
  
  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider", colors[priority])}>
      {priority}
    </span>
  );
};

export function TaskCard({ task, onClick }: TaskCardProps) {
  const { users } = useAppData();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  if (isDragging) {
    return (
      <div 
        ref={setNodeRef} 
        style={style} 
        className="opacity-50"
      >
        <Card className="shadow-sm border-2 border-primary/20 bg-muted/50 cursor-grabbing h-[150px] w-full" />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="group"
      onClick={() => onClick(task)}
    >
      <Card className="cursor-grab active:cursor-grabbing hover:shadow-md transition-all duration-200 border-border/60 hover:border-primary/50 overflow-hidden group-hover:translate-y-[-2px]">
        {task.coverImage && (
            <div className="h-32 w-full overflow-hidden border-b border-border/50">
                <img src={task.coverImage} alt="Cover" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            </div>
        )}
        <CardHeader className="p-3 pb-0 space-y-2">
          <div className="flex justify-between items-start">
            <div className="flex gap-2 flex-wrap">
               {task.tags.map(tag => (
                   <Badge key={tag} variant="secondary" className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground bg-muted/50">
                       {tag}
                   </Badge>
               ))}
            </div>
            <PriorityBadge priority={task.priority} />
          </div>
          <h4 className="font-medium text-sm leading-snug text-foreground group-hover:text-primary transition-colors">
            {task.title}
          </h4>
        </CardHeader>
        <CardContent className="p-3 pt-2">
             {/* Description snippet if needed, but keeping it clean for now */}
        </CardContent>
        <CardFooter className="p-3 pt-0 flex items-center justify-between text-muted-foreground">
           <div className="flex items-center gap-3 text-xs">
                {task.comments.length > 0 && (
                    <div className="flex items-center gap-1 hover:text-foreground">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{task.comments.length}</span>
                    </div>
                )}
                {task.attachments.length > 0 && (
                    <div className="flex items-center gap-1 hover:text-foreground">
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>{task.attachments.length}</span>
                    </div>
                )}
                {task.dueDate && (
                     <div className="flex items-center gap-1 hover:text-foreground">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Mar 20</span>
                     </div>
                )}
           </div>

           <div className="flex -space-x-2">
                {task.assignees.map((userId) => {
                    const user = users[userId];
                    if(!user) return null;
                    return (
                        <Avatar key={user.id} className="h-6 w-6 border-2 border-background ring-1 ring-border/10">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                    )
                })}
           </div>
        </CardFooter>
      </Card>
    </div>
  );
}
