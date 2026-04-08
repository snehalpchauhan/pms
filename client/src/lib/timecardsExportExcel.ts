import ExcelJS from "exceljs";
import { format } from "date-fns";
import type { TimeEntryExportRow, TimecardsExportMeta } from "@/lib/timecardsExport";

const XLSX_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF93C5FD" } },
  left: { style: "thin", color: { argb: "FF93C5FD" } },
  bottom: { style: "thin", color: { argb: "FF93C5FD" } },
  right: { style: "thin", color: { argb: "FF93C5FD" } },
};

const XLSX_HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF2563EB" },
};

const XLSX_ZEBRA_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEFF6FF" },
};

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Styled .xlsx: blue header, borders, wrap on Task + description columns (matches PDF palette).
 * Loaded dynamically so ExcelJS is not in the main bundle.
 */
export async function downloadTimecardsXlsx(
  rows: TimeEntryExportRow[],
  includeUserColumn: boolean,
  filenameBase: string,
  meta: TimecardsExportMeta,
): Promise<void> {
  const headers = includeUserColumn
    ? ["Date", "Member", "Task", "Project", "Work type & description", "Hours"]
    : ["Date", "Task", "Project", "Work type & description", "Hours"];

  const colCount = headers.length;
  const taskCol = includeUserColumn ? 3 : 2;
  const descCol = includeUserColumn ? 5 : 4;
  const hoursCol = colCount;

  const wrapTop: Partial<ExcelJS.Alignment> = {
    vertical: "top",
    horizontal: "left",
    wrapText: true,
  };
  const topLeft: Partial<ExcelJS.Alignment> = { vertical: "top", horizontal: "left", wrapText: false };
  const hoursAlign: Partial<ExcelJS.Alignment> = { vertical: "top", horizontal: "right", wrapText: false };

  const wb = new ExcelJS.Workbook();
  wb.creator = meta.organizationName;
  const sheet = wb.addWorksheet("Time report", {
    properties: { defaultRowHeight: 18 },
    views: [{ showGridLines: true }],
  });

  let r = 1;

  const mergeRow = (row: number) => {
    sheet.mergeCells(row, 1, row, colCount);
    return sheet.getCell(row, 1);
  };

  const titleCell = mergeRow(r);
  titleCell.value = meta.documentTitle;
  titleCell.font = { bold: true, size: 14, color: { argb: "FF111827" } };
  titleCell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  r++;

  const totalCell = mergeRow(r);
  totalCell.value = `Total hours: ${meta.totalHours.toFixed(1)} h  ·  ${meta.entryCount} entries`;
  totalCell.font = { size: 11, bold: true, color: { argb: "FF1E40AF" } };
  totalCell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  r++;

  for (const line of meta.subtitleLines) {
    const c = mergeRow(r);
    c.value = line;
    c.font = { size: 10, color: { argb: "FF1E40AF" } };
    c.alignment = { vertical: "top", horizontal: "left", wrapText: true };
    r++;
  }

  const footCell = mergeRow(r);
  footCell.value = meta.footerAttribution;
  footCell.font = { size: 9, italic: true, color: { argb: "FF64748B" } };
  footCell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  r++;

  r++;

  const headerRowIndex = r;
  const headerRow = sheet.getRow(headerRowIndex);
  headers.forEach((label, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cell.fill = XLSX_HEADER_FILL;
    cell.border = XLSX_BORDER;
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  });
  headerRow.height = 22;
  r++;

  rows.forEach((row, idx) => {
    const dataRow = sheet.getRow(r);
    const vals: (string | number)[] = includeUserColumn
      ? [row.logDate, row.userName, row.taskTitle, row.projectName, row.description, parseFloat(row.hours) || 0]
      : [row.logDate, row.taskTitle, row.projectName, row.description, parseFloat(row.hours) || 0];

    vals.forEach((v, i) => {
      const col = i + 1;
      const cell = dataRow.getCell(col);
      cell.value = v;
      cell.border = XLSX_BORDER;
      if (col === hoursCol) {
        cell.numFmt = "0.0";
        cell.alignment = hoursAlign;
      } else if (col === taskCol || col === descCol) {
        cell.alignment = wrapTop;
      } else {
        cell.alignment = topLeft;
      }
      if (idx % 2 === 1) {
        cell.fill = XLSX_ZEBRA_FILL;
      }
    });
    r++;
  });

  const applyRowBorders = (row: ExcelJS.Row, fromCol: number, toCol: number) => {
    for (let c = fromCol; c <= toCol; c++) {
      row.getCell(c).border = XLSX_BORDER;
    }
  };

  const sumRow1 = sheet.getRow(r);
  sheet.mergeCells(r, 1, r, hoursCol - 1);
  sumRow1.getCell(1).value = "Total hours";
  sumRow1.getCell(1).font = { bold: true, color: { argb: "FF1E40AF" } };
  sumRow1.getCell(1).alignment = { vertical: "middle", horizontal: "left", wrapText: false };
  sumRow1.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDBEAFE" },
  };
  sumRow1.getCell(hoursCol).value = meta.totalHours;
  sumRow1.getCell(hoursCol).numFmt = "0.0";
  sumRow1.getCell(hoursCol).font = { bold: true };
  sumRow1.getCell(hoursCol).alignment = hoursAlign;
  sumRow1.getCell(hoursCol).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDBEAFE" },
  };
  applyRowBorders(sumRow1, 1, hoursCol);
  r++;

  const sumRow2 = sheet.getRow(r);
  sheet.mergeCells(r, 1, r, hoursCol - 1);
  sumRow2.getCell(1).value = "Entries";
  sumRow2.getCell(1).font = { bold: true, color: { argb: "FF1E40AF" } };
  sumRow2.getCell(1).alignment = { vertical: "middle", horizontal: "left", wrapText: false };
  sumRow2.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDBEAFE" },
  };
  sumRow2.getCell(hoursCol).value = meta.entryCount;
  sumRow2.getCell(hoursCol).font = { bold: true };
  sumRow2.getCell(hoursCol).alignment = hoursAlign;
  sumRow2.getCell(hoursCol).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDBEAFE" },
  };
  applyRowBorders(sumRow2, 1, hoursCol);

  const widths = includeUserColumn
    ? [12, 20, 36, 24, 52, 10]
    : [12, 38, 26, 56, 10];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  sheet.views = [
    {
      state: "frozen",
      xSplit: 0,
      ySplit: headerRowIndex,
      topLeftCell: `A${headerRowIndex + 1}`,
      activeCell: `A${headerRowIndex + 1}`,
    },
  ];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerBlobDownload(blob, `${filenameBase}-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
}
