// The brain's HTTP API for paired browsers (smabo-brain gateway.py):
// the list of paired clients, invite codes, rename and remove.
import { brain } from './brain';

export type PairRole = 'web' | 'app' | 'esp32';

export interface PairingItem {
  id: string;
  role: PairRole;
  name: string;
  created: number;
  last_seen: number;
  online: boolean;
}

export interface Invite { code: string; role: PairRole; expires_in: number }

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = brain.token;
  const r = await fetch(`http://${brain.host}${path}`, {
    method,
    cache: 'no-store',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (r.status === 204) return undefined as T;
  const j = await r.json().catch(() => ({})) as T & { error?: string; message?: string };
  if (!r.ok) throw Object.assign(new Error(j.message || j.error || `${method} ${path} ${r.status}`), { reason: j.error });
  return j;
}

export const listPairings = () => call<{ pairings: PairingItem[]; you: string | null }>('GET', '/pairings');
export const createInvite = (role: PairRole) => call<Invite>('POST', '/invites', { role });
export const renamePairing = (id: string, name: string) => call<PairingItem>('PATCH', `/pairings/${id}`, { name });
export const removePairing = (id: string) => call<void>('DELETE', `/pairings/${id}`);

/** Hand an invite to a device that is not paired yet (its REST API still answers
 *  browsers): POST {"brain": {"invite": code}} to http://<device>/config. */
export async function sendInviteToDevice(deviceUrl: string, code: string): Promise<void> {
  let base = deviceUrl.trim();
  if (!/^https?:\/\//.test(base)) base = `http://${base}`;
  const r = await fetch(`${base.replace(/\/+$/, '')}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brain: { invite: code } }),
  });
  if (r.status === 401) throw new Error('This device is already paired. Remove it from the list first, then pair it again');
  if (!r.ok) throw new Error(`The device answered ${r.status}`);
}
