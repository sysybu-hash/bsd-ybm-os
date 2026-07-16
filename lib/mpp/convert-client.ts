import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("mpp/convert-client");

export type MppConvertResult = {
  xml: string;
  fileName: string;
};

export function isMppConvertConfigured(): boolean {
  return Boolean(env.MPP_CONVERT_URL?.trim());
}

/**
 * Converts an MS Project .mpp binary to MS Project XML via external converter service.
 * Set MPP_CONVERT_URL to a POST endpoint that accepts multipart "file" and returns XML.
 */
export async function convertMppToXml(
  file: File | Blob,
  fileName: string,
): Promise<MppConvertResult> {
  const url = env.MPP_CONVERT_URL?.trim();
  if (!url) {
    throw new MppConvertError(
      "ייבוא MPP דורש שירות המרה. הגדירו MPP_CONVERT_URL (POST multipart → XML).",
      "mpp_converter_not_configured",
    );
  }

  const form = new FormData();
  form.append("file", file, fileName.endsWith(".mpp") ? fileName : `${fileName}.mpp`);

  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: form });
  } catch (err: unknown) {
    log.error("mpp_convert_fetch_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    throw new MppConvertError("שירות המרת MPP לא זמין.", "mpp_converter_unreachable");
  }

  const bodyText = await res.text();
  if (!res.ok) {
    log.warn("mpp_convert_http_error", { status: res.status, body: bodyText.slice(0, 200) });
    throw new MppConvertError(
      `המרת MPP נכשלה (${res.status}). בדקו את שירות MPP_CONVERT_URL.`,
      "mpp_converter_failed",
    );
  }

  const trimmed = bodyText.trim();
  if (!trimmed.startsWith("<?xml") && !trimmed.startsWith("<")) {
    throw new MppConvertError(
      "שירות ההמרה לא החזיר XML תקין.",
      "mpp_converter_invalid_response",
    );
  }

  const baseName = fileName.replace(/\.mpp$/i, "") || "schedule";
  return { xml: trimmed, fileName: `${baseName}.xml` };
}

export class MppConvertError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "MppConvertError";
    this.code = code;
  }
}
