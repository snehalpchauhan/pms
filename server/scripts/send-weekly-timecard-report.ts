/**
 * One-off / SSH: email a summary of staff (employee + manager) who are below 8h
 * on any weekday from Monday of this week through today.
 *
 * Usage (from repo root, with .env or env):
 *   npx tsx server/scripts/send-weekly-timecard-report.ts
 *   npx tsx server/scripts/send-weekly-timecard-report.ts you@example.com
 *
 * If you omit the address, the script uses Company settings → Time tracking → summary recipient list (same as schedule).
 *
 * On server:
 *   cd /var/www/pms && set -a && source .env && set +a && npx tsx server/scripts/send-weekly-timecard-report.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

async function main(): Promise<void> {
  loadEnvFromCwd();
  if (!process.env.DATABASE_URL) {
    console.error("error: DATABASE_URL is not set (source .env or run from /var/www/pms with .env)");
    process.exit(1);
  }
  const { sendTimecardAdminSummaryEmail } = await import("../jobs/timecardReminders");
  const { storage } = await import("../storage");

  const arg = process.argv[2]?.trim() || process.env.REPORT_TO?.trim();
  const settings = await storage.getCompanySettings();
  const fmt = settings.timecardDateDisplayFormat ?? "DD/MM/YYYY";
  const fromDb = Array.isArray(settings.timecardSummaryRecipientEmails)
    ? settings.timecardSummaryRecipientEmails.map((e) => String(e).trim()).filter(Boolean)
    : [];
  const envTo = (process.env.TIME_ADMIN_SUMMARY_TO ?? "").trim();
  const recipients = arg ? [arg] : fromDb.length > 0 ? fromDb : envTo ? [envTo] : [];
  if (recipients.length === 0) {
    console.error(
      "error: no recipients — pass an email as first arg, set REPORT_TO, add addresses in Company settings (Time tracking), or TIME_ADMIN_SUMMARY_TO on the server",
    );
    process.exit(1);
  }
  const res = await sendTimecardAdminSummaryEmail(recipients, new Date(), fmt);
  if (!res.sent) {
    console.error("error: email not sent:", res.reason);
    process.exit(1);
  }
  console.log("Sent weekly timecard report to", recipients.join(", "), "| people with gaps:", res.rowsWithGaps);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
