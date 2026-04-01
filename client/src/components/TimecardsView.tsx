import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useAppData } from "@/hooks/useAppData";
import { apiRequest } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Trash2, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimecardsViewProps {
  currentUserRole: string;
}

export default function TimecardsView({ currentUserRole }: TimecardsViewProps) {
  const { user: currentUser } = useAuth();
  const { usersArray, projects } = useAppData();
  const queryClient = useQueryClient();

  const isManagerOrAdmin = currentUserRole === "admin" || currentUserRole === "manager";

  const [filterUserId, setFilterUserId] = useState<string>("all");
  const [filterProjectId, setFilterProjectId] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");

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

  const handleDelete = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/time-entries/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
    } catch (e) {
      console.error("Failed to delete entry:", e);
    }
  };

  const totalHours = entries.reduce((sum: number, e: any) => sum + parseFloat(e.hours || "0"), 0);

  const memberSummary: Record<string, { name: string; avatar?: string; total: number; byProject: Record<string, number> }> = {};
  entries.forEach((e: any) => {
    const uid = String(e.userId);
    if (!memberSummary[uid]) {
      const u = usersArray.find(u => String(u.id) === uid);
      memberSummary[uid] = { name: e.userName || u?.name || "Unknown", avatar: u?.avatar, total: 0, byProject: {} };
    }
    memberSummary[uid].total += parseFloat(e.hours || "0");
    const pid = String(e.projectId);
    memberSummary[uid].byProject[pid] = (memberSummary[uid].byProject[pid] || 0) + parseFloat(e.hours || "0");
  });

  const projectMap: Record<string, string> = {};
  projects.forEach(p => { projectMap[p.id] = p.name; });

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col">
      <div className="p-6 border-b border-border/50 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-xl font-display font-bold text-foreground">Timecards</h2>
              <p className="text-sm text-muted-foreground">Track and review hours logged across tasks</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2">
            <Clock className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-primary" data-testid="text-total-hours">{totalHours.toFixed(1)}h total</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {isManagerOrAdmin && (
            <Select value={filterUserId} onValueChange={setFilterUserId}>
              <SelectTrigger className="w-[160px] h-9 text-sm" data-testid="select-filter-user">
                <SelectValue placeholder="All members" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All members</SelectItem>
                {usersArray.map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
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
            placeholder="Start date"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input
            type="date"
            value={filterEndDate}
            onChange={e => setFilterEndDate(e.target.value)}
            className="w-[150px] h-9 text-sm"
            data-testid="input-filter-end-date"
            placeholder="End date"
          />
          {(filterUserId !== "all" || filterProjectId !== "all" || filterStartDate || filterEndDate) && (
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
              Clear
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-8">

          {/* Member Summary Table - admin/manager only */}
          {isManagerOrAdmin && Object.keys(memberSummary).length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Team Summary</h3>
              <div className="bg-background border border-border/50 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-sm" data-testid="table-member-summary">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Projects</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(memberSummary).map(([uid, summary]) => (
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
                                {projectMap[pid] || `Project ${pid}`}: {hrs.toFixed(1)}h
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
            </div>
          )}

          {/* Detailed log */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Time Log</h3>
            {isLoading ? (
              <div className="text-center text-sm text-muted-foreground py-12">Loading...</div>
            ) : entries.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-12 border-2 border-dashed border-border/50 rounded-xl">
                No time entries found. Open a task and use the Time tab to log hours.
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
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry: any) => {
                      const canDelete = isManagerOrAdmin || String(entry.userId) === String(currentUser?.id);
                      return (
                        <tr key={entry.id} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors group" data-testid={`row-time-entry-${entry.id}`}>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{entry.logDate}</td>
                          {isManagerOrAdmin && (
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {(() => {
                                  const u = usersArray.find(u => String(u.id) === String(entry.userId));
                                  return (
                                    <>
                                      <Avatar className="h-5 w-5">
                                        <AvatarImage src={u?.avatar} />
                                        <AvatarFallback className="text-[10px]">{entry.userName?.[0] || "?"}</AvatarFallback>
                                      </Avatar>
                                      <span className="text-xs">{entry.userName}</span>
                                    </>
                                  );
                                })()}
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-3 font-medium max-w-[200px] truncate">{entry.taskTitle}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{projectMap[String(entry.projectId)] || `Project ${entry.projectId}`}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground italic max-w-[180px] truncate">{entry.description || "—"}</td>
                          <td className="px-4 py-3 text-right font-semibold text-primary">{parseFloat(entry.hours).toFixed(1)}h</td>
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
    </div>
  );
}
