// smabo-esp32 への直接 REST クライアント。
// config / mode は brain を介さず ESP32 の HTTP API を直接叩く。
//   GET  /config          → 全 config
//   POST /config {patch}  → config パッチ適用（ピン変更時は ESP32 再起動）
//   POST /mode   {modes}  → サブシステムの有効/無効

type ConfigObj = Record<string, unknown>;

class Esp32Client {
  private host = '';

  setHost(h: string): void {
    this.host = h;
  }

  /** host を正規化したベース URL（"ip" / "ip:port" / "http://ip" を許容） */
  private base(): string {
    let h = this.host.trim();
    if (!h) throw new Error('ESP32 host not set');
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

  async setConfig(patch: ConfigObj): Promise<void> {
    const r = await fetch(`${this.base()}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(`POST /config ${r.status}`);
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

export const esp32 = new Esp32Client();
