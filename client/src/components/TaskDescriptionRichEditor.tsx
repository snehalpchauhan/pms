import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Smile, Paperclip, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { editorHtmlToMarkdown } from "@/lib/editorHtmlToMarkdown";
import { cn } from "@/lib/utils";

const QUICK_EMOJIS = ["😀", "👍", "❤️", "🎉", "✅", "🔥", "👀", "🙏", "💬", "📎"];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("read"));
    };
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
}

async function replaceDataImagesInHtml(html: string, upload: (dataUrl: string) => Promise<string>): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const imgs = Array.from(doc.querySelectorAll("img[src]"));
  for (const img of imgs) {
    const src = img.getAttribute("src");
    if (!src || !src.startsWith("data:")) continue;
    try {
      const url = await upload(src);
      img.setAttribute("src", url);
    } catch {
      img.remove();
    }
  }
  return doc.body.innerHTML;
}

export type TaskDescriptionRichEditorHandle = {
  getMarkdown: () => string;
  clear: () => void;
};

export type TaskDescriptionRichEditorProps = {
  projectId: number | null;
  /** When this toggles true, editor content is cleared (e.g. modal opened). */
  resetSignal: boolean;
  placeholder: string;
};

export const TaskDescriptionRichEditor = forwardRef<TaskDescriptionRichEditorHandle, TaskDescriptionRichEditorProps>(
  function TaskDescriptionRichEditor({ projectId, resetSignal, placeholder }, ref) {
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const editorRef = useRef<Editor | null>(null);
    const projectIdRef = useRef(projectId);
    projectIdRef.current = projectId;

    const uploadDataUrl = useCallback(
      async (fileDataUrl: string) => {
        const pid = projectIdRef.current;
        if (pid == null || !Number.isInteger(pid) || pid <= 0) {
          throw new Error("No project selected");
        }
        const res = await apiRequest("POST", `/api/projects/${pid}/task-description-upload`, {
          fileDataUrl,
        });
        const { url } = (await res.json()) as { url: string };
        return url;
      },
      [],
    );
    const uploadDataUrlRef = useRef(uploadDataUrl);
    uploadDataUrlRef.current = uploadDataUrl;

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
          handlePaste(view, event) {
            const pid = projectIdRef.current;
            if (pid == null) return false;
            const cd = event.clipboardData;
            if (!cd) return false;

            const files = Array.from(cd.files ?? []);
            const imageFile = files.find((f) => f.type.startsWith("image/"));
            if (imageFile) {
              event.preventDefault();
              void (async () => {
                const ed = editorRef.current;
                if (!ed) return;
                try {
                  const dataUrl = await fileToDataUrl(imageFile);
                  const url = await uploadDataUrlRef.current(dataUrl);
                  ed.chain().focus().setImage({ src: url, alt: imageFile.name }).run();
                } catch (err) {
                  toast({
                    title: "Paste failed",
                    description: err instanceof Error ? err.message : "Could not upload image.",
                    variant: "destructive",
                  });
                }
              })();
              return true;
            }

            const html = cd.getData("text/html");
            if (html && /data:image\//i.test(html)) {
              event.preventDefault();
              void (async () => {
                const ed = editorRef.current;
                if (!ed) return;
                try {
                  const cleaned = await replaceDataImagesInHtml(html, (u) => uploadDataUrlRef.current(u));
                  ed.chain().focus().insertContent(cleaned).run();
                } catch (err) {
                  toast({
                    title: "Paste failed",
                    description: err instanceof Error ? err.message : "Could not process pasted content.",
                    variant: "destructive",
                  });
                }
              })();
              return true;
            }

            return false;
          },
          attributes: {
            class: cn(
              "tiptap task-desc-rich-editor min-h-[7rem] max-h-[min(320px,40vh)] overflow-y-auto px-3 py-2 text-sm text-foreground outline-none rounded-t-md",
              "prose prose-sm max-w-none dark:prose-invert",
              "prose-p:my-1 prose-ul:my-1 prose-li:my-0",
              "[&_img]:max-h-40 [&_img]:rounded-md [&_img]:border [&_img]:border-border/60",
              "bg-muted/20 border border-border/60 border-b-0",
            ),
          },
        },
      },
      [placeholder, toast],
    );

    useEffect(() => {
      editorRef.current = editor ?? null;
    }, [editor]);

    const prevReset = useRef(resetSignal);
    useEffect(() => {
      if (resetSignal && !prevReset.current) {
        editor?.commands.clearContent();
      }
      prevReset.current = resetSignal;
    }, [resetSignal, editor]);

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () => (editor ? editorHtmlToMarkdown(editor.getHTML()) : ""),
        clear: () => {
          editor?.commands.clearContent();
        },
      }),
      [editor],
    );

    const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || projectId == null || !editor) return;
      if (file.size > 8 * 1024 * 1024) {
        toast({ title: "File too large", description: "Max 8MB.", variant: "destructive" });
        return;
      }
      setUploading(true);
      try {
        const dataUrl = await fileToDataUrl(file);
        const url = await uploadDataUrl(dataUrl);
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

    if (!editor) {
      return (
        <div className="min-h-[8rem] rounded-md border border-border/50 bg-muted/20 animate-pulse" aria-hidden />
      );
    }

    const canUpload = projectId != null && !Number.isNaN(projectId) && projectId > 0;

    return (
      <div className="space-y-0 rounded-md overflow-hidden">
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
        <div className="flex flex-wrap justify-between items-center gap-2 px-2 py-2 border border-border/60 rounded-b-md bg-muted/10 border-t-0">
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus().toggleBulletList().run();
              }}
              title="Bullet list"
            >
              <Plus className="w-4 h-4" />
            </Button>
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
              disabled={uploading || !canUpload}
              title="Attach image or PDF"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            </Button>
          </div>
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
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Paste from Word with images (embedded pictures upload automatically). Same shortcuts as chat: lists, bold, links.
        </p>
      </div>
    );
  },
);
