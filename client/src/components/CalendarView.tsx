import { useState } from "react";
import { Project, Task, Status } from "@/lib/mockData";
import { TaskCard } from "./TaskCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface CalendarViewProps {
    project: Project;
    tasks: Task[];
    onTaskClick: (t: Task) => void;
}

export default function CalendarView({ project, tasks, onTaskClick }: CalendarViewProps) {
    const [currentDate, setCurrentDate] = useState(new Date());

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
    const goToToday = () => setCurrentDate(new Date());

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const dateFormat = "d";
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return (
        <div className="flex flex-col h-full bg-background/50">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-background/30 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-display font-bold">
                        {format(currentDate, "MMMM yyyy")}
                    </h2>
                    <div className="flex items-center rounded-md border border-border/50 bg-background shadow-sm">
                        <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={goToToday} className="h-8 px-3 text-xs font-medium border-x border-border/50 rounded-none">
                            Today
                        </Button>
                        <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden p-6">
                {/* Days Header */}
                <div className="grid grid-cols-7 mb-2">
                    {weekDays.map(day => (
                        <div key={day} className="text-center text-sm font-semibold text-muted-foreground py-2 uppercase tracking-wide">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar Grid */}
                <div className="flex-1 grid grid-cols-7 grid-rows-5 gap-2 overflow-y-auto min-h-[500px]">
                    {days.map((day, i) => {
                        const isCurrentMonth = isSameMonth(day, monthStart);
                        const dayTasks = tasks.filter(task => {
                            if (!task.dueDate) return false;
                            return isSameDay(new Date(task.dueDate), day);
                        });

                        return (
                            <div 
                                key={day.toISOString()} 
                                className={cn(
                                    "border rounded-lg p-2 flex flex-col gap-1 transition-colors relative group min-h-[100px]",
                                    isCurrentMonth ? "bg-background border-border/60" : "bg-muted/10 border-border/30 text-muted-foreground",
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
                                    <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </div>
                                
                                <ScrollArea className="flex-1 -mr-1 pr-1">
                                    <div className="space-y-1">
                                        {dayTasks.map(task => {
                                            const column = project.columns.find(c => c.id === task.status);
                                            return (
                                                <div 
                                                    key={task.id}
                                                    onClick={() => onTaskClick(task)}
                                                    className="text-xs p-1.5 rounded border border-border/50 bg-card shadow-sm cursor-pointer hover:border-primary/50 transition-colors truncate flex items-center gap-1.5"
                                                >
                                                    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", column?.color)} />
                                                    <span className="truncate">{task.title}</span>
                                                </div>
                                            )
                                        })}
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
