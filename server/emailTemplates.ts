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
  const loginUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/login` : "";

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

  const ctaBlock = loginUrl ? `
    <!-- CTA Button -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">
      <tr>
        <td align="center" style="padding-top:8px">
          <a href="${loginUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:.3px">
            Log in to Review Task &rarr;
          </a>
        </td>
      </tr>
    </table>` : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.10);max-width:600px">

        <!-- Header -->
        <tr>
          <td style="background:#1e293b;padding:24px 32px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:.5px">PMS</span>
                  <span style="font-size:13px;color:#94a3b8;margin-left:10px">Project Management</span>
                </td>
                <td align="right">
                  <span style="background:#3b82f6;color:#fff;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;letter-spacing:.3px">NEW TASK</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Project Banner -->
        <tr>
          <td style="background:#2563eb;padding:12px 32px">
            <span style="font-size:12px;color:#bfdbfe;font-weight:500;text-transform:uppercase;letter-spacing:.8px">Project</span>
            <span style="font-size:14px;color:#ffffff;font-weight:600;margin-left:8px">${escHtml(projectName)}</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px">

            <!-- Intro -->
            <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.5">
              <strong style="color:#1e293b">${escHtml(clientName)}</strong> (client) has submitted a new task that requires your attention.
            </p>

            <!-- Task Title -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-left:4px solid #2563eb;border-radius:0 8px 8px 0;margin-bottom:24px">
              <tr>
                <td style="padding:18px 20px">
                  <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">Task Title</div>
                  <div style="font-size:18px;font-weight:700;color:#1e293b;line-height:1.3">${escHtml(taskTitle)}</div>
                </td>
              </tr>
            </table>

            ${descriptionBlock}
            ${checklistBlock}
            ${ctaBlock}

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px">
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.6">
              This email was sent by <strong>PMS</strong> because you have task notifications enabled for
              the project <strong>${escHtml(projectName)}</strong>.<br>
              You can manage your notification preferences from the project&rsquo;s Members &amp; Access settings.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
