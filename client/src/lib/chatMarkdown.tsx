import type { ReactNode } from "react";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatPlainWithUrls(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(
        <span key={`${keyBase}-t-${k++}`}>{escapeHtml(text.slice(last, m.index))}</span>,
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
  if (last < text.length) {
    nodes.push(<span key={`${keyBase}-e-${k++}`}>{escapeHtml(text.slice(last))}</span>);
  }
  return nodes.length ? nodes : [<span key={`${keyBase}-z`}>{escapeHtml(text)}</span>];
}

function formatSegment(part: string, i: number): ReactNode {
  // Some inputs may escape "+" as "\+" (e.g. when copied through other systems).
  // Normalize first so underline/bold parsing still works.
  const normalized = part.replace(/\\\+/g, "+");

  if (normalized.startsWith("++") && normalized.endsWith("++") && normalized.length > 4) {
    return <u className="underline underline-offset-2">{formatChatLine(normalized.slice(2, -2), i)}</u>;
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
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const isBullet = line.trimStart().startsWith("- ");
    if (!isBullet) {
      nodes.push(
        <span key={`l-${i}`}>
          {nodes.length > 0 ? <br /> : null}
          {formatChatLine(line, i)}
        </span>,
      );
      i += 1;
      continue;
    }

    // Group consecutive "- " lines into a <ul>.
    const items: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trimStart().startsWith("- ")) {
      const raw = lines[i] ?? "";
      const trimmed = raw.trimStart().slice(2); // remove "- "
      items.push(trimmed);
      i += 1;
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
  // Normalize escaped "+" BEFORE splitting, otherwise the underline token won't match.
  const normalizedLine = line.replace(/\\\+/g, "+");
  const parts = normalizedLine.split(
    /(\+\+[^+]+\+\+|\*\*[^*]+\*\*|\*[^*]+\*|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/g,
  );
  return (
    <>
      {parts.map((part, i) => (
        <span key={`${lineKey}-${i}`}>{formatSegment(part, i)}</span>
      ))}
    </>
  );
}
