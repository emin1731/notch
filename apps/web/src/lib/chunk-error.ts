/** A page's code that can't be loaded: usually a new version was deployed since this tab opened. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(
    message,
  );
}
