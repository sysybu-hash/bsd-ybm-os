/** מצב פנימי של ווידג'ט — JSON-serializable */
export type WidgetViewState = Record<string, unknown>;

export type WidgetNavController = {
  canGoBack: boolean;
  canGoForward: boolean;
  back: () => void;
  forward: () => void;
  getCurrentView: () => WidgetViewState | null;
};

export type WidgetNavRegistration = {
  widgetId: string;
  controller: WidgetNavController;
};
