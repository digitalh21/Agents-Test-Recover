export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const LEAD_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "CALLBACK",
  "NO_RESPONSE",
  "PAYMENT_PENDING",
  "REJECTED",
  "LOST",
  "APPROVED",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  IN_PROGRESS: "In Process",
  CALLBACK: "Call back",
  NO_RESPONSE: "No Response",
  PAYMENT_PENDING: "Payment Approval",
  REJECTED: "Reject/Not Interest",
  LOST: "Lost / Returned to Pool",
  APPROVED: "Closed Won",
};

export const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-slate-100 text-slate-700 border-slate-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
  CALLBACK: "bg-amber-50 text-amber-700 border-amber-200",
  NO_RESPONSE: "bg-orange-50 text-orange-700 border-orange-200",
  PAYMENT_PENDING: "bg-violet-50 text-violet-700 border-violet-200",
  REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
  LOST: "bg-zinc-100 text-zinc-600 border-zinc-300",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

// ─── Pipedrive-style Kanban pipeline stages (exact order) ─────────
// "UNASSIGNED" is a virtual stage (assigned_to IS NULL); others map to lead.status.
export const KANBAN_COLUMNS: { key: string; label: string; staffOnly?: boolean; accent: string }[] = [
  { key: "UNASSIGNED", label: "Pool", accent: "bg-slate-200 text-slate-700 border-slate-300" },
  { key: "NEW", label: "New", accent: STATUS_COLORS.NEW },
  { key: "IN_PROGRESS", label: "In Process", accent: STATUS_COLORS.IN_PROGRESS },
  { key: "CALLBACK", label: "Call back", accent: STATUS_COLORS.CALLBACK },
  { key: "NO_RESPONSE", label: "No Response", accent: STATUS_COLORS.NO_RESPONSE },
  { key: "REJECTED", label: "Reject/Not Interest", accent: STATUS_COLORS.REJECTED },
  { key: "PAYMENT_PENDING", label: "Payment Approval", accent: STATUS_COLORS.PAYMENT_PENDING },
  { key: "LOST", label: "Lost / Returned to Pool", staffOnly: true, accent: STATUS_COLORS.LOST },
  { key: "APPROVED", label: "Closed Won", staffOnly: true, accent: STATUS_COLORS.APPROVED },
];

/** Relative time e.g. "4h ago", "10d ago", "just now" */
export function relTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 0) return "just now";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const mo = Math.floor(days / 30);
  return `${mo}mo ago`;
}

export const PAGE_SIZE = 500;

export function inr(n: number | null | undefined) {
  return "₹" + Number(n ?? 0).toLocaleString("en-IN");
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function maskPhone(p: string) {
  return p.length > 4 ? p.slice(0, 2) + "•••••" + p.slice(-3) : "•••••";
}

export function fillTemplate(body: string, lead: Record<string, unknown>, agentName?: string) {
  const s = (v: unknown, fallback = "") => (v === null || v === undefined || v === "" ? fallback : String(v));
  return body
    .replaceAll("{business_name}", s(lead.businessName))
    .replaceAll("{contact_name}", s(lead.contactName, "there"))
    .replaceAll("{reviews_count}", s(lead.reviewsCount, "0"))
    .replaceAll("{competitor_reviews}", s(lead.competitorReviews, "0"))
    .replaceAll("{rating}", s(lead.rating, "0"))
    .replaceAll("{city}", s(lead.city, "your city"))
    .replaceAll("{agent_name}", agentName ?? "Team");
}
