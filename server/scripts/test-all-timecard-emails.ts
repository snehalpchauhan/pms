/**
 * Run each timecard email path once (for smoke testing after deploy).
 *
 * The **seven** core types:
 *   1) Legacy admin — week-to-date gaps → settings recipients (same as TIME_ADMIN_SUMMARY cron)
 *   2) Admin daily digest — previous business day, all staff → settings
 *   3) Admin weekly digest — last completed ISO week → settings
 *   4) Admin monthly digest — previous calendar month → settings
 *   5) Employee weekly — one HTML mail per staff (all with email)
 *   6) Employee monthly — one HTML mail per staff
 *   7) Employee daily missed — HTML only for people short previous business day
 *
 * Optional 8) Friday-style text reminder — current week gaps (sendWeeklyMissingTimecardEmails)
 *
 * Usage (repo root, DATABASE_URL + Brevo/SMTP in .env):
 *   npx tsx server/scripts/test-all-timecard-emails.ts --skip-employees
 *   RUN_EMPLOYEE_DIGEST_TESTS=1 npx tsx server/scripts/test-all-timecard-emails.ts
 *   npx tsx server/scripts/test-all-timecard-emails.ts --skip-employees --include-friday-text
 *
 * Admin types (1–4) use Company → Time tracking recipients (or TIME_ADMIN_SUMMARY_TO). For (1) only,
 * you can instead run: npx tsx server/scripts/send-weekly-timecard-report.ts you@example.com
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

function argvHas(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main(): Promise<void> {
  loadEnvFromCwd();
  if (!process.env.DATABASE_URL) {
    console.error("error: DATABASE_URL not set (source .env)");
    process.exit(1);
  }

  const skipEmployees = argvHas("--skip-employees");
  const includeEmployees =
    !skipEmployees &&
    (argvHas("--employees") ||
      (process.env.RUN_EMPLOYEE_DIGEST_TESTS ?? "").toLowerCase() === "true" ||
      (process.env.RUN_EMPLOYEE_DIGEST_TESTS ?? "").toLowerCase() === "1");
  const includeFridayText = argvHas("--include-friday-text");

  if (!skipEmployees && !includeEmployees) {
    console.error(
      "Employee weekly/monthly (5–6) email EVERY staff member with an email.\n" +
        "  Safe:   npx tsx server/scripts/test-all-timecard-emails.ts --skip-employees\n" +
        "  Or:     ... --employees   (or RUN_EMPLOYEE_DIGEST_TESTS=1)\n",
    );
    process.exit(1);
  }

  const {
    runAdminDailyDigestAllStaff,
    runAdminMonthlyDigestAllStaff,
    runAdminWeeklyDigestAllStaff,
    runEmployeeMonthlyDigests,
    runEmployeeWeeklyDigests,
  } = await import("../jobs/timecardDigest");
  const {
    runScheduledTimecardAdminSummary,
    sendDailyMissingTimecardEmails,
    sendWeeklyMissingTimecardEmails,
  } = await import("../jobs/timecardReminders");

  const log = (n: string, res: unknown) => console.log(`\n[${n}]`, JSON.stringify(res, null, 0));

  console.log("=== 1) Legacy admin (week-to-date gaps) ===");
  log("1", await runScheduledTimecardAdminSummary(new Date()));

  console.log("\n=== 2) Admin daily digest (prev business day, all staff) ===");
  log("2", await runAdminDailyDigestAllStaff(new Date()));

  console.log("\n=== 3) Admin weekly digest (last ISO week) ===");
  log("3", await runAdminWeeklyDigestAllStaff(new Date()));

  console.log("\n=== 4) Admin monthly digest (previous calendar month) ===");
  log("4", await runAdminMonthlyDigestAllStaff(new Date()));

  if (includeEmployees) {
    console.log("\n=== 5) Employee weekly (one mail per person) ===");
    log("5", await runEmployeeWeeklyDigests(new Date()));
    console.log("\n=== 6) Employee monthly (one mail per person) ===");
    log("6", await runEmployeeMonthlyDigests(new Date()));
  } else {
    console.log("\n=== 5–6) SKIPPED employee weekly/monthly (--skip-employees) ===");
  }

  console.log("\n=== 7) Employee daily missed (HTML, only if short prev business day) ===");
  log("7", await sendDailyMissingTimecardEmails(new Date()));

  if (includeFridayText) {
    console.log("\n=== 8) Friday text reminder (current week gaps, per staff) ===");
    log("8", await sendWeeklyMissingTimecardEmails(new Date()));
  }

  console.log("\nDone. Check Brevo and inboxes.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
