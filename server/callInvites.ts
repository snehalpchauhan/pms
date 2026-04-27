/**
 * Short-lived in-memory call invites for polling fallback when WebSockets
 * are blocked or misconfigured. Cleared on expiry, dismiss, or overwrite.
 */
export type CallInvitePayload = {
  channelId: number;
  channelName: string;
  callerName: string;
  media: "audio" | "video";
};

type StoredInvite = CallInvitePayload & { expiresAt: number };

const byUser = new Map<number, StoredInvite>();

const DEFAULT_TTL_MS = 60_000;

export function publishCallInvites(
  userIds: number[],
  excludeUserId: number,
  payload: CallInvitePayload,
  ttlMs = DEFAULT_TTL_MS,
): void {
  const expiresAt = Date.now() + ttlMs;
  for (const uid of userIds) {
    if (uid === excludeUserId) continue;
    byUser.set(uid, { ...payload, expiresAt });
  }
}

export function peekInvite(userId: number): CallInvitePayload | null {
  const inv = byUser.get(userId);
  if (!inv || inv.expiresAt < Date.now()) {
    byUser.delete(userId);
    return null;
  }
  return {
    channelId: inv.channelId,
    channelName: inv.channelName,
    callerName: inv.callerName,
    media: inv.media,
  };
}

export function dismissInvite(userId: number): void {
  byUser.delete(userId);
}

/** Remove pending invites for this channel (call ended / host closed UI). */
export function clearInvitesForChannel(channelId: number): void {
  const toDelete: number[] = [];
  byUser.forEach((inv, uid) => {
    if (inv.channelId === channelId) toDelete.push(uid);
  });
  for (const uid of toDelete) byUser.delete(uid);
}
