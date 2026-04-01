import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Hash, Phone, Video, Info, Plus, Smile, Paperclip, Lock, Loader2 } from "lucide-react";
import { Message, Project } from "@/lib/mockData";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatChatMarkdown } from "@/lib/chatMarkdown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface MessagesViewProps {
  project: Project;
  channelId?: string;
}

const QUICK_EMOJIS = ["😀", "👍", "❤️", "🎉", "✅", "🔥", "👀", "🙏", "💬", "📎"];

type ComposerUpdate = { next: string; selStart: number; selEnd: number };

function formatMessageTime(iso: string | undefined): string {
  if (!iso) return "Just now";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Just now";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function MessagesView({ project, channelId }: MessagesViewProps) {
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Last known caret/selection in the composer (for emoji popover when textarea is not focused). */
  const savedSelRef = useRef({ start: 0, end: 0 });
  const { users, channels } = useAppData();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const activeChannelId = channelId || channels.find((c) => c.projectId === project.id && c.type !== "direct")?.id;
  const activeChannel = channels.find((c) => c.id === activeChannelId);

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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [channelMessages.length, numericChannelId]);

  const canSend = Boolean(input.trim()) && numericChannelId != null && !Number.isNaN(numericChannelId);

  const applyInputUpdate = (updater: (prev: string, el: HTMLTextAreaElement) => ComposerUpdate) => {
    const el = textareaRef.current;
    if (!el) return;
    const { next, selStart, selEnd } = updater(input, el);
    setInput(next);
    savedSelRef.current = { start: selStart, end: selEnd };
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  };

  const wrapSelection = (before: string, after: string, placeholder = "text") => {
    applyInputUpdate((prev, el) => {
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const selected = prev.slice(start, end);
      const inner = selected || placeholder;
      const next = prev.slice(0, start) + before + inner + after + prev.slice(end);
      const selA = start + before.length;
      const selB = selA + inner.length;
      return { next, selStart: selA, selEnd: selB };
    });
  };

  const insertBullet = () => {
    applyInputUpdate((prev, el) => {
      const start = el.selectionStart ?? 0;
      const lineStart = prev.lastIndexOf("\n", start - 1) + 1;
      const next = prev.slice(0, lineStart) + "- " + prev.slice(lineStart);
      const cursor = lineStart + 2;
      return { next, selStart: cursor, selEnd: cursor };
    });
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const focused = document.activeElement === el;
    const start = focused ? el.selectionStart ?? 0 : savedSelRef.current.start;
    const end = focused ? el.selectionEnd ?? 0 : savedSelRef.current.end;
    setInput((prev) => {
      const next = prev.slice(0, start) + emoji + prev.slice(end);
      const c = start + emoji.length;
      savedSelRef.current = { start: c, end: c };
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(c, c);
      });
      return next;
    });
  };

  const syncComposerSelection = () => {
    const el = textareaRef.current;
    if (!el) return;
    savedSelRef.current = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
  };

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || numericChannelId == null) return;
    if (file.size > 3 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 3MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") resolve(reader.result);
          else reject(new Error("read"));
        };
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      });
      const res = await apiRequest("POST", `/api/channels/${numericChannelId}/chat-upload`, {
        fileDataUrl: dataUrl,
      });
      const { url } = (await res.json()) as { url: string };
      const isImg = file.type.startsWith("image/");
      const insert = isImg ? `\n![${file.name}](${url})\n` : `\n[${file.name}](${url})\n`;
      setInput((prev) => prev + insert);
      toast({ title: "Attachment added" });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async () => {
    if (!canSend || numericChannelId == null || user == null) return;
    const content = input.trim();
    const optimisticId = -Date.now();
    setInput("");
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
            content,
            createdAt: new Date().toISOString(),
          },
        ];
      },
    );
    try {
      await apiRequest("POST", `/api/channels/${numericChannelId}/messages`, { content });
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
    }
  };

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
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={handleAttachFile}
      />

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
              <span className="text-xs text-muted-foreground">{activeChannel?.members.length} members</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" type="button">
            <Phone className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" type="button">
            <Video className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" type="button">
            <Info className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
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
                    <div className={cn("break-words whitespace-pre-wrap", isMine && " [&_a]:text-primary-foreground/90 [&_a]:underline")}>
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
        <div className="max-w-4xl mx-auto bg-background rounded-xl border border-border shadow-sm p-4">
          <Textarea
            ref={textareaRef}
            className="min-h-[80px] resize-none border-none focus-visible:ring-0 p-0 text-base shadow-none bg-transparent"
            placeholder={`Message ${isDM ? dmUser?.name : `#${activeChannel?.name}`}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onSelect={syncComposerSelection}
            onClick={syncComposerSelection}
            onKeyUp={syncComposerSelection}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <div className="mt-3 pt-3 border-t border-border/30">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
              How it will look
            </p>
            <div
              className={cn(
                "min-h-[3.25rem] rounded-lg border px-3 py-2.5 text-[15px] leading-relaxed break-words",
                "bg-muted/25 border-border/60 text-foreground",
                "[&_a]:text-primary [&_a]:underline [&_img]:max-h-40",
              )}
            >
              {input.trim() ? (
                formatChatMarkdown(input)
              ) : (
                <span className="text-muted-foreground text-sm">
                  Bold, italics, links, and images show here while you type (markdown in the box above).
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/40">
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertBullet();
                }}
                title="Bullet list"
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  wrapSelection("**", "**");
                }}
                title="Bold"
              >
                <span className="font-bold text-xs">B</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  wrapSelection("*", "*");
                }}
                title="Italic"
              >
                <span className="italic text-xs font-serif">I</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || numericChannelId == null}
                title="Attach image or PDF"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <Smile className="w-5 h-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="end">
                  <div className="grid grid-cols-5 gap-1">
                    {QUICK_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        className="text-xl p-2 rounded-md hover:bg-muted"
                        onClick={() => insertEmoji(em)}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button size="sm" className="px-6" onClick={() => void handleSend()} disabled={!canSend}>
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
