"use client";

import { useEffect } from "react";
import { buildAllStructuredData } from "@/lib/google-publish/structured-data";

/** JSON-LD דרך DOM — לא כ-<script> בתוך React (React 19 מזהיר על זה ב-client) */
export default function MarketingStructuredData() {
  useEffect(() => {
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.setAttribute("data-bsd-jsonld", "marketing");
    el.text = JSON.stringify(buildAllStructuredData());
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, []);
  return null;
}
