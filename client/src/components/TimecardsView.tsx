import { useState, useMemo } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Clock, Trash2, Filter, Plus, ChevronDown, ChevronUp, Timer, Users, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface TimecardsViewProps {
  currentUserRole: string;
}

interface AllTask {
  id: number;
  title: string;
  projectId: number;
  projectName: string;
  status: string;
}

export default function TimecardsView({ currentUserRole }: TimecardsViewProps) {
  const { user: currentUser } = useAuth();
  const { usersArray, projects } = useAppData();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isAdmin = currentUserRole === "admin";
  const isManagerOrAdmin = isAdmin || currentUserRole === "manager";

  const [filterUserId, setFilterUserId] = useState<string>("all");
  const [filterProjectId, setFilterProjectId] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [summaryExpanded, setSummaryExpanded] = useState(true);

  const [logOpen, setLogOpen] = useState(false);
  const [logTaskId, setLogTaskId] = useState<string>("");
  const [logHours, setLogHours] = useState<string>("");
  const [logDate, setLogDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [logNote, setLogNote] = useState<string>("");
  const [logSaving, setLogSaving] = useState(false);

  const queryParams = new URLSearchParams();
  if (isManagerOrAdmin && filterUserId !== "all") queryParams.set("userId", filterUserId);
  if (filterProjectId !== "all") queryParams.set("projectId", filterProjectId);
  if (filterStartDate) queryParams.set("startDate", filterStartDate);
  if (filterEndDate) queryParams.set("endDate", filterEndDate);

  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/time-entries", filterUserId, filterProjectId, filterStartDate, filterEndDate],
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
    if (!logTaskId || !logHours || !logDate) {
      toast({ title: "Please fill in task, hours, and date", variant: "destructive" });
      return;
    }
    const h = parseFloat(logHours);
    if (isNaN(h) || h <= 0 || h > 24) {
      toast({ title: "Hours must be between 0.1 and 24", variant: "destructive" });
      return;
    }
    setLogSaving(true);
    try {
      await apiRequest("POST", "/api/time-entries", {
        taskId: Number(logTaskId),
        hours: h,
        description: logNote.trim() || null,
        logDate,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Time logged successfully" });
      setLogOpen(false);
      setLogTaskId("");
      setLogHours("");
      setLogNote("");
      setLogDate(format(new Date(), "yyyy-MM-dd"));
    } catch {
      toast({ title: "Failed to log time", variant: "destructive" });
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

  const tasksByProject = useMemo(() => {
    const grouped: Record<string, AllTask[]> = {};
    allTasks.forEach(t => {
      if (!grouped[t.projectName]) grouped[t.projectName] = [];
      grouped[t.projectName].push(t);
    });
    return grouped;
  }, [allTasks]);

  const hasActiveFilters = filterUserId !== "all" || filterProjectId !== "all" || filterStartDate || filterEndDate;

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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2">
              <Timer className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-primary" data-testid="text-total-hours">
                {totalHours.toFixed(1)}h {isManagerOrAdmin ? "total" : "logged"}
              </span>
            </div>
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
            <Select value={filterUserId} onValueChange={setFilterUserId}>
              <SelectTrigger className="w-[170px] h-9 text-sm" data-testid="select-filter-user">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="All members" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All members</SelectItem>
                {usersArray.map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3" />
                      {u.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={filterProjectId} onValueChange={setFilterProjectId}>
            <SelectTrigger className="w-[160px] h-9 text-sm" data-testid="select-filter-project">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                setFilterStartDate("");
                setFilterEndDate("");
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
              <div className="bg-background border border-border/50 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-sm" data-testid="table-time-log">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                      {isManagerOrAdmin && <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>}
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Task</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Note</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hours</th>
                      <th className="px-4 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry: any) => {
                      const canDelete = isManagerOrAdmin || String(entry.userId) === String(currentUser?.id);
                      return (
                        <tr key={entry.id} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors group" data-testid={`row-time-entry-${entry.id}`}>
                          <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{entry.logDate}</td>
                          {isManagerOrAdmin && (
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Avatar className="h-5 w-5 shrink-0">
                                  <AvatarFallback className="text-[9px]">{(entry.userName || "?")[0]}</AvatarFallback>
                                </Avatar>
                                <span className="text-xs whitespace-nowrap">{entry.userName}</span>
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-3 font-medium max-w-[200px] truncate" title={entry.taskTitle}>{entry.taskTitle}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{projectMap[String(entry.projectId)] || `Project ${entry.projectId}`}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground italic max-w-[180px] truncate">{entry.description || "—"}</td>
                          <td className="px-4 py-3 text-right font-semibold text-primary whitespace-nowrap">{parseFloat(entry.hours).toFixed(1)}h</td>
                          <td className="px-4 py-3 text-right">
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
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Log Time Dialog */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Log Time
            </DialogTitle>
            <DialogDescription>
              Record hours spent on a task. This will appear in your timecard.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="log-task">Task <span className="text-destructive">*</span></Label>
              <Select value={logTaskId} onValueChange={setLogTaskId}>
                <SelectTrigger id="log-task" className="w-full" data-testid="select-log-task">
                  <SelectValue placeholder="Select a task…" />
                </SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  {Object.entries(tasksByProject).map(([projectName, tasks]) => (
                    <div key={projectName}>
                      <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {projectName}
                      </div>
                      {tasks.filter(t => t.title.trim()).map(task => (
                        <SelectItem key={task.id} value={String(task.id)}>
                          <span className="truncate">{task.title}</span>
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="log-hours">Hours <span className="text-destructive">*</span></Label>
                <Input
                  id="log-hours"
                  type="number"
                  min="0.1"
                  max="24"
                  step="0.5"
                  placeholder="e.g. 2.5"
                  value={logHours}
                  onChange={e => setLogHours(e.target.value)}
                  data-testid="input-log-hours"
                />
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

            <div className="space-y-1.5">
              <Label htmlFor="log-note">Note <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
              <Textarea
                id="log-note"
                placeholder="What did you work on?"
                value={logNote}
                onChange={e => setLogNote(e.target.value)}
                rows={2}
                className="resize-none"
                data-testid="textarea-log-note"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setLogOpen(false)} disabled={logSaving}>
                Cancel
              </Button>
              <Button onClick={handleLogSubmit} disabled={logSaving} data-testid="button-submit-log">
                {logSaving ? "Saving…" : "Log Time"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
