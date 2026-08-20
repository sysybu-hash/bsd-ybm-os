#!/usr/bin/env node
/**
 * Generates a Mermaid ER diagram from prisma/schema.prisma into docs/DB-ERD.md.
 * Self-contained (no mermaid-cli / puppeteer) — Mermaid renders on GitHub natively.
 * Usage: node scripts/generate-erd.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");

const SCALARS = new Set([
  "String", "Boolean", "Int", "BigInt", "Float", "Decimal",
  "DateTime", "Json", "Bytes",
]);

/** @type {{ name: string, fields: {name:string,type:string,attrs:string}[] }[]} */
const models = [];
const modelNames = new Set();

const modelRe = /^model\s+(\w+)\s*\{([^}]*)\}/gms;
let m;
while ((m = modelRe.exec(schema))) {
  const [, name, body] = m;
  modelNames.add(name);
  const fields = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const [fname, ftypeRaw] = parts;
    const ftype = ftypeRaw.replace(/[?[\]]/g, "");
    const attrs = parts.slice(2).join(" ");
    fields.push({ name: fname, type: ftype, attrs, listOrOpt: ftypeRaw });
  }
  models.push({ name, fields });
}

// Build relations from @relation / model-typed fields.
/** @type {Set<string>} */
const relEdges = new Set();
for (const model of models) {
  for (const f of model.fields) {
    if (!modelNames.has(f.type)) continue; // scalar or enum
    // Cardinality: list => "many", optional => "zero-or-one", else "one"
    const isList = f.listOrOpt.includes("[]");
    // Emit a single undirected-ish edge per pair (dedupe by sorted pair).
    const [a, b] = [model.name, f.type].sort();
    const card = isList ? `${model.name} ||--o{ ${f.type}` : `${model.name} }o--|| ${f.type}`;
    relEdges.add(`${a}|${b}|${card}`);
  }
}

const lines = ["erDiagram"];
// Entities with scalar fields only (Mermaid can't render relation fields as columns cleanly).
for (const model of models) {
  const scalarFields = model.fields.filter((f) => SCALARS.has(f.type));
  lines.push(`  ${model.name} {`);
  for (const f of scalarFields.slice(0, 12)) {
    const pk = /@id/.test(f.attrs) ? "PK" : /@unique/.test(f.attrs) ? "UK" : "";
    lines.push(`    ${f.type} ${f.name}${pk ? ` ${pk}` : ""}`);
  }
  lines.push("  }");
}
const seenPairs = new Set();
for (const edge of relEdges) {
  const [a, b, card] = edge.split("|");
  const key = `${a}|${b}`;
  if (seenPairs.has(key)) continue;
  seenPairs.add(key);
  lines.push(`  ${card} : ""`);
}

const out = `# מודל נתונים — ER Diagram

> נוצר אוטומטית מ-[\`prisma/schema.prisma\`](../prisma/schema.prisma) ע"י
> \`node scripts/generate-erd.mjs\`. אל תערוך ידנית — הרץ מחדש אחרי שינוי סכמה.
> ${models.length} מודלים.

\`\`\`mermaid
${lines.join("\n")}
\`\`\`

## מיגרציות

- יצירה: SQL ב-\`prisma/migrations/\` (Neon — ללא shadow DB).
- הפעלה מקומית: \`npm run db:migrate\`.
`;

writeFileSync(join(root, "docs", "DB-ERD.md"), out, "utf8");
console.log(`ERD written: ${models.length} models, ${seenPairs.size} relations`);
