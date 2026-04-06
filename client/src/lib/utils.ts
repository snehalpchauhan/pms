import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Two-letter initials from a display name: first letter of the first two words when there are
 * multiple words; otherwise the first two characters of the single word. Also used for project
 * rail chips. Falls back to username, then "?".
 */
export function getUserInitials(
  name: string | null | undefined,
  username: string | null | undefined,
): string {
  const n = name?.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const u = username?.trim();
  if (u) return u.slice(0, 2).toUpperCase();
  return "?";
}
