export const OPEN_OMNIBAR_EVENT = "marketing:open-omnibar-sheet";

export function openMarketingOmnibarSheet() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_OMNIBAR_EVENT));
  }
}
