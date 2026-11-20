export function isEvidenceUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || !/^https?:\/\//i.test(value.trim())) return false;
  try {
    const url = new URL(value.trim());
    return !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}
