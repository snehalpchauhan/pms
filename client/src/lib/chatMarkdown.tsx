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
    return <u className="underline underline-offset-2">{normalized.slice(2, -2)}</u>;
  }
  if (normalized.startsWith("**") && normalized.endsWith("**") && normalized.length > 4) {
    return <strong>{normalized.slice(2, -2)}</strong>;
  }
  if (
    normalized.startsWith("*") &&
    normalized.endsWith("*") &&
    !normalized.startsWith("**") &&
    normalized.length > 2
  ) {
    return <em>{normalized.slice(1, -1)}</em>;
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
  return (
    <>
      {lines.map((line, li) => (
        <span key={li}>
          {li > 0 ? <br /> : null}
          {formatChatLine(line, li)}
        </span>
      ))}
    </>
  );
}

function formatChatLine(line: string, lineKey: number): ReactNode {
  const parts = line.split(
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
