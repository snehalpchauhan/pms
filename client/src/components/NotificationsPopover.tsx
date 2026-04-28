import { Bell, Check, Clock, AlertCircle, MessageSquare, ListChecks } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId?: number | null;
  projectId?: number | null;
  channelId?: number | null;
  readAt?: string | null;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export function NotificationsPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();

  const notificationsQuery = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=80", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(user?.id),
    refetchInterval: 30_000,
  });

  const unreadQuery = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread-count", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: Boolean(user?.id),
    refetchInterval: 15_000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`, {});
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/mark-all-read", {});
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws/chat`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ subscribeUser: user.id }));
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as { type?: string; userId?: number };
        if (data.type === "notifications_changed" && Number(data.userId) === Number(user.id)) {
          void queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          void queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
        }
      } catch {
        // ignore invalid payloads
      }
    };
    return () => ws.close();
  }, [user?.id]);

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = unreadQuery.data?.count ?? notifications.filter((n) => !n.readAt).length;

  const getIcon = (type: string) => {
    if (type.includes("assignment")) return <Check className="w-4 h-4 text-primary" />;
    if (type.includes("comment")) return <MessageSquare className="w-4 h-4 text-blue-500" />;
    if (type.includes("timecard")) return <Clock className="w-4 h-4 text-amber-500" />;
    if (type.includes("reopen") || type.includes("overdue")) return <AlertCircle className="w-4 h-4 text-destructive" />;
    return <ListChecks className="w-4 h-4 text-muted-foreground" />;
  };

  const onNotificationClick = async (notification: Notification) => {
    if (!notification.readAt) {
      await markReadMutation.mutateAsync(notification.id);
    }
    window.dispatchEvent(new CustomEvent("pms:notification-open", { detail: notification }));
  };

  const loading = notificationsQuery.isLoading || unreadQuery.isLoading;
  const showEmpty = !loading && notifications.length === 0;
  const isBusy = markReadMutation.isPending || markAllReadMutation.isPending;
  const ordered = useMemo(() => notifications.slice().sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)), [notifications]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground relative hover:text-foreground transition-colors">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-background animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllReadMutation.mutate()}
              className="text-[10px] text-primary hover:underline font-medium disabled:opacity-50"
              disabled={isBusy}
            >
              Mark all read
            </button>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {showEmpty ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
              <Bell className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {ordered.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => void onNotificationClick(notification)}
                  className={cn(
                    "p-4 hover:bg-muted/30 transition-colors cursor-pointer relative group",
                    !notification.readAt && "bg-muted/10",
                  )}
                >
                  <div className="flex gap-3">
                    <div className={cn("mt-1 shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-background border border-border/50", !notification.readAt && "border-primary/20 bg-primary/5")}>
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between items-start">
                        <p className={cn("text-sm font-medium leading-none", !notification.readAt ? "text-foreground" : "text-muted-foreground")}>
                          {notification.title}
                        </p>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{notification.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
