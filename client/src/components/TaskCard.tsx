import { Task, Priority, isSystemTaskComment } from "@/lib/mockData";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/hooks/useAuth";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Paperclip, Calendar, Clock, AlertTriangle } from "lucide-react";
import { isTaskOverInvested, parseTaskHoursField } from "@/lib/taskHours";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
  /** When true, card is not draggable (e.g. limited client). */
  disableDrag?: boolean;
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

export function TaskCard({ task, onClick, disableDrag = false }: TaskCardProps) {
  const { users } = useAppData();
  const { user: currentUser } = useAuth();
  const estimated = parseTaskHoursField(task.estimatedHours);
  const actual = task.totalHours ?? 0;
  const overInvested = isTaskOverInvested(estimated, actual);
  const owner = task.ownerId != null ? users[String(task.ownerId)] : null;
  // Client-request styling is based on who owns the task (owner is a client),
  // not on a magic tag. Keep tag fallback for older data.
  const isClientRequest = owner?.role === "client" || task.tags.includes("[Client Request]");
  const isClientViewing = currentUser?.role === "client";
  /** Violet card outline applies to ALL viewers of client-request tasks. */
  const showClientRequestHighlight = isClientRequest;
  /** Banner text: staff see "Client Request"; clients see "Your Request" or "[Name]'s Request". */
  const clientRequestBannerLabel: string | null = (() => {
    if (!isClientRequest) return null;
    if (!isClientViewing) return owner ? `${owner.name.split(" ")[0]}'s Request` : "Client Request";
    if (task.ownerId != null && Number(task.ownerId) === Number(currentUser?.id)) return "Your Request";
    if (task.ownerId != null) {
      return owner ? `${owner.name.split(" ")[0]}'s Request` : "Client Request";
    }
    return "Client Request";
  })();
  const discussionCommentCount = task.comments.filter((c) => !isSystemTaskComment(c)).length;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task" as const, task },
    disabled: disableDrag,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isDragging) {
    return (
      <div ref={setNodeRef} style={style} className="opacity-50">
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
      className="group touch-none"
      onClick={() => onClick(task)}
    >
      <Card
        className={cn(
          "cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow border-border/60 hover:border-primary/50 overflow-hidden group-hover:translate-y-[-2px]",
          overInvested && "border-amber-500/70 ring-1 ring-amber-500/40",
          showClientRequestHighlight && !overInvested && "border-violet-400/70 ring-1 ring-violet-400/30 bg-violet-50/40 dark:bg-violet-950/20",
        )}
      >
        {clientRequestBannerLabel && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-100/80 dark:bg-violet-900/30 border-b border-violet-200/60 dark:border-violet-800/40">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
            <span className="text-[10px] font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wider">{clientRequestBannerLabel}</span>
          </div>
        )}
        {task.coverImage && (
          <div className="h-32 w-full overflow-hidden border-b border-border/50">
            <img
              src={task.coverImage}
              alt="Cover"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
        )}
        <CardHeader className="p-3 pb-0 space-y-2">
          <div className="flex justify-between items-start">
            <div className="flex gap-2 flex-wrap items-center">
              {task.tags
                .filter((tag) => !(tag === "[Client Request]"))
                .map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground bg-muted/50">
                    {tag}
                  </Badge>
                ))}
              {overInvested && (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400"
                  title="Actual time logged exceeds the budget"
                >
                  <AlertTriangle className="w-3 h-3" />
                  Over budget
                </span>
              )}
            </div>
            <PriorityBadge priority={task.priority} />
          </div>
          <h4 className="font-medium text-sm leading-snug text-foreground group-hover:text-primary transition-colors">{task.title}</h4>
        </CardHeader>
        <CardContent className="p-3 pt-2">{/* keep layout */}</CardContent>
        <CardFooter className="p-3 pt-0 flex items-center justify-between text-muted-foreground">
          <div className="flex items-center gap-3 text-xs">
            {discussionCommentCount > 0 && (
              <div className="flex items-center gap-1 hover:text-foreground">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{discussionCommentCount}</span>
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
                <span>{format(new Date(task.dueDate), "MMM d")}</span>
              </div>
            )}
            {(estimated != null || actual > 0) && (
              <div
                className={cn(
                  "flex items-center gap-1 hover:text-foreground",
                  overInvested ? "text-amber-700 dark:text-amber-400" : "text-primary/70",
                )}
                data-testid={`text-hours-${task.id}`}
                title={estimated != null ? `Estimated ${estimated.toFixed(1)}h · Actual ${actual.toFixed(1)}h` : `Actual ${actual.toFixed(1)}h`}
              >
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span className="tabular-nums">
                  {estimated != null ? `${estimated.toFixed(1)}h est` : null}
                  {estimated != null && actual > 0 ? " · " : null}
                  {actual > 0 ? `${actual.toFixed(1)}h act` : estimated != null ? "" : null}
                </span>
              </div>
            )}
          </div>

          <div className="flex -space-x-2">
            {task.assignees.map((userId) => {
              const user = users[userId];
              if (!user) return null;
              return (
                <Avatar key={user.id} className="h-6 w-6 border-2 border-background ring-1 ring-border/10">
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                </Avatar>
              );
            })}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
