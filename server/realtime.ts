import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

const wss = new WebSocketServer({ noServer: true });
const channelSubscribers = new Map<number, Set<WebSocket>>();

function subscribeToChannel(channelId: number, ws: WebSocket) {
  let set = channelSubscribers.get(channelId);
  if (!set) {
    set = new Set();
    channelSubscribers.set(channelId, set);
  }
  set.add(ws);
  const cleanup = () => {
    set!.delete(ws);
    if (set!.size === 0) channelSubscribers.delete(channelId);
  };
  ws.once("close", cleanup);
  ws.once("error", cleanup);
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as { subscribe?: number };
      if (typeof msg.subscribe === "number" && Number.isInteger(msg.subscribe) && msg.subscribe > 0) {
        subscribeToChannel(msg.subscribe, ws);
      }
    } catch {
      /* ignore malformed */
    }
  });
});

/** Attach WebSocket upgrade handler for /api/ws/chat (same host as the app). */
export function attachChatWebSocket(server: Server) {
  server.on("upgrade", (request, socket, head) => {
    const host = request.headers.host ?? "localhost";
    let pathname = "";
    try {
      pathname = new URL(request.url || "", `http://${host}`).pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/api/ws/chat") return;

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });
}

/** Notify subscribers that messages for this channel may have changed. */
export function notifyChannelMessages(channelId: number) {
  const set = channelSubscribers.get(channelId);
  if (!set?.size) return;
  const payload = JSON.stringify({ type: "channel_messages", channelId });
  set.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
      } catch {
        /* ignore */
      }
    }
  });
}

/** Broadcast an incoming-call ring to everyone subscribed to this channel. */
export function notifyChannelCall(channelId: number, callerName: string, media: "audio" | "video") {
  const set = channelSubscribers.get(channelId);
  if (!set?.size) return;
  const payload = JSON.stringify({ type: "incoming_call", channelId, callerName, media });
  set.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(payload); } catch { /* ignore */ }
    }
  });
}
