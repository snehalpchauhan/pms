import nodemailer from "nodemailer";

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
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

function smtpConfigured(): boolean {
  return Boolean(
    env("SMTP_HOST") && env("SMTP_PORT") && env("SMTP_USER") && env("SMTP_PASS") && (env("SMTP_FROM") || env("BREVO_FROM_EMAIL")),
  );
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

/** Primary: Brevo transactional API. Fallback: SMTP if Brevo not configured. */
export async function sendEmail(input: SendEmailInput): Promise<{ sent: boolean; reason?: string }> {
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
        to: [{ email: input.to.trim() }],
        subject: input.subject,
        textContent: input.text,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[email] Brevo API error:", res.status, errText?.slice(0, 500));
      return { sent: false, reason: `Brevo send failed (HTTP ${res.status})` };
    }
    return { sent: true };
  }

  if (!smtpConfigured() || !env("SMTP_HOST")) {
    return {
      sent: false,
      reason:
        "Email not configured: set BREVO_API_KEY (or BREVO_KEY) for Brevo, or set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS and SMTP_FROM / BREVO_FROM_EMAIL",
    };
  }

  const from = env("SMTP_FROM") ?? env("BREVO_FROM_EMAIL") ?? defaultFromAddress().email;
  const transporter = await getTransporter();
  await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
  return { sent: true };
}
