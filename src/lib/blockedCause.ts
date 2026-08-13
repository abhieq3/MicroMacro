/**
 * A blocked task without a named cause is theater. The board must say
 * why — vendor, QA, missing spec — not just "Blocked".
 *
 * Pure, so the contract can be pinned without a database.
 */

export function namedBlockedCause(pendingWith?: string | null): string {
  return (pendingWith || '').trim();
}

/** True when this status change would leave a blocked task with no cause. */
export function blockedNeedsCause(
  status?: string | null,
  pendingWith?: string | null,
): boolean {
  return status === 'blocked' && !namedBlockedCause(pendingWith);
}
