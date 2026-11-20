import type { NewPermit, PassageRow, Permit, PresenceRow, ScanResult, SyncItem, User } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    // Geen antwoord binnen 8 seconden telt als storing: de slagboom werkt dan lokaal door.
    signal: AbortSignal.timeout(8000),
    ...init,
    headers: {
      'Content-Type': 'application/json',
      // Verplichte header voor wijzigende verzoeken (bescherming tegen CSRF).
      'X-Requested-With': 'groene-weide',
      ...init.headers,
    },
  });
  if (!response.ok) {
    let message = `De server gaf een fout (${response.status}).`;
    try {
      const body = await response.json();
      if (typeof body.detail === 'string') message = body.detail;
      else if (Array.isArray(body.detail) && body.detail[0]?.msg) message = String(body.detail[0].msg).replace(/^Value error, /, '');
    } catch {
      /* geen JSON in het antwoord */
    }
    throw new ApiError(response.status, message);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  me: () => request<User>('/auth/me'),
  login: (username: string, password: string) => post<User>('/auth/login', { username, password }),
  logout: () => post<void>('/auth/logout'),

  permits: () => request<Permit[]>('/permits'),
  addPermit: (permit: NewPermit) => post<Permit>('/permits', permit),
  // Via POST: niet elke proxy of hosting laat DELETE-verzoeken door.
  removePermit: (id: number) => post<void>(`/permits/${id}/delete`),

  presence: () => request<PresenceRow[]>('/presence'),
  passages: (limit = 60) => request<PassageRow[]>(`/passages?limit=${limit}`),

  scan: (body: { plate: string; country: string; vehicle_type: string; siren: boolean; at: string }) =>
    post<ScanResult>('/gate/scan', body),
  decide: (passageId: number, open: boolean) => post<PassageRow>(`/gate/passages/${passageId}/decision`, { open }),
  safety: (locked: boolean, cause: string) => post<void>('/gate/safety', { locked, cause }),
  sync: (items: SyncItem[]) => post<{ synced: number }>('/gate/sync', { items }),

  reset: () => post<void>('/sim/reset'),
};
