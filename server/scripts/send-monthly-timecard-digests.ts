/**
 * One-off / SSH: same monthly emails as the scheduler (`TIME_DIGEST_MONTHLY_ENABLED` bundle).
 *
 * Sends:
 *   - Admin: previous calendar month, all staff → Company → Time tracking summary recipients (or TIME_ADMIN_SUMMARY_TO)
 *   - Employees: one mail per staff/manager with email → their own weekday breakdown
 *
 * Usage (repo root, DATABASE_URL + Brevo/SMTP in env):
 *   npx tsx server/scripts/send-monthly-timecard-digests.ts
 *   npx tsx server/scripts/send-monthly-timecard-digests.ts --admin-only
 *   npx tsx server/scripts/send-monthly-timecard-digests.ts --employees-only
 *   npx tsx server/scripts/send-monthly-timecard-digests.ts --as-of=2026-02-01   (previous month = January 2026)
 *
 * npm:
 *   npm run timecard:monthly-digests
 *
 * Cursor hooks: point `command` at `npm run timecard:monthly-digests` with cwd = repo (and env inherited).
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

function argvFlag(name: string): boolean {
  return process.argv.includes(name);
}

function argvAsOf(): Date | undefined {
  const prefix = "--as-of=";
  const raw = process.argv.find((a) => a.startsWith(prefix));
  if (!raw) return undefined;
  const s = raw.slice(prefix.length).trim();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    console.error("error: invalid --as-of date:", s);
    process.exit(1);
  }
  return d;
}

async function main(): Promise<void> {
  loadEnvFromCwd();
  if (!process.env.DATABASE_URL) {
    console.error("error: DATABASE_URL is not set (source .env or run from app directory)");
    process.exit(1);
  }

  const adminOnly = argvFlag("--admin-only");
  const employeesOnly = argvFlag("--employees-only");
  if (adminOnly && employeesOnly) {
    console.error("error: use only one of --admin-only or --employees-only");
    process.exit(1);
  }

  const now = argvAsOf() ?? new Date();
  const { runAdminMonthlyDigestAllStaff, runEmployeeMonthlyDigests } = await import("../jobs/timecardDigest");

  const runAdmin = !employeesOnly;
  const runEmployees = !adminOnly;

  if (runAdmin) {
    const res = await runAdminMonthlyDigestAllStaff(now);
    if (!res.sent) {
      console.error("admin monthly digest failed:", res.reason ?? "unknown");
      process.exit(1);
    }
    console.log("admin monthly digest sent to:", res.to.join(", "), res.brevoMessageId ? ` · ${res.brevoMessageId}` : "");
  }

  if (runEmployees) {
    const res = await runEmployeeMonthlyDigests(now);
    console.log("employee monthly digests:", { emailed: res.emailed, skipped: res.skipped });
    if (res.skipped > 0 && res.emailed === 0) {
      console.error("error: no employee emails sent (check Brevo/SMTP and user emails)");
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
