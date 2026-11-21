// The Config tab shows encoder_drive as an option of dc_drive: encoder_drive
// drives the same motors and adds the wheel encoders. The ESP32 keeps the two
// mode flags (they are mutually exclusive there), so the UI maps to and from them.

type Modes = Record<string, unknown>;

/** What the dc_drive checkbox and its encoder option show for these modes. */
export function driveView(modes: Modes): { dc: boolean; encoder: boolean } {
  const encoder = modes['encoder_drive'] === true;
  return { dc: encoder || modes['dc_drive'] === true, encoder };
}

/** The modes to send for the dc_drive checkbox and its encoder option. */
export function driveModes(modes: Modes, dc: boolean, encoder: boolean): Modes {
  return { ...modes, dc_drive: dc && !encoder, encoder_drive: dc && encoder };
}
