import { describe, expect, it } from 'vitest';
import { DEAD_ZONE, shapeAxis } from './joystickCurve';

describe('shapeAxis', () => {
  it('is zero inside the dead zone', () => {
    expect(shapeAxis(0)).toBe(0);
    expect(shapeAxis(DEAD_ZONE)).toBe(0);
    expect(shapeAxis(-DEAD_ZONE)).toBe(0);
  });

  it('reaches full speed at the edge, with the sign kept', () => {
    expect(shapeAxis(1)).toBeCloseTo(1);
    expect(shapeAxis(-1)).toBeCloseTo(-1);
    expect(shapeAxis(1.2)).toBeCloseTo(1);
  });

  it('is gentle for small movements', () => {
    expect(shapeAxis(0.3)).toBeLessThan(0.1);
    expect(shapeAxis(0.5)).toBeCloseTo(0.198, 2);
    expect(shapeAxis(-0.5)).toBeCloseTo(-0.198, 2);
  });

  it('increases with the stick', () => {
    let prev = 0;
    for (let s = 0.11; s <= 1; s += 0.05) {
      const v = shapeAxis(s);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});
