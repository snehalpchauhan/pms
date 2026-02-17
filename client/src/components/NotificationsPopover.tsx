import { Bell, Check, Clock, AlertCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";

// Mock Notification Data
interface Notification {
    id: string;
    type: 'mention' | 'assignment' | 'overdue' | 'system';
    title: string;
    message: string;
    time: Date;
    read: boolean;
    projectId?: string;
    taskId?: string;
}

const INITIAL_NOTIFICATIONS: Notification[] = [
    {
        id: 'n1',
        type: 'overdue',
        title: 'Task Overdue',
        message: 'The task "Q4 Marketing Report" was due yesterday.',
        time: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
        read: false,
        projectId: 'p1',
        taskId: 't1'
    },
    {
        id: 'n2',
        type: 'assignment',
        title: 'New Assignment',
        message: 'You were assigned to "Update Homepage Hero".',
        time: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
        read: false,
        projectId: 'p1',
        taskId: 't3'
    },
    {
        id: 'n3',
        type: 'mention',
        title: 'Mentioned in Comments',
        message: 'Sarah mentioned you: "Can you review this?"',
        time: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
        read: true,
        projectId: 'p1',
        taskId: 't2'
    }
];

export function NotificationsPopover() {
    const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);
    const [isOpen, setIsOpen] = useState(false);

    const unreadCount = notifications.filter(n => !n.read).length;

    const markAllRead = () => {
        setNotifications(notifications.map(n => ({ ...n, read: true })));
    };

    const markRead = (id: string) => {
        setNotifications(notifications.map(n => n.id === id ? ({ ...n, read: true }) : n));
    };

    const getIcon = (type: Notification['type']) => {
        switch (type) {
            case 'overdue': return <AlertCircle className="w-4 h-4 text-destructive" />;
            case 'assignment': return <Check className="w-4 h-4 text-primary" />;
            case 'mention': return <Bell className="w-4 h-4 text-blue-500" />;
            default: return <Bell className="w-4 h-4 text-muted-foreground" />;
        }
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground relative hover:text-foreground transition-colors">
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                        <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-background animate-pulse"></span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
                    <h4 className="font-semibold text-sm">Notifications</h4>
                    {unreadCount > 0 && (
                        <button onClick={markAllRead} className="text-[10px] text-primary hover:underline font-medium">
                            Mark all read
                        </button>
                    )}
                </div>
                <ScrollArea className="h-[300px]">
                    {notifications.length > 0 ? (
                        <div className="divide-y divide-border/30">
                            {notifications.map(notification => (
                                <div 
                                    key={notification.id} 
                                    onClick={() => markRead(notification.id)}
                                    className={cn(
                                        "p-4 hover:bg-muted/30 transition-colors cursor-pointer relative group",
                                        !notification.read && "bg-muted/10"
                                    )}
                                >
                                    <div className="flex gap-3">
                                        <div className={cn("mt-1 shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-background border border-border/50", !notification.read && "border-primary/20 bg-primary/5")}>
                                            {getIcon(notification.type)}
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex justify-between items-start">
                                                <p className={cn("text-sm font-medium leading-none", !notification.read ? "text-foreground" : "text-muted-foreground")}>
                                                    {notification.title}
                                                </p>
                                                <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                                                    {formatDistanceToNow(notification.time, { addSuffix: true })}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground line-clamp-2">
                                                {notification.message}
                                            </p>
                                        </div>
                                    </div>
                                    {!notification.read && (
                                        <div className="absolute top-1/2 right-2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                            <Bell className="w-8 h-8 mb-2 opacity-20" />
                            <p className="text-sm">No notifications</p>
                        </div>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}
