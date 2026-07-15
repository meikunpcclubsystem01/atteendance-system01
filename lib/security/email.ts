const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!EMAIL_PATTERN.test(trimmed) || trimmed.length > 255) return null;

  const at = trimmed.lastIndexOf("@");
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase().replace(/\.$/, "");
  if (!local || !domain) return null;

  return `${local}@${domain}`;
}

export function isSchoolMailbox(email: string, allowedDomain: string): boolean {
  const normalized = normalizeEmail(email);
  const domain = allowedDomain.trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "");
  return normalized?.slice(normalized.lastIndexOf("@") + 1) === domain;
}
