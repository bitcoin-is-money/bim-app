/**
 * Replace the password component of a URL with `***`.
 * If the input is not a valid URL, returns `***` to avoid leaking anything.
 */
export function redactUrl(url: string | undefined): string {
  if (url === undefined) {
    return 'undefined';
  }
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '***';
  }
}
