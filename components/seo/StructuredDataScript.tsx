import { buildAllStructuredData } from "@/lib/google-publish/structured-data";

export default function StructuredDataScript() {
  const graphs = buildAllStructuredData();
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graphs) }}
    />
  );
}
