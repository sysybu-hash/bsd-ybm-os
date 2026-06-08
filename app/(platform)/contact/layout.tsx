import type { Metadata } from "next";
import { buildPublicPageMetadata } from "@/lib/google-publish/public-page-metadata";

export const metadata: Metadata = buildPublicPageMetadata("contact");

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
