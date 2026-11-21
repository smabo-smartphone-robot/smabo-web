import { describe, expect, it } from 'vitest';
import { driveModes, driveView } from './driveModes';

describe('dc_drive with the encoder option', () => {
  it('shows encoder_drive as dc_drive with the encoder ticked', () => {
    expect(driveView({ dc_drive: false, encoder_drive: false })).toEqual({ dc: false, encoder: false });
    expect(driveView({ dc_drive: true, encoder_drive: false })).toEqual({ dc: true, encoder: false });
    expect(driveView({ dc_drive: false, encoder_drive: true })).toEqual({ dc: true, encoder: true });
  });

  it('sends exactly one of the two modes, and keeps the others', () => {
    const m = { servos: true, lidar: false, dc_drive: false, encoder_drive: false };
    expect(driveModes(m, true, false)).toEqual({ ...m, dc_drive: true, encoder_drive: false });
    expect(driveModes(m, true, true)).toEqual({ ...m, dc_drive: false, encoder_drive: true });
    expect(driveModes(m, false, true)).toEqual({ ...m, dc_drive: false, encoder_drive: false });
  });
});
