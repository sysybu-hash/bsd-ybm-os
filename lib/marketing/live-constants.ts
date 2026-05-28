/** משך מקסימלי לשיחת Gemini Live בדף שיווק (שניות / מילישניות) */
export const MARKETING_LIVE_MAX_SECONDS = 120;
export const MARKETING_LIVE_MAX_MS = MARKETING_LIVE_MAX_SECONDS * 1000;
/** לפני סיום — מבקשים מהמודל לסכם ולהזמין להרשמה */
export const MARKETING_LIVE_FAREWELL_BEFORE_MS = 20_000;

export const MARKETING_LIVE_SESSION_API = "/api/marketing/assistant/gemini-live/session";

export const MARKETING_CHAT_API = "/api/marketing/assistant/chat";
