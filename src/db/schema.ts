import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Users & Roles ────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("AGENT"), // ADMIN | HR | MANAGER | AGENT
  phone: text("phone"),
  altPhone: text("alt_phone"),
  guardianPhone: text("guardian_phone"),
  qualification: text("qualification"),
  aboutNote: text("about_note"), // staff-written "About Person" summary
  badges: text("badges"), // comma-separated e.g. "Star Caller,Top Closer"
  avatarUrl: text("avatar_url"), // auto-set from passport-size KYC photo
  upiId: text("upi_id"),
  bankAccount: text("bank_account"),
  ifsc: text("ifsc"),
  paymentDetailsStatus: text("payment_details_status").notNull().default("NONE"), // NONE | SUBMITTED | APPROVED
  dailyLeadQuota: integer("daily_lead_quota"), // manual daily auto-assign limit (leads/day)
  walletTotal: integer("wallet_total").notNull().default(0),
  walletPending: integer("wallet_pending").notNull().default(0),
  walletApproved: integer("wallet_approved").notNull().default(0),
  online: boolean("online").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Niches ───────────────────────────────────────────────────────
export const niches = pgTable("niches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  icon: text("icon").notNull().default("📁"),
  visibleToAgents: boolean("visible_to_agents").notNull().default(true), // hidden niches vanish from agent sidebar + workspace
});

// ─── Leads (up to 1M rows — indexed for pagination) ───────────────
export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    nicheId: integer("niche_id").notNull(),
    leadCode: text("lead_code"), // Lead Serial Number e.g. LD-0000123
    cityKeyword: text("city_keyword"), // e.g. "dentist mumbai"
    gmapLink: text("gmap_link"), // Google Maps URL
    businessName: text("business_name").notNull(),
    contactName: text("contact_name"),
    phone: text("phone").notNull(),
    phoneNormalized: text("phone_normalized"), // +919876543210
    city: text("city"),
    rating: doublePrecision("rating").notNull().default(0),
    reviewsCount: integer("reviews_count").notNull().default(0),
    competitorReviews: integer("competitor_reviews").notNull().default(0),
    opensAt: text("opens_at"), // Business working hours
    websiteStatus: text("website_status"), // ACTIVE | BROKEN | NONE
    websiteUrl: text("website_url"),
    serviceStatus: text("service_status"), // VERIFIED | UNCLAIMED
    callStatus: text("call_status"), // Call outcome e.g. CONNECTED | NO_ANSWER | BUSY | WRONG_NUMBER
    status: text("status").notNull().default("NEW"), // NEW | IN_PROGRESS | CALLBACK | NO_RESPONSE | PAYMENT_PENDING | REJECTED | APPROVED
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    unlocked: boolean("unlocked").notNull().default(false),
    historyUnlocked: boolean("history_unlocked").notNull().default(false), // per-lead history access granted to agent
    archived: boolean("archived").notNull().default(false),
    recycled: boolean("recycled").notNull().default(false),
    dealAmount: integer("deal_amount"),
    callbackAt: timestamp("callback_at"), // scheduled callback date & time
    assignedAt: timestamp("assigned_at"),
    lastActivityAt: timestamp("last_activity_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("leads_assigned_status_idx").on(t.assignedTo, t.status),
    index("leads_niche_status_idx").on(t.nicheId, t.status),
    index("leads_status_idx").on(t.status),
  ]
);

// ─── Call notes / audit history on a lead ─────────────────────────
export const leadNotes = pgTable(
  "lead_notes",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id").notNull(),
    agentId: uuid("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    note: text("note").notNull(),
    status: text("status"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("lead_notes_lead_idx").on(t.leadId)]
);

export const callLogs = pgTable(
  "call_logs",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id").notNull(),
    agentId: uuid("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
    durationSec: integer("duration_sec").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("call_logs_lead_idx").on(t.leadId)]
);

// ─── WhatsApp message templates ───────────────────────────────────
export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  nicheId: integer("niche_id"), // null = global
  name: text("name").notNull(),
  body: text("body").notNull(),
});

