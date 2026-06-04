import type { Metadata } from "next";
import { buildPublicPageMetadata } from "@/lib/google-publish/public-page-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicPageMetadata("login");
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
