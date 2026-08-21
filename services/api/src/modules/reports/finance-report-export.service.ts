import { Injectable } from "@nestjs/common";
import { createElement } from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import ExcelJS from "exceljs";
import type { FinanceReport } from "./finance-report.service";

const rupees = (paisa: number) => `Rs. ${(paisa / 100).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#666", marginBottom: 14 },
  sectionHeading: { fontSize: 11, fontWeight: 700, marginTop: 14, marginBottom: 6 },
  cardsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { border: "1 solid #ddd", borderRadius: 4, padding: 6, width: 150, marginBottom: 6 },
  cardLabel: { fontSize: 7, color: "#777", textTransform: "uppercase" },
  cardValue: { fontSize: 12, fontWeight: 700, marginTop: 2 },
  table: { display: "flex", width: "100%" },
  tr: { flexDirection: "row", borderBottom: "0.5 solid #eee" },
  th: { flex: 1, padding: 3, fontSize: 7, fontWeight: 700, backgroundColor: "#f5f5f5" },
  td: { flex: 1, padding: 3, fontSize: 7 },
});

/**
 * Server-generated PDF for the Order & Finance Reports download — @react-pdf/renderer per
 * CLAUDE.md's payments/receipts stack choice (Puppeteer's headless-Chromium footprint is the
 * heavier of the two sanctioned options; this backend has no other React/DOM dependency, so the
 * lighter one wins here). Built with createElement, not JSX — this stays a plain .ts file rather
 * than adding a .tsx/JSX toolchain to a NestJS service for one feature.
 */
@Injectable()
export class FinanceReportExportService {
  async toPdfBuffer(report: FinanceReport, meta: { restaurantName: string; branchLabel: string; periodLabel: string }): Promise<Buffer> {
    const card = (label: string, value: string) =>
      createElement(View, { style: styles.card }, createElement(Text, { style: styles.cardLabel }, label), createElement(Text, { style: styles.cardValue }, value));

    const tableHeader = createElement(
      View,
      { style: styles.tr },
      ...["Order #", "Date", "Branch", "Customer", "Method", "Pay. Status", "Order Status", "Grand Total", "Collected", "Outstanding"].map((h) =>
        createElement(Text, { key: h, style: styles.th }, h),
      ),
    );
    const tableRows = report.rows.slice(0, 2000).map((r) =>
      createElement(
        View,
        { key: r.orderId, style: styles.tr, wrap: false },
        createElement(Text, { style: styles.td }, r.orderNumber),
        createElement(Text, { style: styles.td }, new Date(r.createdAt).toLocaleDateString()),
        createElement(Text, { style: styles.td }, r.branchName),
        createElement(Text, { style: styles.td }, r.customerName),
        createElement(Text, { style: styles.td }, r.paymentMethod),
        createElement(Text, { style: styles.td }, r.paymentStatus),
        createElement(Text, { style: styles.td }, r.orderStatus),
        createElement(Text, { style: styles.td }, rupees(r.grandTotal)),
        createElement(Text, { style: styles.td }, rupees(r.collectedAmount)),
        createElement(Text, { style: styles.td }, rupees(r.outstandingAmount)),
      ),
    );

    const doc = createElement(
      Document,
      {},
      createElement(
        Page,
        { size: "A4", orientation: "landscape", style: styles.page },
        createElement(Text, { style: styles.title }, `${meta.restaurantName} — Order & Finance Statement`),
        createElement(Text, { style: styles.subtitle }, `${meta.branchLabel} · ${meta.periodLabel} · Generated ${new Date().toLocaleString()}`),

        createElement(Text, { style: styles.sectionHeading }, "Order Summary"),
        createElement(
          View,
          { style: styles.cardsRow },
          card("Total Order Attempts", String(report.orderSummary.totalOrderAttempts)),
          card("Successful Orders", String(report.orderSummary.successfulOrders)),
          card("COD Orders", String(report.orderSummary.codOrders)),
          card("Online Orders", String(report.orderSummary.onlineOrders)),
        ),

        createElement(Text, { style: styles.sectionHeading }, "Payment Summary"),
        createElement(
          View,
          { style: styles.cardsRow },
          card("Paid", String(report.paymentSummary.paid)),
          card("Pending", String(report.paymentSummary.pending)),
          card("Failed", String(report.paymentSummary.failed)),
          card("Expired", String(report.paymentSummary.expired)),
          card("Cancelled", String(report.paymentSummary.cancelled)),
          card("Refunded", String(report.paymentSummary.refunded)),
        ),

        createElement(Text, { style: styles.sectionHeading }, "Financial Summary"),
        createElement(
          View,
          { style: styles.cardsRow },
          card("Gross Order Value", rupees(report.financialSummary.grossOrderValue)),
          card("Online Collected", rupees(report.financialSummary.onlineCollected)),
          card("COD Collected", rupees(report.financialSummary.codCollected)),
          card("Total Collected", rupees(report.financialSummary.totalCollected)),
          card("Outstanding COD", rupees(report.financialSummary.outstandingCod)),
          card("Pending Online Value", rupees(report.financialSummary.pendingOnlineValue)),
          card("Failed/Expired Value", rupees(report.financialSummary.failedExpiredValue)),
          card("Refunded Amount", rupees(report.financialSummary.refundedAmount)),
        ),

        createElement(Text, { style: styles.sectionHeading }, `Orders (${report.rows.length}${report.rows.length > 2000 ? ", first 2000 shown" : ""})`),
        createElement(View, { style: styles.table }, tableHeader, ...tableRows),
      ),
    );

    return renderToBuffer(doc);
  }

  async toWorkbookBuffer(report: FinanceReport, meta: { restaurantName: string; branchLabel: string; periodLabel: string }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = meta.restaurantName;

    const summary = workbook.addWorksheet("Summary");
    summary.columns = [{ width: 28 }, { width: 20 }];
    summary.addRow([`${meta.restaurantName} — Order & Finance Statement`]).font = { bold: true, size: 14 };
    summary.addRow([`${meta.branchLabel} · ${meta.periodLabel} · Generated ${new Date().toLocaleString()}`]);
    summary.addRow([]);

    const section = (title: string, entries: [string, string | number][]) => {
      const heading = summary.addRow([title]);
      heading.font = { bold: true };
      for (const [label, value] of entries) summary.addRow([label, value]);
      summary.addRow([]);
    };
    section("Order Summary", [
      ["Total Order Attempts", report.orderSummary.totalOrderAttempts],
      ["Successful Orders", report.orderSummary.successfulOrders],
      ["COD Orders", report.orderSummary.codOrders],
      ["Online Orders", report.orderSummary.onlineOrders],
    ]);
    section("Payment Summary", [
      ["Paid", report.paymentSummary.paid],
      ["Pending", report.paymentSummary.pending],
      ["Failed", report.paymentSummary.failed],
      ["Expired", report.paymentSummary.expired],
      ["Cancelled", report.paymentSummary.cancelled],
      ["Refunded", report.paymentSummary.refunded],
      ["Partially Paid", report.paymentSummary.partiallyPaid],
    ]);
    section("Financial Summary (Rs.)", [
      ["Gross Order Value", (report.financialSummary.grossOrderValue / 100).toFixed(2)],
      ["Online Collected", (report.financialSummary.onlineCollected / 100).toFixed(2)],
      ["COD Collected", (report.financialSummary.codCollected / 100).toFixed(2)],
      ["Other Collected", (report.financialSummary.otherCollected / 100).toFixed(2)],
      ["Total Collected", (report.financialSummary.totalCollected / 100).toFixed(2)],
      ["Outstanding COD", (report.financialSummary.outstandingCod / 100).toFixed(2)],
      ["Pending Online Value", (report.financialSummary.pendingOnlineValue / 100).toFixed(2)],
      ["Failed/Expired Value", (report.financialSummary.failedExpiredValue / 100).toFixed(2)],
      ["Refunded Amount", (report.financialSummary.refundedAmount / 100).toFixed(2)],
    ]);

    const sheet = workbook.addWorksheet("Orders");
    sheet.columns = [
      { header: "Order #", key: "orderNumber", width: 18 },
      { header: "Date", key: "createdAt", width: 18 },
      { header: "Branch", key: "branchName", width: 16 },
      { header: "Customer", key: "customerName", width: 18 },
      { header: "Phone", key: "customerPhone", width: 14 },
      { header: "Source", key: "source", width: 10 },
      { header: "Order Type", key: "orderType", width: 16 },
      { header: "Payment Method", key: "paymentMethod", width: 14 },
      { header: "Payment Status", key: "paymentStatus", width: 14 },
      { header: "Order Status", key: "orderStatus", width: 14 },
      { header: "Subtotal (Rs.)", key: "subtotal", width: 14 },
      { header: "Discount (Rs.)", key: "discount", width: 14 },
      { header: "Delivery Fee (Rs.)", key: "deliveryFee", width: 14 },
      { header: "Tax (Rs.)", key: "tax", width: 12 },
      { header: "Grand Total (Rs.)", key: "grandTotal", width: 16 },
      { header: "Collected (Rs.)", key: "collectedAmount", width: 14 },
      { header: "Outstanding (Rs.)", key: "outstandingAmount", width: 16 },
      { header: "Refunded (Rs.)", key: "refundAmount", width: 14 },
      { header: "Transaction Ref", key: "transactionRef", width: 24 },
      { header: "Payment Attempts", key: "paymentAttempts", width: 14 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const r of report.rows) {
      sheet.addRow({
        ...r,
        createdAt: new Date(r.createdAt).toLocaleString(),
        subtotal: (r.subtotal / 100).toFixed(2),
        discount: (r.discount / 100).toFixed(2),
        deliveryFee: (r.deliveryFee / 100).toFixed(2),
        tax: (r.tax / 100).toFixed(2),
        grandTotal: (r.grandTotal / 100).toFixed(2),
        collectedAmount: (r.collectedAmount / 100).toFixed(2),
        outstandingAmount: (r.outstandingAmount / 100).toFixed(2),
        refundAmount: (r.refundAmount / 100).toFixed(2),
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }
}
