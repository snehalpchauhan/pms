import { and, eq, gte, lte, sql } from "drizzle-orm";
import { addDays, format, isWeekend, startOfWeek, subDays } from "date-fns";
import { formatYmdForTimecardDisplay } from "@shared/timecardDateFormat";
import { db } from "../db";
import { sendEmail } from "../email";
import { storage } from "../storage";
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

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildTimecardSummaryContent(
  data: Awaited<ReturnType<typeof getWeeklyTimecardGaps>>,
  dateDisplayPreset: string,
): { text: string; html: string } {
  const wkStart = formatYmdForTimecardDisplay(data.weekStartYmd, dateDisplayPreset);
  const wkEnd = formatYmdForTimecardDisplay(data.endYmd, dateDisplayPreset);
  if (data.rows.length === 0) {
    const line = `No missing or incomplete timecards (below ${REQUIRED_HOURS_PER_DAY}h) for weekdays this week (${wkStart} – ${wkEnd}).`;
    return {
      text: `${line}\n`,
      html: `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;font-size:14px"><p>${escHtml(line)}</p></body></html>`,
    };
  }
  const textLines: string[] = [
    `Week to date: ${wkStart} – ${wkEnd} (weekdays only; ${REQUIRED_HOURS_PER_DAY}h required per day)`,
    "",
    "Member | Email | Date | Hours logged | Status",
    "—".repeat(70),
  ];
  const htmlRows: string[] = [];
  for (const r of data.rows) {
    for (const g of r.gaps) {
      const d = formatYmdForTimecardDisplay(g.dateYmd, dateDisplayPreset);
      const status = g.hours <= 0 ? "Missing (0h)" : `Below ${REQUIRED_HOURS_PER_DAY}h (logged ${g.hours.toFixed(2)}h)`;
      textLines.push(
        `${r.name} | ${r.email} | ${d} | ${g.hours.toFixed(2)} | ${status}`,
      );
      htmlRows.push(
        `<tr><td>${escHtml(r.name)}</td><td>${escHtml(r.email)}</td><td>${escHtml(d)}</td><td style="text-align:right">${g.hours.toFixed(2)}</td><td>${escHtml(status)}</td></tr>`,
      );
    }
  }
  const text = textLines.join("\n") + "\n";
  const html = `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,Segoe UI,sans-serif;font-size:14px;color:#111">
  <h2 style="font-size:16px;margin:0 0 12px">PMS timecard summary</h2>
  <p style="margin:0 0 12px">Week to date: <strong>${escHtml(wkStart)}</strong> – <strong>${escHtml(wkEnd)}</strong> (weekdays; ${REQUIRED_HOURS_PER_DAY}h required per day)</p>
  <table border="1" cellspacing="0" cellpadding="8" style="border-collapse:collapse;max-width:100%;border-color:#ccc">
    <thead>
      <tr style="background:#f4f4f5">
        <th align="left">Member</th>
        <th align="left">Email</th>
        <th align="left">Date</th>
        <th align="right">Hours logged</th>
        <th align="left">Status</th>
      </tr>
    </thead>
    <tbody>
      ${htmlRows.join("\n")}
    </tbody>
  </table>
  <p style="margin:16px 0 0;font-size:12px;color:#666">PMS</p>
</body>
</html>`;
  return { text, html };
}

/** Sends one message to all addresses (Brevo multi-recipient). */
export async function sendTimecardAdminSummaryEmail(
  recipients: string[],
  now: Date,
  dateDisplayPreset: string,
): Promise<{ sent: boolean; reason?: string; rowsWithGaps: number; brevoMessageId?: string }> {
  const data = await getWeeklyTimecardGaps(now);
  const { text, html } = buildTimecardSummaryContent(data, dateDisplayPreset);
  const wkStart = formatYmdForTimecardDisplay(data.weekStartYmd, dateDisplayPreset);
  const wkEnd = formatYmdForTimecardDisplay(data.endYmd, dateDisplayPreset);
  const subject = `PMS: Timecard summary — week to date (${wkStart} – ${wkEnd})`;
  const res = await sendEmail({ to: recipients, subject, text, html });
  return { sent: res.sent, reason: res.reason, brevoMessageId: res.brevoMessageId, rowsWithGaps: data.rows.length };
}

/**
 * Recipients: company settings (Time tracking) first; if empty, `TIME_ADMIN_SUMMARY_TO` (single) as fallback.
 */
export async function runScheduledTimecardAdminSummary(now = new Date()): Promise<{
  sent: boolean;
  reason?: string;
  rowsWithGaps: number;
  brevoMessageId?: string;
  to: string[];
}> {
  const settings = await storage.getCompanySettings();
  const fmt = settings.timecardDateDisplayFormat ?? "DD/MM/YYYY";
  const raw = settings.timecardSummaryRecipientEmails;
  const fromDb = Array.isArray(raw) ? raw.map((e) => String(e).trim()).filter(Boolean) : [];
  const envTo = (process.env.TIME_ADMIN_SUMMARY_TO ?? "").trim();
  const recipients = fromDb.length > 0 ? fromDb : envTo ? [envTo] : [];
  if (recipients.length === 0) {
    return {
      sent: false,
      reason: "No summary recipients: add emails under Company → Time tracking, or set TIME_ADMIN_SUMMARY_TO on the server",
      rowsWithGaps: 0,
      to: [],
    };
  }
  const r = await sendTimecardAdminSummaryEmail(recipients, now, fmt);
  return { ...r, to: recipients };
}

/**
 * @deprecated use `sendTimecardAdminSummaryEmail` or `runScheduledTimecardAdminSummary` — kept for the manual script and tests.
 */
export async function sendAdminTimecardSummaryEmail(
  to: string,
  now = new Date(),
): Promise<{ sent: boolean; reason?: string; rowsWithGaps: number; brevoMessageId?: string }> {
  const settings = await storage.getCompanySettings();
  const fmt = settings.timecardDateDisplayFormat ?? "DD/MM/YYYY";
  return sendTimecardAdminSummaryEmail([to.trim()], now, fmt);
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

