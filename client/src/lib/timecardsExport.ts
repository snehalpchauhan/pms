import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { format } from "date-fns";
import { parseTimeEntryDescription } from "@/lib/timeEntryDescription";

export type TimeEntryExportRow = {
  logDate: string;
  userName: string;
  taskTitle: string;
  projectName: string;
  description: string;
  hours: string;
};

export type TimecardsExportMeta = {
  /** Main title on PDF / first line of CSV */
  documentTitle: string;
  /** Secondary lines (filters, project context) */
  subtitleLines: string[];
  totalHours: number;
  entryCount: number;
  /** e.g. "Generated April 6, 2026 · Task Board Flow" */
  footerAttribution: string;
};

export function buildTimecardsExportMeta(params: {
  isClient: boolean;
  projectName?: string;
  totalHours: number;
  entryCount: number;
  filterUserLabel?: string;
  filterProjectLabel?: string;
  filterTaskLabel?: string;
  filterStartDate?: string;
  filterEndDate?: string;
}): TimecardsExportMeta {
  const {
    isClient,
    projectName,
    totalHours,
    entryCount,
    filterUserLabel,
    filterProjectLabel,
    filterTaskLabel,
    filterStartDate,
    filterEndDate,
  } = params;

  const documentTitle = isClient ? `Hours shared with you — ${projectName || "Project"}` : "Time report";

  const subtitleLines: string[] = [];
  if (filterUserLabel) subtitleLines.push(`Member: ${filterUserLabel}`);
  if (filterProjectLabel) subtitleLines.push(`Project filter: ${filterProjectLabel}`);
  if (filterTaskLabel) subtitleLines.push(`Task: ${filterTaskLabel}`);
  if (filterStartDate || filterEndDate) {
    const from = filterStartDate || "…";
    const to = filterEndDate || "…";
    subtitleLines.push(`Date range: ${from} to ${to}`);
  }
  if (subtitleLines.length === 0) {
    subtitleLines.push(
      isClient ? "Entries the team chose to share with you" : "Same filters as on screen",
    );
  }

  const footerAttribution = `Generated ${format(new Date(), "MMMM d, yyyy")} · Task Board Flow`;

  return {
    documentTitle,
    subtitleLines,
    totalHours,
    entryCount,
    footerAttribution,
  };
}

function csvEscape(cell: string): string {
  const s = String(cell ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildExportRows(
  entries: Array<{
    logDate: string;
    userName?: string;
    taskTitle?: string;
    projectId?: number;
    description?: string | null;
    hours: string | number;
    clientVisible?: boolean;
  }>,
  projectMap: Record<string, string>,
  includeUserColumn: boolean,
): TimeEntryExportRow[] {
  return entries.map((e) => {
    const { fullText } = parseTimeEntryDescription(e.description ?? "");
    const pid = e.projectId != null ? String(e.projectId) : "";
    return {
      logDate: e.logDate,
      userName: e.userName ?? "",
      taskTitle: e.taskTitle ?? "",
      projectName: projectMap[pid] || (pid ? `Project ${pid}` : ""),
      description: fullText,
      hours: typeof e.hours === "number" ? e.hours.toFixed(1) : String(e.hours),
    };
  });
}

export function downloadTimecardsCsv(
  rows: TimeEntryExportRow[],
  includeUserColumn: boolean,
  filenameBase: string,
  meta: TimecardsExportMeta,
) {
  const headers = includeUserColumn
    ? ["Date", "Member", "Task", "Project", "Work type & description", "Hours"]
    : ["Date", "Task", "Project", "Work type & description", "Hours"];

  const preamble = [
    csvEscape(meta.documentTitle),
    ...meta.subtitleLines.map((l) => csvEscape(l)),
    csvEscape(meta.footerAttribution),
    "",
  ];

  const lines = [
    ...preamble,
    headers.join(","),
    ...rows.map((r) => {
      const cells = includeUserColumn
        ? [r.logDate, r.userName, r.taskTitle, r.projectName, r.description, r.hours]
        : [r.logDate, r.taskTitle, r.projectName, r.description, r.hours];
      return cells.map(csvEscape).join(",");
    }),
    "",
    ["Total hours", meta.totalHours.toFixed(1)].map(csvEscape).join(","),
    ["Entries", String(meta.entryCount)].map(csvEscape).join(","),
  ];

  const bom = "\uFEFF";
  const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTimecardsPdf(rows: TimeEntryExportRow[], includeUserColumn: boolean, meta: TimecardsExportMeta) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = 12;

  doc.setFontSize(15);
  doc.setTextColor(30, 30, 30);
  doc.text(meta.documentTitle, margin, y);
  y += 7;

  doc.setFontSize(8.5);
  doc.setTextColor(75, 85, 99);
  for (const line of meta.subtitleLines) {
    const split = doc.splitTextToSize(line, pageW - margin * 2);
    doc.text(split, margin, y);
    y += split.length * 3.6 + 1;
  }
  doc.text(meta.footerAttribution, margin, y);
  y += 6;

  doc.setTextColor(0, 0, 0);

  const head = includeUserColumn
    ? [["Date", "Member", "Task", "Project", "Description", "Hrs"]]
    : [["Date", "Task", "Project", "Description", "Hrs"]];

  const body = rows.map((r) =>
    includeUserColumn
      ? [r.logDate, r.userName, r.taskTitle, r.projectName, r.description, r.hours]
      : [r.logDate, r.taskTitle, r.projectName, r.description, r.hours],
  );

  autoTable(doc, {
    startY: y,
    head,
    body,
    styles: { fontSize: 7, cellPadding: 1.1, overflow: "linebreak", textColor: [30, 30, 30] },
    headStyles: { fillColor: [55, 65, 81], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: includeUserColumn
      ? {
          0: { cellWidth: 22 },
          1: { cellWidth: 28 },
          2: { cellWidth: 38 },
          3: { cellWidth: 30 },
          4: { cellWidth: 82 },
          5: { cellWidth: 14 },
        }
      : {
          0: { cellWidth: 24 },
          1: { cellWidth: 44 },
          2: { cellWidth: 32 },
          3: { cellWidth: 90 },
          4: { cellWidth: 16 },
        },
    margin: { left: margin, right: margin, bottom: 16 },
    showHead: "everyPage",
  });

  const totalPages = doc.getNumberOfPages();
  const summaryLine = `Total hours: ${meta.totalHours.toFixed(1)} h  ·  ${meta.entryCount} entries`;

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(75, 85, 99);
    doc.text(summaryLine, margin, pageH - 10);
    doc.text(`Page ${i} of ${totalPages}`, pageW - margin - doc.getTextWidth(`Page ${i} of ${totalPages}`), pageH - 10);
    doc.setFontSize(6.5);
    doc.text(meta.footerAttribution, margin, pageH - 5);
  }

  doc.save(`timecards-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
