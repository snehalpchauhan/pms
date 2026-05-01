import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Smile, Paperclip, Loader2, AtSign } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { editorHtmlToMarkdown } from "@/lib/editorHtmlToMarkdown";
import { chatMarkdownToEditorHtml } from "@/lib/chatMarkdownToEditorHtml";
import { cn } from "@/lib/utils";

const QUICK_EMOJIS = ["😀", "👍", "❤️", "🎉", "✅", "🔥", "👀", "🙏", "💬", "📎"];

export type ChatMentionCandidate = { id: string | number; name: string; username: string };

export type ChatRichComposerProps = {
  channelId: number | null;
  placeholder: string;
  /** Called with markdown; should throw on failure so the composer keeps content. */
  onSend: (markdown: string) => Promise<void>;
  /** Optional initial markdown to prefill editor (used for editing messages). */
  initialMarkdown?: string;
  /** Project members for @mentions (inserts `@login` — server notifies on that pattern). */
  mentionCandidates?: ChatMentionCandidate[];
};

export function ChatRichComposer({
  channelId,
  placeholder,
  onSend,
  initialMarkdown,
  mentionCandidates = [],
}: ChatRichComposerProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: false,
          codeBlock: false,
          blockquote: false,
          horizontalRule: false,
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          HTMLAttributes: {
            class: "text-primary underline font-medium",
            target: "_blank",
            rel: "noopener noreferrer",
          },
        }),
        Underline,
        Image.configure({
          inline: false,
          allowBase64: false,
          HTMLAttributes: {
            class: "max-h-40 rounded-md border border-border/60 object-contain my-1",
          },
        }),
        Placeholder.configure({ placeholder }),
      ],
      content: "",
      shouldRerenderOnTransaction: true,
      editorProps: {
        attributes: {
          class: cn(
            "tiptap chat-rich-editor min-h-[5rem] px-0 py-1 text-[13px] text-foreground outline-none",
            "prose max-w-none dark:prose-invert",
            "prose-p:my-1 prose-ul:my-1 prose-li:my-0",
            "prose-p:text-[13px] prose-li:text-[13px] prose-a:text-[13px]",
            "[&_img]:max-h-40 [&_img]:rounded-md [&_img]:border [&_img]:border-border/60",
          ),
        },
      },
    },
    [placeholder],
  );

  useEffect(() => {
    editor?.commands.clearContent();
  }, [channelId, editor]);

  useEffect(() => {
    if (!editor) return;
    const md = typeof initialMarkdown === "string" ? initialMarkdown.trim() : "";
    if (!md) return;
    const html = chatMarkdownToEditorHtml(md);
    if (!html) return;
    // setContent resets selection; that's okay for edit flows
    editor.commands.setContent(html);
  }, [editor, initialMarkdown]);

  const getMarkdown = useCallback(() => {
    if (!editor) return "";
    return editorHtmlToMarkdown(editor.getHTML());
  }, [editor]);

  const handleSubmit = useCallback(async () => {
    if (!editor || channelId == null) return;
    const md = getMarkdown();
    if (!md) return;
    try {
      await onSendRef.current(md);
      editor.commands.clearContent();
    } catch {
      /* parent toasts */
    }
  }, [editor, channelId, getMarkdown]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      e.preventDefault();
      void handleSubmit();
    };
    dom.addEventListener("keydown", onKeyDown);
    return () => dom.removeEventListener("keydown", onKeyDown);
  }, [editor, handleSubmit]);

  const canSend = Boolean(getMarkdown()) && channelId != null && !Number.isNaN(channelId);

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || channelId == null || !editor) return;
    if (file.size > 3 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 3MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") resolve(reader.result);
          else reject(new Error("read"));
        };
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      });
      const res = await apiRequest("POST", `/api/channels/${channelId}/chat-upload`, {
        fileDataUrl: dataUrl,
      });
      const { url } = (await res.json()) as { url: string };
      const isImg = file.type.startsWith("image/");
      if (isImg) {
        editor.chain().focus().setImage({ src: url, alt: file.name }).run();
      } else {
        editor
          .chain()
          .focus()
          .insertContent({
            type: "paragraph",
            content: [
              {
                type: "text",
                text: file.name,
                marks: [{ type: "link", attrs: { href: url, target: "_blank", rel: "noopener noreferrer" } }],
              },
            ],
          })
          .run();
      }
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const insertEmoji = (emoji: string) => {
    editor?.chain().focus().insertContent(emoji).run();
  };

  const filteredMentions = useMemo(() => {
    const q = mentionFilter.trim().toLowerCase();
    const list = mentionCandidates.filter((m) => m.username?.trim());
    if (!q) return list;
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        String(m.username).toLowerCase().includes(q) ||
        String(m.id) === q,
    );
  }, [mentionCandidates, mentionFilter]);

  const insertMention = useCallback(
    (m: ChatMentionCandidate) => {
      if (!editor) return;
      const u = String(m.username).trim();
      if (!u) return;
      editor.chain().focus().insertContent(`@${u} `).run();
      setMentionOpen(false);
      setMentionFilter("");
    },
    [editor],
  );

  if (!editor) {
    return (
      <div className="min-h-[6rem] rounded-md border border-border/50 bg-muted/20 animate-pulse" aria-hidden />
    );
  }

  return (
    <div className="space-y-0">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={handleAttachFile}
      />
      <EditorContent editor={editor} />
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/40">
        <div className="flex items-center gap-0.5">
          {/* Bullet list toggle hidden — current Turndown output makes rendering inconsistent. */}

          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 text-muted-foreground hover:text-foreground",
              editor.isActive("bold") && "bg-muted text-foreground",
            )}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().toggleBold().run();
            }}
            title="Bold"
          >
            <span className="font-bold text-xs">B</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 text-muted-foreground hover:text-foreground",
              editor.isActive("italic") && "bg-muted text-foreground",
            )}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().toggleItalic().run();
            }}
            title="Italic"
          >
            <span className="italic text-xs font-serif">I</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 text-muted-foreground hover:text-foreground",
              editor.isActive("underline") && "bg-muted text-foreground",
            )}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().toggleUnderline().run();
            }}
            title="Underline"
          >
            <span className="text-xs underline underline-offset-2">U</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || channelId == null}
            title="Attach image or PDF"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
              >
                <Smile className="w-5 h-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" align="end">
              <div className="grid grid-cols-5 gap-1">
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className="text-xl p-2 rounded-md hover:bg-muted"
                    onClick={() => insertEmoji(em)}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          {mentionCandidates.length > 0 && (
            <Popover
              open={mentionOpen}
              onOpenChange={(o) => {
                setMentionOpen(o);
                if (!o) setMentionFilter("");
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  title="Mention (@username)"
                >
                  <AtSign className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="end">
                <div className="border-b border-border p-2">
                  <Input
                    placeholder="Search name or username…"
                    value={mentionFilter}
                    onChange={(e) => setMentionFilter(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <ScrollArea className="max-h-52">
                  <div className="p-1">
                    {filteredMentions.length === 0 ? (
                      <p className="px-2 py-3 text-xs text-muted-foreground">No matches</p>
                    ) : (
                      filteredMentions.map((m) => (
                        <button
                          key={String(m.id)}
                          type="button"
                          className="flex w-full flex-col items-start gap-0 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                          onClick={() => insertMention(m)}
                        >
                          <span className="font-medium text-foreground">{m.name}</span>
                          <span className="text-muted-foreground">@{m.username}</span>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          )}
          <Button size="sm" className="px-6" type="button" onClick={() => void handleSubmit()} disabled={!canSend}>
            Send
          </Button>
        </div>
      </div>
      {mentionCandidates.length > 0 && (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Use <span className="font-mono text-foreground">@username</span> (login name) to notify someone in this
          project.
        </p>
      )}
    </div>
  );
}
