/**
 * Build an employee-style timecard digest for one staff member (by their login email)
 * but send it to a different inbox (QA / admin preview).
 *
 * Usage:
 *   npx tsx server/scripts/send-employee-digest-impersonate.ts vanshita@vnnovate.com snehal@vnnovate.com weekly
 *   npx tsx server/scripts/send-employee-digest-impersonate.ts vanshita@vnnovate.com snehal@vnnovate.com monthly
 *   npx tsx server/scripts/send-employee-digest-impersonate.ts vanshita@vnnovate.com snehal@vnnovate.com missed
 *   npx tsx server/scripts/send-employee-digest-impersonate.ts vanshita@vnnovate.com snehal@vnnovate.com missed 2026-04-27
 *     (optional 5th arg YYYY-MM-DD = “as if cron runs that day”, weekday; use on weekends)
 *
 * Modes:
 *   weekly  — last completed ISO week (same window as scheduled employee weekly)
 *   monthly — previous calendar month
 *   missed  — previous business day, only if that person was under 8h (otherwise exits with message)
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { format, isValid, isWeekend, parseISO } from "date-fns";
import { formatYmdForTimecardDisplay } from "@shared/timecardDateFormat";
import { db } from "../db";
import { sendEmail } from "../email";
import { storage } from "../storage";
import { users } from "@shared/schema";
import {
  buildDigestEmailContent,
  buildEmployeeDailyMissComplianceAddon,
  getDigestRowsForRange,
  lastCompletedIsoWeekRange,
  previousBusinessDay,
  previousCalendarMonthRange,
} from "../jobs/timecardDigest";

const REQUIRED = 8;

function loadEnvFromCwd(): void {
  if (process.env.DATABASE_URL) return;
  const p = resolve(process.cwd(), ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.replace(/\r$/, "").trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

async function main(): Promise<void> {
  loadEnvFromCwd();
  if (!process.env.DATABASE_URL) {
    console.error("error: DATABASE_URL not set");
    process.exit(1);
  }

  const asEmail = process.argv[2]?.trim().toLowerCase();
  const deliverTo = process.argv[3]?.trim().toLowerCase();
  const mode = (process.argv[4]?.trim().toLowerCase() ?? "weekly") as "weekly" | "monthly" | "missed";

  if (!asEmail || !deliverTo) {
    console.error(
      "usage: npx tsx server/scripts/send-employee-digest-impersonate.ts <employee-email> <deliver-to-email> [weekly|monthly|missed] [YYYY-MM-DD]",
    );
    process.exit(1);
  }

  if (!["weekly", "monthly", "missed"].includes(mode)) {
    console.error("error: mode must be weekly, monthly, or missed");
    process.exit(1);
  }

  const [u] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(sql`lower(${users.email}) = ${asEmail}`)
    .limit(1);

  if (!u?.email?.trim()) {
    console.error("error: no user found with email", asEmail);
    process.exit(1);
  }
  if (u.role !== "employee" && u.role !== "manager") {
    console.error("error: user must be employee or manager for this digest");
    process.exit(1);
  }

  const settings = await storage.getCompanySettings();
  const fmt = settings.timecardDateDisplayFormat ?? "DD/MM/YYYY";
  const now = new Date();

  let startYmd: string;
  let endYmd: string;
  let heading: string;
  let subBase: string;
  let subject: string;
  let listMode: "gaps-only" | "all-staff" = "all-staff";

  if (mode === "weekly") {
    const r = lastCompletedIsoWeekRange(now);
    startYmd = r.startYmd;
    endYmd = r.endYmd;
    const p1 = formatYmdForTimecardDisplay(startYmd, fmt);
    const p2 = formatYmdForTimecardDisplay(endYmd, fmt);
    heading = "PMS: Your weekly timecard";
    subBase = `Weekdays ${p1} – ${p2}`;
    subject = `PMS: [TEST] Weekly as ${u.name} — ${p1} – ${p2}`;
  } else if (mode === "monthly") {
    const r = previousCalendarMonthRange(now);
    startYmd = r.startYmd;
    endYmd = r.endYmd;
    const monthLabel = format(parseISO(startYmd), "MMMM yyyy");
    const p1 = formatYmdForTimecardDisplay(startYmd, fmt);
    const p2 = formatYmdForTimecardDisplay(endYmd, fmt);
    heading = "PMS: Your monthly timecard";
    subBase = `${monthLabel} (weekdays ${p1} – ${p2})`;
    subject = `PMS: [TEST] Monthly as ${u.name} — ${monthLabel}`;
  } else {
    const refArg = process.argv[5]?.trim();
    const clock =
      refArg && /^\d{4}-\d{2}-\d{2}$/.test(refArg) ? parseISO(`${refArg}T12:00:00`) : now;
    if (refArg && !isValid(clock)) {
      console.error("error: optional 5th argument must be a valid date YYYY-MM-DD");
      process.exit(1);
    }
    if (isWeekend(clock)) {
      console.error(
        "error: missed mode uses a weekday “clock” (or pass 5th arg YYYY-MM-DD as a Monday–Friday, e.g. when testing on weekends)",
      );
      process.exit(1);
    }
    const ymd = toYmd(previousBusinessDay(clock));
    startYmd = ymd;
    endYmd = ymd;
    const pDisp = formatYmdForTimecardDisplay(ymd, fmt);
    heading = "Timecard update required";
    subBase =
      "Your timecard for the date below is incomplete. Please follow the steps that apply to you.";
    subject = `PMS: [TEST] Incomplete as ${u.name} — ${pDisp}`;
    listMode = "gaps-only";
  }

  const onlyGap = mode === "missed";
  const allRows = await getDigestRowsForRange(startYmd, endYmd, { onlyRowsWithGap: onlyGap });
  const row = allRows.find((r) => r.email.toLowerCase() === asEmail);

  if (!row) {
    if (mode === "missed") {
      console.error(
        `error: ${asEmail} has no under-${REQUIRED}h gap on previous business day — nothing to send. Try: weekly or monthly`,
      );
    } else {
      console.error("error: could not build digest row for", asEmail);
    }
    process.exit(1);
  }

  const subheading =
    `[TEST] Deliver to ${deliverTo} — data for ${u.name} <${u.email.trim()}> (not their real inbox)\n` + subBase;

  const pDispRow =
    mode === "missed" ? formatYmdForTimecardDisplay(startYmd, fmt) : "";
  const day0 = row.days[0];
  const { text, html } = buildDigestEmailContent({
    rows: [row],
    dateDisplayPreset: fmt,
    periodStartYmd: startYmd,
    periodEndYmd: endYmd,
    heading,
    subheading,
    listMode,
    ...(mode === "missed" && day0
      ? {
          showAtAGlance: false as const,
          complianceAddon: buildEmployeeDailyMissComplianceAddon({
            dateDisplay: pDispRow,
            loggedHours: day0.hours,
            missingHours: Math.max(0, REQUIRED - day0.hours),
          }),
        }
      : {}),
  });

  const res = await sendEmail({ to: deliverTo, subject, text, html });
  if (!res.sent) {
    console.error("error:", res.reason);
    process.exit(1);
  }
  console.log("ok: sent to", deliverTo, res.brevoMessageId ? `brevoMessageId=${res.brevoMessageId}` : "");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
