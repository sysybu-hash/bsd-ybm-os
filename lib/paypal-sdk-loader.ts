"use client";

/**
 * Minimal shape of the pieces of the PayPal JS SDK this component touches.
 * The SDK ships no types and we only use a sliver of it.
 */
export type PayPalButtonsConfig = {
  style?: { layout?: string; shape?: string; label?: string; height?: number };
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onError?: (err: unknown) => void;
  onCancel?: () => void;
};

export type PayPalSdk = {
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
export function loadPayPalSdk(clientId: string): Promise<PayPalSdk> {
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
