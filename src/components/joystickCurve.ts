/**
 * Joystick response curve: a small dead zone around the centre, then a
 * quadratic curve, so small stick movements give gentle speeds and the full
 * speed is still reached at the edge.
 *
 *   |s| <= DEAD_ZONE → 0
 *   otherwise        → sign(s) · ((|s| − DEAD_ZONE) / (1 − DEAD_ZONE))²
 *
 * e.g. the stick at 30 % of its travel gives about 6 % of the speed limit
 * (it gave 30 % with the linear mapping), at 50 % about 20 %.
 */
export const DEAD_ZONE = 0.1;

export function shapeAxis(s: number): number {
  const a = Math.min(Math.abs(s), 1);
  if (a <= DEAD_ZONE) return 0;
  const t = (a - DEAD_ZONE) / (1 - DEAD_ZONE);
  return Math.sign(s) * t * t;
}
