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
  return turndown.turndown(html).replace(/\u00a0/g, " ").trim();
}
