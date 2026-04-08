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
  privateFlag: string;
};

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
      privateFlag: e.clientVisible === false ? "yes" : "no",
    };
  });
}

export function downloadTimecardsCsv(rows: TimeEntryExportRow[], includeUserColumn: boolean, filenameBase: string) {
  const headers = includeUserColumn
    ? ["Date", "Member", "Task", "Project", "Work type & description", "Hours", "Private"]
    : ["Date", "Task", "Project", "Work type & description", "Hours", "Private"];
  const lines = [
    headers.join(","),
    ...rows.map((r) => {
      const cells = includeUserColumn
        ? [r.logDate, r.userName, r.taskTitle, r.projectName, r.description, r.hours, r.privateFlag]
        : [r.logDate, r.taskTitle, r.projectName, r.description, r.hours, r.privateFlag];
      return cells.map(csvEscape).join(",");
    }),
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

export function downloadTimecardsPdf(rows: TimeEntryExportRow[], includeUserColumn: boolean, title: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(11);
  doc.text(title, 14, 12);
  doc.setFontSize(8);

  const head = includeUserColumn
    ? [["Date", "Member", "Task", "Project", "Description", "Hrs", "Pvt"]]
    : [["Date", "Task", "Project", "Description", "Hrs", "Pvt"]];

  const body = rows.map((r) =>
    includeUserColumn
      ? [
          r.logDate,
          r.userName,
          r.taskTitle,
          r.projectName,
          r.description,
          r.hours,
          r.privateFlag,
        ]
      : [r.logDate, r.taskTitle, r.projectName, r.description, r.hours, r.privateFlag],
  );

  autoTable(doc, {
    startY: 16,
    head,
    body,
    styles: { fontSize: 7, cellPadding: 1, overflow: "linebreak" },
    headStyles: { fillColor: [55, 65, 81], textColor: 255 },
    columnStyles: includeUserColumn
      ? {
          0: { cellWidth: 22 },
          1: { cellWidth: 28 },
          2: { cellWidth: 38 },
          3: { cellWidth: 30 },
          4: { cellWidth: 75 },
          5: { cellWidth: 14 },
          6: { cellWidth: 12 },
        }
      : {
          0: { cellWidth: 24 },
          1: { cellWidth: 42 },
          2: { cellWidth: 32 },
          3: { cellWidth: 85 },
          4: { cellWidth: 16 },
          5: { cellWidth: 12 },
        },
    margin: { left: 10, right: 10 },
  });

  doc.save(`timecards-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
