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
import { runTaskDueNotifications } from "./jobs/taskDueNotifications";
import { storage } from "./storage";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function truthy(name: string): boolean {
  return (env(name) ?? "").toLowerCase() === "true";
}

/** IANA zone for node-cron `timezone` option; empty if invalid / unset. */
function cronTimezoneOption(zone: string | undefined): { timezone?: string } {
  const t = zone?.trim();
  if (!t) return {};
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: t });
    return { timezone: t };
  } catch {
    console.warn("[scheduler] invalid IANA timezone ignored:", t);
    return {};
  }
}

export async function startSchedulers(): Promise<void> {
  const settings = await storage.getCompanySettings();
  const fromEnv = process.env.TIME_EMAIL_CRON_TIMEZONE?.trim();
  const fromDb = settings.emailDigestTimezone?.trim();
  let cronZone = cronTimezoneOption(fromEnv);
  if (cronZone.timezone) {
    console.log("[scheduler] timecard cron timezone (TIME_EMAIL_CRON_TIMEZONE):", cronZone.timezone);
  } else {
    cronZone = cronTimezoneOption(fromDb);
    if (cronZone.timezone) {
      console.log("[scheduler] timecard cron timezone (company settings):", cronZone.timezone);
    } else {
      console.log(
        "[scheduler] timecard crons: no valid IANA timezone — set Company → Time tracking → digest timezone, or TIME_EMAIL_CRON_TIMEZONE; using server default for cron",
      );
    }
  }

  const reminders = truthy("TIME_REMINDERS_ENABLED");
  /** Legacy: week-to-date gaps only, one email to settings recipients. Prefer TIME_DIGEST_* for new schedules. */
  const adminSummaryLegacy = truthy("TIME_ADMIN_SUMMARY_ENABLED");

  const digestAdminDaily = truthy("TIME_DIGEST_ADMIN_DAILY_ENABLED");
  const digestAdminWeekly = truthy("TIME_DIGEST_ADMIN_WEEKLY_ENABLED");
  const digestAdminMonthly = truthy("TIME_DIGEST_ADMIN_MONTHLY_ENABLED");
  const digestEmployeeWeekly = truthy("TIME_DIGEST_EMPLOYEE_WEEKLY_ENABLED");
  const digestEmployeeMonthly = truthy("TIME_DIGEST_EMPLOYEE_MONTHLY_ENABLED");
  const taskDueEnabled = truthy("TASK_DUE_NOTIFICATIONS_ENABLED");

  if (reminders) {
    /** Midnight each day in company TZ when set; weekend sends are no-ops inside jobs. */
    const daily = env("TIME_REMINDERS_DAILY_CRON") ?? "0 0 * * *";
    /** 18:00 Friday — current-week gap text reminder. */
    const weekly = env("TIME_REMINDERS_WEEKLY_CRON") ?? "0 18 * * 5";

    cron.schedule(
      daily,
      async () => {
        try {
          const res = await sendDailyMissingTimecardEmails(new Date());
          console.log("[timecard-reminder] daily (missed only, HTML) done:", res);
        } catch (err) {
          console.error("[timecard-reminder] daily failed:", err);
        }
      },
      cronZone,
    );

    cron.schedule(
      weekly,
      async () => {
        try {
          const res = await sendWeeklyMissingTimecardEmails(new Date());
          console.log("[timecard-reminder] weekly reminder done:", res);
        } catch (err) {
          console.error("[timecard-reminder] weekly failed:", err);
        }
      },
      cronZone,
    );

    console.log("[scheduler] timecard reminders enabled", { daily, weekly, ...cronZone });
  }

  if (adminSummaryLegacy) {
    const adminCron = env("TIME_ADMIN_SUMMARY_CRON") ?? "0 7 * * *";
    cron.schedule(
      adminCron,
      async () => {
        try {
          const res = await runScheduledTimecardAdminSummary(new Date());
          console.log("[timecard-reminder] legacy admin week-to-date summary done:", res);
        } catch (err) {
          console.error("[timecard-reminder] legacy admin summary failed:", err);
        }
      },
      cronZone,
    );
    console.log("[scheduler] legacy admin summary enabled", { cron: adminCron, ...cronZone });
  }

  if (digestAdminDaily) {
    const c = env("TIME_DIGEST_ADMIN_DAILY_CRON") ?? "0 0 * * *";
    cron.schedule(
      c,
      async () => {
        try {
          const res = await runAdminDailyDigestAllStaff(new Date());
          console.log("[timecard-digest] admin daily (all staff, prev business day) done:", res);
        } catch (err) {
          console.error("[timecard-digest] admin daily failed:", err);
        }
      },
      cronZone,
    );
    console.log("[scheduler] TIME_DIGEST_ADMIN_DAILY_ENABLED", { cron: c, ...cronZone });
  }

  if (digestAdminWeekly) {
    const c = env("TIME_DIGEST_ADMIN_WEEKLY_CRON") ?? "0 8 * * 1";
    cron.schedule(
      c,
      async () => {
        try {
          const res = await runAdminWeeklyDigestAllStaff(new Date());
          console.log("[timecard-digest] admin weekly (all staff, last ISO week) done:", res);
        } catch (err) {
          console.error("[timecard-digest] admin weekly failed:", err);
        }
      },
      cronZone,
    );
    console.log("[scheduler] TIME_DIGEST_ADMIN_WEEKLY_ENABLED", { cron: c, ...cronZone });
  }

  if (digestAdminMonthly) {
    const c = env("TIME_DIGEST_ADMIN_MONTHLY_CRON") ?? "0 8 1 * *";
    cron.schedule(
      c,
      async () => {
        try {
          const res = await runAdminMonthlyDigestAllStaff(new Date());
          console.log("[timecard-digest] admin monthly (all staff, prev month) done:", res);
        } catch (err) {
          console.error("[timecard-digest] admin monthly failed:", err);
        }
      },
      cronZone,
    );
    console.log("[scheduler] TIME_DIGEST_ADMIN_MONTHLY_ENABLED", { cron: c, ...cronZone });
  }

  if (digestEmployeeWeekly) {
    const c = env("TIME_DIGEST_EMPLOYEE_WEEKLY_CRON") ?? "0 9 * * 1";
    cron.schedule(
      c,
      async () => {
        try {
          const res = await runEmployeeWeeklyDigests(new Date());
          console.log("[timecard-digest] employee weekly digests done:", res);
        } catch (err) {
          console.error("[timecard-digest] employee weekly failed:", err);
        }
      },
      cronZone,
    );
    console.log("[scheduler] TIME_DIGEST_EMPLOYEE_WEEKLY_ENABLED", { cron: c, ...cronZone });
  }

  if (digestEmployeeMonthly) {
    const c = env("TIME_DIGEST_EMPLOYEE_MONTHLY_CRON") ?? "0 9 1 * *";
    cron.schedule(
      c,
      async () => {
        try {
          const res = await runEmployeeMonthlyDigests(new Date());
          console.log("[timecard-digest] employee monthly digests done:", res);
        } catch (err) {
          console.error("[timecard-digest] employee monthly failed:", err);
        }
      },
      cronZone,
    );
    console.log("[scheduler] TIME_DIGEST_EMPLOYEE_MONTHLY_ENABLED", { cron: c, ...cronZone });
  }

  if (taskDueEnabled) {
    const c = env("TASK_DUE_NOTIFICATIONS_CRON") ?? "0 8 * * *";
    cron.schedule(
      c,
      async () => {
        try {
          const res = await runTaskDueNotifications(new Date());
          console.log("[task-notifications] due alerts done:", res);
        } catch (err) {
          console.error("[task-notifications] due alerts failed:", err);
        }
      },
      cronZone,
    );
    console.log("[scheduler] TASK_DUE_NOTIFICATIONS_ENABLED", { cron: c, ...cronZone });
  }

  const anyDigest =
    digestAdminDaily ||
    digestAdminWeekly ||
    digestAdminMonthly ||
    digestEmployeeWeekly ||
    digestEmployeeMonthly;

  if (!reminders && !adminSummaryLegacy && !anyDigest && !taskDueEnabled) {
    console.log(
      "[scheduler] timecard email jobs disabled. Enable TIME_REMINDERS_ENABLED (daily miss HTML + Fri text), and/or TIME_DIGEST_* (see server/scheduler.ts), and/or legacy TIME_ADMIN_SUMMARY_ENABLED; restart pms.service.",
    );
  }
}
