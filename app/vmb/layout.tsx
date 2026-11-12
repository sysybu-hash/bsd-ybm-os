import type { Metadata } from "next";
import { JetBrains_Mono, Rubik } from "next/font/google";
import "./tokens.css";
import { VMB_BRAND, VMB_ORIGIN } from "@/lib/vmb/brand";
import { vmbT } from "@/lib/vmb/i18n";

const display = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "700", "800"],
  display: "swap",
  variable: "--font-vmb-display",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  variable: "--font-vmb-mono",
});

const t = vmbT("he");

export const metadata: Metadata = {
  metadataBase: new URL(VMB_ORIGIN),
  title: { absolute: t("vmb.meta.title"), template: `%s · ${VMB_BRAND.name}` },
  description: t("vmb.meta.description"),
  applicationName: VMB_BRAND.name,
  // Its own tab icon; without this the platform's icons are inherited.
  icons: { icon: [{ url: VMB_BRAND.logo.icon, type: "image/png", sizes: "256x256" }], apple: VMB_BRAND.logo.appleIcon },
  // Its own install manifest (name, cube icon); otherwise "add to home screen" installs BSD-YBM's.
  manifest: VMB_BRAND.manifest,
  openGraph: {
    title: t("vmb.meta.title"),
    description: t("vmb.meta.description"),
    siteName: VMB_BRAND.name,
    locale: "he_IL",
    type: "website",
  },
};

/** VMB has its own shell: no OS chrome, no BSD-YBM session or tenant logic. */
export default function VmbLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${mono.variable} min-h-screen`}>{children}</div>;
}
