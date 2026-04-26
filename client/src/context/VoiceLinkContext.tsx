/**
 * VoiceLinkContext — global audio/video call state for PMS.
 *
 * Responsibilities:
 *  - Single source of truth for the active call (callFrame) — persists across
 *    view/project changes so the iframe stays alive.
 *  - Opens ONE WebSocket and subscribes with the current user's ID so incoming-
 *    call ring events are received regardless of which view/project is open.
 *    The server pushes ring events directly to each member by userId — no
 *    per-channel subscription needed.
 *  - Renders the full-screen iframe overlay and the incoming-call ring banner
 *    at the top of the React tree (not inside MessagesView) so they show
 *    globally.
 *  - Guards against starting a second call if one is already active.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Phone, Video, Loader2, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CallFrame {
  url: string;
  media: "audio" | "video";
  channelId: number;
  channelName?: string;
}

interface IncomingCall {
  channelId: number;
  channelName?: string;
  callerName: string;
  media: "audio" | "video";
}

interface VoiceLinkContextValue {
  callFrame: CallFrame | null;
  vlBusy: "audio" | "video" | null;
  openVoiceLink: (channelId: number, media: "audio" | "video", channelName?: string) => Promise<void>;
  closeCall: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const VoiceLinkContext = createContext<VoiceLinkContextValue>({
  callFrame: null,
  vlBusy: null,
  openVoiceLink: async () => {},
  closeCall: () => {},
});

export function useVoiceLink() {
  return useContext(VoiceLinkContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const RING_TIMEOUT_MS = 30_000;

export function VoiceLinkProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [callFrame, setCallFrame] = useState<CallFrame | null>(null);
  const [vlBusy, setVlBusy] = useState<"audio" | "video" | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [ringCountdown, setRingCountdown] = useState(RING_TIMEOUT_MS / 1000);

  // Keep a ref so WebSocket handlers always have the latest callFrame value
  // without needing to re-create the socket on every state change.
  const callFrameRef = useRef<CallFrame | null>(null);
  useEffect(() => { callFrameRef.current = callFrame; }, [callFrame]);

  // ── Listen for VoiceLink "leave" postMessage from the iframe ──────────────
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.data?.type === "vl-left") setCallFrame(null);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ── Global WebSocket: subscribe by userId (server pushes rings directly) ──
  const userId = user?.id ? Number(user.id) : null;

  useEffect(() => {
    if (!userId) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws/chat`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ subscribeUser: userId }));
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as {
          type?: string;
          channelId?: number;
          channelName?: string;
          callerName?: string;
          media?: string;
        };
        if (data.type === "incoming_call" && data.channelId != null) {
          // Don't ring if we're already in a call on this channel (use ref — not stale)
          if (callFrameRef.current?.channelId === data.channelId) return;
          setIncomingCall({
            channelId: data.channelId,
            channelName: data.channelName,
            callerName: data.callerName ?? "Someone",
            media: (data.media as "audio" | "video") ?? "audio",
          });
          setRingCountdown(RING_TIMEOUT_MS / 1000);
        }
      } catch {
        /* ignore malformed */
      }
    };

    ws.onerror = () => {};

    return () => ws.close();
  }, [userId]);

  // ── Ring countdown — auto-dismiss after RING_TIMEOUT_MS ──────────────────
  useEffect(() => {
    if (!incomingCall) { setRingCountdown(RING_TIMEOUT_MS / 1000); return; }
    const interval = setInterval(() => {
      setRingCountdown((prev) => {
        if (prev <= 1) { setIncomingCall(null); clearInterval(interval); return RING_TIMEOUT_MS / 1000; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [incomingCall]);

  // ── Open a call ───────────────────────────────────────────────────────────
  const openVoiceLink = useCallback(
    async (channelId: number, media: "audio" | "video", channelName?: string) => {
      if (callFrameRef.current) {
        toast({
          title: "Already in a call",
          description: "Please leave your current call before starting a new one.",
          variant: "destructive",
        });
        return;
      }
      setVlBusy(media);
      try {
        const res = await apiRequest("POST", "/api/chat/voice-link", { channelId, media });
        const data = (await res.json()) as { url?: string; message?: string };
        if (!res.ok || !data.url) {
          toast({ title: "VoiceLink error", description: data.message ?? "Could not start call.", variant: "destructive" });
          return;
        }
        setCallFrame({ url: data.url, media, channelId, channelName });
      } catch {
        toast({ title: "VoiceLink error", description: "Network error. Please try again.", variant: "destructive" });
      } finally {
        setVlBusy(null);
      }
    },
    [toast],
  );

  const closeCall = useCallback(() => setCallFrame(null), []);

  const joinIncoming = useCallback(async () => {
    if (!incomingCall) return;
    const { channelId, media, channelName } = incomingCall;
    setIncomingCall(null);
    await openVoiceLink(channelId, media, channelName);
  }, [incomingCall, openVoiceLink]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <VoiceLinkContext.Provider value={{ callFrame, vlBusy, openVoiceLink, closeCall }}>
      {children}

      {/* ── Incoming call ring banner ── */}
      {incomingCall && !callFrame && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-background border border-border shadow-2xl rounded-2xl px-5 py-4 min-w-80 max-w-sm animate-in slide-in-from-bottom-4">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-semibold text-sm leading-tight truncate">
              {incomingCall.callerName} is calling…
            </span>
            <span className="text-xs text-muted-foreground capitalize">
              {incomingCall.channelName ? `#${incomingCall.channelName} · ` : ""}
              {incomingCall.media} call · {ringCountdown}s
            </span>
          </div>
          <button
            className="rounded-full bg-green-500 hover:bg-green-600 active:scale-95 text-white w-10 h-10 flex items-center justify-center shrink-0 transition-colors"
            title="Join call"
            onClick={joinIncoming}
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            className="rounded-full bg-destructive hover:bg-destructive/80 active:scale-95 text-destructive-foreground w-10 h-10 flex items-center justify-center shrink-0 transition-colors"
            title="Decline"
            onClick={() => setIncomingCall(null)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Full-screen VoiceLink iframe overlay ── */}
      {callFrame && (
        <div className="fixed inset-0 z-[55] flex flex-col bg-black">
          <div className="flex items-center justify-between px-4 py-2 bg-black/70 backdrop-blur-sm shrink-0 border-b border-white/10">
            <div className="flex items-center gap-2 text-white/80 text-sm">
              {callFrame.media === "video" ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
              <span className="capitalize">{callFrame.media} call</span>
              {callFrame.channelName && (
                <span className="text-white/50">· #{callFrame.channelName}</span>
              )}
            </div>
            <button
              className="text-white/70 hover:text-white hover:bg-white/10 text-xs px-3 py-1.5 rounded-lg border border-white/20 transition-colors"
              onClick={closeCall}
            >
              ✕ Leave &amp; Close
            </button>
          </div>
          <iframe
            key={callFrame.url}
            src={callFrame.url}
            className="flex-1 w-full border-0"
            allow="camera; microphone; display-capture; autoplay"
            title="VoiceLink call"
          />
        </div>
      )}
    </VoiceLinkContext.Provider>
  );
}
 *
 * Responsibilities:
 *  - Single source of truth for the active call (callFrame) — persists across
 *    view/project changes so the iframe stays alive.
 *  - Subscribes ONE WebSocket to EVERY channel the user belongs to so incoming-
 *    call ring events are received regardless of which view is open.
 *  - Renders the full-screen iframe overlay and the incoming-call ring banner
 *    at the top of the React tree (not inside MessagesView) so they show
 *    globally.
 *  - Guards against starting a second call if one is already active.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Phone, Video, Loader2, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CallFrame {
  url: string;
  media: "audio" | "video";
  channelId: number;
  channelName?: string;
}

interface IncomingCall {
  channelId: number;
  channelName?: string;
  callerName: string;
  media: "audio" | "video";
}

interface VoiceLinkContextValue {
  callFrame: CallFrame | null;
  vlBusy: "audio" | "video" | null;
  openVoiceLink: (channelId: number, media: "audio" | "video", channelName?: string) => Promise<void>;
  closeCall: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const VoiceLinkContext = createContext<VoiceLinkContextValue>({
  callFrame: null,
  vlBusy: null,
  openVoiceLink: async () => {},
  closeCall: () => {},
});

export function useVoiceLink() {
  return useContext(VoiceLinkContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const RING_TIMEOUT_MS = 30_000;

export function VoiceLinkProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { channels } = useAppData();
  const { user } = useAuth();

  const [callFrame, setCallFrame] = useState<CallFrame | null>(null);
  const [vlBusy, setVlBusy] = useState<"audio" | "video" | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [ringCountdown, setRingCountdown] = useState(RING_TIMEOUT_MS / 1000);

  // ── Listen for VoiceLink "leave" postMessage from the iframe ──────────────
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.data?.type === "vl-left") setCallFrame(null);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ── Global WebSocket: subscribe to ALL channels at once ───────────────────
  // This ensures incoming_call events arrive even when MessagesView isn't open.
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Numeric channel IDs (skip DM pseudo-IDs like "dm-5")
    const numericIds = channels
      .map((c) => Number(c.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (numericIds.length === 0) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws/chat`);
    wsRef.current = ws;

    ws.onopen = () => {
      numericIds.forEach((id) => ws.send(JSON.stringify({ subscribe: id })));
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as {
          type?: string;
          channelId?: number;
          callerName?: string;
          media?: string;
        };
        if (data.type === "incoming_call" && data.channelId != null) {
          // Don't ring if we're the one who started the call (we already have the frame)
          if (callFrame?.channelId === data.channelId) return;
          const ch = channels.find((c) => Number(c.id) === data.channelId);
          setIncomingCall({
            channelId: data.channelId,
            channelName: ch?.name,
            callerName: data.callerName ?? "Someone",
            media: (data.media as "audio" | "video") ?? "audio",
          });
          setRingCountdown(RING_TIMEOUT_MS / 1000);
        }
      } catch {
        /* ignore malformed */
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
    // Re-subscribe whenever the channel list changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels.map((c) => c.id).join(",")]);

  // ── Ring countdown — auto-dismiss after RING_TIMEOUT_MS ──────────────────
  useEffect(() => {
    if (!incomingCall) { setRingCountdown(RING_TIMEOUT_MS / 1000); return; }
    const interval = setInterval(() => {
      setRingCountdown((prev) => {
        if (prev <= 1) { setIncomingCall(null); clearInterval(interval); return RING_TIMEOUT_MS / 1000; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [incomingCall]);

  // ── Open a call ───────────────────────────────────────────────────────────
  const openVoiceLink = useCallback(
    async (channelId: number, media: "audio" | "video", channelName?: string) => {
      if (callFrame) {
        toast({
          title: "Already in a call",
          description: "Please leave your current call before starting a new one.",
          variant: "destructive",
        });
        return;
      }
      setVlBusy(media);
      try {
        const res = await apiRequest("POST", "/api/chat/voice-link", { channelId, media });
        const data = (await res.json()) as { url?: string; message?: string };
        if (!res.ok || !data.url) {
          toast({ title: "VoiceLink error", description: data.message ?? "Could not start call.", variant: "destructive" });
          return;
        }
        setCallFrame({ url: data.url, media, channelId, channelName });
      } catch {
        toast({ title: "VoiceLink error", description: "Network error. Please try again.", variant: "destructive" });
      } finally {
        setVlBusy(null);
      }
    },
    [callFrame, toast],
  );

  const closeCall = useCallback(() => setCallFrame(null), []);

  // ── Join from ring banner ─────────────────────────────────────────────────
  const joinIncoming = useCallback(async () => {
    if (!incomingCall) return;
    const { channelId, media, channelName } = incomingCall;
    setIncomingCall(null);
    await openVoiceLink(channelId, media, channelName);
  }, [incomingCall, openVoiceLink]);

  // ─────────────────────────────────────────────────────────────────────────

  const callerDisplay = user?.name ?? "You";
  void callerDisplay; // used in context only

  return (
    <VoiceLinkContext.Provider value={{ callFrame, vlBusy, openVoiceLink, closeCall }}>
      {children}

      {/* ── Incoming call ring banner ── */}
      {incomingCall && !callFrame && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-background border border-border shadow-2xl rounded-2xl px-5 py-4 min-w-80 max-w-sm animate-in slide-in-from-bottom-4">
          {/* pulsing ring dot */}
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-semibold text-sm leading-tight truncate">
              {incomingCall.callerName} is calling…
            </span>
            <span className="text-xs text-muted-foreground capitalize">
              {incomingCall.channelName ? `#${incomingCall.channelName} · ` : ""}
              {incomingCall.media} call · {ringCountdown}s
            </span>
          </div>
          <button
            className="rounded-full bg-green-500 hover:bg-green-600 active:scale-95 text-white w-10 h-10 flex items-center justify-center shrink-0 transition-colors"
            title="Join call"
            onClick={joinIncoming}
          >
            <Phone className="w-4 h-4" />
          </button>
          <button
            className="rounded-full bg-destructive hover:bg-destructive/80 active:scale-95 text-destructive-foreground w-10 h-10 flex items-center justify-center shrink-0 transition-colors"
            title="Decline"
            onClick={() => setIncomingCall(null)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Full-screen VoiceLink iframe overlay ── */}
      {callFrame && (
        <div className="fixed inset-0 z-[55] flex flex-col bg-black">
          {/* top bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-black/70 backdrop-blur-sm shrink-0 border-b border-white/10">
            <div className="flex items-center gap-2 text-white/80 text-sm">
              {callFrame.media === "video" ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
              <span className="capitalize">{callFrame.media} call</span>
              {callFrame.channelName && (
                <span className="text-white/50">· #{callFrame.channelName}</span>
              )}
            </div>
            <button
              className="text-white/70 hover:text-white hover:bg-white/10 text-xs px-3 py-1.5 rounded-lg border border-white/20 transition-colors"
              onClick={closeCall}
            >
              ✕ Leave &amp; Close
            </button>
          </div>
          {/* VoiceLink iframe */}
          <iframe
            key={callFrame.url}
            src={callFrame.url}
            className="flex-1 w-full border-0"
            allow="camera; microphone; display-capture; autoplay"
            title="VoiceLink call"
          />
        </div>
      )}
    </VoiceLinkContext.Provider>
  );
}
