/**
 * The new order after a reorder request, or null when it names an unknown id. `current` is every
 * id in its current order; the requested ids come first, the others keep their relative order
 * after them. Duplicate ids are rejected earlier, by `idsOrderSchema`.
 */
export function applyOrder(
  current: readonly string[],
  requested: readonly string[],
): string[] | null {
  const known = new Set(current);
  if (requested.some((id) => !known.has(id))) {
    return null;
  }
  const listed = new Set(requested);
  return [...requested, ...current.filter((id) => !listed.has(id))];
}
