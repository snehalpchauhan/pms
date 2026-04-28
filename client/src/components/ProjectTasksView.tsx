import { Project, Task } from "@/lib/mockData";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Board from "./Board";
import TaskListView from "./TaskListView";
import CalendarView from "./CalendarView";
import { FolderKanban, ListTodo, Filter, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
    getPersistedTaskId,
    parseTaskTab,
    persistWorkspaceState,
    readTaskWorkspaceSnapshot,
    type TaskWorkspaceTab,
} from "@/lib/workspacePersistence";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskDetailPage } from "./TaskDetailPage";
import { endOfDay, isPast, isToday, startOfDay } from "date-fns";
import type { ClientPermissions } from "@/App";
import { useQuery } from "@tanstack/react-query";
import { useAppData } from "@/hooks/useAppData";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchableSelect } from "@/components/SearchableSelect";
import {
    DEFAULT_TASK_MARK_COMPLETE_STATUS,
    parseWorkflowColumnId,
    resolveWorkflowStatusForProject,
} from "@shared/workflowColumns";

interface ProjectTasksViewProps {
    project: Project;
    tasks: Task[];
    clientPermissions?: ClientPermissions;
    notificationFocusCommentId?: string | null;
    onNotificationFocusConsumed?: () => void;
}

type AdvancedTaskFilters = {
    assignedTo: string;
    createdBy: string;
    createdFrom: string;
    createdTo: string;
    dueFrom: string;
    dueTo: string;
    priority: string;
    status: string;
};

