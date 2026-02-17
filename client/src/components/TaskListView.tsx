import { Task, Project, USERS, Status } from "@/lib/mockData";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Clock, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { TaskDetailModal } from "./TaskDetailModal";

interface TaskListViewProps {
    tasks: Task[];
    project: Project;
}

export default function TaskListView({ tasks, project }: TaskListViewProps) {
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    
    // Filter for "My Tasks" - in a real app check auth user ID
    // For demo we assume current user is "u1"
    const myTasks = tasks.filter(t => t.assignees.includes("u1"));

    const getStatusIcon = (status: Status) => {
        switch(status) {
            case 'done': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
            case 'in-progress': return <Circle className="w-4 h-4 text-blue-500 fill-blue-500/20" />;
            case 'todo': return <Circle className="w-4 h-4 text-slate-400" />;
            default: return <Circle className="w-4 h-4 text-orange-500" />;
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto h-full overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-3xl font-display font-bold text-foreground">My Tasks</h2>
                    <p className="text-muted-foreground mt-1">Tasks assigned to you in <span className="font-medium text-foreground">{project.name}</span></p>
                </div>
            </div>

            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="grid grid-cols-12 gap-4 p-4 border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <div className="col-span-6 pl-2">Task Name</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-2">Due Date</div>
                    <div className="col-span-2">Priority</div>
                </div>

                <div className="divide-y divide-border/50">
                    {myTasks.length > 0 ? myTasks.map(task => (
                        <div 
                            key={task.id} 
                            className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/20 transition-colors cursor-pointer group"
                            onClick={() => setSelectedTask(task)}
                        >
                            <div className="col-span-6 flex items-center gap-3">
                                {getStatusIcon(task.status)}
                                <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">{task.title}</span>
                                {task.tags.length > 0 && (
                                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground hidden sm:inline-flex">
                                        {task.tags[0]}
                                    </Badge>
                                )}
                            </div>
                            <div className="col-span-2">
                                <Badge variant="secondary" className="font-normal text-xs bg-muted text-muted-foreground">
                                    {project.columns.find(c => c.id === task.status)?.title || task.status}
                                </Badge>
                            </div>
                            <div className="col-span-2 text-sm text-muted-foreground flex items-center gap-2">
                                {task.dueDate ? (
                                    <>
                                        <Clock className="w-3.5 h-3.5" />
                                        {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </>
                                ) : (
                                    <span className="text-muted-foreground/50">-</span>
                                )}
                            </div>
                            <div className="col-span-2 flex items-center justify-between">
                                <Badge 
                                    className={cn(
                                        "text-[10px] uppercase font-bold border-none",
                                        task.priority === 'high' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                        task.priority === 'medium' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                    )}
                                >
                                    {task.priority}
                                </Badge>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100">
                                    <MoreHorizontal className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )) : (
                        <div className="p-12 text-center text-muted-foreground">
                            <p>No tasks assigned to you in this project yet.</p>
                        </div>
                    )}
                </div>
            </div>
            
            <TaskDetailModal 
                task={selectedTask} 
                open={!!selectedTask} 
                onOpenChange={(open) => !open && setSelectedTask(null)} 
            />
        </div>
    );
}
