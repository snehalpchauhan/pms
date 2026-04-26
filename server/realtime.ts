import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

const wss = new WebSocketServer({ noServer: true });
const channelSubscribers = new Map<number, Set<WebSocket>>();

/** userId → set of open WebSocket connections for that user (global ring delivery). */
const userSubscribers = new Map<number, Set<WebSocket>>();

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

function subscribeUser(userId: number, ws: WebSocket) {
  let set = userSubscribers.get(userId);
  if (!set) {
    set = new Set();
    userSubscribers.set(userId, set);
  }
  set.add(ws);
  const cleanup = () => {
    set!.delete(ws);
    if (set!.size === 0) userSubscribers.delete(userId);
  };
  ws.once("close", cleanup);
  ws.once("error", cleanup);
}

function sendToWs(ws: WebSocket, payload: string) {
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(payload); } catch { /* ignore */ }
  }
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as { subscribe?: number; subscribeUser?: number };
      if (typeof msg.subscribe === "number" && Number.isInteger(msg.subscribe) && msg.subscribe > 0) {
        subscribeToChannel(msg.subscribe, ws);
      }
      if (typeof msg.subscribeUser === "number" && Number.isInteger(msg.subscribeUser) && msg.subscribeUser > 0) {
        subscribeUser(msg.subscribeUser, ws);
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
  set.forEach((ws) => sendToWs(ws, payload));
}

/**
 * Ring specific users directly (by userId) — works regardless of which view/
 * channel they currently have open.  callerUserId is excluded so the caller
 * doesn't ring themselves.
 */
export function notifyUsersCall(
  memberUserIds: number[],
  callerUserId: number,
  channelId: number,
  channelName: string,
  callerName: string,
  media: "audio" | "video",
) {
  const payload = JSON.stringify({ type: "incoming_call", channelId, channelName, callerName, media });
  for (const uid of memberUserIds) {
    if (uid === callerUserId) continue; // don't ring the caller
    const sockets = userSubscribers.get(uid);
    if (!sockets?.size) continue;
    sockets.forEach((ws) => sendToWs(ws, payload));
  }
}

/** Tell clients to hide incoming-call UI for this channel (call ended / cleared). */
export function notifyUsersInviteCleared(memberUserIds: number[], channelId: number) {
  const payload = JSON.stringify({ type: "call_invite_cleared", channelId });
  for (const uid of memberUserIds) {
    const sockets = userSubscribers.get(uid);
    if (!sockets?.size) continue;
    sockets.forEach((ws) => sendToWs(ws, payload));
  }
}

/** @deprecated Use notifyUsersCall for call events. Kept for channel-level fallback. */
export function notifyChannelCall(channelId: number, callerName: string, media: "audio" | "video") {
  const set = channelSubscribers.get(channelId);
  if (!set?.size) return;
  const payload = JSON.stringify({ type: "incoming_call", channelId, callerName, media });
  set.forEach((ws) => sendToWs(ws, payload));
}
