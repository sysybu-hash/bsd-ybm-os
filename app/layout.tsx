import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { buildRootMetadata } from "@/lib/site-metadata";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  display: "swap",
  adjustFontFallback: true,
  variable: "--font-heebo",
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
    <html lang="he" dir="rtl" className={heebo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MARKETING_THEME_BOOT }} />
      </head>
      <body className={`${heebo.className} min-h-screen bg-[#0f172a] font-sans text-slate-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
