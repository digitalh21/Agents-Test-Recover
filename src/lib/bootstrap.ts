import { count } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, commissionSlabs, niches, users } from "@/db/schema";

const g = globalThis as typeof globalThis & { __agsBootstrapped?: boolean };

/**
 * First-run initialization for a fresh (empty) Supabase/PostgreSQL database.
 * Creates required system defaults ONLY when tables are empty — never demo leads:
 *  - a default ADMIN account (so the login screen is usable)
 *  - the 5 global commission slab tiers
 *  - one default niche category
 *  - default app settings
 * With an already-populated database this is a no-op.
 */
export async function ensureBootstrap(): Promise<void> {
  if (g.__agsBootstrapped) return;
  try {
    const [{ n: userCount }] = await db.select({ n: count() }).from(users);
    if (Number(userCount) === 0) {
      // Seed default RBAC accounts using UUID generation
      await db.insert(users).values([
        {
          name: "Arjun Mehta",
          email: "admin@autogrowthsystems.com",
          role: "ADMIN",
          phone: "9800000001",
          badges: "Star Caller,Top Closer",
          aboutNote: "Enterprise Director at Auto Growth Systems.",
          online: false,
        },
        {
          name: "Priya Sharma",
          email: "hr@autogrowthsystems.com",
          role: "HR",
          phone: "9800000002",
          online: false,
        },
        {
          name: "Rohit Verma",
          email: "manager@autogrowthsystems.com",
          role: "MANAGER",
          phone: "9800000003",
          online: false,
        },
        {
          name: "Sneha Patel",
          email: "sneha.agent@autogrowthsystems.com",
          role: "AGENT",
          phone: "9800000011",
          badges: "Star Caller,Top Closer",
          aboutNote: "Consistent closer with excellent Hindi & English. Strongest in the dentist niche.",
          qualification: "Graduate",
          online: false,
        },
        {
          name: "Vikram Singh",
          email: "vikram.agent@autogrowthsystems.com",
          role: "AGENT",
          phone: "9800000012",
          badges: "Rising Star",
          qualification: "12th Pass",
          online: false,
        },
        {
          name: "Anita Rao",
          email: "anita.agent@autogrowthsystems.com",
          role: "AGENT",
          phone: "9800000013",
          online: false,
        },
      ]);
    }

    const [{ n: slabCount }] = await db.select({ n: count() }).from(commissionSlabs);
    if (Number(slabCount) === 0) {
      await db.insert(commissionSlabs).values([
        { minCloses: 0, maxCloses: 15, amount: 500 },
        { minCloses: 16, maxCloses: 30, amount: 750 },
        { minCloses: 31, maxCloses: 50, amount: 1000 },
        { minCloses: 51, maxCloses: 75, amount: 1250 },
        { minCloses: 76, maxCloses: null, amount: 1500 },
      ]);
    }

    const [{ n: nicheCount }] = await db.select({ n: count() }).from(niches);
    if (Number(nicheCount) === 0) {
      await db.insert(niches).values([
        { name: "Real Estate", slug: "real-estate", icon: "🏠", visibleToAgents: true },
        { name: "Dentists", slug: "dentists", icon: "🦷", visibleToAgents: true },
        { name: "E-Commerce", slug: "e-commerce", icon: "🛒", visibleToAgents: true },
        { name: "Restaurants", slug: "restaurants", icon: "🍽️", visibleToAgents: true },
        { name: "Gyms & Fitness", slug: "gyms", icon: "💪", visibleToAgents: true },
      ]);
    }

    const [{ n: settingCount }] = await db.select({ n: count() }).from(appSettings);
    if (Number(settingCount) === 0) {
      await db.insert(appSettings).values({ key: "show_history_to_agent", value: "false" });
    }

    g.__agsBootstrapped = true;
  } catch (e) {
    console.error("Bootstrap error:", e);
    // table might not exist yet (migrations pending) — retry on next request
  }
}
