/**
 * Scheduled timecard digest emails: admin (all staff → settings recipients) and per-employee.
 * Opt-in via env vars — see `startSchedulers` in server/scheduler.ts.
 */
import { and, gte, lte, sql } from "drizzle-orm";
import {
  addDays,
  format,
  isWeekend,
  parseISO,
  startOfWeek,
  subDays,
  startOfMonth,
  endOfMonth,
  isValid,
} from "date-fns";
import { formatYmdForTimecardDisplay } from "@shared/timecardDateFormat";
import { db } from "../db";
import { sendEmail } from "../email";
import { storage } from "../storage";
import { timeEntries, users } from "@shared/schema";

const REQUIRED_HOURS_PER_DAY = 8;

function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

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

export type DigestRow = { name: string; email: string; days: { dateYmd: string; hours: number }[] };

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

/** Plain + HTML copy for the employee “daily missed” notice (no “At a glance”). */
export function buildEmployeeDailyMissComplianceAddon(p: {
  dateDisplay: string;
  loggedHours: number;
  missingHours: number;
}): { text: string; html: string } {
  const { dateDisplay, loggedHours, missingHours } = p;
  const safeDate = escHtml(dateDisplay);
  const text = [
    `You have an incomplete timecard for ${dateDisplay}.`,
    `Logged: ${loggedHours.toFixed(2)}h — required: ${REQUIRED_HOURS_PER_DAY}h per weekday (short by ${missingHours.toFixed(2)}h).`,
    "",
    "If you were absent or on approved leave for all or part of that day, please contact HR as soon as possible so your attendance and leave can be recorded correctly.",
    "",
    "If you worked that day, please submit or update your timecard in PMS immediately. Accurate, timely timecards are required for payroll and compliance.",
  ].join("\n");

  const html = `<div style="margin:0 0 16px;padding:14px 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;font-size:14px;line-height:1.55;color:#374151">
  <p style="margin:0 0 10px"><strong>Action required:</strong> Your timecard for <strong>${safeDate}</strong> is below the required <strong>${REQUIRED_HOURS_PER_DAY}h</strong> for that weekday. You have logged <strong>${loggedHours.toFixed(2)}h</strong> (short by <strong>${missingHours.toFixed(2)}h</strong>).</p>
  <p style="margin:0 0 10px">If you were <strong>absent</strong> or on <strong>approved leave</strong> for all or part of that day, please contact <strong>HR</strong> promptly so your attendance can be updated.</p>
  <p style="margin:0">If you <strong>worked</strong> that day, please <strong>submit or correct your timecard</strong> in PMS as soon as possible. Timely, accurate timekeeping is required for payroll and compliance.</p>
</div>`;
  return { text, html };
}

/** Weekday YMD keys from start through end (inclusive), skipping Sat/Sun. */
function weekdayKeysBetween(startYmd: string, endYmd: string): string[] {
  const start = parseISO(startYmd);
  const end = parseISO(endYmd);
  if (!isValid(start) || !isValid(end)) return [];
  const out: string[] = [];
  for (let d = start; toYmd(d) <= endYmd; d = addDays(d, 1)) {
    if (!isWeekend(d)) out.push(toYmd(d));
  }
  return out;
}

export async function getDigestRowsForRange(
  startYmd: string,
  endYmd: string,
  opts: { onlyRowsWithGap: boolean },
): Promise<DigestRow[]> {
  const dayKeys = weekdayKeysBetween(startYmd, endYmd);
  if (dayKeys.length === 0) return [];
  const staff = await getStaffWithEmail();
  const totals = await totalsByUserByDate(startYmd, endYmd);
  const rows: DigestRow[] = [];
  for (const u of staff) {
    const byDate = totals.get(u.id) ?? new Map<string, number>();
    const days = dayKeys.map((dateYmd) => ({ dateYmd, hours: byDate.get(dateYmd) ?? 0 }));
    if (opts.onlyRowsWithGap && !days.some((d) => d.hours < REQUIRED_HOURS_PER_DAY)) continue;
    rows.push({ name: u.name, email: u.email!.trim(), days });
  }
  return rows;
}

export type DigestListMode = "gaps-only" | "all-staff";

