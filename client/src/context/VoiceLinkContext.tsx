/**
 * VoiceLinkContext — global audio/video call state for PMS.
 *
 * - WebSocket `subscribeUser` for instant rings.
 * - GET /api/chat/pending-invite polling every 3.5s as fallback (proxies / firewalls).
 * - Full-width top banner + optional desktop notification (if permission granted).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Phone, Video, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

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

const VoiceLinkContext = createContext<VoiceLinkContextValue>({
  callFrame: null,
  vlBusy: null,
  openVoiceLink: async () => {},
  closeCall: () => {},
});

export function useVoiceLink() {
  return useContext(VoiceLinkContext);
}

const RING_TIMEOUT_MS = 45_000;
const POLL_MS = 3_500;

function maybeDesktopNotify(callerName: string, channelLabel: string, media: string) {
  if (typeof Notification === "undefined") return;
  if (document.visibilityState === "visible") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification("Incoming call — PMS", {
      body: `${callerName} started a ${media} call${channelLabel ? ` in ${channelLabel}` : ""}.`,
      tag: "pms-voicelink-ring",
    });
  } catch {
    /* ignore */
  }
}

export function VoiceLinkProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [callFrame, setCallFrame] = useState<CallFrame | null>(null);
  const [vlBusy, setVlBusy] = useState<"audio" | "video" | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [ringCountdown, setRingCountdown] = useState(RING_TIMEOUT_MS / 1000);

  const callFrameRef = useRef<CallFrame | null>(null);
  useEffect(() => { callFrameRef.current = callFrame; }, [callFrame]);

  const incomingRef = useRef<IncomingCall | null>(null);
  useEffect(() => { incomingRef.current = incomingCall; }, [incomingCall]);

  const applyInvite = useCallback((payload: IncomingCall) => {
    if (callFrameRef.current) return;
    setIncomingCall((prev) => {
      if (
        prev &&
        prev.channelId === payload.channelId &&
        prev.callerName === payload.callerName &&
        prev.media === payload.media &&
        (prev.channelName ?? "") === (payload.channelName ?? "")
      ) {
        return prev;
      }
      return payload;
    });
  }, []);

  /** Close call UI, clear local ring, server pending invite, and broadcast invite-clear for this channel. */
  const clearCallUiAndServerInvites = useCallback(async (channelId: number | undefined) => {
    setCallFrame(null);
    setIncomingCall(null);
    try {
      await apiRequest("POST", "/api/chat/pending-invite/dismiss", {});
    } catch {
      /* ignore */
    }
    if (channelId != null) {
      try {
        await apiRequest("POST", "/api/chat/call-invite-clear-channel", { channelId });
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.data?.type === "vl-left") {
        const ch = callFrameRef.current?.channelId;
        void clearCallUiAndServerInvites(ch);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [clearCallUiAndServerInvites]);

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
        if (data.type === "call_invite_cleared" && data.channelId != null) {
          setIncomingCall((prev) => (prev?.channelId === data.channelId ? null : prev));
          return;
        }
        if (data.type === "incoming_call" && data.channelId != null) {
          if (callFrameRef.current) return;
          applyInvite({
            channelId: data.channelId,
            channelName: data.channelName,
            callerName: data.callerName ?? "Someone",
            media: (data.media as "audio" | "video") ?? "audio",
          });
        }
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => {};
    return () => ws.close();
  }, [userId, applyInvite]);

  // Polling fallback — catches invites when WebSocket upgrade fails (nginx, VPN, etc.)
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || callFrameRef.current) return;
      try {
        const res = await fetch("/api/chat/pending-invite", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as { invite: IncomingCall | null };
        if (j.invite && !callFrameRef.current) {
          applyInvite(j.invite);
        }
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [userId, applyInvite]);

  useEffect(() => {
    if (!incomingCall) {
      setRingCountdown(RING_TIMEOUT_MS / 1000);
      return;
    }
    const ch = incomingCall.channelName ? `#${incomingCall.channelName}` : "";
    maybeDesktopNotify(incomingCall.callerName, ch, incomingCall.media);
    setRingCountdown(RING_TIMEOUT_MS / 1000);

    const interval = setInterval(() => {
      setRingCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          void fetch("/api/chat/pending-invite/dismiss", { method: "POST", credentials: "include" }).catch(() => {});
          setIncomingCall(null);
          return RING_TIMEOUT_MS / 1000;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [incomingCall]);

  const dismissIncoming = useCallback(async () => {
    setIncomingCall(null);
    try {
      await apiRequest("POST", "/api/chat/pending-invite/dismiss", {});
    } catch {
      /* ignore */
    }
  }, []);

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
        setIncomingCall(null);
        setCallFrame({ url: data.url, media, channelId, channelName });
      } catch {
        toast({ title: "VoiceLink error", description: "Network error. Please try again.", variant: "destructive" });
      } finally {
        setVlBusy(null);
      }
    },
    [toast],
  );

  const closeCall = useCallback(() => {
    const ch = callFrameRef.current?.channelId;
    void clearCallUiAndServerInvites(ch);
  }, [clearCallUiAndServerInvites]);

  const iframeAllow = useMemo(() => {
    if (!callFrame?.url) {
      return "microphone *; camera *; display-capture *; autoplay; fullscreen *; encrypted-media *";
    }
    try {
      const o = new URL(callFrame.url).origin;
      return `microphone ${o}; camera ${o}; display-capture ${o}; autoplay; fullscreen ${o}; encrypted-media ${o}`;
    } catch {
      return "microphone *; camera *; display-capture *; autoplay; fullscreen *; encrypted-media *";
    }
  }, [callFrame?.url]);

  const joinIncoming = useCallback(async () => {
    if (!incomingRef.current) return;
    const { channelId, media, channelName } = incomingRef.current;
    await dismissIncoming();
    await openVoiceLink(channelId, media, channelName);
  }, [dismissIncoming, openVoiceLink]);

  return (
    <VoiceLinkContext.Provider value={{ callFrame, vlBusy, openVoiceLink, closeCall }}>
      {children}

      {/* App-wide incoming call — fixed top strip (above sidebar / header) */}
      {incomingCall && !callFrame && (
        <div
          className="fixed top-0 left-0 right-0 z-[100] flex flex-wrap items-center gap-3 border-b border-primary/40 bg-gradient-to-r from-primary/20 via-primary/10 to-background px-4 py-3 shadow-lg backdrop-blur-sm"
          role="alert"
          aria-live="assertive"
        >
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
          </span>
          <Phone className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1 basis-[min(100%,12rem)]">
            <p className="text-sm font-semibold leading-tight">Incoming call</p>
            <p className="text-xs text-muted-foreground leading-snug sm:text-sm">
              <span className="font-medium text-foreground">{incomingCall.callerName}</span>
              {" "}started a <span className="capitalize">{incomingCall.media}</span> call
              {incomingCall.channelName ? (
                <>
                  {" "}in <span className="font-medium text-foreground">#{incomingCall.channelName}</span>
                </>
              ) : null}
              . Join with audio/video in PMS.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">{ringCountdown}s</span>
            <Button size="sm" className="gap-1.5" onClick={joinIncoming}>
              <Video className="h-4 w-4" />
              Join call
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={dismissIncoming}>
              <X className="h-4 w-4" />
              Decline
            </Button>
          </div>
        </div>
      )}

      {callFrame && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-black">
          <div className="flex items-center justify-between border-b border-white/10 bg-black/70 px-4 py-2 backdrop-blur-sm shrink-0">
            <div className="flex items-center gap-2 text-sm text-white/80">
              {callFrame.media === "video" ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
              <span className="capitalize">{callFrame.media} call</span>
              {callFrame.channelName ? (
                <span className="text-white/50">· #{callFrame.channelName}</span>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              onClick={closeCall}
            >
              ✕ Leave &amp; Close
            </button>
          </div>
          <iframe
            key={callFrame.url}
            src={callFrame.url}
            className="flex-1 w-full border-0"
            allow={iframeAllow}
            title="VoiceLink call"
          />
        </div>
      )}
    </VoiceLinkContext.Provider>
  );
}
