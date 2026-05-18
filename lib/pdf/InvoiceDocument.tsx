import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { InvoiceExportPayload } from "@/lib/invoice-export-types";
import { documentTypeLabel } from "@/lib/document-types";
import { formatVatPercent } from "@/lib/vat-config";

const indigo = "#4f46e5";
const slate = "#0f172a";
const muted = "#64748b";
const border = "#e2e8f0";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: "NotoSansHebrew",
    direction: "rtl",
    backgroundColor: "#ffffff",
  },
  headerBand: {
    backgroundColor: indigo,
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "right",
  },
  headerSub: {
    fontSize: 10,
    color: "#c7d2fe",
    textAlign: "right",
    marginTop: 4,
  },
  row: { flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 16 },
  box: {
    width: "48%",
    borderWidth: 1,
    borderColor: border,
    borderRadius: 6,
    padding: 10,
  },
  boxLabel: { fontSize: 8, color: muted, marginBottom: 4, textAlign: "right" },
  boxValue: { fontSize: 11, color: slate, fontWeight: "bold", textAlign: "right" },
  tableHeader: {
    flexDirection: "row-reverse",
    backgroundColor: "#f1f5f9",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  tableRow: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
    borderBottomColor: border,
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  colDesc: { width: "42%", fontSize: 10, textAlign: "right" },
  colQty: { width: "14%", fontSize: 10, textAlign: "center" },
  colPrice: { width: "22%", fontSize: 10, textAlign: "center" },
  colTotal: { width: "22%", fontSize: 10, textAlign: "left" },
  th: { fontSize: 9, fontWeight: "bold", color: muted },
  totalsWrap: {
    marginTop: 14,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: border,
    borderRadius: 6,
    padding: 12,
    width: "42%",
    alignSelf: "flex-start",
  },
  totalLine: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 4,
  },
  totalLabel: { fontSize: 10, color: muted },
  totalValue: { fontSize: 10, color: slate },
  grandTotalRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: border,
  },
  grandTotalLabel: { fontSize: 13, fontWeight: "bold", color: indigo },
  grandTotalValue: { fontSize: 13, fontWeight: "bold", color: indigo },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: border,
    paddingTop: 8,
  },
  footerText: { fontSize: 8, color: muted, textAlign: "center" },
  allocation: {
    marginTop: 10,
    fontSize: 9,
    color: indigo,
    textAlign: "right",
    fontWeight: "bold",
  },
});

function money(n: number) {
  return `₪${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InvoiceDocument({ payload }: { payload: InvoiceExportPayload }) {
  const title = documentTypeLabel(payload.type);
  const vatPct = formatVatPercent(payload.vatRatePercent);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBand}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSub}>
            {payload.orgName ?? "BSD-YBM"} · מס׳ {payload.number}
          </Text>
        </View>

        <View style={styles.row}>
          <View style={styles.box}>
            <Text style={styles.boxLabel}>מאת</Text>
            <Text style={styles.boxValue}>{payload.orgName ?? "—"}</Text>
            {payload.orgTaxId ? (
              <Text style={[styles.boxValue, { fontSize: 9, fontWeight: "normal" }]}>
                {`ח.פ / ע.מ: ${payload.orgTaxId}`}
              </Text>
            ) : null}
            {payload.orgAddress ? (
              <Text style={[styles.boxValue, { fontSize: 9, fontWeight: "normal" }]}>
                {payload.orgAddress}
              </Text>
            ) : null}
          </View>
          <View style={styles.box}>
            <Text style={styles.boxLabel}>לכבוד</Text>
            <Text style={styles.boxValue}>{payload.clientName}</Text>
            <Text style={[styles.boxValue, { fontSize: 9, fontWeight: "normal", marginTop: 6 }]}>
              {`תאריך: ${payload.date}`}
            </Text>
            {payload.dueDate ? (
              <Text style={[styles.boxValue, { fontSize: 9, fontWeight: "normal" }]}>
                {`לתשלום עד: ${payload.dueDate}`}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.colDesc, styles.th]}>תיאור</Text>
          <Text style={[styles.colQty, styles.th]}>כמות</Text>
          <Text style={[styles.colPrice, styles.th]}>מחיר</Text>
          <Text style={[styles.colTotal, styles.th]}>סה״כ</Text>
        </View>
        {payload.items.map((item, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={styles.colDesc}>{item.desc}</Text>
            <Text style={styles.colQty}>{String(item.qty)}</Text>
            <Text style={styles.colPrice}>{money(item.price)}</Text>
            <Text style={styles.colTotal}>{money(item.qty * item.price)}</Text>
          </View>
        ))}

        <View style={styles.totalsWrap}>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>לפני מע״מ</Text>
            <Text style={styles.totalValue}>{money(payload.amount)}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>{`מע״מ (${vatPct}%)`}</Text>
            <Text style={styles.totalValue}>{money(payload.vat)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>סה״כ לתשלום</Text>
            <Text style={styles.grandTotalValue}>{money(payload.total)}</Text>
          </View>
        </View>

        {payload.itaAllocationNumber ? (
          <Text style={styles.allocation}>
            {`מספר הקצאה (רשות המסים): ${payload.itaAllocationNumber}`}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            מסמך הופק במערכת BSD-YBM-OS · אין לראות במסמך זה כקבלה אלא אם צוין במפורש
          </Text>
        </View>
      </Page>
    </Document>
  );
}
