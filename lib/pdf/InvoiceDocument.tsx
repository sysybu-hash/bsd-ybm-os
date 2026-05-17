import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { InvoiceExportPayload } from "@/lib/invoice-export-types";

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "NotoSansHebrew", direction: "rtl" },
  title: { fontSize: 18, marginBottom: 12, textAlign: "center", fontWeight: "bold" },
  org: { fontSize: 9, color: "#64748b", marginBottom: 4, textAlign: "right" },
  meta: { fontSize: 11, marginBottom: 6, textAlign: "right" },
  tableHeader: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 6,
    marginTop: 16,
  },
  tableRow: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 5,
  },
  colDesc: { width: "40%", fontSize: 10, textAlign: "right" },
  colQty: { width: "15%", fontSize: 10, textAlign: "center" },
  colPrice: { width: "20%", fontSize: 10, textAlign: "center" },
  colTotal: { width: "25%", fontSize: 10, textAlign: "left" },
  headerText: { fontSize: 9, fontWeight: "bold", color: "#475569" },
  total: { marginTop: 14, fontSize: 12, fontWeight: "bold", textAlign: "right" },
});

function docTypeLabel(type: string): string {
  if (type === "QUOTE") return "הצעת מחיר";
  if (type === "RECEIPT") return "קבלה";
  if (type === "CREDIT_NOTE") return "זיכוי";
  return "חשבונית מס";
}

export default function InvoiceDocument({ payload }: { payload: InvoiceExportPayload }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {payload.orgName ? <Text style={styles.org}>{payload.orgName}</Text> : null}
        {payload.orgTaxId ? <Text style={styles.org}>{`ח"פ: ${payload.orgTaxId}`}</Text> : null}
        <Text style={styles.title}>{docTypeLabel(payload.type)}</Text>
        <Text style={styles.meta}>{`מספר: ${payload.number}`}</Text>
        <Text style={styles.meta}>{`לקוח: ${payload.clientName}`}</Text>
        <Text style={styles.meta}>{`תאריך: ${payload.date}`}</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.colDesc, styles.headerText]}>תיאור</Text>
          <Text style={[styles.colQty, styles.headerText]}>כמות</Text>
          <Text style={[styles.colPrice, styles.headerText]}>מחיר</Text>
          <Text style={[styles.colTotal, styles.headerText]}>סה״כ</Text>
        </View>
        {payload.items.map((item, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={styles.colDesc}>{item.desc}</Text>
            <Text style={styles.colQty}>{String(item.qty)}</Text>
            <Text style={styles.colPrice}>{`₪${item.price.toLocaleString("he-IL")}`}</Text>
            <Text style={styles.colTotal}>{`₪${(item.qty * item.price).toLocaleString("he-IL")}`}</Text>
          </View>
        ))}
        <Text style={styles.total}>{`סה״כ כולל מע״מ: ₪${payload.total.toLocaleString("he-IL")}`}</Text>
      </Page>
    </Document>
  );
}
