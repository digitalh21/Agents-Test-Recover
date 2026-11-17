// ─── Dynamic RBAC Field Visibility Engine (client-safe) ───────────
// All 14 custom lead data fields, their labels, and masking rules.

export type Visibility = "VISIBLE" | "MASKED" | "HIDDEN";
export type VisibilityMap = Record<string, Visibility>;

export const ROLES = ["ADMIN", "HR", "MANAGER", "AGENT"] as const;
export type Role = (typeof ROLES)[number];

export const VISIBILITY_OPTIONS: Visibility[] = ["VISIBLE", "MASKED", "HIDDEN"];

export const FIELD_DEFS = [
  { key: "lead_code", label: "Lead Serial Number", icon: "🔢", hint: "lead_code" },
  { key: "city_keyword", label: "City Keyword", icon: "📍", hint: "city_keyword" },
  { key: "gmap_link", label: "Google Maps URL", icon: "🗺️", hint: "gmap_link" },
  { key: "business_name", label: "Business Title", icon: "🏢", hint: "business_name" },
  { key: "rating", label: "Google Business Rating", icon: "⭐", hint: "rating" },
  { key: "reviews_count", label: "Reviews vs Competitor", icon: "📊", hint: "reviews_count" },
  { key: "niche_category", label: "Niche / Category", icon: "🗂️", hint: "category_name" },
  { key: "opens_at", label: "Business Working Hours", icon: "🕐", hint: "opens_at" },
  { key: "phone", label: "Mobile Phone Number", icon: "📞", hint: "phone & phone_normalized" },
  { key: "website_status", label: "Website Status", icon: "🌐", hint: "website_status" },
  { key: "website_url", label: "Website URL", icon: "🔗", hint: "website_url" },
  { key: "service_status", label: "Service Status", icon: "🛡️", hint: "service_status" },
  { key: "call_status", label: "Call Outcome Status", icon: "☎️", hint: "call_status" },
  { key: "status", label: "Lead Pipeline Status", icon: "📌", hint: "status" },
] as const;

export type FieldKey = (typeof FIELD_DEFS)[number]["key"];
export const FIELD_KEYS: FieldKey[] = FIELD_DEFS.map((f) => f.key);

// field key → lead object property names affected
export const FIELD_PROPS: Record<FieldKey, string[]> = {
  lead_code: ["leadCode"],
  city_keyword: ["cityKeyword"],
  gmap_link: ["gmapLink"],
  business_name: ["businessName"],
  rating: ["rating"],
  reviews_count: ["reviewsCount", "competitorReviews"],
  niche_category: ["categoryName"],
  opens_at: ["opensAt"],
  phone: ["phone", "phoneNormalized"],
  website_status: ["websiteStatus"],
  website_url: ["websiteUrl"],
  service_status: ["serviceStatus"],
  call_status: ["callStatus"],
  status: ["status"],
};

export function maskPhoneValue(v: string): string {
  const d = v.replace(/\D/g, "");
  if (d.length < 5) return "******";
  return d.slice(0, 2) + "******" + d.slice(-2);
}

/** Produce the partially-masked display value for a field. */
export function maskValue(key: FieldKey, prop: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  switch (key) {
    case "phone":
      return prop === "phoneNormalized"
        ? "+91 " + maskPhoneValue(String(value))
        : maskPhoneValue(String(value));
    case "rating":
      return "•.•";
    case "reviews_count":
      return "•••";
    case "gmap_link":
    case "website_url":
      return "https://••••••••";
    case "lead_code":
      return "LD-•••••";
    case "status":
    case "call_status":
    case "website_status":
    case "service_status":
      return "••••";
    default: {
      const s = String(value);
      return s.length > 1 ? s[0] + "•••••" : "••••";
    }
  }
}

/**
 * Apply the role's visibility map to a lead object (server-side).
 * HIDDEN → value stripped to null. MASKED → partially masked string.
 */
export function applyFieldVisibility(
  lead: Record<string, unknown>,
  map: VisibilityMap,
  opts?: { forceMaskPhone?: boolean }
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...lead };
  for (const def of FIELD_DEFS) {
    const vis = map[def.key] ?? "VISIBLE";
    for (const prop of FIELD_PROPS[def.key]) {
      if (!(prop in out)) continue;
      if (vis === "HIDDEN") out[prop] = null;
      else if (vis === "MASKED") out[prop] = maskValue(def.key, prop, out[prop]);
    }
  }
  if (opts?.forceMaskPhone && (map["phone"] ?? "VISIBLE") === "VISIBLE") {
    if (typeof out.phone === "string") out.phone = maskPhoneValue(out.phone);
    if (typeof out.phoneNormalized === "string") out.phoneNormalized = "+91 " + maskPhoneValue(String(lead.phone ?? ""));
  }
  return out;
}

/** Safe display of possibly-masked numeric fields. */
export function ratingText(v: unknown): string {
  if (typeof v === "number") return v.toFixed(1);
  if (typeof v === "string" && v) return v;
  return "—";
}

export function numText(v: unknown): string {
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "string" && v) return v;
  return "—";
}
