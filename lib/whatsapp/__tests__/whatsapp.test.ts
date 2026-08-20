import { createHmac } from "crypto";
import {
  computeWhatsappSignature,
  resolveWhatsappChallenge,
  verifyWhatsappSignature,
} from "@/lib/whatsapp/verify";
import { parseWhatsappWebhook } from "@/lib/whatsapp/parse";
import { extractLinkCode } from "@/lib/whatsapp/link-codes";
import { replyLinked, replyScanResult, replyUnknownNumber } from "@/lib/whatsapp/replies";

const SECRET = "test-app-secret";

describe("whatsapp/verify", () => {
  it("accepts a correctly-signed body", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }));
    const sig = "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
    expect(verifyWhatsappSignature(sig, body, SECRET)).toBe("ok");
  });

  it("rejects a tampered body", () => {
    const body = Buffer.from("original");
    const sig = "sha256=" + computeWhatsappSignature(body, SECRET);
    expect(verifyWhatsappSignature(sig, Buffer.from("tampered"), SECRET)).toBe("invalid");
  });

  it("reports missing header and misconfiguration", () => {
    const body = Buffer.from("x");
    expect(verifyWhatsappSignature(null, body, SECRET)).toBe("missing");
    expect(verifyWhatsappSignature("sha256=abcd", body, "")).toBe("misconfigured");
  });

  it("echoes the challenge only when the verify token matches", () => {
    const ok = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "tok",
      "hub.challenge": "12345",
    });
    expect(resolveWhatsappChallenge(ok, "tok")).toEqual({ ok: true, challenge: "12345" });
    expect(resolveWhatsappChallenge(ok, "wrong")).toEqual({ ok: false });
  });
});

describe("whatsapp/parse", () => {
  it("extracts text and media messages from a cloud-api payload", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: "972500000001", id: "m1", type: "text", text: { body: "123456" } },
                  {
                    from: "972500000002",
                    id: "m2",
                    type: "image",
                    image: { id: "media-9", mime_type: "image/jpeg" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const out = parseWhatsappWebhook(payload);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: "text", from: "972500000001", text: "123456" });
    expect(out[1]).toMatchObject({ kind: "media", mediaId: "media-9", mimeType: "image/jpeg" });
  });

  it("ignores non-whatsapp payloads and status updates", () => {
    expect(parseWhatsappWebhook({ object: "page" })).toEqual([]);
    expect(
      parseWhatsappWebhook({
        object: "whatsapp_business_account",
        entry: [{ changes: [{ value: { statuses: [{ status: "delivered" }] } }] }],
      }),
    ).toEqual([]);
  });
});

describe("whatsapp/link-codes extractLinkCode", () => {
  it("finds a 6-digit code in free text, ignoring spaces/dashes", () => {
    expect(extractLinkCode("123456")).toBe("123456");
    expect(extractLinkCode("הקוד שלי הוא 654321 תודה")).toBe("654321");
    expect(extractLinkCode("12-34 56")).toBe("123456");
    expect(extractLinkCode("no code here")).toBeNull();
  });
});

describe("whatsapp/process reply builders", () => {
  it("formats the scan-result reply with currency", () => {
    const reply = replyScanResult("ספק בטון", 1234);
    expect(reply).toContain("ספק בטון");
    expect(reply).toContain("התקבל");
    expect(reply).toMatch(/1,234/);
  });

  it("has distinct linked / unknown-number replies", () => {
    expect(replyLinked()).not.toBe(replyUnknownNumber());
    expect(replyLinked()).toContain("חובר");
  });
});
