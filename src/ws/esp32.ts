// 設定の REST クライアント。
// smabo-brain（/brain/info の relay: true）には、brain の /devices/esp32/…・
// /devices/app/… に送り、brain が機器へ転送する（setGateway）。ペアリングを使う brain
// （--pairing）では Bearer token も付ける。ペアリング済みの機器は brain 以外からの要求を断る。
// smabo-brain-ros（relay なし）では、従来どおり機器の HTTP API を直接叩く。
//   ESP32（port 80）:
//     GET  /config          → 全 config
//     POST /config {patch}  → config パッチ適用（ピン変更時は ESP32 再起動）
//     POST /mode   {modes}  → サブシステムの有効/無効
//   スマホ（smabo-app / smabo-sim、port 8081）:
//     GET  /config          → 設定全体
//     POST /config {patch}  → 一部だけ変更。{"ok": true, "ignored": [...]} を返す
//     /face/...             → 表情（ExpressionEditor.tsx）

type ConfigObj = Record<string, unknown>;

/** Send through the brain: its /devices/<role> base URL and our token. */
export interface Gateway { base: string; token: string | null }

/** The device's error text ({error, message} from the device or the brain's relay). */
async function failure(r: Response, what: string): Promise<Error> {
  const j = await r.json().catch(() => ({})) as { error?: string; message?: string };
  return new Error(j.message || j.error || `${what} ${r.status}`);
}

class ConfigClient {
  constructor(private readonly name: string) {}

  private host = '';
  private gateway: Gateway | null = null;

  setHost(h: string): void {
    this.host = h;
  }

  setGateway(g: Gateway | null): void {
    this.gateway = g;
  }

  get viaBrain(): boolean {
    return this.gateway !== null;
  }

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
    if (this.gateway?.token) h['Authorization'] = `Bearer ${this.gateway.token}`;
    return h;
  }

  /** host を正規化したベース URL（"ip" / "ip:port" / "http://ip" を許容） */
  private base(): string {
    if (this.gateway) return this.gateway.base.replace(/\/+$/, '');
    let h = this.host.trim();
    if (!h) throw new Error(`${this.name} host not set`);
    if (!/^https?:\/\//.test(h)) h = `http://${h}`;
    return h.replace(/\/+$/, '');
  }

  async getConfig(): Promise<ConfigObj> {
    const r = await fetch(`${this.base()}/config`, { headers: this.headers() });
    if (!r.ok) throw await failure(r, 'GET /config');
    return r.json() as Promise<ConfigObj>;
  }

  /** GET /config への到達性を確認し、往復時間 (ms) を返す。到達不可なら throw。 */
  async ping(): Promise<number> {
    const t0 = performance.now();
    const r = await fetch(`${this.base()}/config`, { cache: 'no-store', headers: this.headers() });
    if (!r.ok) throw await failure(r, 'GET /config');
    return Math.round(performance.now() - t0);
  }

  /** POST /config. Resolves to the answer's `ignored` paths (the phone lists them; the ESP32 doesn't). */
  async setConfig(patch: ConfigObj): Promise<string[]> {
    const r = await fetch(`${this.base()}/config`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw await failure(r, 'POST /config');
    const body = await r.json().catch(() => ({})) as { ignored?: unknown };
    return Array.isArray(body.ignored) ? body.ignored.map(String) : [];
  }

  /** The full URL of a path on the device (e.g. an image for <img src>), or '' without a host. */
  url(path: string): string {
    try { return `${this.base()}${path}`; } catch { return ''; }
  }

  /** A URL an <img> can show. Through the brain the request needs our token,
   *  so the image is fetched here and handed over as a blob: URL (revoke it). */
  async imageUrl(path: string): Promise<string> {
    if (!this.gateway) return this.url(path);
    const r = await fetch(`${this.base()}${path}`, { cache: 'no-store', headers: this.headers() });
    if (!r.ok) throw await failure(r, `GET ${path}`);
    return URL.createObjectURL(await r.blob());
  }

  /** Any JSON endpoint on the device (the phone's /face/...). Throws with the device's error message. */
  async request<T = unknown>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const r = await fetch(`${this.base()}${path}`, {
      method,
      cache: 'no-store',
      headers: this.headers(body !== undefined),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const j = await r.json().catch(() => ({})) as { error?: string; message?: string };
    if (!r.ok) throw new Error(j.message || j.error || `${method} ${path} ${r.status}`);
    return j as T;
  }

  async setMode(modes: ConfigObj): Promise<void> {
    const r = await fetch(`${this.base()}/mode`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(modes),
    });
    if (!r.ok) throw await failure(r, 'POST /mode');
  }
}

export const esp32 = new ConfigClient('ESP32');
export const phone = new ConfigClient('phone');
