import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Hash, Phone, Video, Info, Lock, Loader2 } from "lucide-react";
import { Message, Project } from "@/lib/mockData";
import { useEffect, useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatChatMarkdown } from "@/lib/chatMarkdown";
import { ChatRichComposer } from "@/components/ChatRichComposer";
import { EditChannelModal } from "@/components/EditChannelModal";
import { useVoiceLink } from "@/context/VoiceLinkContext";

interface MessagesViewProps {
  project: Project;
  channelId?: string;
  /** Called after the current channel is deleted so the parent can clear selection. */
  onChannelDeleted?: () => void;
}

function formatMessageTime(iso: string | undefined): string {
  if (!iso) return "Just now";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Just now";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function MessagesView({ project, channelId, onChannelDeleted }: MessagesViewProps) {
  const { users, channels } = useAppData();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editChannelOpen, setEditChannelOpen] = useState(false);
  const canManageChannel = user?.role === "admin" || user?.role === "manager";
  const activeChannelId = channelId || channels.find((c) => c.projectId === project.id && c.type !== "direct")?.id;
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const isChannelOwner =
    activeChannel != null &&
    user != null &&
    activeChannel.createdByUserId != null &&
    String(activeChannel.createdByUserId) === String(user.id);
  const canEditChannel = canManageChannel || isChannelOwner;

  const isDM = Boolean(activeChannelId?.startsWith("dm-"));
  const dmPeerIdStr = isDM && activeChannelId ? activeChannelId.replace(/^dm-/, "") : "";
  const dmPeerNumericId = dmPeerIdStr ? Number(dmPeerIdStr) : NaN;
  const dmUser = isDM && dmPeerIdStr ? users[dmPeerIdStr] : null;

  const { data: dmChannelId } = useQuery({
    queryKey: ["/api/projects", project.id, "direct-messages", dmPeerNumericId],
    queryFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${project.id}/direct-messages`, {
        peerUserId: dmPeerNumericId,
      });
      const j = (await res.json()) as { channelId: number };
      return j.channelId;
    },
    enabled: isDM && Number.isInteger(dmPeerNumericId) && dmPeerNumericId > 0,
    staleTime: Infinity,
    retry: false,
  });

  const numericChannelId =
    isDM && dmChannelId != null
      ? dmChannelId
      : activeChannelId && !isDM
        ? Number(activeChannelId)
        : null;

  // ── VoiceLink — global call state from context ────────────────
  const { callFrame, vlBusy, openVoiceLink: openVoiceLinkGlobal } = useVoiceLink();
  const openVoiceLink = useCallback(
    (media: "audio" | "video") => {
      if (numericChannelId == null) return;
      void openVoiceLinkGlobal(numericChannelId, media, activeChannel?.name);
    },
    [numericChannelId, activeChannel?.name, openVoiceLinkGlobal],
  );

  const { data: rawMessages } = useQuery<any[]>({
    queryKey: ["/api/channels", numericChannelId, "messages"],
    queryFn: async () => {
      if (numericChannelId == null) return [];
      const res = await fetch(`/api/channels/${numericChannelId}/messages`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: numericChannelId != null && !Number.isNaN(numericChannelId),
    refetchInterval: 3_000,
  });

  useEffect(() => {
    if (numericChannelId == null || Number.isNaN(numericChannelId)) return;
    void (async () => {
      try {
        await apiRequest("POST", `/api/channels/${numericChannelId}/read`, {});
        void queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      } catch {
        /* ignore */
      }
    })();
  }, [numericChannelId, queryClient]);

  useEffect(() => {
    if (numericChannelId == null || Number.isNaN(numericChannelId)) return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws/chat`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ subscribe: numericChannelId }));
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as { type?: string; channelId?: number };
        if (data.type === "channel_messages" && data.channelId === numericChannelId) {
          void queryClient.refetchQueries({ queryKey: ["/api/channels", numericChannelId, "messages"] });
          void queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      ws.close();
    };
  }, [numericChannelId, queryClient]);

  const channelMessages: Message[] = (rawMessages || []).map((m: any) => ({
    id: String(m.id),
    channelId: String(m.channelId),
    authorId: String(m.authorId),
    content: m.content,
    createdAt: formatMessageTime(m.createdAt),
  }));

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    scrollToBottom("auto");
  }, [channelMessages.length, numericChannelId, scrollToBottom]);

  const handleComposerSend = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || numericChannelId == null || user == null) return;
      const optimisticId = -Date.now();
      queryClient.setQueryData(
        ["/api/channels", numericChannelId, "messages"],
        (old: unknown) => {
          const prev = Array.isArray(old) ? old : [];
          return [
            ...prev,
            {
              id: optimisticId,
              channelId: numericChannelId,
              authorId: user.id,
              content: trimmed,
              createdAt: new Date().toISOString(),
            },
          ];
        },
      );
      try {
        await apiRequest("POST", `/api/channels/${numericChannelId}/messages`, { content: trimmed });
        await queryClient.refetchQueries({ queryKey: ["/api/channels", numericChannelId, "messages"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      } catch (e) {
        console.error("Failed to send message:", e);
        await queryClient.refetchQueries({ queryKey: ["/api/channels", numericChannelId, "messages"] });
        toast({
          title: "Message not sent",
          description: e instanceof Error ? e.message : "Try again.",
          variant: "destructive",
        });
        throw e;
      }
    },
    [numericChannelId, queryClient, toast, user],
  );

  if (!activeChannel && !isDM) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground h-full bg-background/50">
        <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4">
          <Hash className="w-8 h-8 opacity-50" />
        </div>
        <p>Select a channel or team member to start messaging</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="h-14 border-b border-border/50 flex items-center justify-between px-6 bg-background/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          {isDM ? (
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={dmUser?.avatar} />
                <AvatarFallback>{dmUser?.name[0]}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-foreground leading-none">{dmUser?.name}</h3>
                <span className="text-xs text-muted-foreground capitalize">{dmUser?.status}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {activeChannel?.type === "private" ? (
                <Lock className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Hash className="w-4 h-4 text-muted-foreground" />
              )}
              <h3 className="font-semibold text-foreground">{activeChannel?.name}</h3>
              <div className="h-4 w-px bg-border mx-2" />
              {canEditChannel ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline text-left"
                  onClick={() => setEditChannelOpen(true)}
                  title="Edit channel name and members"
                >
                  {activeChannel?.type === "public"
                    ? (activeChannel?.memberCountDisplay ?? activeChannel?.members.length ?? 0)
                    : activeChannel?.members.length ?? 0}{" "}
                  members
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {activeChannel?.type === "public"
                    ? (activeChannel?.memberCountDisplay ?? activeChannel?.members.length ?? 0)
                    : activeChannel?.members.length ?? 0}{" "}
                  members
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${callFrame ? "text-green-500" : "text-muted-foreground"}`}
            type="button"
            disabled={vlBusy !== null || numericChannelId == null}
            onClick={() => openVoiceLink("audio")}
            title={callFrame ? "Already in a call" : "Start audio call"}
          >
            {vlBusy === "audio" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${callFrame ? "text-green-500" : "text-muted-foreground"}`}
            type="button"
            disabled={vlBusy !== null || numericChannelId == null}
            onClick={() => openVoiceLink("video")}
            title={callFrame ? "Already in a call" : "Start video call / screen share"}
          >
            {vlBusy === "video" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" type="button">
            <Info className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-6">
        <div className="space-y-4 max-w-4xl mx-auto pb-4">
          <div className="pb-6 text-center sm:text-left border-b border-border/30 mb-6">
            {isDM ? (
              <div className="flex flex-col sm:flex-row items-center gap-4 mb-2">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={dmUser?.avatar} />
                  <AvatarFallback>{dmUser?.name[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <h1 className="text-2xl font-bold mb-1">{dmUser?.name}</h1>
                  <p className="text-muted-foreground text-sm">
                    Direct messages with <span className="font-medium text-foreground">{dmUser?.name}</span>.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center mb-4 mx-auto sm:mx-0">
                  <Hash className="w-8 h-8 text-muted-foreground" />
                </div>
                <h1 className="text-2xl font-bold mb-2">Welcome to #{activeChannel?.name}!</h1>
                <p className="text-muted-foreground text-sm">
                  Start of <span className="font-medium text-foreground">#{activeChannel?.name}</span> in {project.name}.
                </p>
              </>
            )}
          </div>

          {channelMessages.map((msg, idx) => {
            const author = users[msg.authorId];
            const isMine = user != null && Number(msg.authorId) === user.id;
            const prev = channelMessages[idx - 1];
            const showAvatar = !prev || prev.authorId !== msg.authorId;
            const showMeta = showAvatar;

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2 sm:gap-3 animate-in fade-in duration-200",
                  isMine ? "flex-row-reverse" : "flex-row",
                  showAvatar ? "mt-3" : "mt-0.5",
                )}
              >
                <div className="w-9 shrink-0 flex justify-center">
                  {showAvatar ? (
                    <Avatar className="h-9 w-9 rounded-xl border border-border/50">
                      <AvatarImage src={author?.avatar} />
                      <AvatarFallback className="text-xs">{author?.name?.[0] ?? "?"}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="w-9" />
                  )}
                </div>

                <div
                  className={cn(
                    "flex flex-col max-w-[min(85%,28rem)] min-w-0",
                    isMine ? "items-end" : "items-start",
                  )}
                >
                  {showMeta && (
                    <div
                      className={cn(
                        "flex items-center gap-2 mb-1 px-1",
                        isMine ? "flex-row-reverse" : "flex-row",
                      )}
                    >
                      <span className="font-semibold text-xs text-foreground">{isMine ? "You" : author?.name ?? "Unknown"}</span>
                      <span className="text-[10px] text-muted-foreground">{msg.createdAt}</span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed shadow-sm border",
                      isMine
                        ? "bg-primary text-primary-foreground border-primary/20 rounded-tr-md"
                        : "bg-muted/80 text-foreground border-border/60 rounded-tl-md",
                    )}
                  >
                    <div
                      className={cn(
                        "break-words whitespace-pre-wrap",
                        isMine && " [&_a]:text-primary-foreground/90 [&_a]:underline [&_u]:text-primary-foreground/95",
                      )}
                    >
                      {formatChatMarkdown(msg.content)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-4 pt-2 shrink-0 border-t border-border/40">
        <div
          className="max-w-4xl mx-auto bg-background rounded-xl border border-border shadow-sm p-4"
          onMouseDown={() => scrollToBottom("smooth")}
        >
          <ChatRichComposer
            key={numericChannelId != null ? `ch-${numericChannelId}` : `pending-${activeChannelId ?? "x"}`}
            channelId={numericChannelId}
            placeholder={`Message ${isDM ? dmUser?.name ?? "" : `#${activeChannel?.name ?? "channel"}`}`}
            onSend={handleComposerSend}
          />
        </div>
      </div>

      {canEditChannel && !isDM && activeChannel ? (
        <EditChannelModal
          open={editChannelOpen}
          onOpenChange={setEditChannelOpen}
          projectId={project.id}
          channel={activeChannel}
          onDeleted={() => {
            onChannelDeleted?.();
          }}
        />
      ) : null}
    </div>
  );
}
