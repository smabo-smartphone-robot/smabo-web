import { describe, expect, it } from 'vitest';
import { brainInvitePacket, checksum, errorText, ImprovErrorCode, parseRpcResult, wifiSettingsPacket } from './improv';

describe('Improv packets', () => {
  it('builds the Wi-Fi settings packet', () => {
    const p = wifiSettingsPacket('home', 'pw');
    expect(Array.from(p.subarray(0, -1))).toEqual([1, 8, 4, 104, 111, 109, 101, 2, 112, 119]);
    expect(p[p.length - 1]).toBe(checksum(p.subarray(0, -1)));
  });

  it('encodes UTF-8 and allows an open network', () => {
    const p = wifiSettingsPacket('café', '');
    expect(p[2]).toBe(5);            // é is two bytes
    expect(p[2 + 1 + 5]).toBe(0);    // empty password
  });

  it('rejects what the ESP32 cannot store', () => {
    expect(() => wifiSettingsPacket('', 'x')).toThrow();
    expect(() => wifiSettingsPacket('x'.repeat(33), '')).toThrow();
    expect(() => wifiSettingsPacket('x', 'y'.repeat(65))).toThrow();
  });

  it('reads an RPC result with the config URL', () => {
    const url = new TextEncoder().encode('http://192.168.1.42/');
    const body = [1, url.length + 1, url.length, ...url];
    const packet = new Uint8Array([...body, checksum(new Uint8Array(body))]);
    expect(parseRpcResult(packet)).toEqual({ command: 1, strings: ['http://192.168.1.42/'] });
  });

  it('rejects a broken result', () => {
    expect(parseRpcResult(new Uint8Array([1, 0]))).toBeNull();
    expect(parseRpcResult(new Uint8Array([1, 0, 0]))).toBeNull();          // bad checksum
    expect(parseRpcResult(new Uint8Array([1, 2, 5, 0, 8]))).toBeNull();    // string past the end
  });

  it('builds smabo\'s brain invite packet', () => {
    const p = brainInvitePacket('10.0.0.2:9090', 'ABCD-EFGH');
    expect(p[0]).toBe(0xf0);
    expect(p[1]).toBe(1 + 13 + 1 + 9);
    expect(new TextDecoder().decode(p.subarray(3, 16))).toBe('10.0.0.2:9090');
    expect(p[p.length - 1]).toBe(checksum(p.subarray(0, -1)));
  });

  it('explains connection failures', () => {
    expect(errorText(ImprovErrorCode.UnableToConnect)).toMatch(/could not join/);
  });
});
