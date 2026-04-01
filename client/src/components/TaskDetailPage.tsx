import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Task, ChecklistItem, Attachment } from "@/lib/mockData";
import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Calendar, Paperclip, Tag, User as UserIcon, CheckCircle2, MoreHorizontal, MessageSquare, Plus, X, Reply, Clock, History, AlertCircle, FileText, Activity, Repeat, CalendarCheck, ArrowRight, CheckSquare, Trash2, Download, Lock, RotateCcw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useState, useEffect, useMemo, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { ClientPermissions } from "@/App";

const TASK_ATTACHMENT_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/pdf",
]);
const TASK_ATTACHMENT_EXTS = new Set(["png", "jpg", "jpeg", "webp", "pdf"]);

function isAllowedTaskAttachmentFile(file: File): boolean {
  if (file.type && TASK_ATTACHMENT_MIMES.has(file.type)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TASK_ATTACHMENT_EXTS.has(ext);
}

async function readFileAsDataUrl(file: File): Promise<string> {
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

type CommentPayload = { fileName: string; dataUrl: string };

function CommentItem({
  comment,
  allComments,
  users,
  currentUserId,
  onPostReply,
  depth = 0,
}: {
  comment: any;
  allComments: any[];
  users: any;
  currentUserId: string;
  onPostReply: (parentId: string, text: string, files: CommentPayload[]) => Promise<void>;
  depth?: number;
}) {
  const author = users[comment.authorId];
  const [isReplying, setIsReplying] = useState(false);
  const [replyInput, setReplyInput] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replySending, setReplySending] = useState(false);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const { toast: replyToast } = useToast();

  const replies = useMemo(
    () => allComments.filter((r) => String(r.parentId) === String(comment.id)),
    [allComments, comment.id],
  );

  const formattedDate = comment.createdAt
    ? (() => {
        try {
          const d = new Date(comment.createdAt);
          if (!isNaN(d.getTime())) return format(d, "MMM d, h:mm a");
          return comment.createdAt;
        } catch {
          return comment.createdAt;
        }
      })()
    : "Just now";

  const submitReply = async () => {
    const text = replyInput.trim();
    if (!text && replyFiles.length === 0) return;
    setReplySending(true);
    try {
      const payloads: CommentPayload[] = [];
      for (const f of replyFiles) {
        if (f.size > 8 * 1024 * 1024) {
          replyToast({ title: "File too large", description: `${f.name} must be 8MB or less.`, variant: "destructive" });
          continue;
        }
        if (!isAllowedTaskAttachmentFile(f)) {
          replyToast({ title: "Unsupported file", description: f.name, variant: "destructive" });
          continue;
        }
        payloads.push({ fileName: f.name, dataUrl: await readFileAsDataUrl(f) });
      }
      if (!text && payloads.length === 0) {
        if (replyFiles.length > 0) {
          replyToast({ title: "No valid attachments", variant: "destructive" });
        }
        return;
      }
      await onPostReply(String(comment.id), text, payloads);
      setReplyInput("");
      setReplyFiles([]);
      setIsReplying(false);
    } catch {
      replyToast({ title: "Could not send reply", variant: "destructive" });
    } finally {
      setReplySending(false);
    }
  };

  return (
    <div className={cn("flex gap-3 group", depth > 0 && "mt-3")}>
      <Avatar className={cn("mt-0.5 shrink-0", depth > 0 ? "h-6 w-6" : "h-8 w-8")}>
        <AvatarImage src={author?.avatar} />
        <AvatarFallback className="text-[10px]">{author?.name?.[0] || "U"}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="bg-muted/30 px-3 py-2 rounded-2xl rounded-tl-sm inline-block max-w-[90%] border border-border/30">
          <div className="font-semibold text-xs text-foreground mb-0.5">{author?.name || "Unknown"}</div>
          <div className="text-sm text-foreground/90 leading-snug whitespace-pre-wrap">{comment.content}</div>
        </div>
        <div className="flex items-center gap-3 pl-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground font-medium hover:underline cursor-pointer">Like</span>
          <span
            className="text-[10px] text-muted-foreground font-medium hover:underline cursor-pointer"
            onClick={() => setIsReplying(!isReplying)}
          >
            Reply
          </span>
          <span className="text-[10px] text-muted-foreground">{formattedDate}</span>
        </div>
        {comment.attachments && comment.attachments.length > 0 && (
          <div className="flex gap-2 mt-1 flex-wrap pl-1">
            {comment.attachments.map((att: any) => (
              <a
                key={att.id}
                href={att.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground shadow-sm hover:bg-muted/50"
              >
                <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="font-medium truncate max-w-[150px]">{att.name}</span>
              </a>
            ))}
          </div>
        )}
        {isReplying && (
          <div className="flex gap-2 mt-2 pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarImage src={users[currentUserId]?.avatar} />
              <AvatarFallback>ME</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2 min-w-0">
              <input
                ref={replyFileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf,.png,.jpg,.jpeg,.webp,.pdf"
                className="sr-only"
                onChange={(e) => {
                  const list = e.target.files;
                  e.target.value = "";
                  if (list?.length) setReplyFiles((prev) => [...prev, ...Array.from(list)]);
                }}
              />
              <div className="relative">
                <Input
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                  placeholder="Write a reply..."
                  className="h-9 text-xs bg-muted/20 pr-10"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void submitReply();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground"
                  onClick={() => replyFileInputRef.current?.click()}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </Button>
              </div>
              {replyFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {replyFiles.map((f, i) => (
                    <Badge key={`${f.name}-${i}`} variant="secondary" className="text-[10px] font-normal gap-1 pr-1">
                      <span className="truncate max-w-[120px]">{f.name}</span>
                      <button
                        type="button"
                        className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                        onClick={() => setReplyFiles((prev) => prev.filter((_, j) => j !== i))}
                        aria-label="Remove file"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <Button
                type="button"
                size="sm"
                className="h-8 px-3 text-xs"
                disabled={replySending}
                onClick={() => void submitReply()}
              >
                {replySending ? "Sending…" : "Reply"}
              </Button>
            </div>
          </div>
        )}
        {replies.length > 0 && (
          <div className={cn("mt-2 space-y-1 border-l border-border/40 pl-3 ml-1")}>
            {replies.map((r) => (
              <CommentItem
                key={r.id}
                comment={r}
                allComments={allComments}
                users={users}
                currentUserId={currentUserId}
                onPostReply={onPostReply}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface TaskDetailPageProps {
  task: Task;
  onClose: () => void;
  clientPermissions?: ClientPermissions;
}

export function TaskDetailPage({ task, onClose, clientPermissions }: TaskDetailPageProps) {
  const { users, projects } = useAppData();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [commentInput, setCommentInput] = useState("");
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const composerFileInputRef = useRef<HTMLInputElement>(null);
  const [comments, setComments] = useState(task.comments || []);
  const [status, setStatus] = useState(task.status);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task.checklist || []);
  const [newChecklistInput, setNewChecklistInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>(task.attachments || []);
  const [assignees, setAssignees] = useState<string[]>(task.assignees || []);
  const [tags, setTags] = useState<string[]>(task.tags || []);
  const [newTagInput, setNewTagInput] = useState("");
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [timeHours, setTimeHours] = useState("");
  const [timeDate, setTimeDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [timeDescription, setTimeDescription] = useState("");
  const [timeLogging, setTimeLogging] = useState(false);
  const [timeClientVisible, setTimeClientVisible] = useState(true);
  const [clientActionLoading, setClientActionLoading] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");

  const isClient = currentUser?.role === "client";
  const isFullAccess = isClient && clientPermissions?.clientTaskAccess === "full";
  const canEditTaskFields = !isClient || isFullAccess;

  const numericTaskId = Number(task.id);
  const numericProjectId = Number(task.projectId);

  const invalidateTasks = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", numericProjectId, "tasks"] });
  };

  useEffect(() => {
    setComments(task.comments || []);
    setAttachments(task.attachments || []);
    setTags(task.tags?.length ? [...task.tags] : []);
    setStatus(task.status);
  }, [task.id]);

  const patchTask = async (updates: Record<string, unknown>) => {
    await apiRequest("PATCH", `/api/tasks/${numericTaskId}`, updates);
    invalidateTasks();
  };

  const handleStatusChange = async (next: string) => {
    if (next === status || !Number.isInteger(numericTaskId) || numericTaskId <= 0) return;
    const prev = status;
    setStatus(next);
    setStatusSaving(true);
    try {
      await patchTask({ status: next });
    } catch {
      setStatus(prev);
      toast({ title: "Could not update status", variant: "destructive" });
    } finally {
      setStatusSaving(false);
    }
  };

  const addTag = async () => {
    const t = newTagInput.trim();
    if (!t || !canEditTaskFields) return;
    if (tags.includes(t)) {
      setNewTagInput("");
      setTagPopoverOpen(false);
      return;
    }
    const prev = [...tags];
    const next = [...tags, t];
    setTags(next);
    setNewTagInput("");
    setTagPopoverOpen(false);
    try {
      await patchTask({ tags: next });
    } catch {
      setTags(prev);
      toast({ title: "Could not add tag", variant: "destructive" });
    }
  };

  const removeTag = async (tag: string) => {
    if (!canEditTaskFields) return;
    const prev = [...tags];
    const next = tags.filter((x) => x !== tag);
    setTags(next);
    try {
      await patchTask({ tags: next });
    } catch {
      setTags(prev);
      toast({ title: "Could not remove tag", variant: "destructive" });
    }
  };

  const postCommentWithFiles = async (text: string, parentId: string | null, files: CommentPayload[]) => {
    if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) {
      toast({ title: "Cannot comment", description: "Invalid task.", variant: "destructive" });
      throw new Error("invalid task");
    }
    const trimmed = text.trim();
    const content = trimmed || (files.length ? "📎 Attachment" : "");
    if (!content) return;
    const body: Record<string, unknown> = { content, type: "comment" };
    if (parentId) body.parentId = Number(parentId);
    const res = await apiRequest("POST", `/api/tasks/${numericTaskId}/comments`, body);
    const created = await res.json();
    const extraAttachments: Attachment[] = [];
    for (const f of files) {
      const ar = await apiRequest("POST", `/api/tasks/${numericTaskId}/attachments`, {
        fileDataUrl: f.dataUrl,
        fileName: f.fileName,
        commentId: created.id,
      });
      const att = await ar.json();
      extraAttachments.push({
        id: String(att.id),
        name: att.name,
        type: att.type === "image" ? "image" : "file",
        url: att.url,
        size: att.size,
      });
    }
    setComments((prev) => [
      {
        id: String(created.id),
        authorId: String(created.authorId),
        content: created.content,
        createdAt: created.createdAt || new Date().toISOString(),
        type: created.type || "comment",
        parentId: parentId ? String(parentId) : undefined,
        attachments: extraAttachments,
      },
      ...prev,
    ]);
    invalidateTasks();
  };

  const handleApprove = async () => {
    setClientActionLoading(true);
    try {
      await apiRequest("POST", `/api/tasks/${numericTaskId}/approve`, {});
      queryClient.invalidateQueries({ queryKey: ["/api/projects", numericProjectId, "tasks"] });
      toast({ title: `Task approved: "${task.title}"` });
      onClose();
    } catch {
      toast({ title: "Failed to approve task", variant: "destructive" });
    } finally {
      setClientActionLoading(false);
    }
  };

  const handleRequestRevision = async () => {
    if (!revisionReason.trim()) {
      toast({ title: "Please provide a reason for the revision request", variant: "destructive" });
      return;
    }
    setClientActionLoading(true);
    try {
      await apiRequest("POST", `/api/tasks/${numericTaskId}/request-revision`, { reason: revisionReason.trim() });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", numericProjectId, "tasks"] });
      toast({ title: `Revision requested for: "${task.title}"` });
      setRevisionOpen(false);
      setRevisionReason("");
      onClose();
    } catch {
      toast({ title: "Failed to request revision", variant: "destructive" });
    } finally {
      setClientActionLoading(false);
    }
  };

  // Dynamically detect review column (second-to-last) for client actions
  const currentProject = projects.find(p => String(p.id) === String(numericProjectId));
  const projectColumns = (currentProject as any)?.columns || [];
  const fallbackBoardColumns = [
    { id: "todo", title: "To Do" },
    { id: "in-progress", title: "In Progress" },
    { id: "review", title: "Review" },
    { id: "done", title: "Done" },
  ];
  const boardColumnsForStatus = projectColumns.length > 0 ? projectColumns : fallbackBoardColumns;
  const statusStr = String(status);
  const statusColumnIds = new Set(boardColumnsForStatus.map((c: { id: string }) => String(c.id)));
  const statusNotOnBoard = Boolean(statusStr && !statusColumnIds.has(statusStr));
  const statusTitleFor = (s: string) => {
    const col = boardColumnsForStatus.find((c: { id: string }) => String(c.id) === String(s));
    if (col?.title) return col.title;
    if (s === "in-progress") return "In Progress";
    return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ") : "";
  };
  const statusColIdx = boardColumnsForStatus.findIndex((c: { id: string }) => String(c.id) === statusStr);
  const isDoneStatusBadge =
    boardColumnsForStatus.length > 0 && statusColIdx === boardColumnsForStatus.length - 1;
  const reviewColumnId = projectColumns.length >= 2
    ? projectColumns[projectColumns.length - 2]?.id
    : projectColumns[projectColumns.length - 1]?.id;
  const isReviewStatusBadge = reviewColumnId != null && String(status) === String(reviewColumnId);
  const isTodoLikeBadge = statusColIdx === 0;
  const isInProgressStatusBadge = !isDoneStatusBadge && !isReviewStatusBadge && !isTodoLikeBadge;
  const isReviewStatus = reviewColumnId ? task.status === reviewColumnId : task.status === "review";

  const handleMarkComplete = () => {
    const last = boardColumnsForStatus[boardColumnsForStatus.length - 1];
    if (last) void handleStatusChange(String(last.id));
  };

  // "full" clients are treated as employees, so only feedback/contribute get approve/revision
  const canDoClientActions = isClient && !isFullAccess && (
    clientPermissions?.clientTaskAccess === "feedback" ||
    clientPermissions?.clientTaskAccess === "contribute"
  );

  // Check if this project has a client with timecards enabled
  const { data: hasClientTimecardsData } = useQuery<{ hasClientTimecards: boolean }>({
    queryKey: ["/api/projects", numericProjectId, "has-client-timecards"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${numericProjectId}/has-client-timecards`, { credentials: "include" });
      if (!res.ok) return { hasClientTimecards: false };
      return res.json();
    },
    enabled: !isClient || isFullAccess,
  });
  const showClientShareOption = !isClient || isFullAccess;
  const clientTimecardsEnabled = showClientShareOption && (hasClientTimecardsData?.hasClientTimecards === true);

  const { data: timeEntries = [], refetch: refetchTimeEntries } = useQuery<any[]>({
    queryKey: ["/api/tasks", numericTaskId, "time-entries"],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${numericTaskId}/time-entries`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch time entries");
      return res.json();
    },
  });

  const totalHours = timeEntries.reduce((sum: number, e: any) => sum + parseFloat(e.hours || "0"), 0);

  const handleLogTime = async () => {
    if (!timeHours || isNaN(Number(timeHours)) || Number(timeHours) <= 0) return;
    setTimeLogging(true);
    try {
      await apiRequest("POST", `/api/tasks/${numericTaskId}/time-entries`, {
        hours: Number(timeHours),
        description: timeDescription || null,
        logDate: timeDate,
        clientVisible: clientTimecardsEnabled ? timeClientVisible : false,
      });
      setTimeHours("");
      setTimeDescription("");
      setTimeClientVisible(true);
      refetchTimeEntries();
      invalidateTasks();
    } catch (e) {
      console.error("Failed to log time:", e);
    } finally {
      setTimeLogging(false);
    }
  };

  const handleDeleteTimeEntry = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/time-entries/${id}`);
      refetchTimeEntries();
      invalidateTasks();
    } catch (e) {
      console.error("Failed to delete time entry:", e);
    }
  };

  const toggleChecklistItem = async (id: string) => {
      const item = checklist.find(i => i.id === id);
      if (!item) return;
      const newCompleted = !item.completed;
      setChecklist(checklist.map(i => 
          i.id === id ? { ...i, completed: newCompleted } : i
      ));
      try {
        await apiRequest("PATCH", `/api/checklist/${id}`, { completed: newCompleted });
        invalidateTasks();
      } catch (e) {
        setChecklist(checklist);
      }
  };

  const addChecklistItem = async () => {
      if (!newChecklistInput.trim()) return;
      try {
        const res = await apiRequest("POST", `/api/tasks/${numericTaskId}/checklist`, { text: newChecklistInput.trim() });
        const created = await res.json();
        const newItem: ChecklistItem = {
          id: String(created.id),
          text: created.text,
          completed: created.completed,
        };
        setChecklist([...checklist, newItem]);
        setNewChecklistInput("");
        invalidateTasks();
      } catch (e) {
        console.error("Failed to add checklist item:", e);
      }
  };

  const removeChecklistItem = async (id: string) => {
      setChecklist(checklist.filter(item => item.id !== id));
      try {
        await apiRequest("DELETE", `/api/checklist/${id}`);
        invalidateTasks();
      } catch (e) {
        console.error("Failed to remove checklist item:", e);
      }
  };

  const handlePostComment = async () => {
    if (!commentInput.trim() && composerFiles.length === 0) return;
    const payloads: CommentPayload[] = [];
    for (const f of composerFiles) {
      if (f.size > 8 * 1024 * 1024) {
        toast({ title: "File too large", description: `${f.name} must be 8MB or less.`, variant: "destructive" });
        continue;
      }
      if (!isAllowedTaskAttachmentFile(f)) {
        toast({ title: "Unsupported file", description: `${f.name}: use PNG, JPEG, WebP, or PDF.`, variant: "destructive" });
        continue;
      }
      try {
        payloads.push({ fileName: f.name, dataUrl: await readFileAsDataUrl(f) });
      } catch {
        toast({ title: "Could not read file", description: f.name, variant: "destructive" });
      }
    }
    if (!commentInput.trim() && payloads.length === 0 && composerFiles.length > 0) {
      toast({ title: "No valid attachments", variant: "destructive" });
      return;
    }
    try {
      await postCommentWithFiles(commentInput, null, payloads);
      setCommentInput("");
      setComposerFiles([]);
    } catch {
      toast({ title: "Failed to post comment", variant: "destructive" });
    }
  };

  const currentUserId = currentUser ? String(currentUser.id) : "";

  const sortedUserComments = useMemo(
    () =>
      [...comments.filter((c) => c.type !== "system")].sort((a, b) => {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return tb - ta;
      }),
    [comments],
  );

  const sortedSystemLogs = useMemo(
    () =>
      [...comments.filter((c) => c.type === "system")].sort((a, b) => {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return tb - ta;
      }),
    [comments],
  );

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = "";
    if (!files?.length || !canEditTaskFields) return;
    if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) {
      toast({ title: "Cannot upload", description: "This task is not available to upload to.", variant: "destructive" });
      return;
    }
    setUploadingAttachment(true);
    let uploaded = 0;
    try {
      for (const file of Array.from(files)) {
        if (file.size > 8 * 1024 * 1024) {
          toast({ title: "File too large", description: `${file.name} must be 8MB or less.`, variant: "destructive" });
          continue;
        }
        if (!isAllowedTaskAttachmentFile(file)) {
          toast({ title: "Unsupported file", description: `${file.name}: use PNG, JPEG, WebP, or PDF.`, variant: "destructive" });
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        const res = await apiRequest("POST", `/api/tasks/${numericTaskId}/attachments`, {
          fileDataUrl: dataUrl,
          fileName: file.name,
        });
        const created = await res.json();
        const row: Attachment = {
          id: String(created.id),
          name: created.name,
          type: created.type === "image" ? "image" : "file",
          url: created.url,
          size: created.size,
        };
        setAttachments((prev) => [...prev, row]);
        uploaded += 1;
      }
      if (uploaded > 0) {
        invalidateTasks();
        toast({ title: uploaded === 1 ? "Attachment uploaded" : `${uploaded} attachments uploaded` });
      }
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = async (att: Attachment) => {
    if (!canEditTaskFields) return;
    const idNum = Number(att.id);
    if (!Number.isInteger(idNum)) {
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
      return;
    }
    const prev = [...attachments];
    setAttachments((p) => p.filter((a) => a.id !== att.id));
    try {
      await apiRequest("DELETE", `/api/attachments/${idNum}`);
      invalidateTasks();
    } catch {
      setAttachments(prev);
      toast({ title: "Could not remove attachment", variant: "destructive" });
    }
  };

  const toggleAssignee = (userId: string) => {
      if (assignees.includes(userId)) {
          setAssignees(assignees.filter(id => id !== userId));
      } else {
          setAssignees([...assignees, userId]);
      }
  };
  
  return (
    <div className="absolute inset-0 z-50 bg-background flex flex-col animate-in slide-in-from-right duration-300">
         {/* Page Header */}
         <div className="h-16 border-b border-border px-6 flex items-center justify-between bg-background/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
             <div className="flex items-center gap-4">
                 <Button variant="ghost" size="icon" onClick={onClose} className="-ml-2">
                     <X className="w-5 h-5" />
                 </Button>
                 <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-muted-foreground font-mono">
                        {task.id.toUpperCase()}
                    </Badge>
                    <Separator orientation="vertical" className="h-4" />
                    <span className="text-sm text-muted-foreground">Last updated 2 hours ago</span>
                 </div>
             </div>
             
             <div className="flex items-center gap-2">
                 {(!isClient || isFullAccess) && (
                    <>
                        <Button variant="outline" size="sm" className="hidden sm:flex">
                            <AlertCircle className="w-4 h-4 mr-2" /> Report Issue
                        </Button>
                        <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-5 h-5" />
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            className="bg-primary text-primary-foreground"
                            onClick={handleMarkComplete}
                            disabled={statusSaving}
                        >
                            Mark Complete
                        </Button>
                    </>
                 )}
             </div>
         </div>

         <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
             <ScrollArea className="flex-1 min-h-0 min-w-0 lg:min-h-0">
                 <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-8 pb-24 lg:pb-32">
                     
                     {/* Title & Status Block */}
                     <div className="space-y-4">
                        <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground leading-tight tracking-tight">
                            {task.title}
                        </h1>
                        <div className="flex flex-wrap items-center gap-3">
                            {isClient && !isFullAccess ? (
                                <Badge className={cn("h-8 px-3 border-none font-medium max-w-[200px] truncate",
                                    isDoneStatusBadge ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                    isInProgressStatusBadge ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                                    isReviewStatusBadge ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" :
                                    "bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-400"
                                )} title={statusTitleFor(statusStr)}>
                                    {statusTitleFor(statusStr)}
                                </Badge>
                            ) : (
                                <Select value={statusStr} onValueChange={(v) => void handleStatusChange(v)} disabled={statusSaving}>
                                    <SelectTrigger className={cn("min-w-[140px] max-w-[220px] h-8 border-none font-medium transition-colors", 
                                        isDoneStatusBadge ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                        isInProgressStatusBadge ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                                        isReviewStatusBadge ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" :
                                        "bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-400"
                                    )}>
                                        <SelectValue placeholder="Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {statusNotOnBoard && (
                                          <SelectItem value={statusStr}>{statusTitleFor(statusStr)} (current)</SelectItem>
                                        )}
                                        {boardColumnsForStatus.map((col: { id: string; title: string }) => (
                                          <SelectItem key={col.id} value={String(col.id)}>
                                            {col.title}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}

                            <Badge 
                                className={cn(
                                    "text-[10px] uppercase font-bold border-none h-8 px-3",
                                    task.priority === 'high' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                    task.priority === 'medium' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                )}
                            >
                                {task.priority} Priority
                            </Badge>

                            {task.recurrence && (
                                <Badge variant="secondary" className="h-8 px-3 gap-1.5 font-medium border-primary/20 bg-primary/5 text-primary">
                                    <Repeat className="w-3.5 h-3.5" />
                                    <span className="capitalize">
                                        {task.recurrence.frequency === 'custom' 
                                            ? `Every ${task.recurrence.interval} ${task.recurrence.customType}` 
                                            : task.recurrence.frequency}
                                    </span>
                                </Badge>
                            )}
                        </div>
                     </div>

                     {/* Client Action Banner: Approve / Request Revision */}
                     {canDoClientActions && isReviewStatus && (
                         <div className="flex items-center gap-3 p-4 bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-xl">
                             <div className="flex-1">
                                 <div className="text-sm font-semibold text-violet-900 dark:text-violet-200">This task is ready for your review</div>
                                 <div className="text-xs text-violet-700 dark:text-violet-400 mt-0.5">Please approve or request changes.</div>
                             </div>
                             <div className="flex gap-2">
                                 <Button
                                     size="sm"
                                     className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                                     onClick={handleApprove}
                                     disabled={clientActionLoading}
                                     data-testid={`button-approve-task-${task.id}`}
                                 >
                                     <CheckCircle2 className="w-4 h-4" />
                                     Approve
                                 </Button>
                                 <Button
                                     size="sm"
                                     variant="outline"
                                     className="border-orange-300 text-orange-700 hover:bg-orange-50 gap-1.5"
                                     onClick={() => setRevisionOpen(true)}
                                     disabled={clientActionLoading}
                                     data-testid={`button-request-revision-task-${task.id}`}
                                 >
                                     <RotateCcw className="w-4 h-4" />
                                     Request Revision
                                 </Button>
                             </div>
                         </div>
                     )}

                     {/* Revision Dialog */}
                     <Dialog open={revisionOpen} onOpenChange={setRevisionOpen}>
                         <DialogContent className="sm:max-w-[400px]">
                             <DialogHeader>
                                 <DialogTitle>Request Revision</DialogTitle>
                             </DialogHeader>
                             <div className="space-y-3 py-2">
                                 <p className="text-sm text-muted-foreground">
                                     Please describe what changes are needed for <span className="font-medium text-foreground">"{task.title}"</span>.
                                 </p>
                                 <div className="space-y-1.5">
                                     <Label htmlFor="task-revision-reason">Reason <span className="text-destructive">*</span></Label>
                                     <Textarea
                                         id="task-revision-reason"
                                         value={revisionReason}
                                         onChange={e => setRevisionReason(e.target.value)}
                                         placeholder="Describe the changes needed…"
                                         rows={3}
                                         className="resize-none"
                                         data-testid="textarea-task-revision-reason"
                                     />
                                 </div>
                             </div>
                             <DialogFooter>
                                 <Button variant="outline" onClick={() => setRevisionOpen(false)} disabled={clientActionLoading}>Cancel</Button>
                                 <Button
                                     onClick={handleRequestRevision}
                                     disabled={clientActionLoading || !revisionReason.trim()}
                                     className="bg-orange-600 hover:bg-orange-700 text-white"
                                     data-testid="button-submit-task-revision"
                                 >
                                     {clientActionLoading ? "Sending…" : "Request Revision"}
                                 </Button>
                             </DialogFooter>
                         </DialogContent>
                     </Dialog>

                     {/* Metadata Bar - Updated with Start/End Dates */}
                     <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-5 bg-muted/20 border border-border/50 rounded-xl">
                        {/* Assignees */}
                        <div className="space-y-2">
                             <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Assignees</div>
                             <div className="flex flex-wrap gap-2">
                                {assignees.map(id => {
                                    const user = users[id];
                                    return user ? (
                                        <div key={id} className="flex items-center gap-2 bg-background border border-border/50 rounded-full pl-1 pr-3 py-1 shadow-sm">
                                            <Avatar className="h-5 w-5">
                                                <AvatarImage src={user.avatar} />
                                                <AvatarFallback>{user.name[0]}</AvatarFallback>
                                            </Avatar>
                                            <span className="text-xs font-medium truncate max-w-[80px]">{user.name}</span>
                                            {(!isClient || isFullAccess) && (
                                                <button onClick={() => toggleAssignee(id)} className="ml-1 text-muted-foreground hover:text-destructive">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    ) : null;
                                })}
                                {(!isClient || isFullAccess) && (
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full border border-dashed border-border/50">
                                                <Plus className="w-3 h-3" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-60 p-2" align="start">
                                            <div className="space-y-1">
                                                <div className="text-xs font-semibold text-muted-foreground px-2 py-1.5">Add Assignee</div>
                                                {Object.values(users).filter(u => !assignees.includes(u.id)).map(user => (
                                                    <button 
                                                        key={user.id}
                                                        onClick={() => toggleAssignee(user.id)}
                                                        className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-muted rounded-md text-sm transition-colors"
                                                    >
                                                        <Avatar className="h-6 w-6">
                                                            <AvatarImage src={user.avatar} />
                                                            <AvatarFallback>{user.name[0]}</AvatarFallback>
                                                        </Avatar>
                                                        <span>{user.name}</span>
                                                    </button>
                                                ))}
                                                {Object.values(users).filter(u => !assignees.includes(u.id)).length === 0 && (
                                                    <div className="text-xs text-muted-foreground px-2 py-2 italic">All users assigned</div>
                                                )}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                )}
                             </div>
                        </div>

                        {/* Dates - Start & Due */}
                        <div className="space-y-2 md:col-span-2">
                             <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Timeline</div>
                             <div className="flex items-center gap-2 flex-wrap">
                                 {task.startDate ? (
                                     <div className="flex items-center gap-2 bg-background border border-border/50 px-3 py-1.5 rounded-md shadow-sm text-xs font-medium">
                                        <CalendarCheck className="w-3.5 h-3.5 text-muted-foreground" />
                                        <span>{format(new Date(task.startDate), "MMM d")}</span>
                                     </div>
                                 ) : (
                                    <div className="flex items-center gap-2 bg-background border border-dashed border-border/50 px-3 py-1.5 rounded-md text-xs text-muted-foreground opacity-70">
                                        <CalendarCheck className="w-3.5 h-3.5" />
                                        <span>Start</span>
                                    </div>
                                 )}
                                 
                                 <ArrowRight className="w-3 h-3 text-muted-foreground/50" />

                                 {(!isClient || isFullAccess) ? (
                                     <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className={cn("h-[30px] px-3 bg-background border-border/50 shadow-sm text-xs font-medium", !task.dueDate && "text-muted-foreground border-dashed")}>
                                                <Calendar className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                                                {task.dueDate ? format(new Date(task.dueDate), "MMM d") : <span>Due Date</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <CalendarComponent mode="single" initialFocus />
                                        </PopoverContent>
                                    </Popover>
                                 ) : (
                                     <div className="flex items-center gap-2 bg-background border border-border/50 px-3 py-1.5 rounded-md shadow-sm text-xs font-medium">
                                         <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                                         <span>{task.dueDate ? format(new Date(task.dueDate), "MMM d") : "No due date"}</span>
                                     </div>
                                 )}
                             </div>
                        </div>

                         {/* Tags */}
                         <div className="space-y-2">
                             <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tags</div>
                             <div className="flex flex-wrap gap-2">
                                {tags.map((tag) => (
                                    <Badge
                                      key={tag}
                                      variant="secondary"
                                      className="bg-background hover:bg-muted border-border/50 shadow-sm font-medium gap-1 pr-1"
                                    >
                                      {tag}
                                      {canEditTaskFields && (
                                        <button
                                          type="button"
                                          className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                                          onClick={() => void removeTag(tag)}
                                          aria-label={`Remove ${tag}`}
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      )}
                                    </Badge>
                                ))}
                                {canEditTaskFields && (
                                    <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                                      <PopoverTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full border border-dashed border-border/50" type="button">
                                          <Plus className="w-3 h-3" />
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-64 p-3" align="start">
                                        <div className="space-y-2">
                                          <Label htmlFor="new-tag" className="text-xs">
                                            New tag
                                          </Label>
                                          <Input
                                            id="new-tag"
                                            value={newTagInput}
                                            onChange={(e) => setNewTagInput(e.target.value)}
                                            placeholder="e.g. design"
                                            className="h-8 text-sm"
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") {
                                                e.preventDefault();
                                                void addTag();
                                              }
                                            }}
                                          />
                                          <Button size="sm" className="w-full h-8" type="button" onClick={() => void addTag()}>
                                            Add tag
                                          </Button>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                )}
                            </div>
                        </div>
                     </div>
                     
                     {/* Attachments */}
                     <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <Paperclip className="w-4 h-4 text-primary" /> Attachments
                            </h3>
                            {canEditTaskFields && (
                                <div className="relative inline-flex">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs pointer-events-none select-none"
                                        tabIndex={-1}
                                        aria-hidden
                                        disabled={uploadingAttachment}
                                    >
                                        <Plus className="w-3 h-3 mr-1" /> {uploadingAttachment ? "Uploading…" : "Add File"}
                                    </Button>
                                    <input
                                        type="file"
                                        multiple
                                        accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                                        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                                        onChange={(e) => void handleAttachmentUpload(e)}
                                        disabled={uploadingAttachment}
                                        aria-label="Add attachment"
                                    />
                                </div>
                            )}
                        </div>
                        
                        {attachments.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {attachments.map(att => (
                                    <div key={att.id} className="flex items-center gap-3 bg-background border border-border/50 rounded-lg p-3 shadow-sm hover:bg-muted/30 transition-colors group">
                                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                                            {att.type === "image" && att.url ? (
                                                <img src={att.url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <FileText className="w-5 h-5 text-muted-foreground" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{att.name}</div>
                                            <div className="text-xs text-muted-foreground">{att.size}</div>
                                        </div>
                                        <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                                            {att.url ? (
                                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" asChild>
                                                <a href={att.url} target="_blank" rel="noopener noreferrer" download={att.name}>
                                                  <Download className="w-3.5 h-3.5" />
                                                </a>
                                              </Button>
                                            ) : null}
                                            {canEditTaskFields && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                    type="button"
                                                    onClick={() => void handleRemoveAttachment(att)}
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="border-2 border-dashed border-border/50 rounded-lg p-6 text-center text-muted-foreground text-sm bg-muted/10">
                                No attachments yet. Click "Add File" to upload.
                            </div>
                        )}
                     </div>

                     {/* Description (read-only) */}
                     <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground">Description</h3>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed p-6 bg-background rounded-xl border border-border/50 shadow-sm min-h-[100px]">
                          <p>{task.description?.trim() ? task.description : <span className="text-muted-foreground italic">No description</span>}</p>
                        </div>
                    </div>

                    {/* Checklist */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <CheckSquare className="w-4 h-4 text-primary" /> Checklist
                        </h3>
                        <div className="bg-background border border-border/50 rounded-xl p-4 space-y-3 shadow-sm">
                            {checklist.length > 0 && checklist.map(item => (
                                <div key={item.id} className="flex items-center gap-3 group">
                                    <Checkbox 
                                        id={item.id} 
                                        checked={item.completed} 
                                        onCheckedChange={(!isClient || isFullAccess) ? () => toggleChecklistItem(item.id) : undefined}
                                        disabled={isClient && !isFullAccess}
                                    />
                                    <label 
                                        htmlFor={item.id}
                                        className={cn("text-sm cursor-pointer select-none transition-all flex-1", item.completed && "text-muted-foreground line-through")}
                                    >
                                        {item.text}
                                    </label>
                                    {(!isClient || isFullAccess) && (
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                            onClick={() => removeChecklistItem(item.id)}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                            
                            {(!isClient || isFullAccess) && (
                                <div className="flex gap-2 pt-2">
                                    <Input 
                                        placeholder="Add an item..." 
                                        className="h-9 text-sm bg-muted/20"
                                        value={newChecklistInput}
                                        onChange={(e) => setNewChecklistInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addChecklistItem();
                                            }
                                        }}
                                    />
                                    <Button size="sm" variant="secondary" className="h-9" onClick={addChecklistItem}>Add</Button>
                                </div>
                            )}
                        </div>
                    </div>
                 </div>
             </ScrollArea>

             <aside className="flex flex-col w-full lg:w-[min(428px,40vw)] shrink-0 border-t lg:border-t-0 lg:border-l border-border/50 bg-muted/10 min-h-0 lg:h-full">
               <ScrollArea className="h-[min(52vh,480px)] lg:flex-1 lg:h-full lg:min-h-0">
                 <div className="p-4 lg:p-5 pb-20">

                     {/* Tabs: comments, time, system log — right column on large screens */}
                     <Tabs defaultValue="comments" className="w-full">
                        <div className="flex flex-col gap-2 border-b border-border/50 pb-3 mb-6">
                            <TabsList className="bg-transparent h-auto min-h-10 p-0 gap-4 sm:gap-6 flex flex-wrap justify-start w-full">
                                <TabsTrigger 
                                    value="comments" 
                                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-all shrink-0"
                                >
                                    <MessageSquare className="w-4 h-4 mr-2" />
                                    Comments
                                </TabsTrigger>
                                {(!isClient || clientPermissions?.clientShowTimecards) && (
                                    <TabsTrigger 
                                        value="time" 
                                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-all shrink-0"
                                        data-testid="tab-time"
                                    >
                                        <Clock className="w-4 h-4 mr-2" />
                                        Time {totalHours > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">({totalHours.toFixed(1)}h)</span>}
                                    </TabsTrigger>
                                )}
                                {(!isClient || isFullAccess) && (
                                    <TabsTrigger 
                                        value="logs" 
                                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-all shrink-0"
                                    >
                                        <Activity className="w-4 h-4 mr-2" />
                                        System Logs
                                    </TabsTrigger>
                                )}
                            </TabsList>
                            <p className="text-xs text-muted-foreground pl-0.5">
                                {(isClient && !isFullAccess) ? "Client view" : "Visible to team only"}
                            </p>
                        </div>

                        <TabsContent value="time" className="space-y-6 mt-0">
                            {/* Time total */}
                            <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                                <Clock className="w-5 h-5 text-primary" />
                                <div>
                                    <div className="text-sm font-semibold text-foreground">Total Time Logged</div>
                                    <div className="text-2xl font-bold text-primary">{totalHours.toFixed(1)}h</div>
                                </div>
                            </div>

                            {/* Log time form — hidden for non-full clients */}
                            {(!isClient || isFullAccess) && (
                                <div className="bg-background border border-border/50 rounded-xl p-4 space-y-3 shadow-sm">
                                    <h4 className="text-sm font-semibold text-foreground">Log Time</h4>
                                    <div className="flex gap-3 flex-wrap">
                                        <div className="flex-1 min-w-[100px]">
                                            <label className="text-xs text-muted-foreground mb-1 block">Hours</label>
                                            <Input
                                                type="number"
                                                min="0.25"
                                                step="0.25"
                                                placeholder="e.g. 1.5"
                                                value={timeHours}
                                                onChange={e => setTimeHours(e.target.value)}
                                                className="h-9 text-sm"
                                                data-testid="input-time-hours"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-[130px]">
                                            <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                                            <Input
                                                type="date"
                                                value={timeDate}
                                                onChange={e => setTimeDate(e.target.value)}
                                                className="h-9 text-sm"
                                                data-testid="input-time-date"
                                            />
                                        </div>
                                        <div className="flex-[2] min-w-[150px]">
                                            <label className="text-xs text-muted-foreground mb-1 block">Note (optional)</label>
                                            <Input
                                                placeholder="What did you work on?"
                                                value={timeDescription}
                                                onChange={e => setTimeDescription(e.target.value)}
                                                className="h-9 text-sm"
                                                data-testid="input-time-description"
                                            />
                                        </div>
                                        <div className="flex items-end">
                                            <Button
                                                size="sm"
                                                className="h-9 px-4"
                                                onClick={handleLogTime}
                                                disabled={timeLogging || !timeHours}
                                                data-testid="button-log-time"
                                            >
                                                Log Time
                                            </Button>
                                        </div>
                                    </div>
                                    {showClientShareOption && (
                                        <div className={cn("flex items-center gap-2 pt-1", !clientTimecardsEnabled && "opacity-50")}>
                                            <Checkbox
                                                id="time-client-visible"
                                                checked={clientTimecardsEnabled ? timeClientVisible : false}
                                                onCheckedChange={clientTimecardsEnabled ? (v) => setTimeClientVisible(v === true) : undefined}
                                                disabled={!clientTimecardsEnabled}
                                                data-testid="checkbox-time-client-visible"
                                            />
                                            <label htmlFor="time-client-visible" className={cn("text-xs cursor-pointer", clientTimecardsEnabled ? "text-muted-foreground" : "text-muted-foreground/60 cursor-not-allowed")}>
                                                Share with client
                                                {!clientTimecardsEnabled && <span className="ml-1 italic">(no client with timecards)</span>}
                                            </label>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Time entries list */}
                            <div className="space-y-2">
                                {timeEntries.length === 0 ? (
                                    <div className="text-center text-sm text-muted-foreground py-6 border-2 border-dashed border-border/50 rounded-xl">
                                        No time logged yet.{(!isClient || isFullAccess) && " Use the form above to track your work."}
                                    </div>
                                ) : timeEntries.map((entry: any) => {
                                    const canDelete = (!isClient || isFullAccess) && ((currentUser?.role === "admin" || currentUser?.role === "manager" || isFullAccess) || String(entry.userId) === currentUserId);
                                    const isPrivate = entry.clientVisible === false;
                                    return (
                                        <div key={entry.id} className={cn("flex items-center gap-3 bg-background border border-border/50 rounded-lg p-3 shadow-sm group", isPrivate && "bg-muted/20")} data-testid={`time-entry-${entry.id}`}>
                                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                <span className="text-xs font-bold text-primary">{parseFloat(entry.hours).toFixed(1)}h</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-xs font-semibold text-foreground">{entry.userName || "Unknown"}</span>
                                                    <span className="text-xs text-muted-foreground">· {entry.logDate}</span>
                                                    {isPrivate && (
                                                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground bg-muted border border-border/50 px-1.5 py-0.5 rounded" data-testid={`badge-private-entry-${entry.id}`}>
                                                            <Lock className="w-2.5 h-2.5" />
                                                            private
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-sm text-foreground/80 mt-0.5">{entry.description || <span className="text-muted-foreground italic text-xs">No note</span>}</div>
                                            </div>
                                            {canDelete && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                                    onClick={() => handleDeleteTimeEntry(entry.id)}
                                                    data-testid={`button-delete-time-entry-${entry.id}`}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </TabsContent>

                        <TabsContent value="comments" className="space-y-6 mt-0">
                             {/* Comment Input */}
                             <div className="flex gap-3">
                                <Avatar className="h-8 w-8 mt-1">
                                    <AvatarImage src={users[currentUserId]?.avatar} />
                                    <AvatarFallback>{currentUser?.name?.[0] || "ME"}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-2 min-w-0">
                                    <input
                                        ref={composerFileInputRef}
                                        type="file"
                                        multiple
                                        accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf,.png,.jpg,.jpeg,.webp,.pdf"
                                        className="sr-only"
                                        onChange={(e) => {
                                            const list = e.target.files;
                                            e.target.value = "";
                                            if (list?.length) setComposerFiles((prev) => [...prev, ...Array.from(list)]);
                                        }}
                                    />
                                    <div className="relative group">
                                        <Textarea 
                                            value={commentInput}
                                            onChange={(e) => setCommentInput(e.target.value)}
                                            placeholder="Write a comment..." 
                                            className="min-h-[80px] resize-none bg-muted/20 focus:bg-background focus:ring-1 focus:ring-primary/20 border-border/60 shadow-sm p-3 pr-12 text-sm rounded-lg transition-all"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                                    e.preventDefault();
                                                    void handlePostComment();
                                                }
                                            }}
                                        />
                                        <div className="absolute bottom-2 right-2 flex gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-full"
                                                onClick={() => composerFileInputRef.current?.click()}
                                            >
                                                <Paperclip className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                    {composerFiles.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {composerFiles.map((f, i) => (
                                                <Badge key={`${f.name}-${i}`} variant="secondary" className="text-[10px] font-normal gap-1 pr-1">
                                                    <span className="truncate max-w-[140px]">{f.name}</span>
                                                    <button
                                                        type="button"
                                                        className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                                                        onClick={() => setComposerFiles((prev) => prev.filter((_, j) => j !== i))}
                                                        aria-label="Remove file"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex justify-end">
                                        <Button size="sm" className="h-8 px-4 text-xs font-medium" onClick={() => void handlePostComment()} data-testid="button-post-comment">Comment</Button>
                                    </div>
                                </div>
                            </div>

                            {/* Comment Stream — roots only; nested replies render inside CommentItem */}
                            <div className="space-y-4">
                                {sortedUserComments.filter((c) => !c.parentId).map((comment) => (
                                    <CommentItem
                                        key={comment.id}
                                        comment={comment}
                                        allComments={sortedUserComments}
                                        users={users}
                                        currentUserId={currentUserId}
                                        onPostReply={(parentId, text, files) => postCommentWithFiles(text, parentId, files)}
                                    />
                                ))}
                                {sortedUserComments.filter((c) => !c.parentId).length === 0 && (
                                    <div className="text-center text-sm text-muted-foreground py-6">
                                        No comments yet. Be the first to comment.
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="logs" className="space-y-4 mt-0 pt-2">
                             <div className="relative pl-6 ml-3 space-y-6 border-l-2 border-border/40 pb-4">
                                {sortedSystemLogs.map((log) => {
                                    const author = users[log.authorId];
                                    return (
                                        <div key={log.id} className="relative">
                                            <div className="absolute -left-[29px] top-1.5 bg-background rounded-full p-0.5 border border-border">
                                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Avatar className="h-5 w-5 border border-border/50">
                                                    <AvatarImage src={author?.avatar} />
                                                    <AvatarFallback>UA</AvatarFallback>
                                                </Avatar>
                                                <span className="font-medium text-foreground">{author?.name}</span>
                                                <span>{log.content}</span>
                                                <span className="opacity-50">• {log.createdAt}</span>
                                            </div>
                                        </div>
                                    )
                                })}
                                {sortedSystemLogs.length === 0 && (
                                  <p className="text-xs text-muted-foreground pl-1">No system events recorded for this task.</p>
                                )}
                            </div>
                        </TabsContent>
                     </Tabs>
                 </div>
               </ScrollArea>
             </aside>
         </div>
    </div>
  );
}
