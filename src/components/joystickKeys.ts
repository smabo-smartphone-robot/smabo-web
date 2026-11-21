/**
 * Driving with the keyboard (W/A/S/D or the arrow keys).
 *
 * The stick follows the keys held down. When the last key is released the
 * robot must be told to stop: the stick going back to the centre sends
 * nothing by itself, and the robot kept the last command until the ESP32's
 * cmd_timeout ran out, so a short tap moved it a long way.
 */
export interface DriveKeys { w: boolean; a: boolean; s: boolean; d: boolean }

/** The stick position for the keys held down (x right, y forward; each -1, 0 or 1). */
export function keyStick(k: DriveKeys): { x: number; y: number } {
  return { x: (k.d ? 1 : 0) - (k.a ? 1 : 0), y: (k.w ? 1 : 0) - (k.s ? 1 : 0) };
}

/** One keyboard tick: the stick, whether the keys are driving now, and whether to
 *  send a stop (the keys were driving on the last tick and are not any more). */
export function keyTick(k: DriveKeys, wasDriving: boolean): { x: number; y: number; driving: boolean; stop: boolean } {
  const { x, y } = keyStick(k);
  const driving = x !== 0 || y !== 0;
  return { x, y, driving, stop: wasDriving && !driving };
}
