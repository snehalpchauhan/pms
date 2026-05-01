import { useState, useMemo, useEffect, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { useTimecardsFiltersAndEntries } from "@/hooks/useTimecardsFiltersAndEntries";
import { apiRequest } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { parseTimeEntryDescription } from "@/lib/timeEntryDescription";
import {
  buildExportRows,
  buildTimecardsExportMeta,
  downloadTimecardsPdf,
} from "@/lib/timecardsExport";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Clock,
  Trash2,
  Filter,
  Plus,
  Timer,
  BarChart3,
  Users,
  Folder,
  Tag,
  Lock,
  FileSpreadsheet,
  FileDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isToday, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { ClientPermissions } from "@/App";
import type { Project } from "@/lib/mockData";
import type { TimecardDateFormatPreset } from "@shared/timecardDateFormat";
import TimecardsComplianceSummary from "@/components/TimecardsComplianceSummary";
import {
  WORK_CATEGORIES,
  buildStoredTimeDescription,
  countWordsInText,
} from "@shared/timeLogDescription";

const PAGE_SIZE = 25;

/** Log Time modal: default SelectTrigger uses nowrap + line-clamp-1; long task names overflow without these overrides. */
const LOG_TIME_SELECT_TRIGGER = cn(
  "w-full min-w-0 h-auto min-h-9 whitespace-normal py-2 text-left items-start gap-2",
  "[&>span]:!line-clamp-none [&>span]:block [&>span]:whitespace-normal [&>span]:break-words [&>span]:min-w-0 [&>span]:flex-1 [&>span]:text-left",
);

const LOG_TIME_SELECT_CONTENT = "max-h-[220px] w-[var(--radix-select-trigger-width)] max-w-full overflow-x-hidden";

function WorkDescriptionCell({ description }: { description: string | null | undefined }) {
  const { workType, note, fullText } = parseTimeEntryDescription(description);
  if (!description?.trim()) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (workType) {
    return (
      <div className="space-y-1.5 min-w-0 max-w-md" title={fullText}>
        <Badge variant="outline" className="text-[10px] font-medium border-primary/30 text-primary bg-primary/5 shrink-0">
          {workType}
        </Badge>
        {note ? (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">{note}</p>
        ) : null}
      </div>
    );
  }
  return <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-w-md">{fullText}</p>;
}

interface TimecardsViewProps {
  currentUserRole: string;
  currentProject?: Project;
  clientPermissions?: ClientPermissions;
}

export default function TimecardsView({ currentUserRole, currentProject, clientPermissions }: TimecardsViewProps) {
  const { user: currentUser } = useAuth();
  const { projects } = useAppData();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    isClient,
    isAdmin,
    isManagerOrAdmin,
    numericProjectId,
    filterUserId,
    setFilterUserId,
    filterProjectId,
    setFilterProjectId,
    filterTaskId,
    setFilterTaskId,
    filterStartDate,
    setFilterStartDate,
    filterEndDate,
    setFilterEndDate,
    applied,
    commitSearch,
    hasLoadedEntries,
    entries,
    isLoading,
    allTasks,
    totalHours,
    projectMap,
    memberFilterOptions,
    projectFilterOptions,
    taskFilterOptions,
    hasActiveFilters,
    clearFilters: clearFiltersBase,
  } = useTimecardsFiltersAndEntries(currentUserRole, currentProject);

  const [page, setPage] = useState(1);

  const [summaryOpen, setSummaryOpen] = useState(false);

  const [logOpen, setLogOpen] = useState(false);
  const [logProjectId, setLogProjectId] = useState<string>(numericProjectId ? String(numericProjectId) : "");
  const [logTaskId, setLogTaskId] = useState<string>("");
  const [logCategory, setLogCategory] = useState<string>("");
  const [logHours, setLogHours] = useState<string>("");
  const [logDate, setLogDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [logNote, setLogNote] = useState<string>("");
  const [logClientVisible, setLogClientVisible] = useState<boolean>(true);
  const [logSaving, setLogSaving] = useState(false);

  // Fetch client-timecards status for the currently selected log project
  const numericLogProjectId = logProjectId ? Number(logProjectId) : null;
  const { data: logProjectClientTimecardsData } = useQuery<{ hasClientTimecards: boolean }>({
    queryKey: ["/api/projects", numericLogProjectId, "has-client-timecards"],
    queryFn: async () => {
      if (!numericLogProjectId) return { hasClientTimecards: false };
      const res = await fetch(`/api/projects/${numericLogProjectId}/has-client-timecards`, { credentials: "include" });
      if (!res.ok) return { hasClientTimecards: false };
      return res.json();
    },
    enabled: !!numericLogProjectId && !isClient,
  });
  const clientTimecardsEnabled = !isClient && (logProjectClientTimecardsData?.hasClientTimecards === true);

  const { data: companySettingsForTime } = useQuery<{
    companyName?: string;
    logoUrl?: string | null;
    timeLogMinDescriptionWords?: number;
    timeLogMaxHoursPerEntry?: number | null;
    timecardDateDisplayFormat?: TimecardDateFormatPreset;
  }>({
    queryKey: ["/api/company-settings"],
    queryFn: async () => {
      const res = await fetch("/api/company-settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load company settings");
      return res.json();
    },
  });
  const minWordsRequired =
    companySettingsForTime?.timeLogMinDescriptionWords == null
      ? 10
      : Number(companySettingsForTime.timeLogMinDescriptionWords);
  const maxHoursPerEntryCap =
    companySettingsForTime?.timeLogMaxHoursPerEntry == null ||
    Number(companySettingsForTime.timeLogMaxHoursPerEntry) <= 0
      ? null
      : Number(companySettingsForTime.timeLogMaxHoursPerEntry);
  const logHoursInputMax = maxHoursPerEntryCap != null ? Math.min(24, maxHoursPerEntryCap) : 24;

  const handleDelete = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/time-entries/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timecards-compliance-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Entry deleted" });
    } catch {
      toast({ title: "Failed to delete entry", variant: "destructive" });
    }
  };

  const handleLogSubmit = async () => {
    if (!logTaskId || !logCategory || !logHours || !logDate) {
      toast({
        title: "Missing fields",
        description: "Choose project, task, work type, hours, and date.",
        variant: "destructive",
      });
      return;
    }
    const h = parseFloat(logHours.replace(",", "."));
    if (isNaN(h) || h <= 0 || h > 24) {
      toast({ title: "Hours must be between 0.1 and 24", variant: "destructive" });
      return;
    }
    if (maxHoursPerEntryCap != null && h > maxHoursPerEntryCap + 1e-9) {
      toast({
        title: "Hours over company limit",
        description: `Each entry cannot exceed ${maxHoursPerEntryCap} hours. Add multiple entries for longer work.`,
        variant: "destructive",
      });
      return;
    }
    if (minWordsRequired > 0 && countWordsInText(logNote) < minWordsRequired) {
      toast({
        title: "Description too short",
        description: `Enter at least ${minWordsRequired} words in the work description (set in Company Settings).`,
        variant: "destructive",
      });
      return;
    }
    const description = buildStoredTimeDescription(logCategory, logNote);

    setLogSaving(true);
    try {
      await apiRequest("POST", "/api/time-entries", {
        taskId: Number(logTaskId),
        hours: h,
        description,
        logDate,
        clientVisible: clientTimecardsEnabled ? logClientVisible : false,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/timecards-compliance-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Time logged successfully" });
      setLogOpen(false);
      setLogProjectId(numericProjectId ? String(numericProjectId) : "");
      setLogTaskId("");
      setLogCategory("");
      setLogHours("");
      setLogNote("");
      setLogDate(format(new Date(), "yyyy-MM-dd"));
      setLogClientVisible(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      let detail: string | undefined;
      try {
        const parsed = JSON.parse(msg.replace(/^\d+:\s*/, ""));
        if (typeof parsed?.message === "string") detail = parsed.message;
      } catch {
        /* ignore */
      }
      toast({
        title: "Failed to log time",
        description: detail || msg,
        variant: "destructive",
      });
    } finally {
      setLogSaving(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [applied]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const paginatedEntries = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return entries.slice(start, start + PAGE_SIZE);
  }, [entries, page]);

  const groupedPaginatedEntries = useMemo(() => {
    const groups: Array<{ logDate: string; label: string; entries: any[] }> = [];
    const today = new Date();
    const labelFor = (logDate: string) => {
      const d = parseISO(logDate);
      if (isToday(d)) return "Today";
      // Example: Apr 17, 2026
      return format(d, "MMM d, yyyy");
    };
    for (const entry of paginatedEntries) {
      const logDate = String(entry.logDate || "");
      const last = groups[groups.length - 1];
      if (!last || last.logDate !== logDate) {
        groups.push({ logDate, label: labelFor(logDate || format(today, "yyyy-MM-dd")), entries: [entry] });
      } else {
        last.entries.push(entry);
      }
    }
    return groups;
  }, [paginatedEntries]);

  const totalHoursByDate = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of entries) {
      const d = String(e.logDate || "");
      if (!d) continue;
      const h = parseFloat(String(e.hours ?? "0")) || 0;
      m[d] = (m[d] || 0) + h;
    }
    return m;
  }, [entries]);

  const projectSummary = useMemo(() => {
    type MemberSummary = { userId: string; name: string; hours: number };
    type ProjectSummary = {
      projectId: string;
      projectName: string;
      totalHours: number;
      entryCount: number;
      members: MemberSummary[];
    };
    const byProject = new Map<string, { totalHours: number; entryCount: number; members: Map<string, MemberSummary> }>();
    for (const e of entries) {
      const pid = String(e.projectId ?? "");
      if (!pid) continue;
      const hours = parseFloat(String(e.hours ?? "0")) || 0;
      let proj = byProject.get(pid);
      if (!proj) {
        proj = { totalHours: 0, entryCount: 0, members: new Map() };
        byProject.set(pid, proj);
      }
      proj.totalHours += hours;
      proj.entryCount += 1;
      const uid = String(e.userId ?? "");
      const name = String(e.userName ?? "Unknown");
      let mem = proj.members.get(uid);
      if (!mem) {
        mem = { userId: uid, name, hours: 0 };
        proj.members.set(uid, mem);
      }
      mem.hours += hours;
    }

    const rows: ProjectSummary[] = Array.from(byProject.entries()).map(([projectId, v]) => ({
      projectId,
      projectName: projectMap[projectId] || `Project ${projectId}`,
      totalHours: v.totalHours,
      entryCount: v.entryCount,
      members: Array.from(v.members.values()).sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name)),
    }));
    rows.sort((a, b) => b.totalHours - a.totalHours || a.projectName.localeCompare(b.projectName));
    return rows;
  }, [entries, projectMap]);

  const overallSummary = useMemo(() => {
    const memberIds = new Set<string>();
    for (const e of entries) {
      const uid = String(e.userId ?? "");
      if (uid) memberIds.add(uid);
    }
    return {
      entryCount: entries.length,
      memberCount: memberIds.size,
      projectCount: projectSummary.length,
    };
  }, [entries, projectSummary.length]);

  const summaryDialog = (
    <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
      <DialogContent className="sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Summary
            </span>
            <span className="shrink-0 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground text-right">Total hours</span>
              <span className="block text-lg font-bold tabular-nums text-primary text-right">{totalHours.toFixed(1)}h</span>
              <span className="block text-[11px] text-muted-foreground text-right">
                {overallSummary.entryCount} {overallSummary.entryCount === 1 ? "entry" : "entries"} •{" "}
                {overallSummary.memberCount} {overallSummary.memberCount === 1 ? "member" : "members"} •{" "}
                {overallSummary.projectCount} {overallSummary.projectCount === 1 ? "project" : "projects"}
              </span>
            </span>
          </DialogTitle>
          <DialogDescription>Project-wise totals based on your current search and filters.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-2">
          {projectSummary.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No entries to summarize.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {projectSummary.map((p) => (
                <div key={p.projectId} className="rounded-xl border border-border/50 bg-background shadow-sm overflow-hidden">
                  <div className="flex items-start justify-between gap-3 border-b border-border/50 bg-muted/20 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate" title={p.projectName}>
                        {p.projectName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.entryCount} {p.entryCount === 1 ? "entry" : "entries"} • {p.members.length}{" "}
                        {p.members.length === 1 ? "member" : "members"}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground text-right">Total</p>
                      <p className="text-lg font-bold tabular-nums text-primary text-right">{p.totalHours.toFixed(1)}h</p>
                    </div>
                  </div>

                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <span>Member</span>
                      <span>Hours</span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {p.members.map((m) => (
                        <div key={`${p.projectId}-${m.userId}`} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate" title={m.name}>
                              {m.name}
                            </p>
                          </div>
                          <p className="text-xs font-semibold tabular-nums text-foreground">{m.hours.toFixed(1)}h</p>
                        </div>
                      ))}
                      <div className="pt-2 mt-1 border-t border-border/50 flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground">Total</p>
                        <p className="text-xs font-bold tabular-nums text-primary">{p.totalHours.toFixed(1)}h</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  /** Deep link from sidebar: #timecards-summary */
  useEffect(() => {
    const scrollIfNeeded = () => {
      if (typeof window === "undefined") return;
      if (window.location.hash.replace(/^#/, "") !== "timecards-summary") return;
      window.requestAnimationFrame(() => {
        document.getElementById("pms-timecards-summary-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    scrollIfNeeded();
    window.addEventListener("hashchange", scrollIfNeeded);
    return () => window.removeEventListener("hashchange", scrollIfNeeded);
  }, []);

  const showMemberColumn = isClient || isManagerOrAdmin;

  const exportMeta = useMemo(
    () =>
      buildTimecardsExportMeta({
        isClient,
        projectName: currentProject?.name,
        organizationName: companySettingsForTime?.companyName,
        totalHours,
        entryCount: entries.length,
        filterUserLabel:
          isManagerOrAdmin && filterUserId !== "all"
            ? memberFilterOptions.find((o) => o.value === filterUserId)?.label
            : undefined,
        filterProjectLabel:
          filterProjectId !== "all" ? projectFilterOptions.find((o) => o.value === filterProjectId)?.label : undefined,
        filterTaskLabel:
          !isClient && filterProjectId !== "all" && filterTaskId !== "all"
            ? taskFilterOptions.find((o) => o.value === filterTaskId)?.label
            : undefined,
        filterStartDate: filterStartDate || undefined,
        filterEndDate: filterEndDate || undefined,
      }),
    [
      isClient,
      currentProject?.name,
      totalHours,
      entries.length,
      isManagerOrAdmin,
      filterUserId,
      memberFilterOptions,
      filterProjectId,
      projectFilterOptions,
      filterTaskId,
      taskFilterOptions,
      filterStartDate,
      filterEndDate,
      companySettingsForTime?.companyName,
    ],
  );

  const handleExportExcel = async () => {
    try {
      const rows = buildExportRows(entries, projectMap, showMemberColumn);
      const { downloadTimecardsXlsx } = await import("@/lib/timecardsExportExcel");
      await downloadTimecardsXlsx(rows, showMemberColumn, "timecards", exportMeta);
      toast({ title: "Download started", description: "Excel file includes formatting and matches your filters." });
    } catch (e) {
      toast({
        title: "Excel export failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const handleExportPdf = async () => {
    const branding = {
      companyName: companySettingsForTime?.companyName?.trim() || "Company",
      logoUrl: companySettingsForTime?.logoUrl?.trim() || null,
    };
    try {
      const rows = buildExportRows(entries, projectMap, showMemberColumn);
      await downloadTimecardsPdf(rows, showMemberColumn, exportMeta, branding);
      toast({ title: "PDF ready", description: "Includes totals and all rows matching your filters." });
    } catch (e) {
      toast({
        title: "PDF export failed",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  };

  const filteredTasksForLog = useMemo(() => {
    if (!logProjectId) return allTasks.filter(t => t.title.trim());
    return allTasks.filter(t => String(t.projectId) === logProjectId && t.title.trim());
  }, [allTasks, logProjectId]);

  function clearFiltersAndPage() {
    clearFiltersBase();
    setPage(1);
  }

  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<{ projectId?: number | null; taskId?: number | null }>).detail;
      if (!detail) return;
      const pid =
        detail.projectId != null && Number.isInteger(Number(detail.projectId))
          ? String(detail.projectId)
          : "all";
      setFilterProjectId(pid);
      if (pid === "all") {
        setFilterTaskId("all");
      } else if (detail.taskId != null && Number.isInteger(Number(detail.taskId))) {
        setFilterTaskId(String(detail.taskId));
      } else {
        setFilterTaskId("all");
      }
      setPage(1);
      setTimeout(() => {
        commitSearch();
      }, 0);
    };
    window.addEventListener("pms:timecards-focus", onFocus);
    return () => window.removeEventListener("pms:timecards-focus", onFocus);
  }, [commitSearch, setFilterProjectId, setFilterTaskId]);

  // Client view: read-only table
  if (isClient) {
    const projectName = currentProject?.name || "this project";
    return (
      <div className="flex-1 h-full overflow-hidden flex flex-col">
        <div className="p-6 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-xl font-display font-bold text-foreground">Hours Shared With You</h2>
              <p className="text-sm text-muted-foreground">
                Time entries shared by the team for <span className="font-medium text-foreground">{projectName}</span>
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Button size="sm" className="h-9 gap-1.5" onClick={commitSearch} disabled={isLoading} data-testid="button-client-timecards-search">
                <Search className="w-3.5 h-3.5" />
                Search
              </Button>
              <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
                <Timer className="h-5 w-5 shrink-0 text-primary" />
                <div className="text-right leading-tight">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total hours</p>
                  <p className="text-xl font-bold tabular-nums text-primary" data-testid="text-total-hours">
                    {hasLoadedEntries ? `${totalHours.toFixed(1)}h` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {hasLoadedEntries ? `${entries.length} ${entries.length === 1 ? "entry" : "entries"}` : "Not loaded"}
                  </p>
                </div>
              </div>
              {hasLoadedEntries && entries.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={() => setSummaryOpen(true)}
                    data-testid="button-summary-client"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    Summary
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExportExcel} data-testid="button-export-xlsx-client">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Excel
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExportPdf} data-testid="button-export-pdf-client">
                    <FileDown className="w-3.5 h-3.5" />
                    PDF
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {summaryDialog}

        <ScrollArea className="flex-1">
          <div className="p-6">
            {!hasLoadedEntries && !isLoading ? (
              <div className="text-center py-16 border-2 border-dashed border-border/50 rounded-xl space-y-3">
                <Search className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Load shared hours</p>
                  <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm mx-auto">
                    Time entries are not loaded automatically. Click <span className="font-medium text-foreground">Search</span> above to fetch data from the server.
                  </p>
                </div>
              </div>
            ) : isLoading ? (
              <div className="text-center text-sm text-muted-foreground py-16">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-border/50 rounded-xl space-y-3">
                <Clock className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">No shared time entries yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    The team hasn't shared any time entries for this project yet.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-background border border-border/50 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm" data-testid="table-client-time-log">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Task</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Work Type</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedPaginatedEntries.map((group) => (
                        <Fragment key={`group-client-${group.logDate}`}>
                          <tr className="bg-muted/40 border-y border-border/40">
                            <td colSpan={5} className="px-4 py-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-foreground">
                                    {group.label}
                                    {group.label === "Today" ? (
                                      <span className="ml-2 text-[11px] font-medium text-muted-foreground/80">
                                        {format(parseISO(group.logDate), "MMM d, yyyy")}
                                      </span>
                                    ) : null}
                                  </span>
                                </div>
                                <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold tabular-nums text-primary">
                                  {(totalHoursByDate[group.logDate] || 0).toFixed(1)}h
                                </span>
                              </div>
                            </td>
                          </tr>
                          {group.entries.map((entry: any) => (
                            <tr key={entry.id} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-client-time-entry-${entry.id}`}>
                              <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{entry.logDate}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-5 w-5 shrink-0">
                                    <AvatarFallback className="text-[9px]">{(entry.userName || "?")[0]}</AvatarFallback>
                                  </Avatar>
                                  <span className="text-xs whitespace-nowrap">{entry.userName}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 font-medium max-w-[220px] align-top">
                                <span className="block whitespace-pre-wrap break-words" title={entry.taskTitle}>
                                  {entry.taskTitle}
                                </span>
                              </td>
                              <td className="px-4 py-3 align-top min-w-[12rem] max-w-md">
                                <WorkDescriptionCell description={entry.description} />
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-primary whitespace-nowrap align-top">{parseFloat(entry.hours).toFixed(1)}h</td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                {entries.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                    <p className="text-xs text-muted-foreground">
                      Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, entries.length)} of {entries.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        data-testid="button-client-timecards-prev"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        Previous
                      </Button>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        Page {page} of {totalPages}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        data-testid="button-client-timecards-next"
                      >
                        Next
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-border/50 space-y-4 shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-start gap-4">
            <div className="flex items-center gap-3">
              <Clock className="h-7 w-7 shrink-0 text-primary" />
              <div>
                <h2 className="font-display text-xl font-bold text-foreground">Timecards</h2>
                <p className="text-sm text-muted-foreground">
                  {isAdmin ? "All team members' time logs" : isManagerOrAdmin ? "Your team's time logs" : "Your personal time log"}
                </p>
                <p className="text-xs text-muted-foreground/80 mt-1">
                  Use <strong>Search</strong> to load the time log
                  {isManagerOrAdmin ? " and the timecards summary (when From and To dates are set)" : ""} — data is not
                  fetched until you search.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
              <Timer className="h-5 w-5 shrink-0 text-primary" />
              <div className="leading-tight">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total hours</p>
                <p className="text-2xl font-bold tabular-nums text-primary" data-testid="text-total-hours">
                  {hasLoadedEntries ? `${totalHours.toFixed(1)}h` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasLoadedEntries ? (
                    <>
                      {entries.length} {entries.length === 1 ? "entry" : "entries"}
                      {isManagerOrAdmin ? " (filtered)" : ""}
                    </>
                  ) : (
                    "Run Search to load"
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {hasLoadedEntries && entries.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5"
                  onClick={() => setSummaryOpen(true)}
                  data-testid="button-summary"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Summary
                </Button>
                <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExportExcel} data-testid="button-export-xlsx">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Excel
                </Button>
                <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExportPdf} data-testid="button-export-pdf">
                  <FileDown className="w-3.5 h-3.5" />
                  PDF
                </Button>
              </>
            )}
            <Button
              onClick={() => setLogOpen(true)}
              className="gap-2"
              data-testid="button-log-time"
            >
              <Plus className="w-4 h-4" />
              Log Time
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          {isManagerOrAdmin && (
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
              <SearchableSelect
                value={filterUserId}
                onValueChange={setFilterUserId}
                options={memberFilterOptions}
                placeholder="All members"
                searchPlaceholder="Search members…"
                triggerClassName="w-[200px]"
                data-testid="select-filter-user"
              />
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
            <SearchableSelect
              value={filterProjectId}
              onValueChange={setFilterProjectId}
              options={projectFilterOptions}
              placeholder="All projects"
              searchPlaceholder="Search projects…"
              triggerClassName="w-[200px]"
              data-testid="select-filter-project"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
            <SearchableSelect
              value={filterTaskId}
              onValueChange={setFilterTaskId}
              options={taskFilterOptions}
              placeholder={filterProjectId === "all" ? "Select project for tasks" : "All tasks in project"}
              searchPlaceholder="Search tasks…"
              disabled={filterProjectId === "all"}
              triggerClassName="w-[220px]"
              data-testid="select-filter-task"
            />
          </div>
          <Input
            type="date"
            value={filterStartDate}
            onChange={e => setFilterStartDate(e.target.value)}
            className="w-[150px] h-9 text-sm"
            data-testid="input-filter-start-date"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input
            type="date"
            value={filterEndDate}
            onChange={e => setFilterEndDate(e.target.value)}
            className="w-[150px] h-9 text-sm"
            data-testid="input-filter-end-date"
          />
          <Button
            size="sm"
            className="h-9 gap-1.5"
            onClick={commitSearch}
            disabled={isLoading}
            data-testid="button-timecards-search"
          >
            <Search className="w-3.5 h-3.5" />
            Search
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={clearFiltersAndPage} data-testid="button-clear-filters">
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {summaryDialog}

      {/* Summary sits outside Radix ScrollArea so native horizontal scroll on the wide grid works */}
      {isManagerOrAdmin ? (
        <div className="shrink-0 border-b border-border/50 bg-muted/10 px-6 py-4 min-h-0">
          <TimecardsComplianceSummary
            dateDisplayPreset={companySettingsForTime?.timecardDateDisplayFormat ?? "DD/MM/YYYY"}
            applied={applied}
          />
        </div>
      ) : null}

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-3 p-6">
          {/* Detailed Log */}
          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">
                {isManagerOrAdmin ? "Full Time Log" : "My Time Log"}
              </h3>
              {isManagerOrAdmin ? (
                <p className="text-xs text-muted-foreground max-w-3xl">
                  Rows here follow <strong>project</strong> and <strong>task</strong> filters. For weekday totals vs 8h
                  across all projects, use the <strong>Timecards summary</strong> section above.
                </p>
              ) : null}
            </div>

            {!hasLoadedEntries && !isLoading ? (
              <div className="text-center py-16 border-2 border-dashed border-border/50 rounded-xl space-y-3">
                <Search className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Ready to load</p>
                  <p className="text-xs text-muted-foreground/70 mt-1 max-w-md mx-auto">
                    Entries are not loaded automatically. Set optional filters, then click <span className="font-medium text-foreground">Search</span> to query the server.
                  </p>
                </div>
              </div>
            ) : isLoading ? (
              <div className="text-center text-sm text-muted-foreground py-16">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-border/50 rounded-xl space-y-3">
                <Clock className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">No time entries found</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    No rows match your filters. Try adjusting Search criteria or click "Log Time" to add an entry.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setLogOpen(true)} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Log Time
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-background border border-border/50 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm" data-testid="table-time-log">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                        {showMemberColumn ? (
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                        ) : null}
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Task</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Work type &amp; description</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hours</th>
                        <th className="px-4 py-3 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {groupedPaginatedEntries.map((group) => (
                        <Fragment key={`group-staff-${group.logDate}`}>
                          <tr className="bg-muted/40 border-y border-border/40">
                            <td colSpan={showMemberColumn ? 7 : 6} className="px-4 py-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-foreground">
                                    {group.label}
                                    {group.label === "Today" ? (
                                      <span className="ml-2 text-[11px] font-medium text-muted-foreground/80">
                                        {format(parseISO(group.logDate), "MMM d, yyyy")}
                                      </span>
                                    ) : null}
                                  </span>
                                </div>
                                <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold tabular-nums text-primary">
                                  {(totalHoursByDate[group.logDate] || 0).toFixed(1)}h
                                </span>
                              </div>
                            </td>
                          </tr>
                          {group.entries.map((entry: any) => {
                            const canDelete = isManagerOrAdmin || String(entry.userId) === String(currentUser?.id);
                            const isPrivate = entry.clientVisible === false;
                            return (
                              <tr key={entry.id} className={cn("border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors group", isPrivate && "bg-muted/10")} data-testid={`row-time-entry-${entry.id}`}>
                                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap align-top">
                                  <div className="flex items-center gap-1.5">
                                    {entry.logDate}
                                    {isPrivate && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground bg-muted border border-border/50 px-1.5 py-0.5 rounded" data-testid={`badge-private-${entry.id}`}>
                                        <Lock className="w-2.5 h-2.5" />
                                        private
                                      </span>
                                    )}
                                  </div>
                                </td>
                                {showMemberColumn ? (
                                  <td className="px-4 py-3 align-top">
                                    <div className="flex items-center gap-2">
                                      <Avatar className="h-5 w-5 shrink-0">
                                        <AvatarFallback className="text-[9px]">{(entry.userName || "?")[0]}</AvatarFallback>
                                      </Avatar>
                                      <span className="text-xs whitespace-nowrap">{entry.userName}</span>
                                    </div>
                                  </td>
                                ) : null}
                                <td className="px-4 py-3 text-xs text-muted-foreground align-top whitespace-nowrap">{projectMap[String(entry.projectId)] || `Project ${entry.projectId}`}</td>
                                <td className="px-4 py-3 font-medium max-w-[220px] align-top">
                                  <span className="block whitespace-pre-wrap break-words" title={entry.taskTitle}>
                                    {entry.taskTitle}
                                  </span>
                                </td>
                                <td className="px-4 py-3 align-top min-w-[12rem] max-w-md">
                                  <WorkDescriptionCell description={entry.description} />
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-primary whitespace-nowrap align-top">{parseFloat(entry.hours).toFixed(1)}h</td>
                                <td className="px-4 py-3 text-right align-top">
                                  {canDelete && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                      onClick={() => handleDelete(entry.id)}
                                      data-testid={`button-delete-entry-${entry.id}`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                  <p className="text-xs text-muted-foreground">
                    Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, entries.length)} of {entries.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      data-testid="button-timecards-prev"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      data-testid="button-timecards-next"
                    >
                      Next
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Log Time Dialog */}
      <Dialog open={logOpen} onOpenChange={(open) => {
        setLogOpen(open);
        if (!open) {
          setLogProjectId(numericProjectId ? String(numericProjectId) : "");
          setLogTaskId("");
          setLogCategory("");
          setLogHours("");
          setLogNote("");
          setLogDate(format(new Date(), "yyyy-MM-dd"));
          setLogClientVisible(true);
        }
      }}>
        <DialogContent className="sm:max-w-[500px] max-w-[calc(100vw-2rem)] overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Log Time
            </DialogTitle>
            <DialogDescription>
              Record hours spent on a task. Select a project to filter tasks.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2 min-w-0">
            {/* Step 1: Project */}
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="log-project" className="flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-muted-foreground" />
                Project <span className="text-destructive">*</span>
              </Label>
              <Select
                value={logProjectId}
                onValueChange={(v) => {
                  setLogProjectId(v);
                  setLogTaskId("");
                }}
              >
                <SelectTrigger id="log-project" className={LOG_TIME_SELECT_TRIGGER} data-testid="select-log-project">
                  <SelectValue placeholder="Select a project…" />
                </SelectTrigger>
                <SelectContent className={LOG_TIME_SELECT_CONTENT}>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={String(p.id)} className="items-start whitespace-normal py-2">
                      <span className="whitespace-normal break-words leading-snug">{p.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Task — filtered by project */}
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="log-task">
                Task <span className="text-destructive">*</span>
              </Label>
              <Select
                value={logTaskId}
                onValueChange={setLogTaskId}
                disabled={!logProjectId}
              >
                <SelectTrigger id="log-task" className={LOG_TIME_SELECT_TRIGGER} data-testid="select-log-task">
                  <SelectValue placeholder={logProjectId ? "Select a task…" : "Select a project first"} />
                </SelectTrigger>
                <SelectContent className={LOG_TIME_SELECT_CONTENT}>
                  {filteredTasksForLog.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">No tasks in this project</div>
                  ) : (
                    filteredTasksForLog.map(task => (
                      <SelectItem key={task.id} value={String(task.id)} className="items-start whitespace-normal py-2">
                        <span className="whitespace-normal break-words leading-snug">{task.title}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Step 3: Work Type (required) */}
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="log-category" className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                Work Type <span className="text-destructive">*</span>
              </Label>
              <Select value={logCategory} onValueChange={setLogCategory}>
                <SelectTrigger id="log-category" className={LOG_TIME_SELECT_TRIGGER} data-testid="select-log-category">
                  <SelectValue placeholder="What kind of work?" />
                </SelectTrigger>
                <SelectContent className={LOG_TIME_SELECT_CONTENT}>
                  {WORK_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value} className="items-start whitespace-normal py-2">
                      <span className="whitespace-normal break-words leading-snug">{c.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 4: Hours + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="log-hours">Hours <span className="text-destructive">*</span></Label>
                <Input
                  id="log-hours"
                  type="number"
                  min="0.1"
                  max={logHoursInputMax}
                  step="0.5"
                  placeholder="e.g. 2.5"
                  value={logHours}
                  onChange={e => setLogHours(e.target.value)}
                  data-testid="input-log-hours"
                />
                {maxHoursPerEntryCap != null ? (
                  <p className="text-[11px] text-muted-foreground">
                    Company limit: up to {maxHoursPerEntryCap}h per entry.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="log-date">Date <span className="text-destructive">*</span></Label>
                <Input
                  id="log-date"
                  type="date"
                  value={logDate}
                  onChange={e => setLogDate(e.target.value)}
                  data-testid="input-log-date"
                />
              </div>
            </div>

            {/* Step 5: Work description */}
            <div className="space-y-1.5">
              <Label htmlFor="log-note">
                Work description
                {minWordsRequired > 0 ? (
                  <span className="text-destructive"> *</span>
                ) : (
                  <span className="text-muted-foreground text-xs font-normal ml-1">(optional)</span>
                )}
              </Label>
              <Textarea
                id="log-note"
                placeholder={
                  logCategory === "bug" ? "e.g. Fixed null pointer in checkout flow" :
                  logCategory === "rnd" ? "e.g. Evaluated three caching libraries" :
                  logCategory === "meeting" ? "e.g. Sprint planning with design team" :
                  "Add specific details about what you worked on…"
                }
                value={logNote}
                onChange={e => setLogNote(e.target.value)}
                rows={4}
                className="min-h-[96px] resize-y"
                data-testid="textarea-log-note"
              />
              {minWordsRequired > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {countWordsInText(logNote)} / {minWordsRequired} words minimum (work type is not counted).
                </p>
              ) : null}
              {logCategory ? (
                <p className="text-[11px] text-muted-foreground">
                  Stored as:{" "}
                  <span className="font-mono text-foreground">
                    {buildStoredTimeDescription(logCategory, logNote)}
                  </span>
                </p>
              ) : null}
            </div>

            {/* Share with client checkbox — always shown for non-clients, disabled if no client timecards */}
            {!isClient && (
              <div className={cn("flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border/40", !clientTimecardsEnabled && "opacity-50")}>
                <Checkbox
                  id="log-client-visible"
                  checked={clientTimecardsEnabled ? logClientVisible : false}
                  onCheckedChange={clientTimecardsEnabled ? (v) => setLogClientVisible(v === true) : undefined}
                  disabled={!clientTimecardsEnabled}
                  data-testid="checkbox-client-visible"
                />
                <label htmlFor="log-client-visible" className={cn("text-sm font-medium flex-1", clientTimecardsEnabled ? "cursor-pointer" : "cursor-not-allowed")}>
                  Share with client
                </label>
                <span className="text-xs text-muted-foreground">
                  {clientTimecardsEnabled ? "Visible to the project client" : "No client with timecards on this project"}
                </span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setLogOpen(false)} disabled={logSaving}>
                Cancel
              </Button>
              <Button onClick={handleLogSubmit} disabled={logSaving || !logTaskId || !logCategory || !logHours} data-testid="button-submit-log">
                {logSaving ? "Saving…" : "Log Time"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
