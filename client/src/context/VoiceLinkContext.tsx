/**
 * VoiceLinkContext — global audio/video call state for PMS.
 *
 * - WebSocket `subscribeUser` for instant rings.
 * - GET /api/chat/pending-invite polling every 3.5s as fallback.
 * - Full-width top banner for incoming calls.
 * - VoiceLink call opens as a FLOATING draggable window (not fullscreen)
 *   so the messages pane stays visible.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { Phone, Video, X, Minus, Maximize2, Minimize2, GripHorizontal } from "lucide-react";
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

// Default floating window size
const DEFAULT_W = 480;
const DEFAULT_H = 360;

function maybeDesktopNotify(callerName: string, channelLabel: string, media: string) {
  if (typeof Notification === "undefined") return;
  if (document.visibilityState === "visible") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification("Incoming call — PMS", {
      body: `${callerName} started a ${media} call${channelLabel ? ` in ${channelLabel}` : ""}.`,
      tag: "pms-voicelink-ring",
    });
  } catch { /* ignore */ }
}

// ─── Draggable floating window ─────────────────────────────────────────────

interface FloatPos { x: number; y: number }

function useFloatDrag(ref: React.RefObject<HTMLDivElement | null>) {
  const pos = useRef<FloatPos>({ x: window.innerWidth - DEFAULT_W - 24, y: 80 });
  const dragging = useRef(false);
  const origin = useRef<{ mx: number; my: number; px: number; py: number }>({ mx: 0, my: 0, px: 0, py: 0 });

  const onMouseDown = useCallback((e: ReactMouseEvent) => {
    dragging.current = true;
    origin.current = { mx: e.clientX, my: e.clientY, px: pos.current.x, py: pos.current.y };
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMove = (e: globalThis.MouseEvent) => {
      if (!dragging.current || !ref.current) return;
      const dx = e.clientX - origin.current.mx;
      const dy = e.clientY - origin.current.my;
      const nx = Math.max(0, Math.min(window.innerWidth - DEFAULT_W, origin.current.px + dx));
      const ny = Math.max(0, Math.min(window.innerHeight - 48, origin.current.py + dy));
      pos.current = { x: nx, y: ny };
      ref.current.style.left = `${nx}px`;
      ref.current.style.top = `${ny}px`;
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [ref]);

  return { onMouseDown, initialPos: pos.current };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function VoiceLinkProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [callFrame, setCallFrame] = useState<CallFrame | null>(null);
  const [vlBusy, setVlBusy] = useState<"audio" | "video" | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [ringCountdown, setRingCountdown] = useState(RING_TIMEOUT_MS / 1000);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const callFrameRef = useRef<CallFrame | null>(null);
  useEffect(() => { callFrameRef.current = callFrame; }, [callFrame]);

  const incomingRef = useRef<IncomingCall | null>(null);
  useEffect(() => { incomingRef.current = incomingCall; }, [incomingCall]);

  const floatRef = useRef<HTMLDivElement>(null);
  const { onMouseDown: onDragStart, initialPos } = useFloatDrag(floatRef);

  const applyInvite = useCallback((payload: IncomingCall) => {
    if (callFrameRef.current) return;
    setIncomingCall((prev) => {
      if (
        prev &&
        prev.channelId === payload.channelId &&
        prev.callerName === payload.callerName &&
        prev.media === payload.media &&
        (prev.channelName ?? "") === (payload.channelName ?? "")
      ) return prev;
      return payload;
    });
  }, []);

  const clearCallUiAndServerInvites = useCallback(async (channelId: number | undefined) => {
    setCallFrame(null);
    setMinimized(false);
    setExpanded(false);
    setIncomingCall(null);
    try { await apiRequest("POST", "/api/chat/pending-invite/dismiss", {}); } catch { /* ignore */ }
    if (channelId != null) {
      try { await apiRequest("POST", "/api/chat/call-invite-clear-channel", { channelId }); } catch { /* ignore */ }
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
    ws.onopen = () => { ws.send(JSON.stringify({ subscribeUser: userId })); };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as {
          type?: string; channelId?: number; channelName?: string;
          callerName?: string; media?: string;
        };
        if (data.type === "call_invite_cleared" && data.channelId != null) {
          setIncomingCall((prev) => (prev?.channelId === data.channelId ? null : prev));
          return;
        }
        if (data.type === "incoming_call" && data.channelId != null) {
          if (callFrameRef.current) return;
          applyInvite({
            channelId: data.channelId, channelName: data.channelName,
            callerName: data.callerName ?? "Someone",
            media: (data.media as "audio" | "video") ?? "audio",
          });
        }
      } catch { /* ignore */ }
    };
    ws.onerror = () => {};
    return () => ws.close();
  }, [userId, applyInvite]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || callFrameRef.current) return;
      try {
        const res = await fetch("/api/chat/pending-invite", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as { invite: IncomingCall | null };
        if (j.invite && !callFrameRef.current) applyInvite(j.invite);
      } catch { /* ignore */ }
    };
    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [userId, applyInvite]);

  useEffect(() => {
    if (!incomingCall) { setRingCountdown(RING_TIMEOUT_MS / 1000); return; }
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
    try { await apiRequest("POST", "/api/chat/pending-invite/dismiss", {}); } catch { /* ignore */ }
  }, []);

  const openVoiceLink = useCallback(
    async (channelId: number, media: "audio" | "video", channelName?: string) => {
      if (callFrameRef.current) {
        toast({ title: "Already in a call", description: "Leave your current call first.", variant: "destructive" });
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
        setMinimized(false);
        setExpanded(false);
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
    if (!callFrame?.url) return "microphone *; camera *; display-capture *; autoplay; fullscreen *; encrypted-media *";
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

  // Expanded = full screen; normal = floating window; minimized = title bar only
  const floatStyle = expanded
    ? { position: "fixed" as const, inset: 0 }
    : {
        position: "fixed" as const,
        left: `${initialPos.x}px`,
        top: `${initialPos.y}px`,
        width: `${DEFAULT_W}px`,
        height: minimized ? "44px" : `${DEFAULT_H}px`,
      };

  return (
    <VoiceLinkContext.Provider value={{ callFrame, vlBusy, openVoiceLink, closeCall }}>
      {children}

      {/* ── Incoming call banner — top strip ── */}
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
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{incomingCall.callerName}</span>
              {" "}started a <span className="capitalize">{incomingCall.media}</span> call
              {incomingCall.channelName && (
                <> in <span className="font-medium text-foreground">#{incomingCall.channelName}</span></>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">{ringCountdown}s</span>
            <Button size="sm" className="gap-1.5" onClick={joinIncoming}>
              <Video className="h-4 w-4" /> Join call
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={dismissIncoming}>
              <X className="h-4 w-4" /> Decline
            </Button>
          </div>
        </div>
      )}

      {/* ── Floating call window ── */}
      {callFrame && (
        <div
          ref={floatRef}
          className="z-[90] flex flex-col overflow-hidden rounded-xl border border-white/15 bg-black shadow-2xl"
          style={{ ...floatStyle, resize: expanded ? "none" : "both", minWidth: 320, minHeight: 44 }}
        >
          {/* Title bar — drag handle */}
          <div
            className={`flex shrink-0 select-none items-center gap-2 bg-zinc-900 px-3 py-2 ${expanded ? "" : "cursor-grab active:cursor-grabbing"}`}
            onMouseDown={expanded ? undefined : onDragStart}
          >
            <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-white/30" />
            {callFrame.media === "video" ? <Video className="h-4 w-4 text-white/70" /> : <Phone className="h-4 w-4 text-white/70" />}
            <span className="flex-1 truncate text-xs font-medium text-white/80">
              {callFrame.channelName ? `#${callFrame.channelName} · ` : ""}
              <span className="capitalize">{callFrame.media}</span> call
            </span>
            {/* Minimize */}
            <button
              type="button"
              title={minimized ? "Restore" : "Minimize"}
              className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
              onClick={() => { setMinimized((v) => !v); setExpanded(false); }}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            {/* Expand / restore */}
            <button
              type="button"
              title={expanded ? "Restore window" : "Expand to full screen"}
              className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
              onClick={() => { setExpanded((v) => !v); setMinimized(false); }}
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            {/* Close */}
            <button
              type="button"
              title="Leave & close"
              className="rounded p-1 text-white/50 hover:bg-red-500/80 hover:text-white"
              onClick={closeCall}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* iframe — hidden when minimized */}
          {!minimized && (
            <iframe
              key={callFrame.url}
              src={callFrame.url}
              className="flex-1 w-full border-0 bg-black"
              allow={iframeAllow}
              title="VoiceLink call"
            />
          )}
        </div>
      )}
    </VoiceLinkContext.Provider>
  );
}
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

