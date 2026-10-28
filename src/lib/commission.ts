import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentSlabs, commissionSlabs, earnings } from "@/db/schema";

// Exactly 5 tiers: 0–15, 16–30, 31–50, 51–75, 75+
export const TIER_BOUNDS = [
  { min: 0, max: 15, label: "Tier 1 (0 – 15 Closes)" },
  { min: 16, max: 30, label: "Tier 2 (16 – 30 Closes)" },
  { min: 31, max: 50, label: "Tier 3 (31 – 50 Closes)" },
  { min: 51, max: 75, label: "Tier 4 (51 – 75 Closes)" },
  { min: 76, max: null as number | null, label: "Tier 5 (75+ Closes)" },
];

export function tierIndexForCloses(closes: number): number {
  for (let i = 0; i < TIER_BOUNDS.length; i++) {
    const t = TIER_BOUNDS[i];
    if (closes >= t.min && (t.max === null || closes <= t.max)) return i;
  }
  return TIER_BOUNDS.length - 1;
}

/** Global default slab amounts (5 tiers) from the commission_slabs table. */
export async function globalSlabAmounts(): Promise<number[]> {
  const slabs = await db.select().from(commissionSlabs).orderBy(asc(commissionSlabs.minCloses));
  const amounts = TIER_BOUNDS.map((_, i) => slabs[i]?.amount ?? slabs[slabs.length - 1]?.amount ?? 0);
  return amounts;
}

/**
 * Effective 5-tier rates for an agent:
 * per-agent rows in agent_slabs override the global table tier-by-tier.
 */
export async function effectiveSlabsForAgent(agentId: string): Promise<{ amounts: number[]; custom: boolean[] }> {
  const globals = await globalSlabAmounts();
  const rows = await db.select().from(agentSlabs).where(eq(agentSlabs.userId, agentId));
  const customByTier = new Map(rows.map((r) => [r.tier, r.amount]));
  return {
    amounts: globals.map((g, i) => customByTier.get(i + 1) ?? g),
    custom: globals.map((_, i) => customByTier.has(i + 1)),
  };
}

/** Per-close commission for an agent based on their effective tier rates. */
export async function slabAmountForCloses(closes: number, agentId?: string): Promise<number> {
  const idx = tierIndexForCloses(closes);
  if (agentId) {
    const { amounts } = await effectiveSlabsForAgent(agentId);
    return amounts[idx] ?? 0;
  }
  const globals = await globalSlabAmounts();
  return globals[idx] ?? 0;
}

/** Number of approved deal closes for an agent (BONUS rows excluded). */
export async function closesForAgent(agentId: string): Promise<number> {
  const [{ closes }] = await db
    .select({ closes: count() })
    .from(earnings)
    .where(and(eq(earnings.agentId, agentId), eq(earnings.kind, "COMMISSION")));
  return Number(closes);
}
