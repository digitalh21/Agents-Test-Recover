import { db } from "@/db";
import { agentAlerts } from "@/db/schema";

/**
 * Automated management-response alert: fires whenever Admin/HR/Manager
 * approves/rejects an agent request. Surfaces as a dedicated popup modal
 * on the agent's screen on login / while active.
 */
export async function notifyAgent(opts: {
  agentId: string;
  kind: string;
  title: string;
  body: string;
  decision?: string;
}) {
  if (!opts.agentId) return;
  await db.insert(agentAlerts).values({
    agentId: opts.agentId,
    kind: opts.kind,
    title: opts.title.slice(0, 150),
    body: opts.body.slice(0, 1000),
    decision: opts.decision ?? null,
  });
}
