// 設定の REST クライアント。brain を介さず、機器の HTTP API を直接叩く。
//   ESP32（port 80）:
//     GET  /config          → 全 config
//     POST /config {patch}  → config パッチ適用（ピン変更時は ESP32 再起動）
//     POST /mode   {modes}  → サブシステムの有効/無効
//   スマホ（smabo-app / smabo-sim、port 8081）:
//     GET  /config          → 設定全体
//     POST /config {patch}  → 一部だけ変更。{"ok": true, "ignored": [...]} を返す
//     /face/...             → 表情（ExpressionEditor.tsx）

type ConfigObj = Record<string, unknown>;

class ConfigClient {
  constructor(private readonly name: string) {}

  private host = '';

  setHost(h: string): void {
    this.host = h;
  }

  /** host を正規化したベース URL（"ip" / "ip:port" / "http://ip" を許容） */
  private base(): string {
    let h = this.host.trim();
    if (!h) throw new Error(`${this.name} host not set`);
    if (!/^https?:\/\//.test(h)) h = `http://${h}`;
    return h.replace(/\/+$/, '');
  }

  async getConfig(): Promise<ConfigObj> {
    const r = await fetch(`${this.base()}/config`);
    if (!r.ok) throw new Error(`GET /config ${r.status}`);
    return r.json() as Promise<ConfigObj>;
  }

  /** GET /config への到達性を確認し、往復時間 (ms) を返す。到達不可なら throw。 */
  async ping(): Promise<number> {
    const t0 = performance.now();
    const r = await fetch(`${this.base()}/config`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`GET /config ${r.status}`);
    return Math.round(performance.now() - t0);
  }

  /** POST /config. Resolves to the answer's `ignored` paths (the phone lists them; the ESP32 doesn't). */
  async setConfig(patch: ConfigObj): Promise<string[]> {
    const r = await fetch(`${this.base()}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(`POST /config ${r.status}`);
    const body = await r.json().catch(() => ({})) as { ignored?: unknown };
    return Array.isArray(body.ignored) ? body.ignored.map(String) : [];
  }

  /** The full URL of a path on the device (e.g. an image for <img src>), or '' without a host. */
  url(path: string): string {
    try { return `${this.base()}${path}`; } catch { return ''; }
  }

  /** Any JSON endpoint on the device (the phone's /face/...). Throws with the device's error message. */
  async request<T = unknown>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const r = await fetch(`${this.base()}${path}`, {
      method,
      cache: 'no-store',
      ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const j = await r.json().catch(() => ({})) as { error?: string };
    if (!r.ok) throw new Error(j.error || `${method} ${path} ${r.status}`);
    return j as T;
  }

  async setMode(modes: ConfigObj): Promise<void> {
    const r = await fetch(`${this.base()}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modes),
    });
    if (!r.ok) throw new Error(`POST /mode ${r.status}`);
  }
}

export const esp32 = new ConfigClient('ESP32');
export const phone = new ConfigClient('phone');
