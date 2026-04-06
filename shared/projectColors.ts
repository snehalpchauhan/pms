/**
 * Preset project colors: Tailwind class stored in DB + matching hex for UI swatches
 * (inline hex guarantees all presets render even if CSS purging misses a class).
 */
export const PROJECT_COLOR_PRESETS = [
  { tw: "bg-slate-600", hex: "#475569" },
  { tw: "bg-blue-500", hex: "#3b82f6" },
  { tw: "bg-indigo-500", hex: "#6366f1" },
  { tw: "bg-violet-500", hex: "#8b5cf6" },
  { tw: "bg-fuchsia-500", hex: "#d946ef" },
  { tw: "bg-rose-500", hex: "#f43f5e" },
  { tw: "bg-orange-500", hex: "#f97316" },
  { tw: "bg-amber-500", hex: "#f59e0b" },
  { tw: "bg-emerald-500", hex: "#10b981" },
  { tw: "bg-cyan-500", hex: "#06b6d4" },
] as const;

export const PROJECT_COLOR_SWATCHES = PROJECT_COLOR_PRESETS.map((p) => p.tw);

export type ProjectColorSwatch = (typeof PROJECT_COLOR_SWATCHES)[number];

const HEX_6 = /^#[0-9a-f]{6}$/i;
const HEX_3 = /^#[0-9a-f]{3}$/i;

/** Normalize 3- or 6-digit hex to lowercase `#rrggbb`, or null if invalid. */
export function normalizeHexColor(input: string): string | null {
  const s = input.trim();
  if (HEX_6.test(s)) return s.toLowerCase();
  if (HEX_3.test(s)) {
    const h = s.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return null;
}

export function isValidProjectColor(value: string): boolean {
  const v = value.trim();
  if (/^bg-[a-z0-9-]+$/.test(v)) return true;
  return normalizeHexColor(v) !== null;
}

/** Returns a safe stored value: hex, a tailwind `bg-*` class, or default preset. */
export function sanitizeProjectColor(value: string): string {
  const v = value.trim();
  const hex = normalizeHexColor(v);
  if (hex) return hex;
  if (/^bg-[a-z0-9-]+$/.test(v)) return v;
  return "bg-blue-500";
}

/** Sidebar chip: either a Tailwind class or inline hex background. */
export function resolveProjectChipAppearance(value: string | undefined): {
  tailwindClass: string;
  style?: { backgroundColor: string };
} {
  const raw = typeof value === "string" ? value.trim() : "";
  const hex = normalizeHexColor(raw);
  if (hex) {
    return { tailwindClass: "", style: { backgroundColor: hex } };
  }
  if (/^bg-[a-z0-9-]+$/.test(raw)) {
    return { tailwindClass: raw };
  }
  return { tailwindClass: "bg-blue-500" };
}
