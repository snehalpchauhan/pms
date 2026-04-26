import { and, gte, lte, sql } from "drizzle-orm";
import { addDays, format, isWeekend, startOfWeek, subDays } from "date-fns";
import { formatYmdForTimecardDisplay } from "@shared/timecardDateFormat";
import { db } from "../db";
import { sendEmail } from "../email";
import { storage } from "../storage";
import { timeEntries, users } from "@shared/schema";
import { sendEmployeeDailyMissedHtmlDigests } from "./timecardDigest";

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
  return sendEmployeeDailyMissedHtmlDigests(now);
}

/** All employee/manager staff with gaps (< 8h) on at least one weekday Mon–end of this week. Each row includes every weekday in range (hours logged) so email can show OK days in green. */
export async function getWeeklyTimecardGaps(
  now = new Date(),
): Promise<{
  weekStartYmd: string;
  endYmd: string;
  weekdays: string[];
  rows: { name: string; email: string; days: { dateYmd: string; hours: number }[] }[];
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
  const rows: { name: string; email: string; days: { dateYmd: string; hours: number }[] }[] = [];
  for (const u of staff) {
    const byDate = totals.get(u.id) ?? new Map<string, number>();
    const weekDays: { dateYmd: string; hours: number }[] = days.map((dateYmd) => ({
      dateYmd,
      hours: byDate.get(dateYmd) ?? 0,
    }));
    const hasGap = weekDays.some((d) => d.hours < REQUIRED_HOURS_PER_DAY);
    if (!hasGap) continue;
    rows.push({ name: u.name, email: u.email!.trim(), days: weekDays });
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

function hoursMissing(logged: number): number {
  return Math.max(0, REQUIRED_HOURS_PER_DAY - logged);
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

  let totalGapDays = 0;
  let totalHoursMissing = 0;
  for (const r of data.rows) {
    for (const day of r.days) {
      if (day.hours < REQUIRED_HOURS_PER_DAY) {
        totalGapDays++;
        totalHoursMissing += hoursMissing(day.hours);
      }
    }
  }

  const textLines: string[] = [
    `PMS timecard summary — week to date`,
    `Range: ${wkStart} – ${wkEnd} (weekdays only; ${REQUIRED_HOURS_PER_DAY}h required per weekday)`,
    "",
    `Overview: ${data.rows.length} employee(s) listed (each has at least one short day) · ${totalGapDays} gap-day(s) in total (sum of short weekdays across those people, not headcount) · ${totalHoursMissing.toFixed(2)}h missing in total`,
    "",
  ];

  const htmlBlocks: string[] = [];

  for (const r of data.rows) {
    const gapCount = r.days.filter((d) => d.hours < REQUIRED_HOURS_PER_DAY).length;
    const empMissing = r.days.reduce((s, d) => s + hoursMissing(d.hours), 0);
    const empWeekLogged = r.days.reduce((s, d) => s + d.hours, 0);
    textLines.push(
      `▸ ${r.name}  <${r.email}>`,
      `   ${empWeekLogged.toFixed(2)}h logged this week (${r.days.length} weekday(s) in range) · ${gapCount} under ${REQUIRED_HOURS_PER_DAY}h · ${empMissing.toFixed(2)}h missing on short days`,
    );
    for (const day of r.days) {
      const d = formatYmdForTimecardDisplay(day.dateYmd, dateDisplayPreset);
      const ok = day.hours >= REQUIRED_HOURS_PER_DAY;
      if (ok) {
        textLines.push(`   • ${d}: logged ${day.hours.toFixed(2)}h — OK (met ${REQUIRED_HOURS_PER_DAY}h)`);
      } else {
        const miss = hoursMissing(day.hours);
        const note = day.hours <= 0 ? "no time logged" : `short by ${miss.toFixed(2)}h`;
        textLines.push(`   • ${d}: logged ${day.hours.toFixed(2)}h → missing ${miss.toFixed(2)}h (${note})`);
      }
    }
    textLines.push("");

    const innerRows = r.days
      .map((day) => {
        const d = formatYmdForTimecardDisplay(day.dateYmd, dateDisplayPreset);
        const ok = day.hours >= REQUIRED_HOURS_PER_DAY;
        const miss = hoursMissing(day.hours);
        if (ok) {
          const note =
            day.hours > REQUIRED_HOURS_PER_DAY
              ? `OK — above minimum (${day.hours.toFixed(2)}h)`
              : `OK — met ${REQUIRED_HOURS_PER_DAY}h`;
          return `<tr style="background:#ecfdf5;border-left:4px solid #22c55e">
  <td style="padding:8px 10px;font-weight:600">${escHtml(d)}</td>
  <td style="padding:8px 10px;text-align:right;white-space:nowrap">${day.hours.toFixed(2)}h</td>
  <td style="padding:8px 10px;text-align:right;white-space:nowrap;color:#166534">0h</td>
  <td style="padding:8px 10px;font-size:13px;color:#166534">${escHtml(note)}</td>
</tr>`;
        }
        const isEmpty = day.hours <= 0;
        const rowBg = isEmpty ? "#fef2f2" : "#fffbeb";
        const border = isEmpty ? "#fecaca" : "#fde68a";
        const note = isEmpty ? "No hours logged" : `Short by ${miss.toFixed(2)}h`;
        return `<tr style="background:${rowBg};border-left:4px solid ${border}">
  <td style="padding:8px 10px;font-weight:600">${escHtml(d)}</td>
  <td style="padding:8px 10px;text-align:right;white-space:nowrap">${day.hours.toFixed(2)}h</td>
  <td style="padding:8px 10px;text-align:right;font-weight:600;white-space:nowrap;color:${isEmpty ? "#b91c1c" : "#b45309"}">${miss.toFixed(2)}h</td>
  <td style="padding:8px 10px;font-size:13px;color:#444">${escHtml(note)}</td>
</tr>`;
      })
      .join("\n");

    htmlBlocks.push(`<div style="margin:0 0 20px;border:1px solid #e4e4e7;border-radius:10px;overflow:hidden;max-width:640px">
  <div style="background:linear-gradient(180deg,#fafafa 0%,#f4f4f5 100%);padding:12px 14px;border-bottom:1px solid #e4e4e7">
    <div style="font-size:15px;font-weight:700;color:#18181b">${escHtml(r.name)}</div>
    <div style="font-size:12px;color:#52525b;margin-top:2px;word-break:break-all">${escHtml(r.email)}</div>
    <div style="font-size:12px;color:#71717a;margin-top:8px;line-height:1.45">
      <strong style="color:#3f3f46">${empWeekLogged.toFixed(2)}h</strong> logged this week
      <span style="color:#a1a1aa">(${r.days.length} weekday${r.days.length === 1 ? "" : "s"} in range)</span>
      <br />
      <strong style="color:#3f3f46">${gapCount}</strong> of <strong style="color:#3f3f46">${r.days.length}</strong> under ${REQUIRED_HOURS_PER_DAY}h
      · <strong style="color:#3f3f46">${empMissing.toFixed(2)}h</strong> missing on short days
    </div>
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px">
    <thead>
      <tr style="background:#fafafa;font-size:12px;text-transform:uppercase;letter-spacing:0.03em;color:#71717a">
        <th align="left" style="padding:8px 10px;border-bottom:1px solid #e4e4e7">Date</th>
        <th align="right" style="padding:8px 10px;border-bottom:1px solid #e4e4e7;width:1%">Logged</th>
        <th align="right" style="padding:8px 10px;border-bottom:1px solid #e4e4e7;width:1%">Missing</th>
        <th align="left" style="padding:8px 10px;border-bottom:1px solid #e4e4e7">Note</th>
      </tr>
    </thead>
    <tbody>
${innerRows}
    </tbody>
  </table>
</div>`);
  }

  const text = textLines.join("\n") + "\n";
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:16px;font-family:system-ui,Segoe UI,sans-serif;font-size:14px;color:#18181b;background:#fafafa">
  <div style="max-width:680px;margin:0 auto">
    <h1 style="font-size:18px;margin:0 0 6px;font-weight:700">PMS timecard summary</h1>
    <p style="margin:0 0 4px;color:#52525b">Week to date: <strong>${escHtml(wkStart)}</strong> – <strong>${escHtml(wkEnd)}</strong></p>
    <p style="margin:0 0 16px;font-size:13px;color:#71717a">${REQUIRED_HOURS_PER_DAY}h required per weekday · each card lists every weekday in range: <span style="color:#166534">green</span> = met requirement, amber/red = short</p>
    <div style="background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:12px 14px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:600;color:#3f3f46">At a glance</div>
      <ul style="margin:8px 0 0;padding-left:18px;color:#52525b;font-size:13px;line-height:1.5">
        <li><strong>${data.rows.length}</strong> employee(s) shown (only people with at least one short weekday)</li>
        <li><strong>${totalGapDays}</strong> gap-day(s) total — short weekdays summed across those people (not the same as employee count)</li>
        <li><strong>${totalHoursMissing.toFixed(2)}h</strong> missing in total (sum of shortfalls on short days only)</li>
      </ul>
    </div>
    ${htmlBlocks.join("\n")}
    <p style="margin:20px 0 0;font-size:12px;color:#a1a1aa">PMS · automated summary</p>
  </div>
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

