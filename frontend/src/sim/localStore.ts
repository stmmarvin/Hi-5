// Lokale kopie voor als de server wegvalt: wie ingelogd was, de kentekenlijst en de passages die nog naar de
// server moeten. Zo werkt de slagboom door, ook als de pagina tijdens de storing opnieuw wordt geladen.
// Uitloggen wist de kopie.
import type { Permit, SyncItem, User } from '../types';

const KEY = 'groene-weide-lokaal';

export interface LocalCopy {
  user: User;
  permits: Permit[];
  queue: SyncItem[];
}

export function loadLocal(): LocalCopy | null {
  try {
    const copy = JSON.parse(localStorage.getItem(KEY) ?? 'null') as LocalCopy | null;
    return copy?.user && Array.isArray(copy.permits) ? { ...copy, queue: copy.queue ?? [] } : null;
  } catch {
    return null;
  }
}

export function saveLocal(change: Partial<LocalCopy>) {
  try {
    const merged = { ...loadLocal(), ...change };
    if (merged.user && merged.permits) localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* geen opslag beschikbaar: de slagboom werkt door zolang de pagina open blijft */
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* niets te wissen */
  }
}
