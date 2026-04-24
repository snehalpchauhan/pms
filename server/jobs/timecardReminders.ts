import { and, eq, gte, lte, sql } from "drizzle-orm";
import { addDays, format, isWeekend, startOfWeek, subDays } from "date-fns";
import { db } from "../db";
import { sendEmail } from "../email";
import { timeEntries, users } from "@shared/schema";

export const REQUIRED_HOURS_PER_DAY = 8;

function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Previous business day (Mon -> Fri). */
export function previousBusinessDay(from: Date): Date {
  let d = subDays(from, 1);
  while (isWeekend(d)) d = subDays(d, 1);
  return d;
}

type UserRow = { id: number; name: string; email: string | null; role: string };

async function getStaffWithEmail(): Promise<UserRow[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users);
  return rows.filter((u) => (u.role === "employee" || u.role === "manager") && Boolean(u.email?.trim()));
}

async function totalsForDate(logDate: string): Promise<Map<number, number>> {
  const rows = await db
    .select({
      userId: timeEntries.userId,
      total: sql<string>`coalesce(sum(${timeEntries.hours}), 0)::text`,
    })
    .from(timeEntries)
    .where(eq(timeEntries.logDate, logDate))
    .groupBy(timeEntries.userId);

  const out = new Map<number, number>();
  for (const r of rows) out.set(r.userId, Number(r.total) || 0);
  return out;
}

async function totalsByUserByDate(startDate: string, endDate: string): Promise<Map<number, Map<string, number>>> {
  const rows = await db
    .select({
      userId: timeEntries.userId,
      logDate: timeEntries.logDate,
      total: sql<string>`coalesce(sum(${timeEntries.hours}), 0)::text`,
    })
    .from(timeEntries)
    .where(and(gte(timeEntries.logDate, startDate), lte(timeEntries.logDate, endDate)))
    .groupBy(timeEntries.userId, timeEntries.logDate);

  const byUser = new Map<number, Map<string, number>>();
  for (const r of rows) {
    const inner = byUser.get(r.userId) ?? new Map<string, number>();
    inner.set(r.logDate, Number(r.total) || 0);
    byUser.set(r.userId, inner);
  }
  return byUser;
}

function missingLabel(dateYmd: string, hours: number): string {
  if (hours <= 0) return `${dateYmd}: missing (0h)`;
  return `${dateYmd}: ${hours.toFixed(2)}h (need ${REQUIRED_HOURS_PER_DAY}h)`;
}

export async function sendDailyMissingTimecardEmails(now = new Date()): Promise<{ emailed: number; skipped: number }> {
  // If today is Sat/Sun, do nothing.
  if (isWeekend(now)) return { emailed: 0, skipped: 0 };

  const target = previousBusinessDay(now);
  const logDate = toYmd(target);
  const totals = await totalsForDate(logDate);
  const staff = await getStaffWithEmail();

  let emailed = 0;
  let skipped = 0;

  for (const u of staff) {
    const hours = totals.get(u.id) ?? 0;
    if (hours >= REQUIRED_HOURS_PER_DAY) continue;

    const subject = `Missing timecard for ${logDate}`;
    const text =
      `Hi ${u.name},\n\n` +
      `Your timecard for ${logDate} is incomplete.\n` +
      `Logged: ${hours.toFixed(2)}h\n` +
      `Required: ${REQUIRED_HOURS_PER_DAY}h\n\n` +
      `Please update your timecard.\n`;

    try {
      const res = await sendEmail({ to: u.email!.trim(), subject, text });
      if (res.sent) emailed++;
      else skipped++;
    } catch (err) {
      skipped++;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[timecard-reminder] daily email failed:", { userId: u.id, to: u.email, msg });
    }
  }

  return { emailed, skipped };
}

