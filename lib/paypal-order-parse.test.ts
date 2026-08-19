import { parseCapturePayload } from "@/lib/paypal-order-parse";

const capture = {
  id: "CAP-1",
  status: "COMPLETED",
  amount: { value: "349.00", currency_code: "ILS" },
};

describe("parseCapturePayload", () => {
  test("reads custom_id from the purchase unit (shape returned by GET /orders)", () => {
    const parsed = parseCapturePayload({
      status: "COMPLETED",
      purchase_units: [
        {
          custom_id: "REG|buyer@example.com|TIER|COMPANY|M",
          payments: { captures: [{ ...capture, custom_id: "REG|buyer@example.com|TIER|COMPANY|M" }] },
        },
      ],
    });

    expect(parsed).toMatchObject({
      customId: "REG|buyer@example.com|TIER|COMPANY|M",
      paid: 349,
      currency: "ILS",
      captureId: "CAP-1",
    });
  });

  test("falls back to the capture's custom_id, which is the shape the capture call returns", () => {
    // Verified against PayPal sandbox: the response to POST /orders/{id}/capture
    // has no custom_id on the purchase unit. Reading only there returned null,
    // so a paid signup was granted no tier at all.
    const parsed = parseCapturePayload({
      status: "COMPLETED",
      purchase_units: [
        {
          payments: { captures: [{ ...capture, custom_id: "REG|buyer@example.com|TIER|COMPANY|M" }] },
        },
      ],
    });

    expect(parsed?.customId).toBe("REG|buyer@example.com|TIER|COMPANY|M");
  });

  test("returns null when custom_id is absent in both places", () => {
    expect(
      parseCapturePayload({
        status: "COMPLETED",
        purchase_units: [{ payments: { captures: [capture] } }],
      }),
    ).toBeNull();
  });

  test("returns null unless both the order and the capture are COMPLETED", () => {
    expect(
      parseCapturePayload({
        status: "APPROVED",
        purchase_units: [{ custom_id: "x", payments: { captures: [capture] } }],
      }),
    ).toBeNull();

    expect(
      parseCapturePayload({
        status: "COMPLETED",
        purchase_units: [
          { custom_id: "x", payments: { captures: [{ ...capture, status: "PENDING" }] } },
        ],
      }),
    ).toBeNull();
  });
});
