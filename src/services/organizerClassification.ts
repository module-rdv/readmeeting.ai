export type OrganizerDomainClassification = 'internal' | 'external' | 'unknown';

export function normalizeEmailAddress(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

export function classifyOrganizerDomain(
  organizerEmail: string | null | undefined
): OrganizerDomainClassification {
  const normalizedEmail = normalizeEmailAddress(organizerEmail);
  if (!normalizedEmail) return 'unknown';

  const domainSeparator = normalizedEmail.lastIndexOf('@');
  const domain = domainSeparator >= 0 ? normalizedEmail.slice(domainSeparator + 1) : '';
  return domain === 'dgf.ci' ? 'internal' : 'external';
}

export function isOrganizerIdentity(
  organizerEmail: string | null | undefined,
  userEmails: Array<string | null | undefined>
): boolean {
  const normalizedOrganizerEmail = normalizeEmailAddress(organizerEmail);
  return Boolean(
    normalizedOrganizerEmail &&
    userEmails.some((email) => normalizeEmailAddress(email) === normalizedOrganizerEmail)
  );
}