/** All employee/manager staff with gaps (< 8h) on at least one weekday Mon–end of this week, with per-date detail. */
export async function getWeeklyTimecardGaps(
  now = new Date(),
): Promise<{
  weekStartYmd: string;
  endYmd: string;
  weekdays: string[];
  rows: { name: string; email: string; gaps: { dateYmd: string; hours: number }[] }[];
}> {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const startYmd = toYmd(weekStart);
  const endYmd = toYmd(now);
  const staff = await getStaffWithEmail();
  const totals = await totalsByUserByDate(startYmd, endYmd);
  const days: string[] = [];
  for (let d = weekStart; toYmd(d) <= endYmd; d = addDays(d, 1)) {
    if (!isWeekend(d)) days.push(toYmd(d));
  }
  const rows: { name: string; email: string; gaps: { dateYmd: string; hours: number }[] }[] = [];
  for (const u of staff) {
    const byDate = totals.get(u.id) ?? new Map<string, number>();
    const gaps: { dateYmd: string; hours: number }[] = [];
    for (const day of days) {
      const h = byDate.get(day) ?? 0;
      if (h < REQUIRED_HOURS_PER_DAY) gaps.push({ dateYmd: day, hours: h });
    }
    if (gaps.length === 0) continue;
    rows.push({ name: u.name, email: u.email!.trim(), gaps });
  }
  return { weekStartYmd: startYmd, endYmd, weekdays: days, rows };
}

export function formatWeeklyTimecardGapsText(data: Awaited<ReturnType<typeof getWeeklyTimecardGaps>>): string {
  const { weekStartYmd, endYmd, rows } = data;
  if (rows.length === 0) {
    return `No missing or incomplete timecards (below ${REQUIRED_HOURS_PER_DAY}h) for the selected weekdays in this week (${weekStartYmd} – ${endYmd}).\n`;
  }
  const lines: string[] = [
    `Week ${weekStartYmd} to ${endYmd} (weekdays only; ${REQUIRED_HOURS_PER_DAY}h required per day)`,
    "",
    "Staff with gaps:",
    "",
  ];
  for (const r of rows) {
    lines.push(`• ${r.name} (${r.email})`);
    for (const g of r.gaps) {
      if (g.hours <= 0) lines.push(`  - ${g.dateYmd}: missing (0h)`);
      else lines.push(`  - ${g.dateYmd}: ${g.hours.toFixed(2)}h (need ${REQUIRED_HOURS_PER_DAY}h)`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * One email to an admin: everyone (employee/manager) with a weekday gap Mon–today this week, with dates and hours.
 * Used by the daily admin cron and by `server/scripts/send-weekly-timecard-report.ts` flow.
 */
export async function sendAdminTimecardSummaryEmail(
  to: string,
  now = new Date(),
): Promise<{ sent: boolean; reason?: string; rowsWithGaps: number; brevoMessageId?: string }> {
  const data = await getWeeklyTimecardGaps(now);
  const text = formatWeeklyTimecardGapsText(data);
  const subject = `PMS: Daily timecard summary — week to date (${data.weekStartYmd} – ${data.endYmd})`;
  const res = await sendEmail({ to: to.trim(), subject, text: `${text}\n` });
  return { sent: res.sent, reason: res.reason, brevoMessageId: res.brevoMessageId, rowsWithGaps: data.rows.length };
}

export async function sendWeeklyMissingTimecardEmails(now = new Date()): Promise<{ emailed: number; skipped: number }> {
  // Only meaningful on Fridays; if called other days, still computes "this week so far".
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const startYmd = toYmd(weekStart);
  const endYmd = toYmd(now);

  const staff = await getStaffWithEmail();
  const totals = await totalsByUserByDate(startYmd, endYmd);

  let emailed = 0;
  let skipped = 0;

  // Build list of weekdays between start..end (inclusive)
  const days: string[] = [];
  for (let d = weekStart; toYmd(d) <= endYmd; d = addDays(d, 1)) {
    if (!isWeekend(d)) days.push(toYmd(d));
  }

  for (const u of staff) {
    const byDate = totals.get(u.id) ?? new Map<string, number>();
    const missing: string[] = [];
    for (const day of days) {
      const h = byDate.get(day) ?? 0;
      if (h < REQUIRED_HOURS_PER_DAY) missing.push(missingLabel(day, h));
    }
    if (missing.length === 0) continue;

    const subject = `Weekly timecard reminder (${startYmd} - ${endYmd})`;
    const text =
      `Hi ${u.name},\n\n` +
      `You have missing or incomplete timecards for this week:\n\n` +
      missing.map((m) => `- ${m}`).join("\n") +
      `\n\nRequired: ${REQUIRED_HOURS_PER_DAY}h per weekday.\n` +
      `Please update your timecards.\n`;

    try {
      const res = await sendEmail({ to: u.email!.trim(), subject, text });
      if (res.sent) emailed++;
      else skipped++;
    } catch (err) {
      skipped++;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[timecard-reminder] weekly email failed:", { userId: u.id, to: u.email, msg });
    }
  }

  return { emailed, skipped };
}

