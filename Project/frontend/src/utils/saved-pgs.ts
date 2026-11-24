// Local shortlist of saved PGs keyed by the verified guest's phone number.

const KEY_PREFIX = 'livingplus_saved_pgs_';

function storageKey(phone: string): string {
  return `${KEY_PREFIX}${String(phone || '').replace(/\D/g, '').slice(-10)}`;
}

export function getSavedPgIds(phone: string): string[] {
  const key = storageKey(phone);
  if (key === KEY_PREFIX) return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function toggleSavedPg(phone: string, propertyId: string): string[] {
  const current = getSavedPgIds(phone);
  const next = current.includes(propertyId)
    ? current.filter((id) => id !== propertyId)
    : [...current, propertyId];
  const key = storageKey(phone);
  if (key !== KEY_PREFIX) {
    localStorage.setItem(key, JSON.stringify(next));
  }
  return next;
}
