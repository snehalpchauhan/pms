import type { ReactNode } from "react";
import { decodeBasicHtmlEntities } from "@/lib/decodeHtmlEntities";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatPlainWithUrls(text: string, keyBase: string): ReactNode[] {
  const decoded = decodeBasicHtmlEntities(text);
  const nodes: ReactNode[] = [];
  const re = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(decoded)) !== null) {
    if (m.index > last) {
      nodes.push(
        <span key={`${keyBase}-t-${k++}`}>{escapeHtml(decoded.slice(last, m.index))}</span>,
      );
    }
    const href = m[1]!;
    nodes.push(
      <a
        key={`${keyBase}-u-${k++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-primary break-all"
      >
        {href}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < decoded.length) {
    nodes.push(<span key={`${keyBase}-e-${k++}`}>{escapeHtml(decoded.slice(last))}</span>);
  }
  return nodes.length ? nodes : [<span key={`${keyBase}-z`}>{escapeHtml(decoded)}</span>];
}

function formatSegment(part: string, i: number): ReactNode {
  // Some inputs may escape markdown markers (e.g. "\+" or "\*") depending on the converter.
  // Normalize first so underline/bold/italic parsing still works.
  const normalized = part.replace(/\\([+*-])/g, "$1");

  // Bold + Italic: ***text***
  const boldItalic = /^\*\*\*([\s\S]+)\*\*\*$/.exec(normalized);
  if (boldItalic) {
    return (
      <strong>
        <em>{formatChatLine(boldItalic[1], i)}</em>
      </strong>
    );
  }

  // Combined tokens (e.g. TipTap produces underline+bold).
  // Examples: **++text++**, ++**text**++
  const boldUnderlineInner = /^\*\*\+\+([\s\S]+)\+\+\*\*$/.exec(normalized);
  if (boldUnderlineInner) {
    return (
      <strong>
        <u className="underline underline-offset-2">{formatChatLine(boldUnderlineInner[1], i)}</u>
      </strong>
    );
  }
  const underlineBoldInner = /^\+\+\*\*([\s\S]+)\*\*\+\+$/.exec(normalized);
  if (underlineBoldInner) {
    return (
      <u className="underline underline-offset-2">
        <strong>{formatChatLine(underlineBoldInner[1], i)}</strong>
      </u>
    );
  }

  // Italic + Underline: *++text++*
  const italicUnderlineInner = /^\*\+\+([\s\S]+)\+\+\*$/.exec(normalized);
  if (italicUnderlineInner) {
    return (
      <em>
        <u className="underline underline-offset-2">{formatChatLine(italicUnderlineInner[1], i)}</u>
      </em>
    );
  }
  // Underline + Italic: ++*text*++
  const underlineItalicInner = /^\+\+\*([\s\S]+)\*\+\+$/.exec(normalized);
  if (underlineItalicInner) {
    return (
      <u className="underline underline-offset-2">
        <em>{formatChatLine(underlineItalicInner[1], i)}</em>
      </u>
    );
  }

  if (normalized.startsWith("++") && normalized.endsWith("++") && normalized.length > 4) {
    return <u className="underline underline-offset-2">{formatChatLine(normalized.slice(2, -2), i)}</u>;
  }
  if (normalized.startsWith("***") && normalized.endsWith("***") && normalized.length > 6) {
    return (
      <strong>
        <em>{formatChatLine(normalized.slice(3, -3), i)}</em>
      </strong>
    );
  }
  if (normalized.startsWith("**") && normalized.endsWith("**") && normalized.length > 4) {
    return <strong>{formatChatLine(normalized.slice(2, -2), i)}</strong>;
  }
  if (
    normalized.startsWith("*") &&
    normalized.endsWith("*") &&
    !normalized.startsWith("**") &&
    normalized.length > 2
  ) {
    return <em>{formatChatLine(normalized.slice(1, -1), i)}</em>;
  }

  const img = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(normalized);
  if (img) {
    return (
      <img
        src={img[2]}
        alt={img[1]}
        className="max-w-full rounded-md max-h-52 mt-1 border border-border/60 object-contain"
      />
    );
  }
  const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(normalized);
  if (link) {
    return (
      <a href={link[2]} target="_blank" rel="noopener noreferrer" className="underline text-primary">
        {link[1]}
      </a>
    );
  }
  return <span>{formatPlainWithUrls(normalized, `p${i}`)}</span>;
}

/** Renders a small markdown subset: ++underline++, **bold**, *italic*, ![alt](url), [text](url), URLs, newlines. */
export function formatChatMarkdown(text: string): ReactNode {
  if (!text) return null;
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  const bulletRe = /^\s*-\s+(.*)$/;
  const isBlank = (s: string) => s.trim().length === 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const bulletMatch = bulletRe.exec(line);
    if (!bulletMatch) {
      nodes.push(
        <span key={`l-${i}`}>
          {nodes.length > 0 ? <br /> : null}
          {formatChatLine(line, i)}
        </span>,
      );
      i += 1;
      continue;
    }

    // Group consecutive bullet lines into a <ul>. Blank/whitespace-only
    // spacer lines (Turndown emits them between <li><p>...</p></li> items)
    // should NOT break the list.
    const items: string[] = [];
    while (i < lines.length) {
      const cur = lines[i] ?? "";
      const m = bulletRe.exec(cur);
      if (m) {
        items.push(m[1] ?? "");
        i += 1;
        continue;
      }
      // Look ahead: if next non-blank line is also a bullet, skip the blank.
      if (isBlank(cur)) {
        let j = i + 1;
        while (j < lines.length && isBlank(lines[j] ?? "")) j += 1;
        if (j < lines.length && bulletRe.test(lines[j] ?? "")) {
          i = j;
          continue;
        }
      }
      break;
    }


    nodes.push(
      <ul key={`ul-${i}`} className="list-disc pl-5 my-2 space-y-1">
        {items.map((t, idx) => (
          <li key={idx} className="leading-relaxed">
            {formatChatLine(t, idx)}
          </li>
        ))}
      </ul>,
    );
  }

  return <>{nodes}</>;
}

function formatChatLine(line: string, lineKey: number): ReactNode {
  // Normalize escaped markers BEFORE splitting, otherwise tokens won't match.
  const normalizedLine = line.replace(/\\([+*-])/g, "$1");
  // Order matters: longer/combined tokens must come BEFORE the simpler ones
  // so e.g. `***Hiii***` isn't split into stray `*` + `**Hiii**` + `**`.
  const parts = normalizedLine.split(
    /(\*\*\+\+[^+*]+\+\+\*\*|\+\+\*\*[^+*]+\*\*\+\+|\*\+\+[^+*]+\+\+\*|\+\+\*[^+*]+\*\+\+|\*\*\*[^*]+\*\*\*|\+\+[^+]+\+\+|\*\*[^*]+\*\*|\*[^*]+\*|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/g,
  );

  return (
    <>
      {parts.map((part, i) => (
        <span key={`${lineKey}-${i}`}>{formatSegment(part, i)}</span>
      ))}
    </>
  );
}
