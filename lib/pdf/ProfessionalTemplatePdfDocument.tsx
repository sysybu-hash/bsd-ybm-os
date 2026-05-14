import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", direction: "rtl" },
  kind: { fontSize: 10, color: "#0d9488", marginBottom: 6, textAlign: "right" },
  title: { fontSize: 18, marginBottom: 12, textAlign: "right" },
  body: { fontSize: 11, lineHeight: 1.6, color: "#334155", textAlign: "right" },
  meta: { marginTop: 20, fontSize: 9, color: "#94a3b8", textAlign: "right" },
});

export type ProfessionalTemplatePdfProps = {
  industryLabel: string;
  templateLabel: string;
  templateDescription: string;
  kindLabel: string;
  generatedAt: string;
};

export default function ProfessionalTemplatePdfDocument({
  industryLabel,
  templateLabel,
  templateDescription,
  kindLabel,
  generatedAt,
}: ProfessionalTemplatePdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.kind}>{kindLabel}</Text>
        <Text style={styles.title}>{templateLabel}</Text>
        <Text style={styles.body}>{templateDescription}</Text>
        <Text style={styles.meta}>
          מקצוע: {industryLabel} · {generatedAt}
        </Text>
        <View style={{ marginTop: 16 }}>
          <Text style={styles.body}>
            מסמך זה הופק אוטומטית כתבנית מקצועית. יש להשלים פרטים, חתימות ומספרי מסמך לפי הצורך בארגון.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
