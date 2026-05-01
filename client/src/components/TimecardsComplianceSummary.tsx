import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "lucide-react";
import { formatYmdForTimecardDisplay, type TimecardDateFormatPreset } from "@shared/timecardDateFormat";
import { cn } from "@/lib/utils";
import type { TimecardsAppliedFilters } from "@/hooks/useTimecardsFiltersAndEntries";

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

export default function TimecardsComplianceSummary({
  dateDisplayPreset,
  applied,
}: {
  dateDisplayPreset: TimecardDateFormatPreset;
  applied: TimecardsAppliedFilters | null;
}) {
  const startDate = applied?.filterStartDate?.trim() ?? "";
  const endDate = applied?.filterEndDate?.trim() ?? "";
  const userId = applied?.filterUserId ?? "all";
  const canQuery = Boolean(applied && startDate && endDate);

  const { data, isLoading, isFetching, error } = useQuery<ComplianceApiResponse>({
    queryKey: ["/api/timecards-compliance-summary", startDate, endDate, userId],
    queryFn: async () => {
      const qp = new URLSearchParams({ startDate, endDate });
      if (userId !== "all") qp.set("userId", userId);
      const res = await fetch(`/api/timecards-compliance-summary?${qp}`, { credentials: "include" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || res.statusText);
      }
      return res.json();
    },
    enabled: canQuery,
  });

  const busy = canQuery && (isLoading || isFetching);

  return (
    <div id="pms-timecards-summary-anchor" className="scroll-mt-4 min-w-0 w-full max-w-full">
      <Card className="border-border/60 shadow-sm min-w-0">
        <CardHeader className="pb-2 pt-4 px-6">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <ClipboardList className="h-5 w-5 text-primary shrink-0" />
            Timecards summary
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 space-y-3 px-6 pb-4 pt-0">
          {error ? (
            <p className="text-sm text-destructive whitespace-pre-wrap">
              {error instanceof Error ? error.message : String(error)}
            </p>
          ) : null}

          {busy ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading summary…</p>
          ) : null}

          {canQuery && !busy && data ? (
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
                <p className="text-sm text-muted-foreground">No employees or managers match the member filter.</p>
              ) : (
                <div
                  className="max-h-[min(55vh,560px)] w-full min-w-0 overflow-auto rounded-lg border border-border/60 bg-background overscroll-x-contain"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
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
                                <div
                                  className="text-[11px] text-muted-foreground truncate max-w-[200px]"
                                  title={person.email}
                                >
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
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
