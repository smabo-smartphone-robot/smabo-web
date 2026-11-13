// Wi-Fi setup for the ESP32 over Bluetooth LE (the Improv Wi-Fi protocol).
//
// smabo-esp32 advertises the Improv service while it cannot join Wi-Fi
// (improv.py). Here the browser connects with Web Bluetooth, sends the SSID and
// password, and gets the ESP32's config URL back once it has joined.
//
// Web Bluetooth needs Chrome or Edge and a secure page: https:// or
// http://localhost. On http://<LAN address> navigator.bluetooth is missing.
//
// Protocol: https://www.improv-wifi.com/ble/

const uuid = (n: string) => `00467768-6228-2272-4663-2774782680${n}`;
export const IMPROV_SERVICE = uuid('00');
const STATE = uuid('01');
const ERROR = uuid('02');
const RPC = uuid('03');
const RESULT = uuid('04');

export const State = { AuthRequired: 1, Authorized: 2, Provisioning: 3, Provisioned: 4 } as const;
export const ImprovErrorCode = {
  None: 0, InvalidRpc: 1, UnknownRpc: 2, UnableToConnect: 3, NotAuthorized: 4, Unknown: 0xff,
} as const;

const CMD_WIFI_SETTINGS = 1;
/** smabo's own command (outside Improv's range): where the brain is, and an
 *  invite code, so the ESP32 pairs with the brain once it is on Wi-Fi. */
const CMD_BRAIN_INVITE = 0xf0;

export function checksum(bytes: Uint8Array): number {
  let sum = 0;
  for (const b of bytes) sum += b;
  return sum & 0xff;
}

/** RPC packet for "send Wi-Fi settings": [1, len, ssidLen, ssid, passLen, pass, checksum]. */
export function wifiSettingsPacket(ssid: string, password: string): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const s = enc.encode(ssid);
  const p = enc.encode(password);
  if (s.length === 0) throw new Error('SSID is empty');
  if (s.length > 32) throw new Error('SSID is longer than 32 bytes');
  if (p.length > 64) throw new Error('Password is longer than 64 bytes');
  const data = [s.length, ...s, p.length, ...p];
  const body = new Uint8Array([CMD_WIFI_SETTINGS, data.length, ...data]);
  return new Uint8Array([...body, checksum(body)]);
}

