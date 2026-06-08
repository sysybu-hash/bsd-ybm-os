import type { Metadata } from "next";
import { buildPublicPageMetadata } from "@/lib/google-publish/public-page-metadata";

export function generateMetadata(): Metadata {
  return buildPublicPageMetadata("login");
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
