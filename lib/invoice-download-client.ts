/** הורדת מסמך מונפק (PDF / Word) עם cookies — לא דרך <a download> בלבד */
export async function downloadIssuedDocumentExport(
  documentId: string,
  format: "pdf" | "docx",
): Promise<{ ok: true; filename: string } | { ok: false; error: string }> {
  const url = `/api/documents/issued/${documentId}/export?format=${format}`;
  let res: Response;
  try {
    res = await fetch(url, { credentials: "include", cache: "no-store" });
  } catch {
    return { ok: false, error: "לא ניתן להתחבר לשרת. בדקו חיבור לאינטרנט." };
  }

  if (!res.ok) {
    let message = "ייצוא המסמך נכשל";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* תגובה לא JSON */
    }
    return { ok: false, error: message };
  }

  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/i.exec(cd);
  const filename =
    match?.[1]?.trim() ??
    `bsd-ybm-document-${documentId.slice(0, 8)}.${format === "pdf" ? "pdf" : "doc"}`;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);

  return { ok: true, filename };
}
