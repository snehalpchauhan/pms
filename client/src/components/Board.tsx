import { useState, useEffect } from "react";
import { 
  DndContext, 
  DragOverlay, 
  useDroppable, 
  DragStartEvent, 
  DragEndEvent,
  closestCorners,
  defaultDropAnimationSideEffects,
  DropAnimation,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor
} from "@dnd-kit/core";
import { Task, Status, Project } from "@/lib/mockData";
import { TaskCard } from "./TaskCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Plus, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPast, isToday, isTomorrow, isThisWeek } from "date-fns";
import type { ClientPermissions } from "@/App";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.5',
      },
    },
  }),
};

interface ClientTaskActionsProps {
  task: Task;
  isReviewColumn: boolean;
  clientTaskAccess: string;
  onActionDone: () => void;
}

function ClientTaskActions({ task, isReviewColumn, clientTaskAccess, onActionDone }: ClientTaskActionsProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isReviewColumn) return null;
  // "full" clients behave as employees; only feedback/contribute get the approval workflow
  if (clientTaskAccess !== "feedback" && clientTaskAccess !== "contribute") return null;

  const handleApprove = async () => {
    setLoading(true);
    try {
      await apiRequest("POST", `/api/tasks/${task.id}/approve`, {});
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: `Task approved: "${task.title}"` });
      onActionDone();
    } catch {
      toast({ title: "Failed to approve task", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestRevision = async () => {
    if (!revisionReason.trim()) {
      toast({ title: "Please provide a reason for the revision request", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("POST", `/api/tasks/${task.id}/request-revision`, { reason: revisionReason.trim() });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: `Revision requested for: "${task.title}"` });
      setRevisionOpen(false);
      setRevisionReason("");
      onActionDone();
    } catch {
      toast({ title: "Failed to request revision", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex gap-1 mt-2">
        <Button
          size="sm"
          className="flex-1 h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
          onClick={handleApprove}
          disabled={loading}
          data-testid={`button-approve-task-${task.id}`}
        >
          <CheckCircle2 className="w-3 h-3" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-7 text-[11px] border-orange-300 text-orange-700 hover:bg-orange-50 gap-1"
          onClick={() => setRevisionOpen(true)}
          disabled={loading}
          data-testid={`button-request-revision-task-${task.id}`}
        >
          <RotateCcw className="w-3 h-3" />
          Revision
        </Button>
      </div>

      <Dialog open={revisionOpen} onOpenChange={setRevisionOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Request Revision</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Please describe what changes are needed for <span className="font-medium text-foreground">"{task.title}"</span>.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="revision-reason">Reason <span className="text-destructive">*</span></Label>
              <Textarea
                id="revision-reason"
                value={revisionReason}
                onChange={e => setRevisionReason(e.target.value)}
                placeholder="Describe the changes needed…"
                rows={3}
                className="resize-none"
                data-testid="textarea-revision-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisionOpen(false)} disabled={loading}>Cancel</Button>
            <Button
              onClick={handleRequestRevision}
              disabled={loading || !revisionReason.trim()}
              className="bg-orange-600 hover:bg-orange-700 text-white"
              data-testid="button-submit-revision"
            >
              {loading ? "Sending…" : "Request Revision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ColumnProps {
  id: Status;
  title: string;
  tasks: Task[];
  color: string;
  onTaskClick: (t: Task) => void;
  onAddTask: (status: string) => void;
  isReviewColumn: boolean;
  clientPermissions?: ClientPermissions;
}

function Column({ id, title, tasks, color, onTaskClick, onAddTask, isReviewColumn, clientPermissions }: ColumnProps) {
  const { setNodeRef } = useDroppable({
    id: id,
  });
  const queryClient = useQueryClient();

  const isClient = clientPermissions?.role === "client";
  const showAddTask = !isClient || (clientPermissions?.clientTaskAccess === "contribute" || clientPermissions?.clientTaskAccess === "full");

  const getGroup = (task: Task) => {
    if (!task.dueDate) return 'Later';
    const date = new Date(task.dueDate);
    if (isPast(date) && !isToday(date)) return 'Overdue';
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'This Week';
    if (isThisWeek(date, { weekStartsOn: 1 })) return 'This Week';
    return 'Later';
  };

  const groupedTasks: Record<string, Task[]> = {
    'Overdue': [],
    'Today': [],
    'This Week': [],
    'Later': []
  };

  tasks.forEach(task => {
      const group = getGroup(task);
      if (group === 'Overdue') groupedTasks['Overdue'].push(task);
      else if (group === 'Today') groupedTasks['Today'].push(task);
      else if (group === 'This Week') groupedTasks['This Week'].push(task);
      else groupedTasks['Later'].push(task);
  });

  return (
    <div className="flex flex-col h-full min-w-[320px] max-w-[320px] bg-muted/30 rounded-xl border border-border/60 backdrop-blur-md shadow-sm">
      <div className="p-4 pb-3 flex items-center justify-between border-b border-border/40">
         <div className="flex items-center gap-2">
            <div className={cn("w-2.5 h-2.5 rounded-full ring-2 ring-offset-2 ring-offset-muted/30 shadow-sm", color)} />
            <h3 className="font-display font-semibold text-sm text-foreground tracking-tight">{title}</h3>
            <span className="ml-1 text-[10px] font-mono font-medium text-muted-foreground bg-background/50 border border-border px-1.5 py-0.5 rounded shadow-sm">
                {tasks.length}
            </span>
         </div>
         {showAddTask && (
             <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground -mr-1" onClick={() => onAddTask(id)}>
                 <Plus className="w-4 h-4" />
             </Button>
         )}
      </div>
      
      <div className="flex-1 p-3 overflow-hidden">
        <ScrollArea className="h-full pr-3 -mr-3">
            <div ref={setNodeRef} className="min-h-[150px] pb-4 space-y-4">
                {Object.entries(groupedTasks).map(([groupName, groupTasks]) => {
                    if (groupTasks.length === 0) return null;
                    return (
                        <div key={groupName} className="space-y-2">
                             <div className="flex items-center gap-2 px-1">
                                <h4 className={cn(
                                    "text-[10px] font-bold uppercase tracking-wider",
                                    groupName === 'Overdue' ? "text-red-500" : 
                                    groupName === 'Today' ? "text-orange-500" :
                                    groupName === 'This Week' ? "text-blue-500" : "text-muted-foreground"
                                )}>
                                    {groupName}
                                </h4>
                                <div className="h-px flex-1 bg-border/50" />
                            </div>
                            <div className="space-y-3">
                                {groupTasks.map((task) => (
                                    <div key={task.id}>
                                        <TaskCard task={task} onClick={onTaskClick} />
                                        {isClient && (
                                            <ClientTaskActions
                                                task={task}
                                                isReviewColumn={isReviewColumn}
                                                clientTaskAccess={clientPermissions?.clientTaskAccess || "feedback"}
                                                onActionDone={() => queryClient.invalidateQueries({ queryKey: ["/api/projects"] })}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
                {tasks.length === 0 && (
                    <div className="text-center py-8 text-xs text-muted-foreground italic">
                        No tasks
                    </div>
                )}
            </div>
        </ScrollArea>
      </div>
    </div>
  );
}

interface BoardProps {
    project: Project;
    tasks: Task[];
    onTaskClick?: (t: Task) => void;
    onAddTask?: (status: string) => void;
    clientPermissions?: ClientPermissions;
}

export default function Board({ project, tasks, onTaskClick, onAddTask, clientPermissions }: BoardProps) {
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const isClient = clientPermissions?.role === "client";
  const isFullAccess = isClient && clientPermissions?.clientTaskAccess === "full";

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: (isClient && !isFullAccess) ? 999999 : 8, // Disable for non-full clients
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    if (isClient && !isFullAccess) return;
    setActiveTask(event.active.data.current?.task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (isClient && !isFullAccess) return;
    const { active, over } = event;
    
    if (!over) {
        setActiveTask(null);
        return;
    }

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) {
        setActiveTask(null);
        return;
    }

    let newStatus: Status | undefined;

    if (project.columns.some(col => col.id === overId)) {
        newStatus = overId as Status;
    } 
    else {
        const overTask = localTasks.find(t => t.id === overId);
        if (overTask) {
            newStatus = overTask.status;
        }
    }

    if (newStatus) {
        setLocalTasks(prev => prev.map(t => {
            if (t.id === activeId) {
                return { ...t, status: newStatus as Status };
            }
            return t;
        }));
    }
    
    setActiveTask(null);
  };

  // Determine the review column (second to last active column)
  const columns = project.columns;
  const reviewColumnId = columns.length >= 2 ? columns[columns.length - 2].id : null;

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col bg-background/50">
       <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart} 
            onDragEnd={handleDragEnd}
          >
            <div className="flex h-full p-6 gap-6 w-max min-w-full">
                {project.columns.map((col) => (
                    <Column 
                        key={col.id} 
                        id={col.id} 
                        title={col.title} 
                        color={col.color}
                        tasks={localTasks.filter(t => t.status === col.id)}
                        onTaskClick={onTaskClick || (() => {})}
                        onAddTask={onAddTask || (() => {})}
                        isReviewColumn={col.id === reviewColumnId}
                        clientPermissions={clientPermissions}
                    />
                ))}
                
                {(!isClient || isFullAccess) && (
                    <div className="min-w-[320px] max-w-[320px] h-[100px] border-2 border-dashed border-border/50 rounded-xl flex items-center justify-center hover:bg-muted/10 transition-colors cursor-pointer group">
                        <div className="flex items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
                            <Plus className="w-5 h-5" />
                            <span className="font-medium">Add Section</span>
                        </div>
                    </div>
                )}
            </div>

            <DragOverlay dropAnimation={dropAnimation}>
                {activeTask ? (
                    <div className="rotate-2 cursor-grabbing">
                        <TaskCard task={activeTask} onClick={() => {}} />
                    </div>
                ) : null}
            </DragOverlay>
          </DndContext>
       </div>
    </div>
  );
}
