export type OrderResult =
  { ok: true; ids: string[] } | { ok: false; reason: 'unknown-id' | 'incomplete' };

/**
 * The new order after a reorder request. `current` is every id in its current order.
 * - not exact: the requested ids come first, the others keep their relative order after them
 * - exact: the request must list every id exactly once
 * Duplicate ids are rejected earlier, by `idsOrderSchema`.
 */
export function applyOrder(
  current: readonly string[],
  requested: readonly string[],
  { exact }: { exact: boolean },
): OrderResult {
  const known = new Set(current);
  if (requested.some((id) => !known.has(id))) {
    return { ok: false, reason: 'unknown-id' };
  }
  if (exact && requested.length !== current.length) {
    return { ok: false, reason: 'incomplete' };
  }
  const listed = new Set(requested);
  return { ok: true, ids: [...requested, ...current.filter((id) => !listed.has(id))] };
}
