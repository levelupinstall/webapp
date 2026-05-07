/** Date-specific availability overrides for carpenter scheduling (client-safe types). */
export type CarpenterCalendarDay = {
  /** Local calendar date YYYY-MM-DD */
  date: string;
  status: "available" | "unavailable";
  /** HH:mm (24h); used when status is available */
  startTime: string;
  endTime: string;
};
