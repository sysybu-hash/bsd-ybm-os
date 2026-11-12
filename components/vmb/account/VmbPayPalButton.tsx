"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clientEnv } from "@/lib/env";
import { loadPayPalSdk } from "@/lib/paypal-sdk-loader";

type Purchase = { kind: "annual" } | { kind: "credits"; packId: string };

/**
 * PayPal buttons for one VMB purchase. The server sets the price; the client
 * only names what it buys. On approval the server captures and applies it.
 */
export function VmbPayPalButton({ purchase, okText, failText }: { purchase: Purchase; okText: string; failText: string }) {
  const host = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const clientId = clientEnv.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const body = JSON.stringify(purchase);

  useEffect(() => {
    const el = host.current;
    if (!el || !clientId) return;
    let closed = false;
    let buttons: { close?: () => void } | null = null;
    loadPayPalSdk(clientId)
      .then((paypal) => {
        if (closed) return;
        const b = paypal.Buttons({
          style: { layout: "horizontal", shape: "pill", label: "pay", height: 44 },
          createOrder: async () => {
            const res = await fetch("/api/vmb/billing/paypal/create-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
            });
            const data = (await res.json()) as { id?: string };
            if (!res.ok || !data.id) throw new Error("create-order failed");
            return data.id;
          },
          onApprove: async ({ orderID }) => {
            const res = await fetch("/api/vmb/billing/paypal/capture-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderID }),
            });
            setMsg({ ok: res.ok, text: res.ok ? okText : failText });
            if (res.ok) router.refresh();
          },
          onError: () => setMsg({ ok: false, text: failText }),
        });
        buttons = b;
        return b.render(el);
      })
      .catch(() => setMsg({ ok: false, text: failText }));
    return () => {
      closed = true;
      buttons?.close?.();
    };
  }, [clientId, body, okText, failText, router]);

  if (!clientId) return null;
  return (
    <div>
      <div ref={host} className="min-h-11" />
      {msg ? (
        <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-[color:var(--vmb-pass)]" : "text-[color:var(--vmb-fail)]"}`}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
