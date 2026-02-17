import { useState } from "react";
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
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.5',
      },
    },
  }),
};

interface ColumnProps {
  id: Status;
  title: string;
  tasks: Task[];
  color: string;
  onTaskClick: (t: Task) => void;
}

function Column({ id, title, tasks, color, onTaskClick }: ColumnProps) {
  const { setNodeRef } = useDroppable({
    id: id,
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
         <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground -mr-1">
             <Plus className="w-4 h-4" />
         </Button>
      </div>
      
      <div className="flex-1 p-3 overflow-hidden">
        <ScrollArea className="h-full pr-3 -mr-3">
            <div ref={setNodeRef} className="space-y-3 min-h-[150px] pb-4">
            {tasks.map((task) => (
                <TaskCard key={task.id} task={task} onClick={onTaskClick} />
            ))}
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
}

export default function Board({ project, tasks, onTaskClick }: BoardProps) {
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  if (localTasks !== tasks && localTasks[0]?.projectId !== project.id) {
       setLocalTasks(tasks);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask(event.active.data.current?.task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
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
                    />
                ))}
                
                <div className="min-w-[320px] max-w-[320px] h-[100px] border-2 border-dashed border-border/50 rounded-xl flex items-center justify-center hover:bg-muted/10 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
                        <Plus className="w-5 h-5" />
                        <span className="font-medium">Add Section</span>
                    </div>
                </div>
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
