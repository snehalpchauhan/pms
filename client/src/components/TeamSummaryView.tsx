import { useMemo } from "react";
import { useTimecardsFiltersAndEntries } from "@/hooks/useTimecardsFiltersAndEntries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/SearchableSelect";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, Filter, Folder, Search, Tag, Timer, Users } from "lucide-react";
import type { ClientPermissions } from "@/App";
import type { Project } from "@/lib/mockData";

interface TeamSummaryViewProps {
  currentUserRole: string;
  currentProject?: Project;
  clientPermissions?: ClientPermissions;
}

export default function TeamSummaryView({ currentUserRole, currentProject }: TeamSummaryViewProps) {
  const {
    isManagerOrAdmin,
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
    commitSearch,
    hasLoadedEntries,
    entries,
    isLoading,
    totalHours,
    memberSummary,
    projectMap,
    memberFilterOptions,
    projectFilterOptions,
    taskFilterOptions,
    hasActiveFilters,
    clearFilters,
  } = useTimecardsFiltersAndEntries(currentUserRole, currentProject);

  const sortedMembers = useMemo(
    () => Object.entries(memberSummary).sort((a, b) => b[1].total - a[1].total),
    [memberSummary],
  );

  if (!isManagerOrAdmin) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <BarChart3 className="h-12 w-12 text-muted-foreground/50" />
        <div className="max-w-sm space-y-1">
          <h2 className="text-lg font-semibold">Team summary</h2>
          <p className="text-sm text-muted-foreground">Only managers and administrators can view team hour breakdowns.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-4 border-b border-border/50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-7 w-7 text-primary" />
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">Team summary</h2>
              <p className="text-sm text-muted-foreground">Hours by team member and project — click Search to load (same filters as Timecards).</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-5 py-3">
            <Timer className="h-5 w-5 text-primary" />
            <div className="text-right leading-tight">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total hours</p>
              <p className="text-2xl font-bold tabular-nums text-primary" data-testid="text-team-summary-total-hours">
                {hasLoadedEntries ? `${totalHours.toFixed(1)}h` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasLoadedEntries ? `${entries.length} ${entries.length === 1 ? "entry" : "entries"}` : "Not loaded"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <SearchableSelect
              value={filterUserId}
              onValueChange={setFilterUserId}
              options={memberFilterOptions}
              placeholder="All members"
              searchPlaceholder="Search members…"
              triggerClassName="w-[200px]"
              data-testid="select-team-summary-user"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <SearchableSelect
              value={filterProjectId}
              onValueChange={setFilterProjectId}
              options={projectFilterOptions}
              placeholder="All projects"
              searchPlaceholder="Search projects…"
              triggerClassName="w-[200px]"
              data-testid="select-team-summary-project"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <SearchableSelect
              value={filterTaskId}
              onValueChange={setFilterTaskId}
              options={taskFilterOptions}
              placeholder={filterProjectId === "all" ? "Select project for tasks" : "All tasks in project"}
              searchPlaceholder="Search tasks…"
              disabled={filterProjectId === "all"}
              triggerClassName="w-[220px]"
              data-testid="select-team-summary-task"
            />
          </div>
          <Input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            className="h-9 w-[150px] text-sm"
            data-testid="input-team-summary-start"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            className="h-9 w-[150px] text-sm"
            data-testid="input-team-summary-end"
          />
          <Button size="sm" className="h-9 gap-1.5" onClick={commitSearch} disabled={isLoading} data-testid="button-team-summary-search">
            <Search className="h-3.5 w-3.5" />
            Search
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={clearFilters} data-testid="button-team-summary-clear">
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6">
          {!hasLoadedEntries && !isLoading ? (
            <div className="space-y-2 rounded-xl border-2 border-dashed border-border/50 py-16 text-center">
              <Search className="mx-auto h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">Load team summary</p>
              <p className="mx-auto max-w-md text-xs text-muted-foreground/80">
                Data is not loaded automatically. Click <span className="font-medium text-foreground">Search</span> above to fetch hours from the server.
              </p>
            </div>
          ) : isLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
          ) : sortedMembers.length === 0 ? (
            <div className="space-y-2 rounded-xl border-2 border-dashed border-border/50 py-16 text-center">
              <p className="text-sm font-medium text-muted-foreground">No hours in this range</p>
              <p className="text-xs text-muted-foreground/80">Adjust filters and Search again, or log time from the Timecards page.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/50 bg-background shadow-sm">
              <table className="w-full text-sm" data-testid="table-team-summary">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Member</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Project breakdown
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total hours</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map(([uid, summary]) => (
                    <tr
                      key={uid}
                      className="border-b border-border/30 transition-colors last:border-0 hover:bg-muted/20"
                      data-testid={`row-team-summary-${uid}`}
                    >
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
                        <span className="font-bold text-primary" data-testid={`text-team-summary-member-${uid}`}>
                          {summary.total.toFixed(1)}h
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