// ─── Uploads (payment proofs, KYC docs) ───────────────────────────
export const uploads = pgTable(
  "uploads",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id"),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("proof"), // proof | kyc_aadhaar | kyc_marksheet | kyc_photo | kyc_pan
    fileName: text("file_name"),
    url: text("url").notNull(),
    status: text("status").notNull().default("PENDING"), // PENDING | APPROVED | REJECTED (KYC review)
    rejectionNote: text("rejection_note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("uploads_lead_idx").on(t.leadId), index("uploads_user_idx").on(t.userId)]
);

// ─── Deal approvals (commission on closed deals) ──────────────────
export const deals = pgTable("deals", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  agentId: uuid("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  commission: integer("commission").notNull().default(0),
  screenshotUrl: text("screenshot_url"),
  note: text("note"), // optional agent note alongside the proof
  rejectionNote: text("rejection_note"), // staff comments when proof is rejected
  status: text("status").notNull().default("PENDING"), // PENDING | APPROVED | REJECTED
  createdAt: timestamp("created_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
});

// ─── Wallet withdrawal requests ───────────────────────────────────
export const withdrawals = pgTable("withdrawals", {
  id: serial("id").primaryKey(),
  agentId: uuid("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("PENDING"),
  proofUrl: text("proof_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
});

// ─── Correction requests (agent made a mistake) ───────────────────
export const corrections = pgTable("corrections", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  agentId: uuid("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  requestedStatus: text("requested_status"),
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
});

// ─── Lead requests (agent finished daily leads) ───────────────────
export const leadRequests = pgTable("lead_requests", {
  id: serial("id").primaryKey(),
  agentId: uuid("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  leadId: integer("lead_id"), // set for REPLACE / HISTORY requests
  type: text("type").notNull().default("NEW"), // NEW | REPLACE | HISTORY
  note: text("note"), // reason for replacement / history access
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
});

// ─── Lead error reports (agent → management review) ──────────────
export const leadErrors = pgTable("lead_errors", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  agentId: uuid("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  issue: text("issue").notNull(),
  status: text("status").notNull().default("OPEN"), // OPEN | RESOLVED | DISMISSED
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

// ─── Help desk tickets (complaints / requests) ────────────────────
export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  ticketNo: text("ticket_no").notNull().unique(), // e.g. TKT-84920
  agentId: uuid("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  category: text("category").notNull(), // ACCESS_ISSUE | DATA_CORRECTION | PAYOUT_QUERY | LEAD_ISSUE | OTHER
  details: text("details").notNull(),
  attachmentUrl: text("attachment_url"),
  status: text("status").notNull().default("OPEN"), // OPEN | IN_PROGRESS | RESOLVED | CLOSED
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticket_id").notNull(),
    senderId: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("ticket_msg_idx").on(t.ticketId)]
);

// ─── Banner / popup broadcasts with mandatory acknowledgment ──────
export const banners = pgTable("banners", {
  id: serial("id").primaryKey(),
  senderId: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  imageUrl: text("image_url"), // optional Text + Image broadcast
  targetAgentId: uuid("target_agent_id").references(() => users.id, { onDelete: "set null" }), // null = All Agents
  requireAck: boolean("require_ack").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bannerAcks = pgTable(
  "banner_acks",
  {
    id: serial("id").primaryKey(),
    bannerId: integer("banner_id").notNull(),
    agentId: uuid("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    response: text("response"), // agent's typed reply (optional)
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("banner_ack_idx").on(t.bannerId, t.agentId)]
);

// ─── Automated agent alerts (management decision popups) ──────────
export const agentAlerts = pgTable(
  "agent_alerts",
  {
    id: serial("id").primaryKey(),
    agentId: uuid("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // DEAL | PAYOUT | CORRECTION | LEAD_REQUEST | LEAD_ERROR | TICKET | KYC
    title: text("title").notNull(),
    body: text("body").notNull(),
    decision: text("decision"), // APPROVED | REJECTED | RESOLVED | ...
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("agent_alerts_idx").on(t.agentId, t.read)]
);

// ─── App-wide settings (key-value, admin/HR managed) ──────────────
export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // e.g. show_history_to_agent
  value: text("value").notNull(),
});

// ─── Earnings ledger (per closed deal) ────────────────────────────
export const earnings = pgTable(
  "earnings",
  {
    id: serial("id").primaryKey(),
    agentId: uuid("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("COMMISSION"), // COMMISSION | BONUS
    status: text("status").notNull().default("APPROVED"), // PENDING | APPROVED (staff-controlled)
    leadId: integer("lead_id").notNull(),
    leadName: text("lead_name"),
    businessName: text("business_name").notNull(),
    amount: integer("amount").notNull(),
    approvedAt: timestamp("approved_at").notNull().defaultNow(),
  },
  (t) => [index("earnings_agent_idx").on(t.agentId)]
);

// ─── Audit trail ──────────────────────────────────────────────────
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    leadId: integer("lead_id"),
    action: text("action").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_user_idx").on(t.userId), index("audit_lead_idx").on(t.leadId)]
);

// ─── Direct chat ──────────────────────────────────────────────────
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    fromId: uuid("from_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    toId: uuid("to_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("chat_pair_idx").on(t.fromId, t.toId)]
);

// ─── Push notification broadcasts ─────────────────────────────────
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  senderId: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  targetRole: text("target_role").notNull().default("AGENT"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Dynamic RBAC field visibility (admin-managed) ────────────────
export const fieldPermissions = pgTable(
  "field_permissions",
  {
    id: serial("id").primaryKey(),
    fieldKey: text("field_key").notNull(), // one of the 14 lead field keys
    role: text("role").notNull(), // ADMIN | HR | MANAGER | AGENT
    visibility: text("visibility").notNull().default("VISIBLE"), // VISIBLE | MASKED | HIDDEN
  },
  (t) => [uniqueIndex("field_perm_key_role_idx").on(t.fieldKey, t.role)]
);

// ─── Tiered commission slabs (admin/HR/manager configurable) ──────
export const commissionSlabs = pgTable("commission_slabs", {
  id: serial("id").primaryKey(),
  minCloses: integer("min_closes").notNull(), // slab lower bound (inclusive)
  maxCloses: integer("max_closes"), // null = open-ended (50+)
  amount: integer("amount").notNull(), // ₹ per close in this slab
});

// ─── Per-agent custom slab overrides (normalized) ─────────────────
export const agentSlabs = pgTable(
  "agent_slabs",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tier: integer("tier").notNull(), // 1..5 (0–15 / 16–30 / 31–50 / 51–75 / 75+)
    amount: integer("amount").notNull(), // custom ₹ per close for this agent+tier
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_slabs_user_tier_idx").on(t.userId, t.tier)]
);

// ─── Daily activity & performance snapshots per agent ─────────────
export const agentDailyStats = pgTable(
  "agent_daily_stats",
  {
    id: serial("id").primaryKey(),
    agentId: uuid("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    day: text("day").notNull(), // YYYY-MM-DD
    touchedLeads: integer("touched_leads").notNull().default(0),
    statusChanges: integer("status_changes").notNull().default(0),
    dealsClosed: integer("deals_closed").notNull().default(0),
  },
  (t) => [uniqueIndex("daily_stats_agent_day_idx").on(t.agentId, t.day)]
);

// ─── Active time tracking (Page Visibility API sync) ──────────────
export const timeTracks = pgTable(
  "time_tracks",
  {
    id: serial("id").primaryKey(),
    agentId: uuid("agent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    day: text("day").notNull(), // YYYY-MM-DD
    seconds: integer("seconds").notNull().default(0),
  },
  (t) => [uniqueIndex("time_agent_day_idx").on(t.agentId, t.day)]
);
