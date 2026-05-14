/** תגובות אחידות ל-Server Actions (ליטוש / סנכרון) */
export type ActionResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};
