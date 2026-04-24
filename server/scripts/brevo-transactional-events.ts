/**
 * Print recent Brevo transactional events (or filter by messageId from a send).
 *
 *   cd /var/www/pms && set -a && source .env && set +a && npx tsx server/scripts/brevo-transactional-events.ts
 *   npx tsx server/scripts/brevo-transactional-events.ts <messageId>
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFromCwd(): void {
  if (process.env.BREVO_API_KEY || process.env.BREVO_KEY) return;
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
  const { fetchBrevoTransactionalEvents } = await import("../email");
  const messageId = process.argv[2]?.trim();
  const email = process.env.BREVO_EVENTS_EMAIL?.trim();
  const out = await fetchBrevoTransactionalEvents({
    messageId: messageId || undefined,
    email: email || undefined,
    limit: 30,
  });
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
