import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { useAppData } from "@/hooks/useAppData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Search } from "lucide-react";
import { formatYmdForTimecardDisplay, type TimecardDateFormatPreset } from "@shared/timecardDateFormat";
import { cn } from "@/lib/utils";

type ComplianceApiResponse = {
  requiredHoursPerDay: number;
  startYmd: string;
  endYmd: string;
  weekdays: string[];
  people: {
    userId: number;
    name: string;
    email: string | null;
    days: { dateYmd: string; hours: number; metRequirement: boolean; missingHours: number }[];
    gapDayCount: number;
    totalMissingHours: number;
  }[];
};

type SummaryParams = { startDate: string; endDate: string; userId: string };

export default function TimecardsComplianceSummary({
  dateDisplayPreset,
}: {
  dateDisplayPreset: TimecardDateFormatPreset;
}) {
  const { usersArray } = useAppData();
  const [draftStart, setDraftStart] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [draftEnd, setDraftEnd] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [filterUserId, setFilterUserId] = useState<string>("all");
  const [params, setParams] = useState<SummaryParams | null>(null);

  const memberOptions = useMemo(
    () => [
      { value: "all", label: "All employees & managers" },
      ...usersArray
        .filter((u) => u.role === "employee" || u.role === "manager")
        .map((u) => ({ value: String(u.id), label: u.name })),
    ],
    [usersArray],
  );

  const { data, isLoading, isFetching, error } = useQuery<ComplianceApiResponse>({
    queryKey: ["/api/timecards-compliance-summary", params],
    queryFn: async () => {
      if (!params) throw new Error("No params");
      const qp = new URLSearchParams({
        startDate: params.startDate,
        endDate: params.endDate,
      });
      if (params.userId !== "all") qp.set("userId", params.userId);
      const res = await fetch(`/api/timecards-compliance-summary?${qp}`, { credentials: "include" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      return res.json();
    },
    enabled: params !== null,
  });

  const loadSummary = () => {
    setParams({
      startDate: draftStart,
      endDate: draftEnd,
      userId: filterUserId,
    });
  };

  const applyThisMonth = () => {
    const n = new Date();
    setDraftStart(format(startOfMonth(n), "yyyy-MM-dd"));
    setDraftEnd(format(endOfMonth(n), "yyyy-MM-dd"));
  };

  const applyLastMonth = () => {
    const n = subMonths(new Date(), 1);
    setDraftStart(format(startOfMonth(n), "yyyy-MM-dd"));
    setDraftEnd(format(endOfMonth(n), "yyyy-MM-dd"));
  };

  const busy = isLoading || isFetching;

  return (
    <div id="pms-timecards-summary-anchor" className="scroll-mt-4">
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-5 w-5 text-primary shrink-0" />
          Timecards summary
        </CardTitle>
        <CardDescription>
          Weekdays only — same {data?.requiredHoursPerDay ?? 8}h target as digest emails. Green = met; amber = short. Use
          filters and <strong>Load summary</strong> (data is not fetched until you load).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Quick range</Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={applyThisMonth}>
                This month
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={applyLastMonth}>
                Last month
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="compliance-start" className="text-xs">
              From
            </Label>
            <Input
              id="compliance-start"
              type="date"
              className="h-9 w-[150px] font-mono text-sm"
              value={draftStart}
              onChange={(e) => setDraftStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="compliance-end" className="text-xs">
              To
            </Label>
            <Input
              id="compliance-end"
              type="date"
              className="h-9 w-[150px] font-mono text-sm"
              value={draftEnd}
              onChange={(e) => setDraftEnd(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 min-w-[200px]">
            <Label className="text-xs">Employee</Label>
            <SearchableSelect
              value={filterUserId}
              onValueChange={setFilterUserId}
              options={memberOptions}
              placeholder="All employees & managers"
              searchPlaceholder="Search…"
              triggerClassName="w-[220px]"
            />
          </div>
          <Button type="button" size="sm" className="h-9 gap-1.5" onClick={loadSummary} disabled={busy}>
            <Search className="h-3.5 w-3.5" />
            {busy ? "Loading…" : "Load summary"}
          </Button>
        </div>

        {error ? (
          <p className="text-sm text-destructive whitespace-pre-wrap">
            {error instanceof Error ? error.message : String(error)}
          </p>
        ) : null}

        {params && !busy && data && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                Range: <span className="font-mono text-foreground">{data.startYmd}</span> –{" "}
                <span className="font-mono text-foreground">{data.endYmd}</span>
              </span>
              <span>·</span>
              <span>{data.weekdays.length} weekday(s)</span>
              <span>·</span>
              <span>{data.people.length} people</span>
            </div>
            {data.weekdays.length === 0 ? (
              <p className="text-sm text-muted-foreground">No weekdays in this range (check dates).</p>
            ) : data.people.length === 0 ? (
              <p className="text-sm text-muted-foreground">No employees or managers match the employee filter.</p>
            ) : (
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
                  <table className="w-max min-w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/40">
                        <th
                          className={cn(
                            "sticky left-0 z-20 bg-muted/95 backdrop-blur-sm border-r border-border/60",
                            "px-3 py-2 text-left font-semibold text-foreground min-w-[200px]",
                          )}
                        >
                          Employee
                        </th>
                        {data.weekdays.map((ymd) => (
                          <th
                            key={ymd}
                            className="px-2 py-2 text-center font-semibold text-muted-foreground whitespace-nowrap min-w-[4.5rem]"
                          >
                            {formatYmdForTimecardDisplay(ymd, dateDisplayPreset)}
                          </th>
                        ))}
                        <th className="px-2 py-2 text-center font-semibold text-muted-foreground whitespace-nowrap border-l border-border/60">
                          Gaps
                        </th>
                        <th className="px-2 py-2 text-center font-semibold text-muted-foreground whitespace-nowrap">
                          Missing h
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.people.map((person) => (
                        <tr key={person.userId} className="border-b border-border/40 hover:bg-muted/20">
                          <td
                            className={cn(
                              "sticky left-0 z-10 bg-background/95 backdrop-blur-sm border-r border-border/60",
                              "px-3 py-2 align-top",
                            )}
                          >
                            <div className="font-medium text-foreground">{person.name}</div>
                            {person.email ? (
                              <div className="text-[11px] text-muted-foreground truncate max-w-[200px]" title={person.email}>
                                {person.email}
                              </div>
                            ) : (
                              <Badge variant="outline" className="mt-1 text-[10px]">
                                No email
                              </Badge>
                            )}
                          </td>
                          {person.days.map((d) => (
                            <td key={d.dateYmd} className="px-1 py-1.5 text-center align-middle">
                              {d.metRequirement ? (
                                <span
                                  className="inline-flex min-h-[2rem] min-w-[2.75rem] items-center justify-center rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
                                  title={`${d.hours.toFixed(2)}h — met ${data.requiredHoursPerDay}h`}
                                >
                                  {d.hours.toFixed(1)}
                                </span>
                              ) : (
                                <span
                                  className="inline-flex min-h-[2rem] min-w-[2.75rem] flex-col items-center justify-center rounded-md bg-amber-50 text-amber-950 border border-amber-200/90 dark:bg-amber-950/35 dark:text-amber-100 dark:border-amber-800"
                                  title={`${d.hours.toFixed(2)}h — short by ${d.missingHours.toFixed(2)}h`}
                                >
                                  <span className="tabular-nums font-semibold">{d.hours.toFixed(1)}</span>
                                  <span className="text-[9px] font-medium opacity-90">−{d.missingHours.toFixed(1)}</span>
                                </span>
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center tabular-nums font-medium border-l border-border/60">
                            {person.gapDayCount}
                          </td>
                          <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">
                            {person.totalMissingHours.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {!params && (
          <p className="text-xs text-muted-foreground">
            Set the date range and optional employee, then click <strong>Load summary</strong>.
          </p>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
