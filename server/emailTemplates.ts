/**
 * Email templates for PMS transactional notifications.
 * Each function returns { subject, text, html } ready to pass to sendEmail().
 */

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface ClientNewTaskEmailOpts {
  /** Full name of the client who created the task */
  clientName: string;
  /** Name of the project the task was added to */
  projectName: string;
  /** Task title */
  taskTitle: string;
  /** Task description (may be empty) */
  taskDescription?: string;
  /** Checklist items submitted with the task */
  checklistItems?: string[];
  /** Public URL of the PMS app (e.g. https://pms.vnnovate.com); used for the login CTA */
  appUrl?: string;
  /** Used to deep-link into the task in PMS */
  projectId?: number;
  taskId?: number;
}

export interface ClientReopenTaskEmailOpts {
  clientName: string;
  projectName: string;
  taskTitle: string;
  reason: string;
  appUrl?: string;
  projectId?: number;
  taskId?: number;
}

function normalizeBaseUrl(appUrl?: string): string {
  return (appUrl ?? "").trim().replace(/\/$/, "");
}

function buildTaskLink(appUrl?: string, projectId?: number, taskId?: number): string {
  const base = normalizeBaseUrl(appUrl);
  if (!base || !projectId || !taskId) return "";
  // Legacy deep link is ingested once and opens the right project/task.
  return `${base}/?view=tasks&project=${encodeURIComponent(String(projectId))}&task=${encodeURIComponent(String(taskId))}`;
}

