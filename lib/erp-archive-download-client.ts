/** הורדת קובץ מקור של מסמך סריקה (מ-Google Drive דרך השרת) */
export async function downloadErpScanDocumentFile(
  documentId: string,
  fallbackFileName: string,
): Promise<{ ok: true; filename: string } | { ok: false; error: string }> {
  const url = `/api/erp/documents/${documentId}/file?disposition=attachment`;
  let res: Response;
  try {
    res = await fetch(url, { credentials: "include", cache: "no-store" });
  } catch {
    return { ok: false, error: "לא ניתן להתחבר לשרת. בדקו חיבור לאינטרנט." };
  }

  if (!res.ok) {
    let message = "הורדת הקובץ נכשלה";
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
  const filename = decodeURIComponent(match?.[1]?.trim() ?? fallbackFileName);

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
