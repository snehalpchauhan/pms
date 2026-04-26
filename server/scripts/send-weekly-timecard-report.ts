/**
 * One-off / SSH: same **admin timecard summary** email as the scheduler
 * (`TIME_ADMIN_SUMMARY_ENABLED` cron → `runScheduledTimecardAdminSummary`).
 *
 * With no address: calls `runScheduledTimecardAdminSummary` (recipients from Company → Time tracking,
 * or `TIME_ADMIN_SUMMARY_TO`). With an address: same email body/send path, but forces that inbox
 * (for testing without changing settings).
 *
 * Usage (from repo root, with .env or env):
 *   npx tsx server/scripts/send-weekly-timecard-report.ts
 *   npx tsx server/scripts/send-weekly-timecard-report.ts you@example.com
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
  const { runScheduledTimecardAdminSummary, sendTimecardAdminSummaryEmail } = await import(
    "../jobs/timecardReminders"
  );
  const { storage } = await import("../storage");

  const arg = process.argv[2]?.trim() || process.env.REPORT_TO?.trim();
  const now = new Date();

  if (!arg) {
    const res = await runScheduledTimecardAdminSummary(now);
    if (!res.sent) {
      console.error("error: email not sent:", res.reason);
      process.exit(1);
    }
    console.log(
      "Sent admin timecard summary (scheduler path) to",
      res.to.join(", "),
      "| people with gaps:",
      res.rowsWithGaps,
    );
    return;
  }

  const settings = await storage.getCompanySettings();
  const fmt = settings.timecardDateDisplayFormat ?? "DD/MM/YYYY";
  const res = await sendTimecardAdminSummaryEmail([arg], now, fmt);
  if (!res.sent) {
    console.error("error: email not sent:", res.reason);
    process.exit(1);
  }
  console.log("Sent admin timecard summary (override recipient) to", arg, "| people with gaps:", res.rowsWithGaps);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
