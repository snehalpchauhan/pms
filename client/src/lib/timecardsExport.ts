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

export type TimecardsPdfBranding = {
  companyName: string;
  logoUrl: string | null;
};

/** Typical print margin (mm) for A4 — balances readability and table width */
const PDF_MARGIN_MM = 15;

/** Blue palette (replaces gray): header ~ blue-600, zebra ~ blue-50 */
const PDF_BLUE_HEADER: [number, number, number] = [37, 99, 235];
const PDF_BLUE_ZEBRA: [number, number, number] = [239, 246, 255];
const PDF_BLUE_MUTED: [number, number, number] = [30, 64, 175];

function absoluteAssetUrl(pathOrUrl: string): string {
  const t = pathOrUrl.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (typeof window === "undefined") return t;
  const path = t.startsWith("/") ? t : `/${t}`;
  return `${window.location.origin}${path}`;
}

/**
 * Load company logo for jsPDF (same-origin /uploads with cookies).
 * Returns data URL + format hint, or null.
 */
async function loadLogoDataUrl(logoUrl: string | null): Promise<{ dataUrl: string; format: string } | null> {
  if (!logoUrl?.trim()) return null;
  try {
    const url = absoluteAssetUrl(logoUrl);
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(blob);
    });
    const mime = blob.type.toLowerCase();
    let fmt = "PNG";
    if (mime.includes("jpeg") || mime.includes("jpg")) fmt = "JPEG";
    else if (mime.includes("webp")) fmt = "WEBP";
    else if (mime.includes("png")) fmt = "PNG";
    else if (mime.includes("gif")) fmt = "GIF";
    return { dataUrl, format: fmt };
  } catch {
    return null;
  }
}

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

export async function downloadTimecardsPdf(
  rows: TimeEntryExportRow[],
  includeUserColumn: boolean,
  meta: TimecardsExportMeta,
  branding: TimecardsPdfBranding,
): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = PDF_MARGIN_MM;
  const contentW = pageW - margin * 2;

  const companyName = branding.companyName?.trim() || "Company";
  const logoBox = 11;
  let y = margin;

  const loaded = await loadLogoDataUrl(branding.logoUrl);

  if (loaded) {
    try {
      doc.addImage(loaded.dataUrl, loaded.format, margin, y, logoBox, logoBox);
    } catch {
      /* unsupported image type — continue without logo */
    }
  }

  doc.setFontSize(13);
  doc.setTextColor(PDF_BLUE_MUTED[0], PDF_BLUE_MUTED[1], PDF_BLUE_MUTED[2]);
  const nameX = margin + (loaded ? logoBox + 4 : 0);
  doc.text(companyName, nameX, y + logoBox * 0.55);

  y += Math.max(logoBox, 12) + 3;
  doc.setDrawColor(PDF_BLUE_HEADER[0], PDF_BLUE_HEADER[1], PDF_BLUE_HEADER[2]);
  doc.setLineWidth(0.35);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  doc.text(meta.documentTitle, margin, y);
  y += 7;

  doc.setFontSize(8.5);
  doc.setTextColor(PDF_BLUE_MUTED[0], PDF_BLUE_MUTED[1], PDF_BLUE_MUTED[2]);
  for (const line of meta.subtitleLines) {
    const split = doc.splitTextToSize(line, contentW);
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

  // Explicit widths so the table always spans `contentW`; description gets all remaining mm (long notes wrap with linebreak)
  const wDate = 17;
  const wMember = 24;
  const wTask = 34;
  const wProj = 28;
  const wHrs = 13;
  const wDescMember = Math.max(
    48,
    contentW - wDate - wMember - wTask - wProj - wHrs - 1,
  );

  const wDateS = 18;
  const wTaskS = 36;
  const wProjS = 30;
  const wHrsS = 14;
  const wDescSolo = Math.max(52, contentW - wDateS - wTaskS - wProjS - wHrsS - 1);

  const narrow = includeUserColumn
    ? {
        0: { cellWidth: wDate },
        1: { cellWidth: wMember },
        2: { cellWidth: wTask },
        3: { cellWidth: wProj },
        4: { cellWidth: wDescMember },
        5: { cellWidth: wHrs },
      }
    : {
        0: { cellWidth: wDateS },
        1: { cellWidth: wTaskS },
        2: { cellWidth: wProjS },
        3: { cellWidth: wDescSolo },
        4: { cellWidth: wHrsS },
      };

  autoTable(doc, {
    startY: y,
    head,
    body,
    tableWidth: contentW,
    styles: {
      fontSize: 7,
      cellPadding: 1.2,
      overflow: "linebreak",
      textColor: [17, 24, 39],
      lineColor: [191, 219, 254],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: PDF_BLUE_HEADER,
      textColor: 255,
      fontStyle: "bold",
      halign: "left",
    },
    alternateRowStyles: { fillColor: PDF_BLUE_ZEBRA },
    columnStyles: narrow,
    margin: { left: margin, right: margin, bottom: 18 },
    showHead: "everyPage",
  });

  const totalPages = doc.getNumberOfPages();
  const summaryLine = `Total hours: ${meta.totalHours.toFixed(1)} h  ·  ${meta.entryCount} entries`;

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(PDF_BLUE_MUTED[0], PDF_BLUE_MUTED[1], PDF_BLUE_MUTED[2]);
    doc.text(summaryLine, margin, pageH - 10);
    const pageLabel = `Page ${i} of ${totalPages}`;
    doc.text(pageLabel, pageW - margin - doc.getTextWidth(pageLabel), pageH - 10);
    doc.setFontSize(6.5);
    doc.text(meta.footerAttribution, margin, pageH - 5);
  }

  doc.save(`timecards-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
