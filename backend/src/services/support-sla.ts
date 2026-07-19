/**
 * First-response targets for support tickets.
 *
 * These are a policy the platform chooses, not a measurement, so they live in
 * one readable place rather than being scattered through queries. The console
 * shows time remaining against them; changing a number here changes what the
 * console promises, which is the point.
 *
 * The target applies to the *first* operator response. Once a ticket has been
 * answered it is no longer counted against this clock — subsequent replies are
 * measured by resolution, which is a different question.
 */

const BASE_MINUTES: Record<string, number> = {
  urgent: 30,
  high: 120,
  normal: 480,
  low: 1440,
};

/**
 * Plan weighting. Enterprise customers pay for a faster answer; free accounts
 * are answered on a best-effort basis and the target says so rather than
 * quietly holding the same promise.
 */
const PLAN_MULTIPLIER: Record<string, number> = {
  enterprise: 0.5,
  pro: 1,
  free: 2,
};

export function targetMinutes(priority: string, plan: string | null): number {
  const base = BASE_MINUTES[priority] ?? BASE_MINUTES.normal!;
  const multiplier = PLAN_MULTIPLIER[plan ?? "free"] ?? 1;
  return Math.round(base * multiplier);
}

export interface SlaState {
  /** Minutes left before the first-response target is missed. Negative when overdue. */
  remainingMinutes: number;
  /** True once an operator has responded, whatever the elapsed time was. */
  met: boolean;
  targetMinutes: number;
}

export function firstResponseSla(ticket: {
  priority: string;
  plan: string | null;
  createdAt: Date | string;
  firstResponseAt: Date | string | null;
  status: string;
}, now = new Date()): SlaState {
  const target = targetMinutes(ticket.priority, ticket.plan);
  const created = new Date(ticket.createdAt).getTime();

  if (ticket.firstResponseAt) {
    const elapsed = (new Date(ticket.firstResponseAt).getTime() - created) / 60_000;
    return { remainingMinutes: Math.round(target - elapsed), met: elapsed <= target, targetMinutes: target };
  }

  // A ticket closed without an operator reply has no first-response clock left
  // to run; treating it as perpetually overdue would distort attainment.
  if (ticket.status === "resolved" || ticket.status === "closed") {
    return { remainingMinutes: 0, met: false, targetMinutes: target };
  }

  const elapsed = (now.getTime() - created) / 60_000;
  return { remainingMinutes: Math.round(target - elapsed), met: false, targetMinutes: target };
}
