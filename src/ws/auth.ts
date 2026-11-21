// This browser's token for each brain it paired with (localStorage, per host).
//
// The token is sent as the first WebSocket frame and as a Bearer header to the
// brain's HTTP API, never as a cookie, so other sites cannot use it for us.
const key = (host: string) => `smabo-web.token.${host.trim().toLowerCase()}`;

function storage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function loadToken(host: string): string | null {
  try { return storage()?.getItem(key(host)) ?? null; } catch { return null; }
}

export function saveToken(host: string, token: string): void {
  try { storage()?.setItem(key(host), token); } catch { /* private window: pair again next time */ }
}

export function clearToken(host: string): void {
  try { storage()?.removeItem(key(host)); } catch { /* ignore */ }
}

/** A default name for this browser in the brain's list ("Chrome on macOS"). */
export function browserName(): string {
  if (typeof navigator === 'undefined') return 'browser';
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} on ${os}` : b;
}
