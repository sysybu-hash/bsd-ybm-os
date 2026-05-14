import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatCurrencyILS } from "@/lib/ui-formatters";

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", direction: "rtl" },
  title: { fontSize: 20, marginBottom: 8, textAlign: "right" },
  subtitle: { fontSize: 11, color: "#64748b", marginBottom: 20, textAlign: "right" },
  row: { flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 10, fontSize: 11 },
  label: { color: "#334155" },
  value: { fontWeight: "bold", color: "#0f172a" },
  footer: { marginTop: 24, fontSize: 9, color: "#94a3b8", textAlign: "right" },
});

export type FinanceReportPdfProps = {
  organizationName: string;
  generatedAt: string;
  actual: number;
  pending: number;
  forecast: number;
  totalProjected: number;
  pendingDocCount: number;
  paidIssuedTotal: number;
};

export default function FinanceReportDocument({
  organizationName,
  generatedAt,
  actual,
  pending,
  forecast,
  totalProjected,
  pendingDocCount,
  paidIssuedTotal,
}: FinanceReportPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>דוח תמונת מצב פיננסית</Text>
        <Text style={styles.subtitle}>
          {organizationName} · נוצר ב־{generatedAt}
        </Text>
        <View style={styles.row}>
          <Text style={styles.label}>מחזור משולם (מסמכים מונפקים)</Text>
          <Text style={styles.value}>{formatCurrencyILS(actual)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>גבייה פתוחה</Text>
          <Text style={styles.value}>{formatCurrencyILS(pending)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>תחזית צנרת (לידים/הצעות)</Text>
          <Text style={styles.value}>{formatCurrencyILS(forecast)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>סה״כ צפוי (מעוגל)</Text>
          <Text style={styles.value}>{formatCurrencyILS(totalProjected)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>מסמכים במצב PENDING</Text>
          <Text style={styles.value}>{String(pendingDocCount)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>סה״כ מסמכים שסומנו כשולמו (היקף)</Text>
          <Text style={styles.value}>{formatCurrencyILS(paidIssuedTotal)}</Text>
        </View>
        <Text style={styles.footer}>
          BSD-YBM — דוח סיכום; אינו מהווה ייעוץ חשבונאי או מס. לפרטים מלאים עברו למסמכים ול-ERP.
        </Text>
      </Page>
    </Document>
  );
}
