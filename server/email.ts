import nodemailer from "nodemailer";

export type SendEmailInput = {
  /** One or more recipients (Brevo: all in one transactional send). */
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

export type SendEmailResult = {
  sent: boolean;
  reason?: string;
  /** Present when Brevo accepted the send; use with Brevo dashboard or `brevo-transactional-events` script. */
  brevoMessageId?: string;
};

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

function brevoConfigured(): boolean {
  return Boolean(env("BREVO_API_KEY") || env("BREVO_KEY"));
}

function getBrevoApiKey(): string | undefined {
  return env("BREVO_API_KEY") ?? env("BREVO_KEY");
}

/** True when SMTP credentials and a usable From address are set (see sendEmail / defaultFromAddress). */
function smtpConfigured(): boolean {
  const hasFrom = Boolean(env("SMTP_FROM") || env("BREVO_FROM_EMAIL") || env("SMTP_FROM_EMAIL"));
  return Boolean(env("SMTP_HOST") && env("SMTP_PORT") && env("SMTP_USER") && env("SMTP_PASS") && hasFrom);
}

let transporterPromise: Promise<nodemailer.Transporter> | null = null;

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (transporterPromise) return transporterPromise;
  transporterPromise = (async () => {
    const host = env("SMTP_HOST")!;
    const port = Number(env("SMTP_PORT")!);
    const secure = env("SMTP_SECURE")?.toLowerCase() === "true" || port === 465;
    const user = env("SMTP_USER")!;
    const pass = env("SMTP_PASS")!;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    if (process.env.NODE_ENV !== "production") {
      try {
        await transporter.verify();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[email] SMTP verify failed (dev only):", msg);
      }
    }

    return transporter;
  })();
  return transporterPromise;
}

function defaultFromAddress(): { email: string; name: string } {
  const email = env("BREVO_FROM_EMAIL") ?? env("SMTP_FROM_EMAIL") ?? "pms@vnnovate.com";
  const name = env("BREVO_FROM_NAME") ?? "PMS";
  return { email, name };
}

function normalizeRecipients(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : [to];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const e = String(raw).trim();
    if (!e || seen.has(e.toLowerCase())) continue;
    seen.add(e.toLowerCase());
    out.push(e);
  }
  return out;
}

/** Primary: Brevo transactional API. Fallback: SMTP if Brevo not configured. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const recipients = normalizeRecipients(input.to);
  if (recipients.length === 0) {
    return { sent: false, reason: "No recipients" };
  }

  if (brevoConfigured()) {
    const key = getBrevoApiKey()!;
    const { email, name } = defaultFromAddress();
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": key,
      },
      body: JSON.stringify({
        sender: { name, email },
        to: recipients.map((e) => ({ email: e })),
        subject: input.subject,
        textContent: input.text,
        ...(input.html ? { htmlContent: input.html } : {}),
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[email] Brevo API error:", res.status, errText?.slice(0, 500));
      return { sent: false, reason: `Brevo send failed (HTTP ${res.status})` };
    }
    let brevoMessageId: string | undefined;
    try {
      const body = (await res.json()) as { messageId?: string };
      if (body?.messageId && typeof body.messageId === "string") {
        brevoMessageId = body.messageId;
        console.log("[email] Brevo accepted:", { to: recipients, brevoMessageId });
      }
    } catch {
      /* non-JSON success body is unexpected but still “sent” */
    }
    return { sent: true, brevoMessageId };
  }

  if (!smtpConfigured() || !env("SMTP_HOST")) {
    return {
      sent: false,
      reason:
        "Email not configured: set BREVO_API_KEY (or BREVO_KEY) for Brevo, or set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS and one of SMTP_FROM, BREVO_FROM_EMAIL, or SMTP_FROM_EMAIL",
    };
  }

  const from = env("SMTP_FROM") ?? env("BREVO_FROM_EMAIL") ?? env("SMTP_FROM_EMAIL") ?? defaultFromAddress().email;
  const transporter = await getTransporter();
  await transporter.sendMail({
    from,
    to: recipients.length === 1 ? recipients[0] : recipients,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
  });
  console.log("[email] SMTP sent:", { to: recipients });
  return { sent: true };
}

/**
 * Log once at process start so operators can see whether outbound email is available.
 * Scheduled mail additionally requires TIME_REMINDERS_ENABLED / TIME_DIGEST_* etc. (see scheduler logs).
 */
export function logEmailOutboundSummary(): void {
  if (brevoConfigured()) {
    const { email, name } = defaultFromAddress();
    console.log("[email] outbound transport: Brevo API · sender", `${name} <${email}>`);
    return;
  }
  if (smtpConfigured()) {
    console.log("[email] outbound transport: SMTP · host", env("SMTP_HOST"), "· port", env("SMTP_PORT"));
    return;
  }
  console.warn(
    "[email] outbound transport: NOT CONFIGURED — set BREVO_API_KEY (or BREVO_KEY), or full SMTP_* plus SMTP_FROM / BREVO_FROM_EMAIL / SMTP_FROM_EMAIL on this process. UI-only settings do not inject API keys.",
  );
}

const BREVO_EVENTS_URL = "https://api.brevo.com/v3/smtp/statistics/events";

/**
 * Look up recent transactional events in Brevo (optional `messageId` filter when supported).
 * Requires BREVO_API_KEY. Useful to confirm delivery vs. bounce after a send.
 */
export async function fetchBrevoTransactionalEvents(params: {
  messageId?: string;
  email?: string;
  limit?: number;
}): Promise<unknown> {
  const key = getBrevoApiKey();
  if (!key) throw new Error("BREVO_API_KEY is not set");
  const sp = new URLSearchParams();
  sp.set("limit", String(params.limit ?? 20));
  if (params.messageId) sp.set("messageId", params.messageId);
  if (params.email) sp.set("email", params.email);
  const res = await fetch(`${BREVO_EVENTS_URL}?${sp.toString()}`, {
    headers: { accept: "application/json", "api-key": key },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Brevo events HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as unknown;
}
