import { format, isValid, parseISO } from "date-fns";

/** Preset keys stored in `company_settings.timecard_date_display_format` */
export const TIMECARD_DATE_FORMAT_PRESETS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;
export type TimecardDateFormatPreset = (typeof TIMECARD_DATE_FORMAT_PRESETS)[number];

const PRESET_TO_DATE_FNS: Record<TimecardDateFormatPreset, string> = {
  "DD/MM/YYYY": "dd/MM/yyyy",
  "MM/DD/YYYY": "MM/dd/yyyy",
  "YYYY-MM-DD": "yyyy-MM-dd",
};

function normalizePreset(p: string | null | undefined): TimecardDateFormatPreset {
  const t = (p || "").trim();
  if (t === "MM/DD/YYYY" || t === "YYYY-MM-DD" || t === "DD/MM/YYYY") return t;
  return "DD/MM/YYYY";
}

export function timecardDateFormatToDateFns(preset: string | null | undefined): string {
  return PRESET_TO_DATE_FNS[normalizePreset(preset)];
}

/** `ymd` is `yyyy-MM-dd` (time_entries.log_date). */
export function formatYmdForTimecardDisplay(ymd: string, preset: string | null | undefined): string {
  const d = parseISO(ymd);
  if (!isValid(d)) return ymd;
  return format(d, timecardDateFormatToDateFns(preset));
}
