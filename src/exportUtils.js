import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export async function exportExcel(filename, sheetName, columns, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 22 }));
  rows.forEach((r) => sheet.addRow(r));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E2A78" } };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), filename + ".xlsx");
}

export function exportPDF(filename, title, columns, rows) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString(), 14, 21);
  autoTable(doc, {
    startY: 26,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => (r[c.key] ?? "-").toString())),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 42, 120] }
  });
  doc.save(filename + ".pdf");
}