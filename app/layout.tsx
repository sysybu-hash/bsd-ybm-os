import type { Metadata, Viewport } from "next";
import { Assistant } from "next/font/google";
import "./globals.css";
import { buildRootMetadata } from "@/lib/site-metadata";

// Body, UI and headings — refined modern Hebrew sans (latin + hebrew). Variable
// font, so the ExtraBold (800) hero H1 (LCP element) and regular body share one
// download. Preloaded so it is ready before first paint.
const sans = Assistant({
  subsets: ["hebrew", "latin"],
  display: "swap",
  preload: true,
  adjustFontFallback: true,
  fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"],
  variable: "--font-sans",
});

export const metadata: Metadata = buildRootMetadata();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

const MARKETING_THEME_BOOT = `try{var p=location.pathname;if(p==='/'||p.startsWith('/marketing-preview')){var t=null;try{t=localStorage.getItem('theme');}catch(e){}var mode=t==='light'?'light':'dark';var root=document.documentElement;root.classList.remove(mode==='light'?'dark':'light');root.classList.add(mode);root.style.colorScheme=mode;}}catch(e){}`;

/** מעטפת HTML סטטית — סשן/טננט ב-(platform)/layout בלבד */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MARKETING_THEME_BOOT }} />
      </head>
      <body className={`${sans.className} min-h-screen bg-[color:var(--background-main)] font-sans text-[color:var(--foreground-main)] antialiased`}>
        {children}
      </body>
    </html>
  );
}
