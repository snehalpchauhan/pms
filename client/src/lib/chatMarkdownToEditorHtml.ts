function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineMarkdownToHtml(md: string): string {
  // images: ![alt](url)
  let s = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
    const safeAlt = escapeHtml(String(alt ?? ""));
    const safeUrl = escapeHtml(String(url ?? ""));
    return `<img src="${safeUrl}" alt="${safeAlt}" />`;
  });

  // links: [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    const safeText = escapeHtml(String(text ?? ""));
    const safeUrl = escapeHtml(String(url ?? ""));
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeText}</a>`;
  });

  // underline: ++text++
  s = s.replace(/\+\+([\s\S]+?)\+\+/g, (_m, inner) => `<u>${escapeHtml(String(inner ?? ""))}</u>`);

  // bold: **text**
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, (_m, inner) => `<strong>${escapeHtml(String(inner ?? ""))}</strong>`);

  // italic: *text*
  // keep this last to avoid interfering with **bold**
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, (_m, lead, inner) => `${lead}<em>${escapeHtml(String(inner ?? ""))}</em>`);

  return s;
}

/**
 * Best-effort conversion from our chat markdown (formatChatMarkdown) into
 * HTML that TipTap can accept via editor.commands.setContent(html).
 */
export function chatMarkdownToEditorHtml(markdown: string): string {
  const raw = String(markdown ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";

  const lines = raw.split("\n");
  const blocks: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith("- ")) {
        const itemText = (lines[i] ?? "").slice(2);
        items.push(`<li><p>${inlineMarkdownToHtml(itemText)}</p></li>`);
        i++;
      }
      i--; // compensate for outer loop increment
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (line.trim() === "") {
      continue;
    }

    blocks.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
  }

  return blocks.join("");
}

