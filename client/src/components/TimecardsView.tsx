import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
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
  downloadTimecardsCsv,
  downloadTimecardsPdf,
} from "@/lib/timecardsExport";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  ChevronDown,
  ChevronUp,
  Timer,
  Users,
  Folder,
  Tag,
  Lock,
  FileSpreadsheet,
  FileDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { ClientPermissions } from "@/App";
import type { Project } from "@/lib/mockData";
import {
  WORK_CATEGORIES,
  buildStoredTimeDescription,
  countWordsInText,
} from "@shared/timeLogDescription";

const PAGE_SIZE = 25;

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

interface AllTask {
  id: number;
  title: string;
  projectId: number;
  projectName: string;
  status: string;
}

export default function TimecardsView({ currentUserRole, currentProject, clientPermissions }: TimecardsViewProps) {
  const { user: currentUser } = useAuth();
  const { usersArray, projects } = useAppData();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isClient = currentUserRole === "client";
  const isAdmin = currentUserRole === "admin";
  const isManagerOrAdmin = isAdmin || currentUserRole === "manager";

  const numericProjectId = currentProject ? Number(currentProject.id) : null;

  const [filterUserId, setFilterUserId] = useState<string>("all");
  const [filterProjectId, setFilterProjectId] = useState<string>("all");
  const [filterTaskId, setFilterTaskId] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [page, setPage] = useState(1);

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

  const queryParams = new URLSearchParams();
  if (isManagerOrAdmin && filterUserId !== "all") queryParams.set("userId", filterUserId);
  if (filterProjectId !== "all") queryParams.set("projectId", filterProjectId);
  if (!isClient && filterProjectId !== "all" && filterTaskId !== "all") {
    queryParams.set("taskId", filterTaskId);
  }
  if (filterStartDate) queryParams.set("startDate", filterStartDate);
  if (filterEndDate) queryParams.set("endDate", filterEndDate);
  // For clients, also pass their current project
  if (isClient && numericProjectId && filterProjectId === "all") {
    queryParams.set("projectId", String(numericProjectId));
  }

  const { data: companySettingsForTime } = useQuery<{
    timeLogMinDescriptionWords?: number;
    timeLogMaxHoursPerEntry?: number | null;
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

  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: [
      "/api/time-entries",
      filterUserId,
      filterProjectId,
      filterTaskId,
      filterStartDate,
      filterEndDate,
      currentUserRole,
      numericProjectId,
    ],
    queryFn: async () => {
      const res = await fetch(`/api/time-entries?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch time entries");
      return res.json();
    },
  });

  const { data: allTasks = [] } = useQuery<AllTask[]>({
    queryKey: ["/api/tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
    enabled: !isClient,
  });

  const handleDelete = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/time-entries/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
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

  const totalHours = entries.reduce((sum: number, e: any) => sum + parseFloat(e.hours || "0"), 0);

  const memberSummary = useMemo(() => {
    const summary: Record<string, { name: string; avatar?: string; total: number; byProject: Record<string, number> }> = {};
    entries.forEach((e: any) => {
      const uid = String(e.userId);
      if (!summary[uid]) {
        const u = usersArray.find(u => String(u.id) === uid);
        summary[uid] = { name: e.userName || u?.name || "Unknown", avatar: u?.avatar || undefined, total: 0, byProject: {} };
      }
      summary[uid].total += parseFloat(e.hours || "0");
      const pid = String(e.projectId);
      summary[uid].byProject[pid] = (summary[uid].byProject[pid] || 0) + parseFloat(e.hours || "0");
    });
    return summary;
  }, [entries, usersArray]);

  const projectMap = useMemo(() => {
    const m: Record<string, string> = {};
    projects.forEach(p => { m[p.id] = p.name; });
    return m;
  }, [projects]);

  const memberFilterOptions = useMemo(
    () => [
      { value: "all", label: "All members" },
      ...usersArray.map((u) => ({ value: String(u.id), label: u.name })),
    ],
    [usersArray],
  );

  const projectFilterOptions = useMemo(
    () => [
      { value: "all", label: "All projects" },
      ...projects.map((p) => ({ value: p.id, label: p.name })),
    ],
    [projects],
  );

  const taskFilterOptions = useMemo(() => {
    if (filterProjectId === "all") {
      return [{ value: "all", label: "Select a project first" }];
    }
    const inProject = allTasks.filter((t) => String(t.projectId) === filterProjectId);
    return [
      { value: "all", label: "All tasks in project" },
      ...inProject.map((t) => ({
        value: String(t.id),
        label: (t.title || `Task ${t.id}`).slice(0, 120),
      })),
    ];
  }, [allTasks, filterProjectId]);

  useEffect(() => {
    setFilterTaskId("all");
  }, [filterProjectId]);

  useEffect(() => {
    setPage(1);
  }, [filterUserId, filterProjectId, filterTaskId, filterStartDate, filterEndDate]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const paginatedEntries = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return entries.slice(start, start + PAGE_SIZE);
  }, [entries, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const showMemberColumn = isClient || isManagerOrAdmin;

  const handleExportCsv = () => {
    const rows = buildExportRows(entries, projectMap, showMemberColumn);
    downloadTimecardsCsv(rows, showMemberColumn, "timecards");
    toast({ title: "Download started", description: "CSV includes all rows matching your filters." });
  };

  const handleExportPdf = () => {
    try {
      const rows = buildExportRows(entries, projectMap, showMemberColumn);
      downloadTimecardsPdf(rows, showMemberColumn, "Timecards — filtered export");
      toast({ title: "PDF ready", description: "Includes all rows matching your filters." });
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

  const hasActiveFilters =
    filterUserId !== "all" ||
    filterProjectId !== "all" ||
    filterTaskId !== "all" ||
    filterStartDate ||
    filterEndDate;

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
              {totalHours > 0 && (
                <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2">
                  <Timer className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-primary" data-testid="text-total-hours">
                    {totalHours.toFixed(1)}h total
                  </span>
                </div>
              )}
              {entries.length > 0 && (
                <>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExportCsv} data-testid="button-export-csv-client">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Excel (CSV)
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

        <ScrollArea className="flex-1">
          <div className="p-6">
            {isLoading ? (
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
                      {paginatedEntries.map((entry: any) => (
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-xl font-display font-bold text-foreground">Timecards</h2>
              <p className="text-sm text-muted-foreground">
                {isAdmin ? "All team members' time logs" : isManagerOrAdmin ? "Your team's time logs" : "Your personal time log"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2">
              <Timer className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-primary" data-testid="text-total-hours">
                {totalHours.toFixed(1)}h {isManagerOrAdmin ? "total" : "logged"}
              </span>
            </div>
            {entries.length > 0 && (
              <>
                <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleExportCsv} data-testid="button-export-csv">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Excel (CSV)
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
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs"
              onClick={() => {
                setFilterUserId("all");
                setFilterProjectId("all");
                setFilterTaskId("all");
                setFilterStartDate("");
                setFilterEndDate("");
                setPage(1);
              }}
              data-testid="button-clear-filters"
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">

          {/* Team Summary — admin/manager only */}
          {isManagerOrAdmin && Object.keys(memberSummary).length > 0 && (
            <div className="space-y-3">
              <button
                className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                onClick={() => setSummaryExpanded(v => !v)}
              >
                {summaryExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Team Summary
                <Badge variant="secondary" className="font-normal text-xs">{Object.keys(memberSummary).length} members</Badge>
              </button>

              {summaryExpanded && (
                <div className="bg-background border border-border/50 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm" data-testid="table-member-summary">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project Breakdown</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(memberSummary)
                        .sort((a, b) => b[1].total - a[1].total)
                        .map(([uid, summary]) => (
                          <tr key={uid} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-member-${uid}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Avatar className="h-7 w-7">
                                  <AvatarImage src={summary.avatar} />
                                  <AvatarFallback className="text-[10px]">{summary.name[0]}</AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{summary.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(summary.byProject).map(([pid, hrs]) => (
                                  <Badge key={pid} variant="secondary" className="text-[10px] font-normal">
                                    {projectMap[pid] || `Project ${pid}`}: {(hrs as number).toFixed(1)}h
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-bold text-primary" data-testid={`text-member-hours-${uid}`}>{summary.total.toFixed(1)}h</span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <Separator className="opacity-50" />

          {/* Detailed Log */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              {isManagerOrAdmin ? "Full Time Log" : "My Time Log"}
            </h3>

            {isLoading ? (
              <div className="text-center text-sm text-muted-foreground py-16">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-border/50 rounded-xl space-y-3">
                <Clock className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">No time entries found</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Click "Log Time" to record hours against a task
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
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Task</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Work type &amp; description</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hours</th>
                        <th className="px-4 py-3 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedEntries.map((entry: any) => {
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
                            <td className="px-4 py-3 font-medium max-w-[220px] align-top">
                              <span className="block whitespace-pre-wrap break-words" title={entry.taskTitle}>
                                {entry.taskTitle}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground align-top whitespace-nowrap">{projectMap[String(entry.projectId)] || `Project ${entry.projectId}`}</td>
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Log Time
            </DialogTitle>
            <DialogDescription>
              Record hours spent on a task. Select a project to filter tasks.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Step 1: Project */}
            <div className="space-y-1.5">
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
                <SelectTrigger id="log-project" className="w-full" data-testid="select-log-project">
                  <SelectValue placeholder="Select a project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Task — filtered by project */}
            <div className="space-y-1.5">
              <Label htmlFor="log-task">
                Task <span className="text-destructive">*</span>
              </Label>
              <Select
                value={logTaskId}
                onValueChange={setLogTaskId}
                disabled={!logProjectId}
              >
                <SelectTrigger id="log-task" className="w-full" data-testid="select-log-task">
                  <SelectValue placeholder={logProjectId ? "Select a task…" : "Select a project first"} />
                </SelectTrigger>
                <SelectContent className="max-h-[220px]">
                  {filteredTasksForLog.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">No tasks in this project</div>
                  ) : (
                    filteredTasksForLog.map(task => (
                      <SelectItem key={task.id} value={String(task.id)}>
                        <span className="truncate">{task.title}</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Step 3: Work Type (required) */}
            <div className="space-y-1.5">
              <Label htmlFor="log-category" className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                Work Type <span className="text-destructive">*</span>
              </Label>
              <Select value={logCategory} onValueChange={setLogCategory}>
                <SelectTrigger id="log-category" className="w-full" data-testid="select-log-category">
                  <SelectValue placeholder="What kind of work?" />
                </SelectTrigger>
                <SelectContent>
                  {WORK_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
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
