/** Growth funnel event names — shared by client and server capture. */
export const FUNNEL_EVENTS = {
  ctaRegister: "funnel_cta_register",
  registerStarted: "funnel_register_started",
  registerCompleted: "funnel_register_completed",
  leadSubmitted: "funnel_lead_submitted",
  activated: "funnel_activated",
  payStarted: "funnel_pay_started",
  payCompleted: "funnel_pay_completed",
} as const;
