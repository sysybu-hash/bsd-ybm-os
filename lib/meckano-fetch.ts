/** Meckano REST — מפתח API נשלח בכותרת `key` (לא `token`). */
export const MECKANO_REST_BASE = "https://app.meckano.co.il/rest";

export function meckanoHeaders(apiKey: string): HeadersInit {
  return {
    key: apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export function meckanoRestUrl(path: string): string {
  const p = path.replace(/^\//, "");
  return `${MECKANO_REST_BASE}/${p}`;
}

export async function meckanoFetch(
  path: string,
  apiKey: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(meckanoRestUrl(path), {
    ...init,
    headers: {
      ...meckanoHeaders(apiKey),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}
