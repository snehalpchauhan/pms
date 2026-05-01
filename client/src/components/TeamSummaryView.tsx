import { useState, useMemo } from "react";
import { useTimecardsFiltersAndEntries } from "@/hooks/useTimecardsFiltersAndEntries";
import { useAppData } from "@/hooks/useAppData";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarChart3, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format,
  parseISO,
  isAfter,
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  getDay,
} from "date-fns";
import type { ClientPermissions } from "@/App";
import type { Project } from "@/lib/mockData";

const WORK_HOURS = 8;

interface TeamSummaryViewProps {
  currentUserRole: string;
  currentProject?: Project;
  clientPermissions?: ClientPermissions;
}

export default function TeamSummaryView({ currentUserRole, currentProject }: TeamSummaryViewProps) {
  const { usersArray } = useAppData();

  const {
    isManagerOrAdmin,
    filterStartDate,
    setFilterStartDate,
    filterEndDate,
    setFilterEndDate,
    commitSearch,
    hasLoadedEntries,
    entries,
    isLoading,
    hasActiveFilters,
    clearFilters,
  } = useTimecardsFiltersAndEntries(currentUserRole, currentProject);

  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [memberPopoverOpen, setMemberPopoverOpen] = useState(false);

  const memberOptions = useMemo(
    () => usersArray.map((u) => ({ id: String(u.id), name: u.name })),
    [usersArray],
  );

  function toggleMember(id: string) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyPreset(preset: "this-week" | "this-month" | "last-month") {
    const today = new Date();
    let start: Date, end: Date;
    if (preset === "this-week") {
      start = startOfWeek(today, { weekStartsOn: 1 });
      end = endOfWeek(today, { weekStartsOn: 1 });
    } else if (preset === "this-month") {
      start = startOfMonth(today);
      end = endOfMonth(today);
    } else {
      const lastMonth = subMonths(today, 1);
      start = startOfMonth(lastMonth);
      end = endOfMonth(lastMonth);
    }
    setFilterStartDate(format(start, "yyyy-MM-dd"));
    setFilterEndDate(format(end, "yyyy-MM-dd"));
  }

  // Client-side member filter
  const filteredEntries = useMemo(() => {
    if (selectedMemberIds.size === 0) return entries;
    return entries.filter((e: any) => selectedMemberIds.has(String(e.userId)));
  }, [entries, selectedMemberIds]);

  // All weekdays in range (+ any weekend dates that actually have entries)
  const displayDates = useMemo(() => {
    const set = new Set<string>();
    if (filterStartDate && filterEndDate) {
      let curr = parseISO(filterStartDate);
      const rangeEnd = parseISO(filterEndDate);
      while (!isAfter(curr, rangeEnd)) {
        const dow = getDay(curr);
        if (dow !== 0 && dow !== 6) set.add(format(curr, "yyyy-MM-dd"));
        curr = addDays(curr, 1);
      }
    }
    filteredEntries.forEach((e: any) => {
      if (e.logDate) set.add(e.logDate);
    });
    return Array.from(set).sort();
  }, [filterStartDate, filterEndDate, filteredEntries]);

  // Members present in data, alphabetical
  const membersInData = useMemo(() => {
    const seen = new Map<string, { name: string }>();
    filteredEntries.forEach((e: any) => {
      const uid = String(e.userId);
      if (!seen.has(uid)) {
        const u = usersArray.find((x) => String(x.id) === uid);
        seen.set(uid, { name: e.userName || u?.name || "Unknown" });
      }
    });
    return Array.from(seen.entries())
      .map(([id, info]) => ({ id, ...info }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredEntries, usersArray]);

  // hoursGrid[userId][date] = hours
  const hoursGrid = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    filteredEntries.forEach((e: any) => {
      const uid = String(e.userId);
      if (!map[uid]) map[uid] = {};
      map[uid][e.logDate] = (map[uid][e.logDate] || 0) + parseFloat(e.hours || "0");
    });
    return map;
  }, [filteredEntries]);

  const totalHours = useMemo(
    () => filteredEntries.reduce((s: number, e: any) => s + parseFloat(e.hours || "0"), 0),
    [filteredEntries],
  );

  const totalMissed = useMemo(() => {
    let missed = 0;
    membersInData.forEach(({ id }) => {
      displayDates.forEach((date) => {
        const dow = getDay(parseISO(date));
        if (dow === 0 || dow === 6) return;
        missed += Math.max(0, WORK_HOURS - (hoursGrid[id]?.[date] || 0));
      });
    });
    return missed;
  }, [membersInData, displayDates, hoursGrid]);

  if (!isManagerOrAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <BarChart3 className="h-12 w-12 text-muted-foreground/50" />
        <div className="max-w-sm space-y-1">
          <h2 className="text-lg font-semibold">Team summary</h2>
          <p className="text-sm text-muted-foreground">Only managers and administrators can view team hour breakdowns.</p>
        </div>
      </div>
    );
  }

  const memberLabel =
    selectedMemberIds.size === 0
      ? "All members"
      : `${selectedMemberIds.size} member${selectedMemberIds.size > 1 ? "s" : ""}`;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="shrink-0 space-y-4 border-b border-border/50 bg-muted/10 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-7 w-7 text-primary" />
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">Team summary</h2>
              <p className="text-sm text-muted-foreground">Daily 8 h compliance — member × date grid</p>
            </div>
          </div>

          {hasLoadedEntries && (
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-right leading-tight">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total hours</p>
                <p className="text-xl font-bold tabular-nums text-primary">{totalHours.toFixed(1)}h</p>
                <p className="text-[11px] text-muted-foreground">{filteredEntries.length} entries · {membersInData.length} member{membersInData.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-right leading-tight">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Missing hours</p>
                <p className="text-xl font-bold tabular-nums text-destructive">{totalMissed.toFixed(0)}h</p>
                <p className="text-[11px] text-muted-foreground">{displayDates.filter(d => { const dow = getDay(parseISO(d)); return dow !== 0 && dow !== 6; }).length} working days</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Filters ──────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-4">
          {/* Quick presets */}
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => applyPreset("this-week")}>This week</Button>
            <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => applyPreset("this-month")}>This month</Button>
            <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => applyPreset("last-month")}>Last month</Button>
          </div>

          <div className="h-6 w-px shrink-0 bg-border/60" />

          {/* Member multi-select */}
          <Popover open={memberPopoverOpen} onOpenChange={setMemberPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 min-w-[150px] justify-between gap-1.5">
                <span className="text-sm">{memberLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="max-h-60 space-y-0.5 overflow-y-auto">
                <button
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                    selectedMemberIds.size === 0 && "bg-muted font-medium",
                  )}
                  onClick={() => setSelectedMemberIds(new Set())}
                >
                  <span className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input text-[10px]",
                    selectedMemberIds.size === 0 && "border-primary bg-primary text-primary-foreground",
                  )}>
                    {selectedMemberIds.size === 0 && "✓"}
                  </span>
                  All members
                </button>
                {memberOptions.map((m) => (
                  <button
                    key={m.id}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                    onClick={() => toggleMember(m.id)}
                  >
                    <span className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input text-[10px]",
                      selectedMemberIds.has(m.id) && "border-primary bg-primary text-primary-foreground",
                    )}>
                      {selectedMemberIds.has(m.id) && "✓"}
                    </span>
                    {m.name}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Date range */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="h-9 w-[148px] text-sm tabular-nums"
              data-testid="input-team-summary-start"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="h-9 w-[148px] text-sm tabular-nums"
              data-testid="input-team-summary-end"
            />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={clearFilters} data-testid="button-team-summary-clear">
                Clear
              </Button>
            )}
            <Button size="sm" className="h-9 gap-1.5 px-4" onClick={commitSearch} disabled={isLoading} data-testid="button-team-summary-search">
              <Search className="h-3.5 w-3.5" />
              Search
            </Button>
          </div>
        </div>
      </div>

      {/* ── Content area: overflow-hidden so the table wrapper IS the sole scroll container ── */}
      <div className="min-h-0 flex-1 overflow-hidden p-6 flex flex-col">
        {!hasLoadedEntries && !isLoading ? (
          <div className="rounded-xl border-2 border-dashed border-border/50 py-16 text-center space-y-2">
            <Search className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">Set a date range then click Search</p>
            <p className="text-xs text-muted-foreground/70">Use quick presets above or enter dates manually.</p>
          </div>
        ) : isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : membersInData.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border/50 py-16 text-center space-y-2">
            <p className="text-sm font-medium text-muted-foreground">No entries found for this range</p>
            <p className="text-xs text-muted-foreground/70">Adjust filters and try again.</p>
          </div>
        ) : (
          /*
           * The table wrapper IS the scroll container (overflow-auto + flex-1 min-h-0).
           * sticky left-0 / top-0 cells therefore snap to the wrapper's visible edges,
           * eliminating content bleed to the left of Date and above the header row.
           */
          <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-border/50 bg-background shadow-sm">
            {/*
             * border-separate — required for position:sticky on <th>/<td>
             * (border-collapse disables sticky in most browsers.)
             */}
            <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  {/* Corner cell: frozen when scrolling horizontally OR vertically */}
                  <th className="sticky left-0 top-0 z-[50] border-b-2 border-r border-border/50 bg-muted px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground min-w-[132px]">
                    Date
                  </th>
                  {/* Member columns: frozen on vertical scroll */}
                  {membersInData.map(({ id, name }) => (
                    <th
                      key={id}
                      className="sticky top-0 z-[40] border-b-2 border-border/50 bg-muted px-3 py-3 text-center w-[110px] min-w-[90px] max-w-[130px]"
                    >
                      <div className="flex flex-col items-center gap-1 overflow-hidden">
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarFallback className="text-[10px]">{name[0]}</AvatarFallback>
                        </Avatar>
                        <span
                          className="block w-full truncate text-center text-[11px] font-semibold text-foreground leading-tight"
                          title={name}
                        >
                          {name}
                        </span>
                      </div>
                    </th>
                  ))}
                  <th className="sticky top-0 z-[40] border-l border-b-2 border-border/50 bg-muted px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[84px]">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {displayDates.map((date) => {
                  const dow = getDay(parseISO(date));
                  const isWeekend = dow === 0 || dow === 6;
                  const rowTotal = membersInData.reduce(
                    (s, { id }) => s + (hoursGrid[id]?.[date] || 0),
                    0,
                  );

                  return (
                    <tr
                      key={date}
                      className={cn(
                        "[&>td]:border-b [&>td]:border-border/25",
                        isWeekend ? "bg-muted/10" : "hover:bg-muted/5 transition-colors",
                      )}
                    >
                      {/* Sticky date cell */}
                      <td className={cn(
                        "sticky left-0 z-[30] border-r border-border/40 px-4 py-2.5 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] dark:shadow-[2px_0_4px_-2px_rgba(0,0,0,0.35)]",
                        isWeekend ? "bg-muted" : "bg-background",
                      )}>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[10px] font-bold uppercase w-7 shrink-0",
                            isWeekend ? "text-muted-foreground/40" : "text-muted-foreground",
                          )}>
                            {format(parseISO(date), "EEE")}
                          </span>
                          <span className={cn(
                            "text-sm font-medium tabular-nums",
                            isWeekend ? "text-muted-foreground/50" : "text-foreground",
                          )}>
                            {format(parseISO(date), "d MMM")}
                          </span>
                        </div>
                      </td>

                      {/* Hour cell per member */}
                      {membersInData.map(({ id }) => {
                        const hours = hoursGrid[id]?.[date] || 0;
                        const missed = isWeekend ? 0 : Math.max(0, WORK_HOURS - hours);

                        if (isWeekend) {
                          return (
                            <td key={id} className="bg-muted/10 px-3 py-2.5 text-center">
                              <span className="text-muted-foreground/25 text-xs">·</span>
                            </td>
                          );
                        }

                        if (hours === 0) {
                          return (
                            <td key={id} className="bg-red-50/60 dark:bg-red-950/15 px-3 py-2.5 text-center">
                              <span className="text-xs font-semibold text-red-400 dark:text-red-500">—</span>
                              <div className="text-[10px] text-red-400/70 tabular-nums">-8h</div>
                            </td>
                          );
                        }

                        if (hours >= WORK_HOURS) {
                          return (
                            <td key={id} className="bg-emerald-50/60 dark:bg-emerald-950/15 px-3 py-2.5 text-center">
                              <span className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                                {hours % 1 === 0 ? `${hours}h` : `${hours.toFixed(1)}h`}
                              </span>
                            </td>
                          );
                        }

                        // Partial hours
                        return (
                          <td key={id} className="bg-amber-50/60 dark:bg-amber-950/15 px-3 py-2.5 text-center">
                            <span className="text-xs font-bold tabular-nums text-amber-700 dark:text-amber-400">
                              {hours % 1 === 0 ? `${hours}h` : `${hours.toFixed(1)}h`}
                            </span>
                            <div className="text-[10px] text-red-500/80 tabular-nums leading-none mt-0.5">
                              -{missed % 1 === 0 ? `${missed}h` : `${missed.toFixed(1)}h`}
                            </div>
                          </td>
                        );
                      })}

                      {/* Row total */}
                      <td className={cn(
                        "border-l border-border/40 px-4 py-2.5 text-right font-bold tabular-nums whitespace-nowrap",
                        isWeekend ? "text-muted-foreground/30" : rowTotal === 0 ? "text-muted-foreground/50" : "text-foreground",
                      )}>
                        {isWeekend || rowTotal === 0
                          ? "—"
                          : rowTotal % 1 === 0 ? `${rowTotal}h` : `${rowTotal.toFixed(1)}h`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer: per-member totals + missing */}
              <tfoot>
                <tr className="border-t-2 border-border/60 bg-muted/30">
                  <td className="sticky left-0 z-[30] border-r border-t-2 border-border/50 bg-muted px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                    Total
                  </td>
                  {membersInData.map(({ id }) => {
                    const memberTotal = Object.values(hoursGrid[id] || {}).reduce((s, h) => s + h, 0);
                    return (
                      <td key={id} className="px-3 py-2.5 text-center font-bold tabular-nums text-primary">
                        {memberTotal % 1 === 0 ? `${memberTotal}h` : `${memberTotal.toFixed(1)}h`}
                      </td>
                    );
                  })}
                  <td className="border-l border-border/40 px-4 py-2.5 text-right font-bold tabular-nums text-primary whitespace-nowrap">
                    {totalHours % 1 === 0 ? `${totalHours}h` : `${totalHours.toFixed(1)}h`}
                  </td>
                </tr>
                <tr className="border-t border-border/30 bg-muted/10">
                  <td className="sticky left-0 z-[30] border-r border-border/40 bg-muted px-4 py-2 text-xs font-semibold uppercase tracking-wider text-destructive/70 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                    Missing
                  </td>
                  {membersInData.map(({ id }) => {
                    const memberMissed = displayDates.reduce((s, date) => {
                      const dow = getDay(parseISO(date));
                      if (dow === 0 || dow === 6) return s;
                      return s + Math.max(0, WORK_HOURS - (hoursGrid[id]?.[date] || 0));
                    }, 0);
                    return (
                      <td key={id} className={cn("px-3 py-2 text-center font-bold tabular-nums", memberMissed > 0 ? "text-destructive" : "text-muted-foreground/40")}>
                        {memberMissed > 0
                          ? `-${memberMissed % 1 === 0 ? `${memberMissed}h` : `${memberMissed.toFixed(1)}h`}`
                          : "—"}
                      </td>
                    );
                  })}
                  <td className={cn("border-l border-border/40 px-4 py-2 text-right font-bold tabular-nums whitespace-nowrap", totalMissed > 0 ? "text-destructive" : "text-muted-foreground/40")}>
                    {totalMissed > 0
                      ? `-${totalMissed % 1 === 0 ? `${totalMissed}h` : `${totalMissed.toFixed(0)}h`}`
                      : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
