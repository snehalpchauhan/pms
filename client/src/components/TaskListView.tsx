import { Task, Project, Status } from "@/lib/mockData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Clock, MoreHorizontal, Timer, AlertTriangle } from "lucide-react";
import { isTaskOverInvested, parseTaskHoursField } from "@/lib/taskHours";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { isToday, isTomorrow, isThisWeek, isPast } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TaskListViewProps {
    tasks: Task[];
    project: Project;
    onTaskClick?: (t: Task) => void;
    /** Board column id for completed work (from company mark-complete setting + project columns). */
    completeColumnId: string;
}

export default function TaskListView({ tasks, project, onTaskClick, completeColumnId }: TaskListViewProps) {
    const [groupBy, setGroupBy] = useState<"none" | "dueDate">("dueDate");
    const [listScope, setListScope] = useState<"active" | "completed">("active");
    const { user: currentUser } = useAuth();
    const { users } = useAppData();

    const doneId = completeColumnId || "done";
    const isTaskDone = (t: Task) => String(t.status) === String(doneId);
    const activeTasks = tasks.filter((t) => !isTaskDone(t));
    const completedTasks = tasks.filter((t) => isTaskDone(t));

    // Active: group by due date (no completed tasks). Completed: single list — never under Overdue.
    const groupedTasks = (() => {
        if (listScope === "completed") {
            if (completedTasks.length === 0) return {};
            return { Completed: completedTasks };
        }

        const source = activeTasks;
        if (groupBy === "none") {
            return { "All Tasks": source };
        }

        const groups: Record<string, Task[]> = {
            Overdue: [],
            Today: [],
            Tomorrow: [],
            "This Week": [],
            Later: [],
            "No Date": [],
        };

        source.forEach((task) => {
            if (!task.dueDate) {
                groups["No Date"].push(task);
                return;
            }

            const date = new Date(task.dueDate);

            if (isPast(date) && !isToday(date)) {
                groups["Overdue"].push(task);
            } else if (isToday(date)) {
                groups["Today"].push(task);
            } else if (isTomorrow(date)) {
                groups["Tomorrow"].push(task);
            } else if (isThisWeek(date, { weekStartsOn: 1 }) && date > new Date()) {
                groups["This Week"].push(task);
            } else {
                groups["Later"].push(task);
            }
        });

        const result: Record<string, Task[]> = {};
        Object.keys(groups).forEach((key) => {
            if (groups[key].length > 0) result[key] = groups[key];
        });

        return result;
    })();

    const taskGroups = groupedTasks;

    const getStatusIcon = (status: Status) => {
        if (String(status) === String(doneId)) {
            return <CheckCircle2 className="w-4 h-4 text-green-500" />;
        }
        switch (status) {
            case "in-progress":
                return <Circle className="w-4 h-4 text-blue-500 fill-blue-500/20" />;
            case "todo":
                return <Circle className="w-4 h-4 text-red-500 fill-red-500/20" />;
            case "review":
                return <Circle className="w-4 h-4 text-yellow-500 fill-yellow-500/25" />;
            default:
                return <Circle className="w-4 h-4 text-muted-foreground" />;
        }
    };

    const renderTaskTable = (groupTasks: Task[]) => (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            {groupBy === "none" && (
                <div className="grid grid-cols-12 gap-4 p-4 border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <div className="col-span-6 pl-2">Task Name</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-2">Due Date</div>
                    <div className="col-span-2">Priority</div>
                </div>
            )}

            <div className="divide-y divide-border/50">
                {groupTasks.map((task) => {
                    const estimated = parseTaskHoursField(task.estimatedHours);
                    const actual = task.totalHours ?? 0;
                    const overInvested = isTaskOverInvested(estimated, actual);
                    const isClientRequest = task.tags.includes("[Client Request]");
                    // Violet row styling applies to ALL viewers of client-request tasks
                    const showClientRequestHighlight = isClientRequest;
                    const isClientViewing = currentUser?.role === "client";
                    const isMyTask = isClientViewing && isClientRequest && task.ownerId != null && Number(task.ownerId) === Number(currentUser?.id);
                    const clientCreatorLabel: string | null = (() => {
                        if (!isClientViewing || !isClientRequest) return null;
                        if (task.ownerId != null && Number(task.ownerId) === Number(currentUser?.id)) return "You created";
                        if (task.ownerId != null) {
                            const owner = users[String(task.ownerId)];
                            return owner ? `${owner.name.split(" ")[0]} created` : "Client created";
                        }
                        return "Client created";
                    })();
                    return (
                        <div
                            key={task.id}
                            className={cn(
                                "grid grid-cols-12 gap-4 p-4 items-center hover:bg-muted/20 transition-colors cursor-pointer group",
                                overInvested && "bg-amber-500/5 border-l-2 border-l-amber-500",
                                showClientRequestHighlight && !overInvested && "bg-violet-50/40 dark:bg-violet-950/20 border-l-2 border-l-violet-400",
                            )}
                            onClick={() => onTaskClick && onTaskClick(task)}
                        >
                            <div className="col-span-6 flex items-center gap-3">
                                {getStatusIcon(task.status)}
                                <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                                    {task.title}
                                </span>
                                {/* Staff: violet left-border on the row is the visual cue — no inline pill needed */}
                                {clientCreatorLabel && (
                                    <span
                                        className={cn(
                                            "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0",
                                            isMyTask
                                                ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                                                : "bg-violet-50 text-violet-600/80 dark:bg-violet-950/40 dark:text-violet-400",
                                        )}
                                    >
                                        <span className={cn("w-1 h-1 rounded-full shrink-0", isMyTask ? "bg-violet-500" : "bg-violet-400/70")} />
                                        {clientCreatorLabel}
                                    </span>
                                )}
                                {task.tags.filter(t => t !== "[Client Request]").length > 0 && (
                                    <Badge
                                        variant="outline"
                                        className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground hidden sm:inline-flex"
                                    >
                                        {task.tags.find(t => t !== "[Client Request]")}
                                    </Badge>
                                )}
                            </div>
                            <div className="col-span-2">
                                <Badge variant="secondary" className="font-normal text-xs bg-muted text-muted-foreground">
                                    {project.columns.find((c) => c.id === task.status)?.title || task.status}
                                </Badge>
                            </div>
                            <div className="col-span-2 text-sm text-muted-foreground flex items-center gap-2">
                                {task.dueDate ? (
                                    <>
                                        <Clock className="w-3.5 h-3.5" />
                                        {new Date(task.dueDate).toLocaleDateString(undefined, {
                                            month: "short",
                                            day: "numeric",
                                        })}
                                    </>
                                ) : (
                                    <span className="text-muted-foreground/50">-</span>
                                )}
                            </div>
                            <div className="col-span-2 flex items-center justify-between gap-2 min-w-0">
                                <div className="flex flex-col gap-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Badge
                                            className={cn(
                                                "text-[10px] uppercase font-bold border-none shrink-0",
                                                task.priority === "high"
                                                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                                    : task.priority === "medium"
                                                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                                            )}
                                        >
                                            {task.priority}
                                        </Badge>
                                        {overInvested && (
                                            <span
                                                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 shrink-0"
                                                title="Over budget"
                                            >
                                                <AlertTriangle className="w-3 h-3" />
                                                Over budget
                                            </span>
                                        )}
                                    </div>
                                    {(estimated != null || actual > 0) && (
                                        <span
                                            className={cn(
                                                "flex items-center gap-1 text-xs font-medium tabular-nums truncate",
                                                overInvested ? "text-amber-700 dark:text-amber-400" : "text-primary/70",
                                            )}
                                            data-testid={`text-list-hours-${task.id}`}
                                        >
                                            <Timer className="w-3 h-3 shrink-0" />
                                            {estimated != null ? `${estimated.toFixed(1)}h est` : null}
                                            {estimated != null && actual > 0 ? " · " : null}
                                            {actual > 0 ? `${actual.toFixed(1)}h act` : null}
                                        </span>
                                    )}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0"
                                >
                                    <MoreHorizontal className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    const groupEntries = Object.entries(taskGroups);
    const showSectionHeaders = groupBy !== "none" || listScope === "completed";

    return (
        <div className="p-8 max-w-5xl mx-auto h-full overflow-y-auto">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between mb-8">
                <div>
                    <h2 className="text-3xl font-display font-bold text-foreground">Task List</h2>
                    <p className="text-muted-foreground mt-1">
                        All tasks in <span className="font-medium text-foreground">{project.name}</span>
                    </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <Tabs value={listScope} onValueChange={(v) => setListScope(v as "active" | "completed")}>
                        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
                            <TabsTrigger value="active" className="gap-1.5 px-3">
                                Active
                                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-mono tabular-nums">
                                    {activeTasks.length}
                                </Badge>
                            </TabsTrigger>
                            <TabsTrigger value="completed" className="gap-1.5 px-3">
                                Completed
                                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-mono tabular-nums">
                                    {completedTasks.length}
                                </Badge>
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                    {listScope === "active" && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground whitespace-nowrap">Group by:</span>
                            <Select value={groupBy} onValueChange={(v: "none" | "dueDate") => setGroupBy(v)}>
                                <SelectTrigger className="w-[140px] h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    <SelectItem value="dueDate">Due Date</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            </div>

            {groupEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
                    {listScope === "completed"
                        ? "No completed tasks yet."
                        : "No tasks in this view."}
                </div>
            ) : (
                <div className="space-y-6">
                    {groupEntries.map(([groupName, groupTasks]) => (
                        <div key={`${listScope}-${groupName}`} className="space-y-3">
                            {showSectionHeaders && (
                                <div className="flex items-center gap-2 px-1">
                                    <h3
                                        className={cn(
                                            "text-sm font-bold uppercase tracking-wider",
                                            groupName === "Overdue"
                                                ? "text-red-500"
                                                : groupName === "Today"
                                                  ? "text-primary"
                                                : groupName === "Completed"
                                                  ? "text-green-600 dark:text-green-400"
                                                  : "text-muted-foreground",
                                        )}
                                    >
                                        {groupName}
                                    </h3>
                                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-mono">
                                        {groupTasks.length}
                                    </Badge>
                                </div>
                            )}

                            {renderTaskTable(groupTasks)}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