function wrapPmsEmailHtml(opts: { title: string; eyebrow: string; bodyHtml: string; ctaHref?: string; ctaText?: string; footerText: string }): string {
  const { title, eyebrow, bodyHtml, ctaHref, ctaText, footerText } = opts;
  const cta = ctaHref && ctaText
    ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px">
        <tr>
          <td align="left">
            <a href="${ctaHref}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:700">
              ${escHtml(ctaText)}
            </a>
          </td>
        </tr>
      </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,Helvetica,sans-serif;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:28px 0">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;max-width:640px">
        <tr>
          <td style="padding:18px 22px;background:linear-gradient(90deg,#eff6ff,#ffffff)">
            <div style="font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#2563eb">${escHtml(eyebrow)}</div>
            <div style="margin-top:6px;font-size:20px;font-weight:800;line-height:1.25;color:#0f172a">${escHtml(title)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:22px">
            ${bodyHtml}
            ${cta}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 22px;border-top:1px solid #eef2f7;background:#fafafa">
            <div style="font-size:12px;line-height:1.6;color:#64748b">${escHtml(footerText)}</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Builds the subject, plain-text, and HTML body for the "new client task" notification.
 */
export function buildClientNewTaskEmail(opts: ClientNewTaskEmailOpts): {
  subject: string;
  text: string;
  html: string;
} {
  const { clientName, projectName, taskTitle, appUrl } = opts;
  const descriptionText = opts.taskDescription?.trim() ?? "";
  const checklistItems = (opts.checklistItems ?? []).filter(Boolean);
  const taskUrl = buildTaskLink(appUrl, opts.projectId, opts.taskId);
  const loginUrl = normalizeBaseUrl(appUrl) ? `${normalizeBaseUrl(appUrl)}/login` : "";

  // ── Subject ──────────────────────────────────────────────────────────────────
  const subject = `[${projectName}] New client task: ${taskTitle}`;

  // ── Plain-text fallback ───────────────────────────────────────────────────────
  const SEP = "─".repeat(50);
  let text = `New Client Task — ${projectName}\n${SEP}\n\n`;
  text += `From:     ${clientName} (client)\n`;
  text += `Project:  ${projectName}\n`;
  text += `Task:     ${taskTitle}\n\n`;
  if (descriptionText) {
    text += `Description\n───────────\n${descriptionText}\n\n`;
  }
  if (checklistItems.length > 0) {
    text += `Checklist\n─────────\n`;
    checklistItems.forEach((item, i) => { text += `  ${i + 1}. ${item}\n`; });
    text += "\n";
  }
  text += loginUrl ? `Log in to review: ${loginUrl}\n` : "Log in to PMS to review this task.\n";

  // ── HTML ─────────────────────────────────────────────────────────────────────
  const descriptionBlock = descriptionText ? `
    <!-- Description -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr>
        <td style="padding-bottom:8px">
          <span style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.8px">Description</span>
        </td>
      </tr>
      <tr>
        <td style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 18px;font-size:14px;color:#4b5563;line-height:1.7">
          ${escHtml(descriptionText).replace(/\n/g, "<br>")}
        </td>
      </tr>
    </table>` : "";

  const checklistBlock = checklistItems.length > 0 ? `
    <!-- Checklist -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr>
        <td style="padding-bottom:10px">
          <span style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.8px">
            Checklist (${checklistItems.length} item${checklistItems.length > 1 ? "s" : ""})
          </span>
        </td>
      </tr>
      ${checklistItems.map((item, idx) => `
      <tr>
        <td style="padding:0 0 6px">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px">
            <tr>
              <td width="40" style="padding:10px 12px;text-align:center">
                <span style="display:inline-block;width:22px;height:22px;border:2px solid #d1d5db;border-radius:4px;background:#fff;line-height:18px;text-align:center;font-size:11px;color:#9ca3af">${idx + 1}</span>
              </td>
              <td style="padding:10px 12px 10px 0;font-size:14px;color:#374151">${escHtml(item)}</td>
            </tr>
          </table>
        </td>
      </tr>`).join("")}
    </table>` : "";

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#334155">
      <strong style="color:#0f172a">${escHtml(clientName)}</strong> (client) added a new task in <strong>${escHtml(projectName)}</strong>.
    </p>
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:#f8fafc">
      <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#64748b">Task</div>
      <div style="margin-top:6px;font-size:16px;font-weight:800;color:#0f172a;line-height:1.35">${escHtml(taskTitle)}</div>
    </div>
    <div style="height:16px"></div>
    ${descriptionBlock}
    ${checklistBlock}
    ${loginUrl ? `<div style="font-size:12px;color:#64748b;margin-top:8px">If the button doesn’t work: ${escHtml(taskUrl || loginUrl)}</div>` : ""}`;

  const html = wrapPmsEmailHtml({
    eyebrow: "New task",
    title: `${projectName}`,
    bodyHtml,
    ctaHref: taskUrl || loginUrl || undefined,
    ctaText: taskUrl ? "Open task in PMS" : loginUrl ? "Log in to PMS" : undefined,
    footerText:
      `You received this because “Notify on client task” is enabled for ${projectName}. ` +
      `You can change this in Members & Access.`,
  });

  return { subject, text, html };
}

export function buildClientReopenTaskEmail(opts: ClientReopenTaskEmailOpts): {
  subject: string;
  text: string;
  html: string;
} {
  const { clientName, projectName, taskTitle } = opts;
  const reason = (opts.reason ?? "").trim();
  const taskUrl = buildTaskLink(opts.appUrl, opts.projectId, opts.taskId);
  const loginUrl = normalizeBaseUrl(opts.appUrl) ? `${normalizeBaseUrl(opts.appUrl)}/login` : "";

  const subject = `[${projectName}] Client re-opened task: ${taskTitle}`;
  const SEP = "─".repeat(50);
  let text = `Client Re-opened Task — ${projectName}\n${SEP}\n\n`;
  text += `From:     ${clientName} (client)\n`;
  text += `Project:  ${projectName}\n`;
  text += `Task:     ${taskTitle}\n\n`;
  if (reason) text += `Reason\n──────\n${reason}\n\n`;
  text += taskUrl ? `Open task: ${taskUrl}\n` : loginUrl ? `Log in: ${loginUrl}\n` : "Log in to PMS to review.\n";

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#334155">
      <strong style="color:#0f172a">${escHtml(clientName)}</strong> (client) re-opened a task in <strong>${escHtml(projectName)}</strong>.
    </p>
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;background:#f8fafc">
      <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#64748b">Task</div>
      <div style="margin-top:6px;font-size:16px;font-weight:800;color:#0f172a;line-height:1.35">${escHtml(taskTitle)}</div>
    </div>
    ${reason ? `
      <div style="height:16px"></div>
      <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#64748b">Reason</div>
      <div style="margin-top:6px;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;background:#ffffff;color:#334155;line-height:1.7;font-size:14px">
        ${escHtml(reason).replace(/\n/g, "<br>")}
      </div>` : ""}
    ${(taskUrl || loginUrl) ? `<div style="font-size:12px;color:#64748b;margin-top:10px">If the button doesn’t work: ${escHtml(taskUrl || loginUrl)}</div>` : ""}`;

  const html = wrapPmsEmailHtml({
    eyebrow: "Task re-opened",
    title: `${projectName}`,
    bodyHtml,
    ctaHref: taskUrl || loginUrl || undefined,
    ctaText: taskUrl ? "Open task in PMS" : loginUrl ? "Log in to PMS" : undefined,
    footerText:
      `You received this because “Notify on client task” is enabled for ${projectName}. ` +
      `You can change this in Members & Access.`,
  });

  return { subject, text, html };
}
