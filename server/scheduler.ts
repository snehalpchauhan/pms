import cron from "node-cron";
import {
  runAdminDailyDigestAllStaff,
  runAdminMonthlyDigestAllStaff,
  runAdminWeeklyDigestAllStaff,
  runEmployeeMonthlyDigests,
  runEmployeeWeeklyDigests,
} from "./jobs/timecardDigest";
import {
  runScheduledTimecardAdminSummary,
  sendDailyMissingTimecardEmails,
  sendWeeklyMissingTimecardEmails,
} from "./jobs/timecardReminders";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function truthy(name: string): boolean {
  return (env(name) ?? "").toLowerCase() === "true";
}

export function startSchedulers() {
  const reminders = truthy("TIME_REMINDERS_ENABLED");
  /** Legacy: week-to-date gaps only, one email to settings recipients. Prefer TIME_DIGEST_* for new schedules. */
  const adminSummaryLegacy = truthy("TIME_ADMIN_SUMMARY_ENABLED");

  const digestAdminDaily = truthy("TIME_DIGEST_ADMIN_DAILY_ENABLED");
  const digestAdminWeekly = truthy("TIME_DIGEST_ADMIN_WEEKLY_ENABLED");
  const digestAdminMonthly = truthy("TIME_DIGEST_ADMIN_MONTHLY_ENABLED");
  const digestEmployeeWeekly = truthy("TIME_DIGEST_EMPLOYEE_WEEKLY_ENABLED");
  const digestEmployeeMonthly = truthy("TIME_DIGEST_EMPLOYEE_MONTHLY_ENABLED");

  if (reminders) {
    const daily = env("TIME_REMINDERS_DAILY_CRON") ?? "0 9 * * 1-5"; // 09:00 Mon–Fri — previous business day HTML if short (see timecardDigest)
    const weekly = env("TIME_REMINDERS_WEEKLY_CRON") ?? "0 17 * * 5"; // Fri 17:00 — text reminder for current week gaps

    cron.schedule(daily, async () => {
      try {
        const res = await sendDailyMissingTimecardEmails(new Date());
        console.log("[timecard-reminder] daily (missed only, HTML) done:", res);
      } catch (err) {
        console.error("[timecard-reminder] daily failed:", err);
      }
    });

    cron.schedule(weekly, async () => {
      try {
        const res = await sendWeeklyMissingTimecardEmails(new Date());
        console.log("[timecard-reminder] weekly reminder done:", res);
      } catch (err) {
        console.error("[timecard-reminder] weekly failed:", err);
      }
    });

    console.log("[scheduler] timecard reminders enabled", { daily, weekly });
  }

  if (adminSummaryLegacy) {
    const adminCron = env("TIME_ADMIN_SUMMARY_CRON") ?? "0 7 * * *";
    cron.schedule(adminCron, async () => {
      try {
        const res = await runScheduledTimecardAdminSummary(new Date());
        console.log("[timecard-reminder] legacy admin week-to-date summary done:", res);
      } catch (err) {
        console.error("[timecard-reminder] legacy admin summary failed:", err);
      }
    });
    console.log("[scheduler] legacy admin summary enabled", { cron: adminCron });
  }

  if (digestAdminDaily) {
    const c = env("TIME_DIGEST_ADMIN_DAILY_CRON") ?? "0 8 * * 1-5";
    cron.schedule(c, async () => {
      try {
        const res = await runAdminDailyDigestAllStaff(new Date());
        console.log("[timecard-digest] admin daily (all staff, prev business day) done:", res);
      } catch (err) {
        console.error("[timecard-digest] admin daily failed:", err);
      }
    });
    console.log("[scheduler] TIME_DIGEST_ADMIN_DAILY_ENABLED", { cron: c });
  }

  if (digestAdminWeekly) {
    const c = env("TIME_DIGEST_ADMIN_WEEKLY_CRON") ?? "0 8 * * 1";
    cron.schedule(c, async () => {
      try {
        const res = await runAdminWeeklyDigestAllStaff(new Date());
        console.log("[timecard-digest] admin weekly (all staff, last ISO week) done:", res);
      } catch (err) {
        console.error("[timecard-digest] admin weekly failed:", err);
      }
    });
    console.log("[scheduler] TIME_DIGEST_ADMIN_WEEKLY_ENABLED", { cron: c });
  }

  if (digestAdminMonthly) {
    const c = env("TIME_DIGEST_ADMIN_MONTHLY_CRON") ?? "0 8 1 * *";
    cron.schedule(c, async () => {
      try {
        const res = await runAdminMonthlyDigestAllStaff(new Date());
        console.log("[timecard-digest] admin monthly (all staff, prev month) done:", res);
      } catch (err) {
        console.error("[timecard-digest] admin monthly failed:", err);
      }
    });
    console.log("[scheduler] TIME_DIGEST_ADMIN_MONTHLY_ENABLED", { cron: c });
  }

  if (digestEmployeeWeekly) {
    const c = env("TIME_DIGEST_EMPLOYEE_WEEKLY_CRON") ?? "0 9 * * 1";
    cron.schedule(c, async () => {
      try {
        const res = await runEmployeeWeeklyDigests(new Date());
        console.log("[timecard-digest] employee weekly digests done:", res);
      } catch (err) {
        console.error("[timecard-digest] employee weekly failed:", err);
      }
    });
    console.log("[scheduler] TIME_DIGEST_EMPLOYEE_WEEKLY_ENABLED", { cron: c });
  }

  if (digestEmployeeMonthly) {
    const c = env("TIME_DIGEST_EMPLOYEE_MONTHLY_CRON") ?? "0 9 1 * *";
    cron.schedule(c, async () => {
      try {
        const res = await runEmployeeMonthlyDigests(new Date());
        console.log("[timecard-digest] employee monthly digests done:", res);
      } catch (err) {
        console.error("[timecard-digest] employee monthly failed:", err);
      }
    });
    console.log("[scheduler] TIME_DIGEST_EMPLOYEE_MONTHLY_ENABLED", { cron: c });
  }

  const anyDigest =
    digestAdminDaily ||
    digestAdminWeekly ||
    digestAdminMonthly ||
    digestEmployeeWeekly ||
    digestEmployeeMonthly;

  if (!reminders && !adminSummaryLegacy && !anyDigest) {
    console.log(
      "[scheduler] timecard email jobs disabled. Enable TIME_REMINDERS_ENABLED (daily miss HTML + Fri text), and/or TIME_DIGEST_* (see server/scheduler.ts), and/or legacy TIME_ADMIN_SUMMARY_ENABLED; restart pms.service.",
    );
  }
}