export function buildDigestEmailContent(opts: {
  rows: DigestRow[];
  dateDisplayPreset: string;
  periodStartYmd: string;
  periodEndYmd: string;
  heading: string;
  subheading: string;
  listMode: DigestListMode;
  /** When false, omits the “At a glance” box and overview counts (e.g. employee daily missed). Default true. */
  showAtAGlance?: boolean;
  /** Extra body copy (plain + HTML) inserted after the subheading; HTML is trusted (caller must escape user data). */
  complianceAddon?: { text: string; html: string };
}): { text: string; html: string } {
  const {
    rows,
    dateDisplayPreset,
    periodStartYmd,
    periodEndYmd,
    heading,
    subheading,
    listMode,
    showAtAGlance = true,
    complianceAddon,
  } = opts;
  const pStart = formatYmdForTimecardDisplay(periodStartYmd, dateDisplayPreset);
  const pEnd = formatYmdForTimecardDisplay(periodEndYmd, dateDisplayPreset);

  if (rows.length === 0) {
    const line =
      listMode === "gaps-only"
        ? `No missing or incomplete timecards (below ${REQUIRED_HOURS_PER_DAY}h) for this period (${pStart} – ${pEnd}).`
        : `No staff with email on file for this period (${pStart} – ${pEnd}).`;
    return {
      text: `${line}\n`,
      html: `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;font-size:14px"><p>${escHtml(line)}</p></body></html>`,
    };
  }

  let totalGapDays = 0;
  let totalHoursMissing = 0;
  let peopleWithGap = 0;
  for (const r of rows) {
    let personGap = false;
    for (const day of r.days) {
      if (day.hours < REQUIRED_HOURS_PER_DAY) {
        totalGapDays++;
        totalHoursMissing += hoursMissing(day.hours);
        personGap = true;
      }
    }
    if (personGap) peopleWithGap++;
  }

  const textLines: string[] = [`${heading}`, `${subheading}`, ""];
  if (complianceAddon?.text) {
    textLines.push(complianceAddon.text.trim(), "");
  }
  if (showAtAGlance) {
    textLines.push(
      `Range (weekdays): ${pStart} – ${pEnd} · ${REQUIRED_HOURS_PER_DAY}h required per weekday`,
      "",
    );
    if (listMode === "all-staff") {
      textLines.push(
        `Overview: ${rows.length} employee(s) · ${peopleWithGap} with at least one short day · ${totalGapDays} gap-day(s) · ${totalHoursMissing.toFixed(2)}h missing in total`,
        "",
      );
    } else {
      textLines.push(
        `Overview: ${rows.length} employee(s) with gaps · ${totalGapDays} gap-day(s) · ${totalHoursMissing.toFixed(2)}h missing in total`,
        "",
      );
    }
  }

  const htmlBlocks: string[] = [];

  for (const r of rows) {
    const gapCount = r.days.filter((d) => d.hours < REQUIRED_HOURS_PER_DAY).length;
    const empMissing = r.days.reduce((s, d) => s + hoursMissing(d.hours), 0);
    const empLogged = r.days.reduce((s, d) => s + d.hours, 0);
    textLines.push(
      `▸ ${r.name}  <${r.email}>`,
      `   ${empLogged.toFixed(2)}h logged (${r.days.length} weekday(s)) · ${gapCount} under ${REQUIRED_HOURS_PER_DAY}h · ${empMissing.toFixed(2)}h missing on short days`,
    );
    for (const day of r.days) {
      const d = formatYmdForTimecardDisplay(day.dateYmd, dateDisplayPreset);
      const ok = day.hours >= REQUIRED_HOURS_PER_DAY;
      if (ok) {
        textLines.push(`   • ${d}: logged ${day.hours.toFixed(2)}h — OK`);
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
      <strong style="color:#3f3f46">${empLogged.toFixed(2)}h</strong> logged
      <span style="color:#a1a1aa">(${r.days.length} weekday${r.days.length === 1 ? "" : "s"})</span>
      <br />
      <strong style="color:#3f3f46">${gapCount}</strong> under ${REQUIRED_HOURS_PER_DAY}h
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

  const glance =
    listMode === "all-staff"
      ? `<li><strong>${rows.length}</strong> employee(s) in this report</li>
        <li><strong>${peopleWithGap}</strong> with at least one short weekday</li>
        <li><strong>${totalGapDays}</strong> gap-day(s) total (not headcount)</li>
        <li><strong>${totalHoursMissing.toFixed(2)}h</strong> missing in total</li>`
      : `<li><strong>${rows.length}</strong> employee(s) with at least one gap</li>
        <li><strong>${totalGapDays}</strong> gap-day(s) total</li>
        <li><strong>${totalHoursMissing.toFixed(2)}h</strong> missing in total</li>`;

  const glanceBlock = showAtAGlance
    ? `<p style="margin:0 0 16px;font-size:13px;color:#71717a"><strong>${escHtml(pStart)}</strong> – <strong>${escHtml(pEnd)}</strong> · ${REQUIRED_HOURS_PER_DAY}h per weekday · <span style="color:#166534">green</span> = OK</p>
    <div style="background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:12px 14px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:600;color:#3f3f46">At a glance</div>
      <ul style="margin:8px 0 0;padding-left:18px;color:#52525b;font-size:13px;line-height:1.5">${glance}</ul>
    </div>`
    : `<p style="margin:0 0 12px;font-size:13px;color:#71717a"><strong>Date:</strong> ${escHtml(pStart)}${pStart === pEnd ? "" : ` – ${escHtml(pEnd)}`}</p>`;

  const addonHtml = complianceAddon?.html ? `${complianceAddon.html}\n    ` : "";

  const text = textLines.join("\n") + "\n";
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:16px;font-family:system-ui,Segoe UI,sans-serif;font-size:14px;color:#18181b;background:#fafafa">
  <div style="max-width:680px;margin:0 auto">
    <h1 style="font-size:18px;margin:0 0 6px;font-weight:700">${escHtml(heading)}</h1>
    <p style="margin:0 0 8px;color:#52525b;line-height:1.45">${escHtml(subheading)}</p>
    ${addonHtml}${glanceBlock}
    ${htmlBlocks.join("\n")}
    <p style="margin:20px 0 0;font-size:12px;color:#a1a1aa">PMS · timecard notification</p>
  </div>
</body>
</html>`;
  return { text, html };
}

async function resolveAdminRecipients(): Promise<{ recipients: string[]; fmt: string }> {
  const settings = await storage.getCompanySettings();
  const fmt = settings.timecardDateDisplayFormat ?? "DD/MM/YYYY";
  const raw = settings.timecardSummaryRecipientEmails;
  const fromDb = Array.isArray(raw) ? raw.map((e) => String(e).trim()).filter(Boolean) : [];
  const envTo = (process.env.TIME_ADMIN_SUMMARY_TO ?? "").trim();
  const recipients = fromDb.length > 0 ? fromDb : envTo ? [envTo] : [];
  return { recipients, fmt };
}

/** Previous completed Mon–Sun calendar week → weekday-only YMD span (Mon–Fri within that week). */
export function lastCompletedIsoWeekRange(now: Date): { startYmd: string; endYmd: string } {
  const thisMonday = startOfWeek(now, { weekStartsOn: 1 });
  const lastMonday = subDays(thisMonday, 7);
  const lastSunday = addDays(lastMonday, 6);
  return { startYmd: toYmd(lastMonday), endYmd: toYmd(lastSunday) };
}

/** Previous calendar month (for jobs running on the 1st). */
export function previousCalendarMonthRange(now: Date): { startYmd: string; endYmd: string } {
  const firstThisMonth = startOfMonth(now);
  const lastPrev = subDays(firstThisMonth, 1);
  const start = startOfMonth(lastPrev);
  const end = endOfMonth(lastPrev);
  return { startYmd: toYmd(start), endYmd: toYmd(end) };
}

export async function runAdminDailyDigestAllStaff(now = new Date()): Promise<{
  sent: boolean;
  reason?: string;
  brevoMessageId?: string;
  to: string[];
}> {
  if (isWeekend(now)) return { sent: false, reason: "Skipped on weekend (no previous business day mail)", to: [], brevoMessageId: undefined };
  const target = previousBusinessDay(now);
  const ymd = toYmd(target);
  const { recipients, fmt } = await resolveAdminRecipients();
  if (recipients.length === 0) {
    return { sent: false, reason: "No summary recipients in Company settings or TIME_ADMIN_SUMMARY_TO", to: [], brevoMessageId: undefined };
  }
  const rows = await getDigestRowsForRange(ymd, ymd, { onlyRowsWithGap: false });
  const pDisp = formatYmdForTimecardDisplay(ymd, fmt);
  const { text, html } = buildDigestEmailContent({
    rows,
    dateDisplayPreset: fmt,
    periodStartYmd: ymd,
    periodEndYmd: ymd,
    heading: "PMS daily timecard summary",
    subheading: `All employees — previous business day (${pDisp})`,
    listMode: "all-staff",
  });
  const subject = `PMS: Daily timecard summary — ${pDisp}`;
  const res = await sendEmail({ to: recipients, subject, text, html });
  return { sent: res.sent, reason: res.reason, brevoMessageId: res.brevoMessageId, to: recipients };
}

export async function runAdminWeeklyDigestAllStaff(now = new Date()): Promise<{
  sent: boolean;
  reason?: string;
  brevoMessageId?: string;
  to: string[];
}> {
  const { startYmd, endYmd } = lastCompletedIsoWeekRange(now);
  const { recipients, fmt } = await resolveAdminRecipients();
  if (recipients.length === 0) {
    return { sent: false, reason: "No summary recipients in Company settings or TIME_ADMIN_SUMMARY_TO", to: [], brevoMessageId: undefined };
  }
  const rows = await getDigestRowsForRange(startYmd, endYmd, { onlyRowsWithGap: false });
  const p1 = formatYmdForTimecardDisplay(startYmd, fmt);
  const p2 = formatYmdForTimecardDisplay(endYmd, fmt);
  const { text, html } = buildDigestEmailContent({
    rows,
    dateDisplayPreset: fmt,
    periodStartYmd: startYmd,
    periodEndYmd: endYmd,
    heading: "PMS weekly timecard summary",
    subheading: "All employees — last completed calendar week (weekdays)",
    listMode: "all-staff",
  });
  const subject = `PMS: Weekly timecard summary — ${p1} – ${p2}`;
  const res = await sendEmail({ to: recipients, subject, text, html });
  return { sent: res.sent, reason: res.reason, brevoMessageId: res.brevoMessageId, to: recipients };
}

export async function runAdminMonthlyDigestAllStaff(now = new Date()): Promise<{
  sent: boolean;
  reason?: string;
  brevoMessageId?: string;
  to: string[];
}> {
  const { startYmd, endYmd } = previousCalendarMonthRange(now);
  const { recipients, fmt } = await resolveAdminRecipients();
  if (recipients.length === 0) {
    return { sent: false, reason: "No summary recipients in Company settings or TIME_ADMIN_SUMMARY_TO", to: [], brevoMessageId: undefined };
  }
  const rows = await getDigestRowsForRange(startYmd, endYmd, { onlyRowsWithGap: false });
  const { text, html } = buildDigestEmailContent({
    rows,
    dateDisplayPreset: fmt,
    periodStartYmd: startYmd,
    periodEndYmd: endYmd,
    heading: "PMS monthly timecard summary",
    subheading: `All employees — previous calendar month (${format(parseISO(startYmd), "MMMM yyyy")})`,
    listMode: "all-staff",
  });
  const subject = `PMS: Monthly timecard summary — ${format(parseISO(startYmd), "MMMM yyyy")}`;
  const res = await sendEmail({ to: recipients, subject, text, html });
  return { sent: res.sent, reason: res.reason, brevoMessageId: res.brevoMessageId, to: recipients };
}

export async function runEmployeeWeeklyDigests(now = new Date()): Promise<{ emailed: number; skipped: number }> {
  const { startYmd, endYmd } = lastCompletedIsoWeekRange(now);
  const settings = await storage.getCompanySettings();
  const fmt = settings.timecardDateDisplayFormat ?? "DD/MM/YYYY";
  const rows = await getDigestRowsForRange(startYmd, endYmd, { onlyRowsWithGap: false });
  const p1 = formatYmdForTimecardDisplay(startYmd, fmt);
  const p2 = formatYmdForTimecardDisplay(endYmd, fmt);
  let emailed = 0;
  let skipped = 0;
  for (const r of rows) {
    const { text, html } = buildDigestEmailContent({
      rows: [r],
      dateDisplayPreset: fmt,
      periodStartYmd: startYmd,
      periodEndYmd: endYmd,
      heading: "PMS: Your weekly timecard",
      subheading: `Weekdays ${p1} – ${p2}`,
      listMode: "all-staff",
    });
    const subject = `PMS: Your weekly timecard — ${p1} – ${p2}`;
    try {
      const res = await sendEmail({ to: r.email, subject, text, html });
      if (res.sent) emailed++;
      else skipped++;
    } catch (err) {
      skipped++;
      console.warn("[timecard-digest] employee weekly send failed:", r.email, err);
    }
  }
  return { emailed, skipped };
}

export async function runEmployeeMonthlyDigests(now = new Date()): Promise<{ emailed: number; skipped: number }> {
  const { startYmd, endYmd } = previousCalendarMonthRange(now);
  const settings = await storage.getCompanySettings();
  const fmt = settings.timecardDateDisplayFormat ?? "DD/MM/YYYY";
  const rows = await getDigestRowsForRange(startYmd, endYmd, { onlyRowsWithGap: false });
  const monthLabel = format(parseISO(startYmd), "MMMM yyyy");
  const p1 = formatYmdForTimecardDisplay(startYmd, fmt);
  const p2 = formatYmdForTimecardDisplay(endYmd, fmt);
  let emailed = 0;
  let skipped = 0;
  for (const r of rows) {
    const { text, html } = buildDigestEmailContent({
      rows: [r],
      dateDisplayPreset: fmt,
      periodStartYmd: startYmd,
      periodEndYmd: endYmd,
      heading: "PMS: Your monthly timecard",
      subheading: `${monthLabel} (weekdays ${p1} – ${p2})`,
      listMode: "all-staff",
    });
    const subject = `PMS: Your monthly timecard — ${monthLabel}`;
    try {
      const res = await sendEmail({ to: r.email, subject, text, html });
      if (res.sent) emailed++;
      else skipped++;
    } catch (err) {
      skipped++;
      console.warn("[timecard-digest] employee monthly send failed:", r.email, err);
    }
  }
  return { emailed, skipped };
}

/** Single previous business day; only employees short that day; HTML digest. */
export async function sendEmployeeDailyMissedHtmlDigests(now = new Date()): Promise<{ emailed: number; skipped: number }> {
  if (isWeekend(now)) return { emailed: 0, skipped: 0 };
  const target = previousBusinessDay(now);
  const ymd = toYmd(target);
  const settings = await storage.getCompanySettings();
  const fmt = settings.timecardDateDisplayFormat ?? "DD/MM/YYYY";
  const rows = await getDigestRowsForRange(ymd, ymd, { onlyRowsWithGap: true });
  const pDisp = formatYmdForTimecardDisplay(ymd, fmt);
  let emailed = 0;
  let skipped = 0;
  for (const r of rows) {
    const day = r.days[0];
    const loggedHours = day ? day.hours : 0;
    const missingHours = hoursMissing(loggedHours);
    const complianceAddon = buildEmployeeDailyMissComplianceAddon({
      dateDisplay: pDisp,
      loggedHours,
      missingHours,
    });
    const { text, html } = buildDigestEmailContent({
      rows: [r],
      dateDisplayPreset: fmt,
      periodStartYmd: ymd,
      periodEndYmd: ymd,
      heading: "Timecard update required",
      subheading: "Your timecard for the date below is incomplete. Please follow the steps that apply to you.",
      listMode: "gaps-only",
      showAtAGlance: false,
      complianceAddon,
    });
    const subject = `PMS: Incomplete timecard — ${pDisp}`;
    try {
      const res = await sendEmail({ to: r.email, subject, text, html });
      if (res.sent) emailed++;
      else skipped++;
    } catch (err) {
      skipped++;
      console.warn("[timecard-digest] employee daily missed send failed:", r.email, err);
    }
  }
  return { emailed, skipped };
}
