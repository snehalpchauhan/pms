/**
 * One-off / SSH: email a summary of staff (employee + manager) who are below 8h
 * on any weekday from Monday of this week through today.
 *
 * Usage (from repo root, with .env or env):
 *   npx tsx server/scripts/send-weekly-timecard-report.ts
 *   REPORT_TO=you@example.com npx tsx server/scripts/send-weekly-timecard-report.ts
 *   npx tsx server/scripts/send-weekly-timecard-report.ts other@example.com
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
  const { getWeeklyTimecardGaps, formatWeeklyTimecardGapsText } = await import("../jobs/timecardReminders");
  const { sendEmail } = await import("../email");

  const to = process.argv[2]?.trim() || process.env.REPORT_TO?.trim() || "snehal@vnnovate.com";
  const data = await getWeeklyTimecardGaps(new Date());
  const text = formatWeeklyTimecardGapsText(data);
  const subject = `PMS: Weekly timecard summary (${data.weekStartYmd} – ${data.endYmd})`;
  const res = await sendEmail({ to, subject, text });
  if (!res.sent) {
    console.error("error: email not sent:", res.reason);
    process.exit(1);
  }
  console.log("Sent weekly timecard report to", to, "| people with gaps:", data.rows.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
