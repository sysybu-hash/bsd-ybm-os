import { Font } from "@react-pdf/renderer";

let registered = false;

/** רישום פונט עברי ל־react-pdf (CDN — ללא קובץ מקומי) */
export function registerHebrewPdfFont(): void {
  if (registered) return;
  Font.register({
    family: "NotoSansHebrew",
    fonts: [
      {
        src: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansHebrew/NotoSansHebrew-Regular.ttf",
        fontWeight: "normal",
      },
      {
        src: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSansHebrew/NotoSansHebrew-Bold.ttf",
        fontWeight: "bold",
      },
    ],
  });
  registered = true;
}
