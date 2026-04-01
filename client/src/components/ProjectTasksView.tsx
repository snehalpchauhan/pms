import { Project, Task } from "@/lib/mockData";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Board from "./Board";
import TaskListView from "./TaskListView";
import CalendarView from "./CalendarView";
import { FolderKanban, ListTodo, Filter, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskDetailPage } from "./TaskDetailPage";
import { isPast, isToday } from "date-fns";
import type { ClientPermissions } from "@/App";

interface ProjectTasksViewProps {
    project: Project;
    tasks: Task[];
    clientPermissions?: ClientPermissions;
}

export default function ProjectTasksView({ project, tasks, clientPermissions }: ProjectTasksViewProps) {
    const { user } = useAuth();
    const currentUserId = user ? String(user.id) : "";
    const [filter, setFilter] = useState("all");
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);

    const isClient = user?.role === "client";

    const filteredTasks = tasks.filter(t => {
        if (filter === "mine") return t.assignees.includes(currentUserId);
        if (filter === "overdue") {
            if (!t.dueDate) return false;
            const isDone = t.status === project.columns[project.columns.length - 1].id;
            return isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate)) && !isDone;
        }
        return true;
    });

    return (
        <div className="h-full flex flex-col overflow-hidden relative">
            <Tabs defaultValue="board" className="flex-1 flex flex-col h-full overflow-hidden">
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
                        <Select value={filter} onValueChange={setFilter}>
                            <SelectTrigger className="w-[140px] h-9 text-xs">
                                <Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                                <SelectValue placeholder="Filter" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Tasks</SelectItem>
                                {!isClient && <SelectItem value="mine">My Tasks</SelectItem>}
                                <SelectItem value="overdue">Overdue</SelectItem>
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
                                onTaskClick={setSelectedTask}
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
                            onTaskClick={setSelectedTask} 
                        />
                    </TabsContent>
                    <TabsContent value="calendar" className="h-full m-0 data-[state=active]:flex flex-col overflow-hidden">
                        <CalendarView 
                            project={project} 
                            tasks={filteredTasks} 
                            onTaskClick={setSelectedTask} 
                        />
                    </TabsContent>
                </div>
            </Tabs>
            
            {selectedTask && (
                <TaskDetailPage 
                    task={selectedTask} 
                    onClose={() => setSelectedTask(null)}
                    clientPermissions={clientPermissions}
                />
            )}
        </div>
    );
}
