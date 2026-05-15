/** העדפות מחברת NotebookLM — נשמרות ב-localStorage (ללא API רשמי ל-NotebookLM). */

export const NOTEBOOKLM_STORAGE_KEY = "bsd_ybm_notebooklm_prefs_v1";

export type NotebookLMResponseStyle = "sources" | "balanced" | "creative";
export type NotebookLMResponseLength = "short" | "medium" | "long";
export type NotebookLMShareLevel = "private" | "workspace" | "link";
export type NotebookLMChatLanguage = "he" | "en" | "auto";

export type NotebookLMSourcePrefs = {
  pdf: boolean;
  googleDocs: boolean;
  googleSlides: boolean;
  websites: boolean;
  youtube: boolean;
  googleDrive: boolean;
  codeRepos: boolean;
};

export type NotebookLMStudioPrefs = {
  audioOverview: boolean;
  videoOverview: boolean;
  mindMap: boolean;
  researchReport: boolean;
  quiz: boolean;
  flashcards: boolean;
  briefingDoc: boolean;
  dataTable: boolean;
};

export type NotebookLMSettings = {
  notebookTitle: string;
  notebookNotes: string;
  sources: NotebookLMSourcePrefs;
  studio: NotebookLMStudioPrefs;
  customInstructions: string;
  responseStyle: NotebookLMResponseStyle;
  responseLength: NotebookLMResponseLength;
  shareLevel: NotebookLMShareLevel;
  chatLanguage: NotebookLMChatLanguage;
  sourceGroundingInChat: boolean;
  showCitations: boolean;
  autoRefreshSources: boolean;
  maxSourcesReminder: number;
};

export const defaultNotebookLMSettings = (): NotebookLMSettings => ({
  notebookTitle: "",
  notebookNotes: "",
  sources: {
    pdf: true,
    googleDocs: true,
    googleSlides: true,
    websites: true,
    youtube: true,
    googleDrive: true,
    codeRepos: false,
  },
  studio: {
    audioOverview: true,
    videoOverview: false,
    mindMap: true,
    researchReport: true,
    quiz: true,
    flashcards: true,
    briefingDoc: true,
    dataTable: false,
  },
  customInstructions: "",
  responseStyle: "balanced",
  responseLength: "medium",
  shareLevel: "private",
  chatLanguage: "he",
  sourceGroundingInChat: true,
  showCitations: true,
  autoRefreshSources: true,
  maxSourcesReminder: 50,
});

export function loadNotebookLMSettings(): NotebookLMSettings {
  const defaults = defaultNotebookLMSettings();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(NOTEBOOKLM_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<NotebookLMSettings>;
    return {
      ...defaults,
      ...parsed,
      sources: { ...defaults.sources, ...parsed.sources },
      studio: { ...defaults.studio, ...parsed.studio },
    };
  } catch {
    return defaults;
  }
}

export function saveNotebookLMSettings(s: NotebookLMSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTEBOOKLM_STORAGE_KEY, JSON.stringify(s));
}

export const NOTEBOOKLM_APP_URL = "https://notebooklm.google.com";
