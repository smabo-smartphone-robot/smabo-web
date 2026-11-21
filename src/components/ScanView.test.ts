import { describe, expect, it } from 'vitest';
import { SHRINK_DELAY_MS, holdViewRange, viewRange } from './ScanView';

describe('viewRange', () => {
  it('picks the smallest radius that holds the farthest point', () => {
    expect(viewRange(0)).toBe(0.5);
    expect(viewRange(0.9)).toBe(1);
    expect(viewRange(1)).toBe(2);       // 5 % margin
    expect(viewRange(4.2)).toBe(5);
    expect(viewRange(30)).toBe(12);
  });
});

describe('holdViewRange', () => {
  it('zooms out at once', () => {
    const v = holdViewRange({ range: 2, shrinkSince: null }, 4.2, 0);
    expect(v).toEqual({ range: 5, shrinkSince: null });
  });

  it('keeps the radius while the farthest point jumps around', () => {
    let v = holdViewRange(null, 4.2, 0);
    expect(v.range).toBe(5);
    for (let t = 100; t < SHRINK_DELAY_MS; t += 100) {
      v = holdViewRange(v, t % 200 ? 1.5 : 2.5, t);
      expect(v.range).toBe(5);
    }
  });

  it('zooms in once a smaller radius has fitted long enough', () => {
    let v = holdViewRange(null, 4.2, 0);
    v = holdViewRange(v, 1.5, 1000);
    v = holdViewRange(v, 1.5, 1000 + SHRINK_DELAY_MS - 1);
    expect(v.range).toBe(5);
    v = holdViewRange(v, 1.5, 1000 + SHRINK_DELAY_MS);
    expect(v).toEqual({ range: 2, shrinkSince: null });
  });

  it('restarts the wait when a far point comes back', () => {
    let v = holdViewRange(null, 4.2, 0);
    v = holdViewRange(v, 1.5, 1000);
    v = holdViewRange(v, 4.5, 2000);
    v = holdViewRange(v, 1.5, 1000 + SHRINK_DELAY_MS);
    expect(v.range).toBe(5);
  });
});
