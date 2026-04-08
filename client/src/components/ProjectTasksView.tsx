import { Project, Task } from "@/lib/mockData";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Board from "./Board";
import TaskListView from "./TaskListView";
import CalendarView from "./CalendarView";
import { FolderKanban, ListTodo, Filter, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef, useCallback } from "react";
import {
    getSearchParams,
    parseTaskTab,
    updateUrlParams,
    type TaskWorkspaceTab,
} from "@/lib/workspaceUrl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskDetailPage } from "./TaskDetailPage";
import { isPast, isToday } from "date-fns";
import type { ClientPermissions } from "@/App";
import { useQuery } from "@tanstack/react-query";
import {
    DEFAULT_TASK_MARK_COMPLETE_STATUS,
    parseWorkflowColumnId,
    resolveWorkflowStatusForProject,
} from "@shared/workflowColumns";

interface ProjectTasksViewProps {
    project: Project;
    tasks: Task[];
    clientPermissions?: ClientPermissions;
}

const VALID_FILTERS = new Set(["all", "mine", "overdue", "completed"]);

export default function ProjectTasksView({ project, tasks, clientPermissions }: ProjectTasksViewProps) {
    const { user } = useAuth();
    const currentUserId = user ? String(user.id) : "";
    const [taskTab, setTaskTab] = useState<TaskWorkspaceTab>(() =>
        parseTaskTab(typeof window !== "undefined" ? getSearchParams().get("taskTab") : null),
    );
    const [filter, setFilter] = useState(() => {
        const f = typeof window !== "undefined" ? getSearchParams().get("taskFilter") : null;
        return f && VALID_FILTERS.has(f) ? f : "all";
    });
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const prevProjectIdRef = useRef<string | null>(null);

    const openTask = useCallback((t: Task) => {
        setSelectedTask(t);
        updateUrlParams({ task: String(t.id) });
    }, []);

    const closeTask = useCallback(() => {
        setSelectedTask(null);
        updateUrlParams({ task: null });
    }, []);

    useEffect(() => {
        if (prevProjectIdRef.current === null) {
            prevProjectIdRef.current = project.id;
            return;
        }
        if (prevProjectIdRef.current === project.id) return;
        prevProjectIdRef.current = project.id;
        setSelectedTask(null);
        updateUrlParams({ task: null });
    }, [project.id]);

    useEffect(() => {
        const id = getSearchParams().get("task");
        if (!id) {
            return;
        }
        const t = tasks.find((x) => String(x.id) === id);
        if (t) {
            setSelectedTask(t);
        } else if (tasks.length > 0) {
            updateUrlParams({ task: null });
        }
    }, [tasks, project.id]);

    useEffect(() => {
        if (!selectedTask) return;
        const fresh = tasks.find((t) => t.id === selectedTask.id);
        if (!fresh) return;
        const same =
            fresh.status === selectedTask.status &&
            fresh.dueDate === selectedTask.dueDate &&
            fresh.startDate === selectedTask.startDate &&
            fresh.priority === selectedTask.priority &&
            fresh.boardOrder === selectedTask.boardOrder &&
            fresh.estimatedHours === selectedTask.estimatedHours &&
            (fresh.totalHours ?? 0) === (selectedTask.totalHours ?? 0) &&
            JSON.stringify(fresh.tags ?? []) === JSON.stringify(selectedTask.tags ?? []) &&
            JSON.stringify(fresh.assignees ?? []) === JSON.stringify(selectedTask.assignees ?? []);
        if (same) return;
        setSelectedTask(fresh);
    }, [tasks, selectedTask]);

    const isClient = user?.role === "client";

    const { data: companyWorkflowSettings } = useQuery({
        queryKey: ["/api/company-settings"],
        queryFn: async () => {
            const res = await fetch("/api/company-settings", { credentials: "include" });
            if (!res.ok) throw new Error("Failed to load company settings");
            return res.json() as { taskMarkCompleteStatus?: string };
        },
    });

    const boardColsForComplete =
        project.columns?.length > 0
            ? project.columns
            : [
                  { id: "todo", title: "To Do" },
                  { id: "in-progress", title: "In Progress" },
                  { id: "review", title: "Review" },
                  { id: "done", title: "Done" },
              ];
    const markCompleteWorkflow =
        parseWorkflowColumnId(companyWorkflowSettings?.taskMarkCompleteStatus) ??
        DEFAULT_TASK_MARK_COMPLETE_STATUS;
    const resolvedCompleteColumnId = resolveWorkflowStatusForProject(
        boardColsForComplete,
        markCompleteWorkflow,
        "markComplete",
    );

    const filteredTasks = tasks.filter((t) => {
        if (filter === "mine") return t.assignees.includes(currentUserId);
        if (filter === "overdue") {
            if (!t.dueDate) return false;
            const isDone = String(t.status) === String(resolvedCompleteColumnId);
            return isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)) && !isDone;
        }
        if (filter === "completed") {
            return String(t.status) === String(resolvedCompleteColumnId);
        }
        return true;
    });

    const handleTaskTabChange = (v: string) => {
        const tab = parseTaskTab(v);
        setTaskTab(tab);
        updateUrlParams({ taskTab: tab });
    };

    const handleFilterChange = (v: string) => {
        setFilter(v);
        updateUrlParams({ taskFilter: v === "all" ? null : v });
    };

    return (
        <div className="h-full flex flex-col overflow-hidden relative">
            <Tabs
                value={taskTab}
                onValueChange={handleTaskTabChange}
                className="flex-1 flex flex-col h-full overflow-hidden"
            >
                <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between shrink-0 bg-background/50 backdrop-blur-sm z-10">
                    <TabsList className="grid w-[300px] grid-cols-3">
                        <TabsTrigger value="board">
                            <FolderKanban className="w-4 h-4 mr-2" />
                            Board
                        </TabsTrigger>
                        <TabsTrigger value="list">
                            <ListTodo className="w-4 h-4 mr-2" />
                            List
                        </TabsTrigger>
                        <TabsTrigger value="calendar">
                            <Calendar className="w-4 h-4 mr-2" />
                            Calendar
                        </TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-3">
                        <Select value={filter} onValueChange={handleFilterChange}>
                            <SelectTrigger className="w-[140px] h-9 text-xs">
                                <Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                                <SelectValue placeholder="Filter" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Tasks</SelectItem>
                                {!isClient && <SelectItem value="mine">My Tasks</SelectItem>}
                                <SelectItem value="overdue">Overdue</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden relative">
                     <TabsContent value="board" className="h-full m-0 data-[state=active]:flex flex-col">
                        <div className="flex-1 overflow-hidden">
                            <Board 
                                project={project} 
                                tasks={filteredTasks} 
                                onTaskClick={openTask}
                                onAddTask={(status) => {
                                    if (isClient && clientPermissions?.clientTaskAccess !== "contribute" && clientPermissions?.clientTaskAccess !== "full") return;
                                    const event = new CustomEvent('openNewTaskModal', { detail: { status } });
                                    window.dispatchEvent(event);
                                }}
                                clientPermissions={clientPermissions}
                            />
                        </div>
                    </TabsContent>
                    <TabsContent value="list" className="h-full m-0 data-[state=active]:flex flex-col overflow-y-auto">
                        <TaskListView
                            project={project}
                            tasks={filteredTasks}
                            completeColumnId={resolvedCompleteColumnId}
                            onTaskClick={openTask}
                        />
                    </TabsContent>
                    <TabsContent value="calendar" className="h-full m-0 data-[state=active]:flex flex-col overflow-hidden">
                        <CalendarView 
                            project={project} 
                            tasks={filteredTasks} 
                            onTaskClick={openTask} 
                        />
                    </TabsContent>
                </div>
            </Tabs>
            
            {selectedTask && (
                <TaskDetailPage 
                    task={selectedTask} 
                    onClose={closeTask}
                    clientPermissions={clientPermissions}
                />
            )}
        </div>
    );
}
