/**
 * Extracts a human-readable message from an unknown thrown value.
 *
 * Handles the three common shapes:
 * - `Error` instances  -> `.message`
 * - plain strings      -> as-is
 * - everything else    -> JSON representation (avoids the `[object Object]`
 *   trap of `String()`)
 */
export function serializeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    // JSON.stringify returns undefined (not a string) for undefined/functions/symbols.
    // TypeScript types it as string, but the runtime disagrees — cast to preserve the guard.
    const json = JSON.stringify(err) as string | undefined;
    if (json !== undefined) return json;
  } catch {
    // JSON.stringify throws on circular references
  }
  return String(err);
}
