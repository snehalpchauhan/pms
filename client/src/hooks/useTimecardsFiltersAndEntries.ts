import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppData } from "@/hooks/useAppData";
import type { Project } from "@/lib/mockData";

export interface AllTask {
  id: number;
  title: string;
  projectId: number;
  projectName: string;
  status: string;
}

/** Snapshot of filters sent to the server — `null` means no search has been run yet */
export type TimecardsAppliedFilters = {
  filterUserId: string;
  filterProjectId: string;
  filterTaskId: string;
  filterStartDate: string;
  filterEndDate: string;
};

export function useTimecardsFiltersAndEntries(
  currentUserRole: string,
  currentProject: Project | undefined,
) {
  const { usersArray, projects } = useAppData();

  const isClient = currentUserRole === "client";
  const isAdmin = currentUserRole === "admin";
  const isManagerOrAdmin = isAdmin || currentUserRole === "manager";

  const numericProjectId = currentProject ? Number(currentProject.id) : null;

  const [filterUserId, setFilterUserId] = useState<string>("all");
  const [filterProjectId, setFilterProjectId] = useState<string>("all");
  const [filterTaskId, setFilterTaskId] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");

  const [applied, setApplied] = useState<TimecardsAppliedFilters | null>(null);

  const buildQueryParams = useCallback(
    (snap: TimecardsAppliedFilters) => {
      const qp = new URLSearchParams();
      if (isManagerOrAdmin && snap.filterUserId !== "all") qp.set("userId", snap.filterUserId);
      if (snap.filterProjectId !== "all") qp.set("projectId", snap.filterProjectId);
      if (!isClient && snap.filterProjectId !== "all" && snap.filterTaskId !== "all") {
        qp.set("taskId", snap.filterTaskId);
      }
      if (snap.filterStartDate) qp.set("startDate", snap.filterStartDate);
      if (snap.filterEndDate) qp.set("endDate", snap.filterEndDate);
      if (isClient && numericProjectId && snap.filterProjectId === "all") {
        qp.set("projectId", String(numericProjectId));
      }
      return qp;
    },
    [isClient, isManagerOrAdmin, numericProjectId],
  );

  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: [
      "/api/time-entries",
      applied?.filterUserId,
      applied?.filterProjectId,
      applied?.filterTaskId,
      applied?.filterStartDate,
      applied?.filterEndDate,
      currentUserRole,
      numericProjectId,
    ],
    queryFn: async () => {
      if (!applied) return [];
      const qp = buildQueryParams(applied);
      const res = await fetch(`/api/time-entries?${qp.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch time entries");
      return res.json();
    },
    enabled: applied !== null,
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

  const commitSearch = useCallback(() => {
    setApplied({
      filterUserId,
      filterProjectId,
      filterTaskId,
      filterStartDate,
      filterEndDate,
    });
  }, [filterUserId, filterProjectId, filterTaskId, filterStartDate, filterEndDate]);

  useEffect(() => {
    if (!applied) return;
    const matches =
      applied.filterUserId === filterUserId &&
      applied.filterProjectId === filterProjectId &&
      applied.filterTaskId === filterTaskId &&
      applied.filterStartDate === filterStartDate &&
      applied.filterEndDate === filterEndDate;
    if (!matches) setApplied(null);
  }, [filterUserId, filterProjectId, filterTaskId, filterStartDate, filterEndDate, applied]);

  const totalHours = entries.reduce((sum: number, e: any) => sum + parseFloat(e.hours || "0"), 0);

  const memberSummary = useMemo(() => {
    const summary: Record<string, { name: string; avatar?: string; total: number; byProject: Record<string, number> }> =
      {};
    entries.forEach((e: any) => {
      const uid = String(e.userId);
      if (!summary[uid]) {
        const u = usersArray.find((x) => String(x.id) === uid);
        summary[uid] = {
          name: e.userName || u?.name || "Unknown",
          avatar: u?.avatar || undefined,
          total: 0,
          byProject: {},
        };
      }
      summary[uid].total += parseFloat(e.hours || "0");
      const pid = String(e.projectId);
      summary[uid].byProject[pid] = (summary[uid].byProject[pid] || 0) + parseFloat(e.hours || "0");
    });
    return summary;
  }, [entries, usersArray]);

  const projectMap = useMemo(() => {
    const m: Record<string, string> = {};
    projects.forEach((p) => {
      m[p.id] = p.name;
    });
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

  const hasActiveFilters =
    filterUserId !== "all" ||
    filterProjectId !== "all" ||
    filterTaskId !== "all" ||
    filterStartDate ||
    filterEndDate;

  function clearFilters() {
    setFilterUserId("all");
    setFilterProjectId("all");
    setFilterTaskId("all");
    setFilterStartDate("");
    setFilterEndDate("");
    setApplied(null);
  }

  return {
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
    hasLoadedEntries: applied !== null,
    entries,
    isLoading,
    allTasks,
    totalHours,
    memberSummary,
    projectMap,
    memberFilterOptions,
    projectFilterOptions,
    taskFilterOptions,
    hasActiveFilters,
    clearFilters,
  };
}
