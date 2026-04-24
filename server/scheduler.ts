import cron from "node-cron";
import { sendDailyMissingTimecardEmails, sendWeeklyMissingTimecardEmails } from "./jobs/timecardReminders";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function startSchedulers() {
  const enabled = (env("TIME_REMINDERS_ENABLED") ?? "").toLowerCase() === "true";
  if (!enabled) return;

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

