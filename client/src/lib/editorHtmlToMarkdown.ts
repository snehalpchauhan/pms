import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  emDelimiter: "*",
  strongDelimiter: "**",
});

turndown.addRule("chatUnderline", {
  filter: ["u"],
  replacement: (content) => `++${content}++`,
});

/** Convert TipTap / ProseMirror HTML to markdown for the chat API (matches formatChatMarkdown). */
export function editorHtmlToMarkdown(html: string): string {
  let md = turndown.turndown(html).replace(/\u00a0/g, " ").trim();
  // Turndown escapes "- " at line start inside paragraphs as "\- " so markdown parsers
  // don't treat pasted bullet lines as list syntax — restore a normal hyphen + space.
  md = md.replace(/^(\s*)\\-(\s)/gm, "$1-$2");
  return md;
}