export default function ProjectTasksView({
    project,
    tasks,
    clientPermissions,
    notificationFocusCommentId = null,
    onNotificationFocusConsumed,
}: ProjectTasksViewProps) {
    const { user } = useAuth();
    const { users } = useAppData();
    const currentUserId = user ? String(user.id) : "";
    const [taskTab, setTaskTab] = useState<TaskWorkspaceTab>(() => readTaskWorkspaceSnapshot().taskTab);
    const [filter, setFilter] = useState(() => readTaskWorkspaceSnapshot().taskFilter);
    const [advancedFilters, setAdvancedFilters] = useState<AdvancedTaskFilters>({
        assignedTo: "all",
        createdBy: "all",
        createdFrom: "",
        createdTo: "",
        dueFrom: "",
        dueTo: "",
        priority: "all",
        status: "all",
    });
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const prevProjectIdRef = useRef<string | null>(null);

    const openTask = useCallback((t: Task) => {
        setSelectedTask(t);
        persistWorkspaceState({ taskId: String(t.id) });
    }, []);

    const closeTask = useCallback(() => {
        setSelectedTask(null);
        persistWorkspaceState({ taskId: null });
    }, []);

    useEffect(() => {
        if (prevProjectIdRef.current === null) {
            prevProjectIdRef.current = project.id;
            return;
        }
        if (prevProjectIdRef.current === project.id) return;
        prevProjectIdRef.current = project.id;
        setSelectedTask(null);
        persistWorkspaceState({ taskId: null });
    }, [project.id]);

    useEffect(() => {
        const id = getPersistedTaskId();
        if (!id) {
            return;
        }
        const t = tasks.find((x) => String(x.id) === id);
        if (t) {
            setSelectedTask(t);
        } else if (tasks.length > 0) {
            persistWorkspaceState({ taskId: null });
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
        if (advancedFilters.assignedTo !== "all" && !t.assignees.includes(advancedFilters.assignedTo)) {
            return false;
        }
        if (advancedFilters.createdBy !== "all" && String(t.ownerId ?? "") !== advancedFilters.createdBy) {
            return false;
        }
        if (advancedFilters.priority !== "all" && String(t.priority) !== advancedFilters.priority) {
            return false;
        }
        if (advancedFilters.status !== "all" && String(t.status) !== advancedFilters.status) {
            return false;
        }
        if (advancedFilters.createdFrom || advancedFilters.createdTo) {
            if (!t.createdAt) return false;
            const createdAt = new Date(t.createdAt);
            if (Number.isNaN(createdAt.getTime())) return false;
            if (advancedFilters.createdFrom) {
                const createdFrom = startOfDay(new Date(advancedFilters.createdFrom));
                if (createdAt < createdFrom) return false;
            }
            if (advancedFilters.createdTo) {
                const createdTo = endOfDay(new Date(advancedFilters.createdTo));
                if (createdAt > createdTo) return false;
            }
        }
        if (advancedFilters.dueFrom || advancedFilters.dueTo) {
            if (!t.dueDate) return false;
            const dueDate = new Date(t.dueDate);
            if (Number.isNaN(dueDate.getTime())) return false;
            if (advancedFilters.dueFrom) {
                const dueFrom = startOfDay(new Date(advancedFilters.dueFrom));
                if (dueDate < dueFrom) return false;
            }
            if (advancedFilters.dueTo) {
                const dueTo = endOfDay(new Date(advancedFilters.dueTo));
                if (dueDate > dueTo) return false;
            }
        }
        return true;
    });

    const assignableUsers = useMemo(
        () =>
            Object.values(users)
                .filter((u) => u && u.id != null)
                .sort((a, b) => a.name.localeCompare(b.name)),
        [users],
    );

    const activeAdvancedFilterCount = useMemo(() => {
        let count = 0;
        if (advancedFilters.assignedTo !== "all") count += 1;
        if (advancedFilters.createdBy !== "all") count += 1;
        if (advancedFilters.priority !== "all") count += 1;
        if (advancedFilters.status !== "all") count += 1;
        if (advancedFilters.createdFrom) count += 1;
        if (advancedFilters.createdTo) count += 1;
        if (advancedFilters.dueFrom) count += 1;
        if (advancedFilters.dueTo) count += 1;
        return count;
    }, [advancedFilters]);

    const handleTaskTabChange = (v: string) => {
        const tab = parseTaskTab(v);
        setTaskTab(tab);
        persistWorkspaceState({ taskTab: tab });
    };

    const handleFilterChange = (v: string) => {
        setFilter(v);
        persistWorkspaceState({ taskFilter: v === "all" ? null : v });
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
                        <TabsTrigger value="board" type="button">
                            <FolderKanban className="w-4 h-4 mr-2" />
                            Board
                        </TabsTrigger>
                        <TabsTrigger value="list" type="button">
                            <ListTodo className="w-4 h-4 mr-2" />
                            List
                        </TabsTrigger>
                        <TabsTrigger value="calendar" type="button">
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
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="h-9 text-xs">
                                    <Filter className="w-3.5 h-3.5 mr-2" />
                                    Advanced
                                    {activeAdvancedFilterCount > 0 ? ` (${activeAdvancedFilterCount})` : ""}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-[360px] p-4 space-y-4">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-semibold">Advanced filters</h4>
                                    <p className="text-xs text-muted-foreground">
                                        Applies to board, list, and calendar views.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Assigned to</Label>
                                        <SearchableSelect
                                            value={advancedFilters.assignedTo}
                                            onValueChange={(v) =>
                                                setAdvancedFilters((prev) => ({ ...prev, assignedTo: v }))
                                            }
                                            options={[
                                                { value: "all", label: "Anyone" },
                                                ...assignableUsers.map((u) => ({
                                                    value: String(u.id),
                                                    label: u.name,
                                                })),
                                            ]}
                                            placeholder="Anyone"
                                            searchPlaceholder="Search assignee..."
                                            emptyText="No user found."
                                            triggerClassName="h-8 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Created by</Label>
                                        <SearchableSelect
                                            value={advancedFilters.createdBy}
                                            onValueChange={(v) =>
                                                setAdvancedFilters((prev) => ({ ...prev, createdBy: v }))
                                            }
                                            options={[
                                                { value: "all", label: "Anyone" },
                                                ...assignableUsers.map((u) => ({
                                                    value: String(u.id),
                                                    label: u.name,
                                                })),
                                            ]}
                                            placeholder="Anyone"
                                            searchPlaceholder="Search creator..."
                                            emptyText="No user found."
                                            triggerClassName="h-8 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Priority</Label>
                                        <Select
                                            value={advancedFilters.priority}
                                            onValueChange={(v) =>
                                                setAdvancedFilters((prev) => ({ ...prev, priority: v }))
                                            }
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue placeholder="All" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All</SelectItem>
                                                <SelectItem value="low">Low</SelectItem>
                                                <SelectItem value="medium">Medium</SelectItem>
                                                <SelectItem value="high">High</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Status</Label>
                                        <Select
                                            value={advancedFilters.status}
                                            onValueChange={(v) =>
                                                setAdvancedFilters((prev) => ({ ...prev, status: v }))
                                            }
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue placeholder="All" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All</SelectItem>
                                                {project.columns.map((c) => (
                                                    <SelectItem key={c.id} value={c.id}>
                                                        {c.title}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Created from</Label>
                                        <Input
                                            type="date"
                                            value={advancedFilters.createdFrom}
                                            onChange={(e) =>
                                                setAdvancedFilters((prev) => ({ ...prev, createdFrom: e.target.value }))
                                            }
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Created to</Label>
                                        <Input
                                            type="date"
                                            value={advancedFilters.createdTo}
                                            onChange={(e) =>
                                                setAdvancedFilters((prev) => ({ ...prev, createdTo: e.target.value }))
                                            }
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Due from</Label>
                                        <Input
                                            type="date"
                                            value={advancedFilters.dueFrom}
                                            onChange={(e) =>
                                                setAdvancedFilters((prev) => ({ ...prev, dueFrom: e.target.value }))
                                            }
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Due to</Label>
                                        <Input
                                            type="date"
                                            value={advancedFilters.dueTo}
                                            onChange={(e) =>
                                                setAdvancedFilters((prev) => ({ ...prev, dueTo: e.target.value }))
                                            }
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-8 text-xs"
                                        onClick={() =>
                                            setAdvancedFilters({
                                                assignedTo: "all",
                                                createdBy: "all",
                                                createdFrom: "",
                                                createdTo: "",
                                                dueFrom: "",
                                                dueTo: "",
                                                priority: "all",
                                                status: "all",
                                            })
                                        }
                                    >
                                        Reset filters
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>
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
                    focusCommentId={notificationFocusCommentId}
                    onFocusCommentConsumed={onNotificationFocusConsumed}
                />
            )}
        </div>
    );
}
