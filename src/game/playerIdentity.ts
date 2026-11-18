const GUEST_ID_STORAGE_KEY = 'prism_sling_guest_id_v1';
const PLAYER_NAME_STORAGE_KEY = 'prism_sling_player_name_v1';

function generateGuestId(): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `guest_${randomPart}`;
}

export function getOrCreateGuestId(): string {
  try {
    const existing = localStorage.getItem(GUEST_ID_STORAGE_KEY);
    if (existing && /^guest_[a-zA-Z0-9_-]{8,36}$/.test(existing)) {
      return existing;
    }
    const created = generateGuestId();
    localStorage.setItem(GUEST_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return generateGuestId();
  }
}

export function getDefaultGuestCallsign(guestId: string): string {
  return `Player-${guestId.slice(-4).toUpperCase()}`;
}

export function sanitizeCallsign(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 20);
}

export function loadSavedPlayerName(): string | null {
  try {
    const raw = localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
    if (!raw) return null;
    const clean = sanitizeCallsign(raw);
    return clean.length > 0 ? clean : null;
  } catch {
    return null;
  }
}

export function savePlayerName(name: string): string {
  const clean = sanitizeCallsign(name);
  try {
    if (clean) {
      localStorage.setItem(PLAYER_NAME_STORAGE_KEY, clean);
    } else {
      localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
  return clean;
}
