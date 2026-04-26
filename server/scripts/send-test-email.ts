/**
 * Smoke test for transactional email (Brevo or SMTP).
 *
 * Usage (from repo root, with .env loaded):
 *   npx tsx server/scripts/send-test-email.ts you@example.com
 *
 * If you omit the address, uses TEST_EMAIL_TO, then BREVO_FROM_EMAIL, then SMTP_FROM / BREVO_FROM_EMAIL default.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFromCwd(): void {
  if (process.env.BREVO_API_KEY || process.env.BREVO_KEY || process.env.SMTP_HOST) return;
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
  const { sendEmail } = await import("../email");
  const arg = process.argv[2]?.trim();
  const fromDefault = process.env.BREVO_FROM_EMAIL?.trim() || process.env.SMTP_FROM?.trim();
  const to =
    arg ||
    process.env.TEST_EMAIL_TO?.trim() ||
    process.env.BREVO_FROM_EMAIL?.trim() ||
    fromDefault;
  if (!to) {
    console.error(
      "error: pass recipient as first arg, or set TEST_EMAIL_TO or BREVO_FROM_EMAIL / SMTP_FROM in .env",
    );
    process.exit(1);
  }
  const stamp = new Date().toISOString();
  const res = await sendEmail({
    to,
    subject: `PMS email smoke test (${stamp})`,
    text: `This is an automated smoke test from PMS.\n\nSent at: ${stamp}\n`,
  });
  if (!res.sent) {
    console.error("error: not sent:", res.reason);
    process.exit(1);
  }
  console.log("ok: sent to", to, res.brevoMessageId ? `brevoMessageId=${res.brevoMessageId}` : "");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
