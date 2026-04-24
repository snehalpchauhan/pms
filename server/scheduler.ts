import cron from "node-cron";
import {
  sendAdminTimecardSummaryEmail,
  sendDailyMissingTimecardEmails,
  sendWeeklyMissingTimecardEmails,
} from "./jobs/timecardReminders";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function startSchedulers() {
  const reminders = (env("TIME_REMINDERS_ENABLED") ?? "").toLowerCase() === "true";
  /** Opt in with TIME_ADMIN_SUMMARY_ENABLED=true. Defaults recipient to snehal@vnnovate.com unless TIME_ADMIN_SUMMARY_TO is set. */
  const adminSummaryEnabled = (env("TIME_ADMIN_SUMMARY_ENABLED") ?? "").toLowerCase() === "true";
  const adminSummaryTo = env("TIME_ADMIN_SUMMARY_TO")?.trim() || "snehal@vnnovate.com";

  if (reminders) {
    const daily = env("TIME_REMINDERS_DAILY_CRON") ?? "0 9 * * 1-5"; // 09:00 Mon-Fri
    const weekly = env("TIME_REMINDERS_WEEKLY_CRON") ?? "0 17 * * 5"; // 17:00 Fri

    cron.schedule(daily, async () => {
      try {
        const res = await sendDailyMissingTimecardEmails(new Date());
        console.log("[timecard-reminder] daily done:", res);
      } catch (err) {
        console.error("[timecard-reminder] daily failed:", err);
      }
    });

    cron.schedule(weekly, async () => {
      try {
        const res = await sendWeeklyMissingTimecardEmails(new Date());
        console.log("[timecard-reminder] weekly done:", res);
      } catch (err) {
        console.error("[timecard-reminder] weekly failed:", err);
      }
    });

    console.log("[scheduler] timecard reminders enabled", { daily, weekly });
  }

  if (adminSummaryEnabled) {
    const adminCron = env("TIME_ADMIN_SUMMARY_CRON") ?? "0 7 * * *"; // 07:00 every day, server local time
    cron.schedule(adminCron, async () => {
      try {
        const res = await sendAdminTimecardSummaryEmail(adminSummaryTo, new Date());
        console.log("[timecard-reminder] admin daily summary done:", res);
      } catch (err) {
        console.error("[timecard-reminder] admin daily summary failed:", err);
      }
    });
    console.log("[scheduler] admin timecard summary enabled", { to: adminSummaryTo, cron: adminCron });
  }

  if (!reminders && !adminSummaryEnabled) {
    console.log(
      "[scheduler] timecard email jobs disabled: set TIME_REMINDERS_ENABLED=true and/or TIME_ADMIN_SUMMARY_ENABLED=true in server .env, then restart pms.service",
    );
  }
}

