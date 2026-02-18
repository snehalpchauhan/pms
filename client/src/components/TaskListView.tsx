import { Task, Project, Status } from "@/lib/mockData";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Clock, MoreHorizontal, Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { isToday, isTomorrow, isThisWeek, isFuture, isPast, parseISO } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TaskListViewProps {
    tasks: Task[];
    project: Project;
    onTaskClick?: (t: Task) => void;
}

export default function TaskListView({ tasks, project, onTaskClick }: TaskListViewProps) {
    const [groupBy, setGroupBy] = useState<"none" | "dueDate">("dueDate");

    // Grouping Logic
    const groupedTasks = (() => {
        if (groupBy === 'none') return { 'All Tasks': tasks };

        const groups: Record<string, Task[]> = {
            'Overdue': [],
            'Today': [],
            'Tomorrow': [],
            'This Week': [],
            'Later': [],
            'No Date': []
        };

        tasks.forEach(task => {
            if (!task.dueDate) {
                groups['No Date'].push(task);
                return;
            }

            const date = new Date(task.dueDate);
            
            if (isPast(date) && !isToday(date)) {
                groups['Overdue'].push(task);
            } else if (isToday(date)) {
                groups['Today'].push(task);
            } else if (isTomorrow(date)) {
                groups['Tomorrow'].push(task);
            } else if (isThisWeek(date, { weekStartsOn: 1 }) && date > new Date()) { // simple future check within week
                groups['This Week'].push(task);
            } else {
                groups['Later'].push(task);
            }
        });

        // Remove empty groups but keep order
        const result: Record<string, Task[]> = {};
        Object.keys(groups).forEach(key => {
            if (groups[key].length > 0) result[key] = groups[key];
        });

        return result;
    })();

    const taskGroups = groupedTasks;

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
                    <h2 className="text-3xl font-display font-bold text-foreground">Task List</h2>
                    <p className="text-muted-foreground mt-1">All tasks in <span className="font-medium text-foreground">{project.name}</span></p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Group by:</span>
                    <Select value={groupBy} onValueChange={(v: any) => setGroupBy(v)}>
                        <SelectTrigger className="w-[140px] h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="dueDate">Due Date</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-6">
                {Object.entries(taskGroups).map(([groupName, groupTasks]) => (
                    <div key={groupName} className="space-y-3">
                         {groupBy !== 'none' && (
                            <div className="flex items-center gap-2 px-1">
                                <h3 className={cn(
                                    "text-sm font-bold uppercase tracking-wider",
                                    groupName === 'Overdue' ? "text-red-500" : 
                                    groupName === 'Today' ? "text-primary" : "text-muted-foreground"
                                )}>
                                    {groupName}
                                </h3>
                                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-mono">{groupTasks.length}</Badge>
                            </div>
                         )}

                        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                            {!groupBy && (
                                <div className="grid grid-cols-12 gap-4 p-4 border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    <div className="col-span-6 pl-2">Task Name</div>
                                    <div className="col-span-2">Status</div>
                                    <div className="col-span-2">Due Date</div>
                                    <div className="col-span-2">Priority</div>
                                </div>
                            )}

                            <div className="divide-y divide-border/50">
                                {groupTasks.map(task => (
                                    <div 
                                        key={task.id} 
                                        className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/20 transition-colors cursor-pointer group"
                                        onClick={() => onTaskClick && onTaskClick(task)}
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
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
