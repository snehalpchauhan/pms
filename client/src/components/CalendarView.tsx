import { useState } from "react";
import { Project, Task, Status } from "@/lib/mockData";
import { TaskCard } from "./TaskCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Filter, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday, startOfDay, endOfDay, addWeeks, subWeeks, subDays, addDays } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CalendarViewProps {
    project: Project;
    tasks: Task[];
    onTaskClick: (t: Task) => void;
}

type ViewMode = "month" | "week" | "day";

export default function CalendarView({ project, tasks, onTaskClick }: CalendarViewProps) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<ViewMode>("month");

    const next = () => {
        if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
        if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1));
        if (viewMode === 'day') setCurrentDate(addDays(currentDate, 1));
    };

    const prev = () => {
        if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
        if (viewMode === 'week') setCurrentDate(subWeeks(currentDate, 1));
        if (viewMode === 'day') setCurrentDate(subDays(currentDate, 1));
    };

    const goToToday = () => setCurrentDate(new Date());

    const dateFormat = "d";
    const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Date Range Logic
    let days: Date[] = [];
    let gridCols = 7;

    if (viewMode === 'month') {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);
        days = eachDayOfInterval({ start: startDate, end: endDate });
        gridCols = 7;
    } else if (viewMode === 'week') {
        const startDate = startOfWeek(currentDate);
        const endDate = endOfWeek(currentDate);
        days = eachDayOfInterval({ start: startDate, end: endDate });
        gridCols = 7;
    } else if (viewMode === 'day') {
        days = [currentDate];
        gridCols = 1;
    }

    const getTasksForDay = (day: Date) => {
        return tasks.filter(task => {
            if (!task.dueDate) return false;
            return isSameDay(new Date(task.dueDate), day);
        });
    };

    return (
        <div className="flex flex-col h-full bg-background/50">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-background/30 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <div className="flex items-center rounded-md border border-border/50 bg-background shadow-sm">
                        <Button variant="ghost" size="icon" onClick={prev} className="h-8 w-8">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={goToToday} className="h-8 px-3 text-xs font-medium border-x border-border/50 rounded-none">
                            Today
                        </Button>
                        <Button variant="ghost" size="icon" onClick={next} className="h-8 w-8">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <h2 className="text-xl font-display font-bold min-w-[200px]">
                        {viewMode === 'month' && format(currentDate, "MMMM yyyy")}
                        {viewMode === 'week' && `Week of ${format(startOfWeek(currentDate), "MMM d, yyyy")}`}
                        {viewMode === 'day' && format(currentDate, "MMMM d, yyyy")}
                    </h2>
                </div>

                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="w-[200px]">
                    <TabsList className="grid w-full grid-cols-3 h-8">
                        <TabsTrigger value="month" className="text-xs">Month</TabsTrigger>
                        <TabsTrigger value="week" className="text-xs">Week</TabsTrigger>
                        <TabsTrigger value="day" className="text-xs">Day</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden p-6">
                {/* Days Header (Only for Month/Week) */}
                {viewMode !== 'day' && (
                    <div className="grid grid-cols-7 mb-2">
                        {weekDays.map(day => (
                            <div key={day} className="text-center text-sm font-semibold text-muted-foreground py-2 uppercase tracking-wide">
                                {day}
                            </div>
                        ))}
                    </div>
                )}

                {/* Calendar Grid */}
                <div className={cn(
                    "flex-1 grid gap-2 overflow-y-auto min-h-[500px]",
                    viewMode === 'month' && "grid-cols-7 grid-rows-5",
                    viewMode === 'week' && "grid-cols-7 grid-rows-1",
                    viewMode === 'day' && "grid-cols-1 grid-rows-1"
                )}>
                    {days.map((day, i) => {
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        const dayTasks = getTasksForDay(day);

                        return (
                            <div 
                                key={day.toISOString()} 
                                className={cn(
                                    "border rounded-lg p-2 flex flex-col gap-1 transition-colors relative group",
                                    viewMode === 'month' && "min-h-[100px]",
                                    viewMode === 'week' && "min-h-[400px]",
                                    viewMode === 'day' && "min-h-[500px]",
                                    (isCurrentMonth || viewMode !== 'month') ? "bg-background border-border/60" : "bg-muted/10 border-border/30 text-muted-foreground",
                                    isToday(day) && "ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/50"
                                )}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className={cn(
                                        "text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full",
                                        isToday(day) ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                                    )}>
                                        {format(day, dateFormat)}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        {viewMode === 'day' && <span className="text-sm font-semibold text-muted-foreground">{format(day, "EEEE")}</span>}
                                        <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Plus className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                                
                                <ScrollArea className="flex-1 -mr-1 pr-1">
                                    <div className="space-y-1">
                                        {dayTasks.map(task => {
                                            const column = project.columns.find(c => c.id === task.status);
                                            return (
                                                <div 
                                                    key={task.id}
                                                    onClick={() => onTaskClick(task)}
                                                    className={cn(
                                                        "p-2 rounded border border-border/50 bg-card shadow-sm cursor-pointer hover:border-primary/50 transition-colors flex flex-col gap-1",
                                                        viewMode === 'day' ? "p-3" : "text-xs"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                                        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", column?.color)} />
                                                        <span className="truncate font-medium">{task.title}</span>
                                                    </div>
                                                    {viewMode !== 'month' && (
                                                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                                                            <span className="uppercase tracking-wide">{task.priority}</span>
                                                            <span>•</span>
                                                            <span>{task.assignees.length} assignee(s)</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                        {dayTasks.length === 0 && viewMode === 'day' && (
                                            <div className="h-full flex items-center justify-center text-muted-foreground/50 text-sm italic mt-10">
                                                No tasks for today
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
