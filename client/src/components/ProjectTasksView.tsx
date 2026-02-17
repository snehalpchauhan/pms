import { Project, Task } from "@/lib/mockData";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Board from "./Board";
import TaskListView from "./TaskListView";
import { FolderKanban, ListTodo, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ProjectTasksViewProps {
    project: Project;
    tasks: Task[];
}

export default function ProjectTasksView({ project, tasks }: ProjectTasksViewProps) {
    const [filter, setFilter] = useState("all");

    // In a real app, current user ID would come from context
    const currentUserId = "u1"; 

    const filteredTasks = tasks.filter(t => {
        if (filter === "mine") return t.assignees.includes(currentUserId);
        return true;
    });

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <Tabs defaultValue="board" className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between shrink-0 bg-background/50 backdrop-blur-sm z-10">
                    <TabsList className="grid w-[200px] grid-cols-2">
                        <TabsTrigger value="board">
                            <FolderKanban className="w-4 h-4 mr-2" />
                            Board
                        </TabsTrigger>
                        <TabsTrigger value="list">
                            <ListTodo className="w-4 h-4 mr-2" />
                            List
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
                                <SelectItem value="mine">My Tasks</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden relative">
                     <TabsContent value="board" className="h-full m-0 data-[state=active]:flex flex-col">
                        <div className="flex-1 overflow-hidden">
                            <Board project={project} tasks={filteredTasks} />
                        </div>
                    </TabsContent>
                    <TabsContent value="list" className="h-full m-0 data-[state=active]:flex flex-col overflow-y-auto">
                        <TaskListView project={project} tasks={filteredTasks} />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
