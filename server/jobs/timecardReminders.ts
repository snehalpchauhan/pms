import { and, eq, gte, lte, sql } from "drizzle-orm";
import { addDays, format, isWeekend, startOfWeek, subDays } from "date-fns";
import { db } from "../db";
import { sendEmail } from "../email";
import { timeEntries, users } from "@shared/schema";

const REQUIRED_HOURS_PER_DAY = 8;

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

