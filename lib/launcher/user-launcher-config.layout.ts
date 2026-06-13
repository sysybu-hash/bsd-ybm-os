/** מקסימום אריחים לאזור — מספיק לכל האפליקציות הזמינות + מרווח */
export const LAUNCHER_ZONE_MAX_SLOTS = 48;

/** מעטפת quick grid — ממורכזת, בלי חיתוך אופקי */
export const LAUNCHER_QUICK_GRID_CONTAINER_CLASS =
  "flex w-full min-w-0 shrink-0 flex-col items-center justify-center gap-3 overflow-visible px-3 sm:px-4";

/** מעטפת רשת דסקטופ — ממורכזת */
export const LAUNCHER_QUICK_DESKTOP_WRAP_CLASS =
  "hidden w-full min-w-0 justify-center overflow-visible px-2 md:flex md:px-4";

/** רשת דסקטופ — LTR לקואורדינטות; רווח ב-inline style מ-quickGridInlineStyle */
export const LAUNCHER_QUICK_DESKTOP_GRID_CLASS =
  "mx-auto grid shrink-0 justify-items-stretch box-border [direction:ltr]";

/** רשת 2 עמודות במובייל — ממורכזת, אריחים גדולים */
export const LAUNCHER_QUICK_MOBILE_GRID_CLASS =
  "mx-auto grid w-full max-w-[min(100%,17.75rem)] grid-cols-2 justify-items-center gap-4 overflow-x-hidden py-1 [direction:ltr] md:hidden";

/** אריח לרשת 2×N במובייל — מטרת מגע ~124px */
export const LAUNCHER_QUICK_MOBILE_TILE_WRAPPER_CLASS =
  "box-border h-[124px] w-full max-w-[124px] min-w-[120px] shrink-0 justify-self-center";

export const LAUNCHER_QUICK_ROW_CLASS = "flex w-full flex-wrap justify-center gap-3";

/** תא רשת — ריבוע גמיש עד 140px; הרווח בין תאים מגיע מ-gap של הרשת */
export const LAUNCHER_QUICK_TILE_WRAPPER_CLASS =
  "box-border flex w-full min-w-0 max-w-[140px] aspect-square justify-self-center";

/** רשת עריכה — עמודות/שורות דינמיות ב־inline style; LTR לקואורדינטות עקביות */
export const LAUNCHER_QUICK_EDIT_GRID_CLASS =
  "grid shrink-0 justify-items-stretch rounded-xl border border-dashed border-indigo-400/30 [direction:ltr] bg-[color:var(--surface-card)]/40 p-3 shadow-sm";

/** מעטפת עריכת quick grid — נגללת אופקית/אנכית כדי שהאריחים יישארו בגודל קריא */
export const LAUNCHER_QUICK_EDIT_SCROLL_CLASS =
  "flex min-h-0 w-full flex-1 items-start justify-start overflow-auto overscroll-contain px-1 py-2 md:justify-center";

/** @deprecated השתמשו ב־LAUNCHER_QUICK_GRID_CONTAINER_CLASS + שורות */
export const LAUNCHER_QUICK_GRID_CLASS = LAUNCHER_QUICK_GRID_CONTAINER_CLASS;

export const LAUNCHER_PICKER_GRID_CONTAINER_CLASS =
  "flex w-full flex-col items-center gap-2";

export const LAUNCHER_PICKER_ROW_CLASS = "flex w-full flex-wrap justify-center gap-2";

export const LAUNCHER_PICKER_TILE_CLASS = "w-[min(100%,96px)] shrink-0";

/** @deprecated השתמשו ב־LAUNCHER_PICKER_GRID_CONTAINER_CLASS + שורות */
export const LAUNCHER_PICKER_GRID_CLASS = LAUNCHER_PICKER_GRID_CONTAINER_CLASS;
