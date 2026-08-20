"use client";

import { useEffect, useRef, useState } from "react";
// `env` is the server proxy: in the browser it does a dynamic process.env[key]
// lookup, which Next cannot inline at build time, so every NEXT_PUBLIC_* read
// through it is undefined on the client. `clientEnv` uses static literal reads.
import { clientEnv } from "@/lib/env";

/**
 * Minimal shape of the pieces of the PayPal JS SDK this component touches.
 * The SDK ships no types and we only use a sliver of it.
 */
type PayPalButtonsConfig = {
  style?: { layout?: string; shape?: string; label?: string; height?: number };
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onError?: (err: unknown) => void;
  onCancel?: () => void;
};

type PayPalSdk = {
  Buttons: (config: PayPalButtonsConfig) => {
    render: (container: HTMLElement) => Promise<void>;
    close?: () => void;
  };
};

declare global {
  interface Window {
    paypal?: PayPalSdk;
  }
}

const SDK_ID = "paypal-sdk";
let sdkPromise: Promise<PayPalSdk> | null = null;

/** Loads the PayPal SDK once per page, reusing the in-flight promise. */
function loadPayPalSdk(clientId: string): Promise<PayPalSdk> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no window"));
  }
  if (window.paypal) return Promise.resolve(window.paypal);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<PayPalSdk>((resolve, reject) => {
    const existing = document.getElementById(SDK_ID);
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.paypal) resolve(window.paypal);
        else reject(new Error("PayPal SDK loaded without a global"));
      });
      existing.addEventListener("error", () => reject(new Error("PayPal SDK failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.id = SDK_ID;
    const params = new URLSearchParams({
      "client-id": clientId,
      currency: "ILS",
      intent: "capture",
      components: "buttons",
    });
    script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    script.async = true;
    script.onload = () => {
      if (window.paypal) resolve(window.paypal);
      else reject(new Error("PayPal SDK loaded without a global"));
    };
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("PayPal SDK failed to load"));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

type Props = Readonly<{
  email: string;
  tier: string;
  billingCycle: "monthly" | "annual";
  /** Called with the PayPal order id once the payer approves. */
  onApproved: (orderId: string) => void;
  onError: (message: string) => void;
  labels: {
    unavailable: string;
    loading: string;
    failed: string;
  };
}>;

/**
 * PayPal buttons for a signup that has not happened yet.
 *
 * The order is created by POST /api/register/paypal/create-order, which prices
 * it server-side and stamps the custom_id that verifyRegistrationPayPalOrder
 * reads. Capture is deliberately *not* done here — POST /api/register fetches
 * the order and captures it while deciding the tier, so the only thing this
 * component hands back is an order id.
 */
export default function PayPalRegisterButtons({
  email,
  tier,
  billingCycle,
  onApproved,
  onError,
  labels,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  // Keep the latest props reachable from the SDK callbacks without re-rendering
  // the buttons, which would tear down an in-flight payment.
  const latest = useRef({ email, tier, billingCycle, onApproved, onError });
  latest.current = { email, tier, billingCycle, onApproved, onError };

  const clientId = clientEnv.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";

  useEffect(() => {
    if (!clientId) {
      setStatus("unavailable");
      return;
    }
    let cancelled = false;

    void loadPayPalSdk(clientId)
      .then((sdk) => {
        if (cancelled || !containerRef.current) return;
        const buttons = sdk.Buttons({
          style: { layout: "vertical", shape: "rect", height: 44 },
          createOrder: async () => {
            const cur = latest.current;
            const res = await fetch("/api/register/paypal/create-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: cur.email,
                tier: cur.tier,
                billingCycle: cur.billingCycle,
              }),
            });
            const data = (await res.json()) as { id?: string; error?: string };
            if (!res.ok || !data.id) {
              throw new Error(data.error ?? labels.failed);
            }
            return data.id;
          },
          onApprove: async (data) => {
            latest.current.onApproved(data.orderID);
          },
          onError: (err: unknown) => {
            latest.current.onError(err instanceof Error ? err.message : labels.failed);
          },
        });
        void buttons.render(containerRef.current).then(() => {
          if (!cancelled) setStatus("ready");
        });
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, labels.failed]);

  if (status === "unavailable") {
    return (
      <p className="rounded-xl border border-amber-500/30 bg-[color:var(--surface-soft)] p-4 text-sm font-bold text-[color:var(--foreground-muted)]">
        {labels.unavailable}
      </p>
    );
  }

  return (
    <div>
      {status === "loading" ? (
        <div className="h-24 animate-pulse rounded-xl bg-[color:var(--surface-soft)]" aria-hidden />
      ) : null}
      <div ref={containerRef} />
      <span className="sr-only" aria-live="polite">
        {status === "loading" ? labels.loading : ""}
      </span>
    </div>
  );
}
