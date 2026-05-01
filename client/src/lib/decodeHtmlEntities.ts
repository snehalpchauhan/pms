/** Decode common entities before re-escaping for safe HTML (fixes pasted `&amp;` showing literally). */
export function decodeBasicHtmlEntities(s: string): string {
  if (!s) return s;
  let t = String(s);
  t = t.replace(/&#x([0-9a-fA-F]+);/g, (m, hex: string) => {
    const n = parseInt(hex, 16);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
  });
  t = t.replace(/&#(\d+);/g, (m, d: string) => {
    const n = parseInt(d, 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCharCode(n) : m;
  });
  t = t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
  t = t.replace(/&amp;/g, "&");
  return t;
}