function packet(command: number, strings: string[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const data: number[] = [];
  for (const s of strings) {
    const b = enc.encode(s);
    if (b.length > 255) throw new Error('Text is too long');
    data.push(b.length, ...b);
  }
  const body = new Uint8Array([command, data.length, ...data]);
  return new Uint8Array([...body, checksum(body)]);
}

/** smabo's invite packet: [0xF0, len, hostLen, "host:port", codeLen, code, checksum]. */
export function brainInvitePacket(brainHost: string, code: string): Uint8Array<ArrayBuffer> {
  return packet(CMD_BRAIN_INVITE, [brainHost, code]);
}

/** Strings in an RPC result packet, or null when the packet is malformed. */
export function parseRpcResult(bytes: Uint8Array): { command: number; strings: string[] } | null {
  if (bytes.length < 3) return null;
  const end = bytes[1] + 2;
  if (bytes.length !== end + 1 || checksum(bytes.subarray(0, end)) !== bytes[end]) return null;
  const dec = new TextDecoder();
  const strings: string[] = [];
  for (let i = 2; i < end;) {
    const n = bytes[i];
    if (i + 1 + n > end) return null;
    strings.push(dec.decode(bytes.subarray(i + 1, i + 1 + n)));
    i += 1 + n;
  }
  return { command: bytes[0], strings };
}

export function errorText(code: number): string {
  switch (code) {
    case ImprovErrorCode.InvalidRpc: return 'The ESP32 could not read the request';
    case ImprovErrorCode.UnknownRpc: return 'The ESP32 does not know this request';
    case ImprovErrorCode.UnableToConnect: return 'The ESP32 could not join that network. Check the name and password';
    case ImprovErrorCode.NotAuthorized: return 'Press the button on the ESP32 first';
    default: return `Improv error ${code}`;
  }
}

export const bluetoothAvailable = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;

const PROVISION_TIMEOUT_MS = 40000;

/** One Improv device chosen by the user. */
export class ImprovDevice {
  private constructor(
    private device: BluetoothDevice,
    private chars: Record<'state' | 'error' | 'rpc' | 'result', BluetoothRemoteGATTCharacteristic>,
  ) {}

  get name(): string { return this.device.name ?? 'ESP32'; }

  /** Show the browser's device picker (must run from a click) and connect. */
  static async request(): Promise<ImprovDevice> {
    if (!bluetoothAvailable()) {
      throw new Error('This browser has no Web Bluetooth. Use Chrome or Edge on https:// or http://localhost');
    }
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [IMPROV_SERVICE] }] });
    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(IMPROV_SERVICE);
    const get = (u: string) => service.getCharacteristic(u);
    const [state, error, rpc, result] = await Promise.all([get(STATE), get(ERROR), get(RPC), get(RESULT)]);
    return new ImprovDevice(device, { state, error, rpc, result });
  }

  async state(): Promise<number> {
    return (await this.chars.state.readValue()).getUint8(0);
  }

  /** Send the Wi-Fi settings; resolves with the ESP32's config URL once it has joined. */
  async provision(ssid: string, password: string, onState?: (s: number) => void): Promise<string | null> {
    const { state, error, result, rpc } = this.chars;
    const packet = wifiSettingsPacket(ssid, password);
    await Promise.all([state.startNotifications(), error.startNotifications(), result.startNotifications()]);

    return new Promise<string | null>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        state.removeEventListener('characteristicvaluechanged', onStateChange);
        error.removeEventListener('characteristicvaluechanged', onError);
        result.removeEventListener('characteristicvaluechanged', onResult);
      };
      const done = (url: string | null) => { cleanup(); resolve(url); };
      const fail = (e: Error) => { cleanup(); reject(e); };
      const byte = (ev: Event) => (ev.target as BluetoothRemoteGATTCharacteristic).value!.getUint8(0);

      const onStateChange = (ev: Event) => {
        const s = byte(ev);
        onState?.(s);
        // The URL may arrive before or after the state; give it a moment.
        if (s === State.Provisioned) setTimeout(() => done(null), 3000);
      };
      const onError = (ev: Event) => {
        const code = byte(ev);
        if (code !== ImprovErrorCode.None) fail(new Error(errorText(code)));
      };
      const onResult = (ev: Event) => {
        const v = (ev.target as BluetoothRemoteGATTCharacteristic).value!;
        const parsed = parseRpcResult(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
        if (parsed?.command === CMD_WIFI_SETTINGS) done(parsed.strings[0] ?? null);
      };
      const timer = setTimeout(() => fail(new Error('The ESP32 did not answer in time')), PROVISION_TIMEOUT_MS);

      state.addEventListener('characteristicvaluechanged', onStateChange);
      error.addEventListener('characteristicvaluechanged', onError);
      result.addEventListener('characteristicvaluechanged', onResult);
      rpc.writeValueWithResponse(packet).catch(fail);
    });
  }

  /** Tell the ESP32 where the brain is and give it an invite (before the Wi-Fi
   *  settings). False when its firmware does not know the command. */
  async sendBrainInvite(brainHost: string, code: string): Promise<boolean> {
    const { error, result, rpc } = this.chars;
    await Promise.all([error.startNotifications(), result.startNotifications()]);
    return new Promise<boolean>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        error.removeEventListener('characteristicvaluechanged', onError);
        result.removeEventListener('characteristicvaluechanged', onResult);
      };
      const onError = (ev: Event) => {
        const code = (ev.target as BluetoothRemoteGATTCharacteristic).value!.getUint8(0);
        if (code === ImprovErrorCode.None) return;
        cleanup();
        if (code === ImprovErrorCode.UnknownRpc) resolve(false); else reject(new Error(errorText(code)));
      };
      const onResult = (ev: Event) => {
        const v = (ev.target as BluetoothRemoteGATTCharacteristic).value!;
        const parsed = parseRpcResult(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
        if (parsed?.command === CMD_BRAIN_INVITE) { cleanup(); resolve(true); }
      };
      const timer = setTimeout(() => { cleanup(); resolve(false); }, 5000);
      error.addEventListener('characteristicvaluechanged', onError);
      result.addEventListener('characteristicvaluechanged', onResult);
      rpc.writeValueWithResponse(brainInvitePacket(brainHost, code)).catch(e => { cleanup(); reject(e); });
    });
  }

  disconnect(): void {
    if (this.device.gatt?.connected) this.device.gatt.disconnect();
  }
}
