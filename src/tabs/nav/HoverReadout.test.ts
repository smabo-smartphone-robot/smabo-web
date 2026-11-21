import { describe, it, expect } from 'vitest';
import { TfTree } from '../../ros/tfTree';
import { framePoint } from '../../ros/navScene';
import { hoverLines } from './HoverReadout';
import { pickStartMap, NEW_MAP, saveOutcome, switchWarning, toggleState, type NavManagerState } from './ModePanels';
import type { ModeState } from '../../ros/useRosState';

const tf = (parent: string, child: string, x: number, y: number, yaw = 0) => ({
  header: { frame_id: parent },
  child_frame_id: child,
  transform: {
    translation: { x, y, z: 0 },
    rotation: { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) },
  },
});

describe('pointer coordinates', () => {
  const tree = new TfTree();
  // map -> odom: 1 m along x; odom -> base_link: robot at (2, 0) facing +y
  tree.add([tf('map', 'odom', 1, 0), tf('odom', 'base_link', 2, 0, Math.PI / 2)]);

  it('puts a map point into the other frames', () => {
    const o = framePoint(tree, 'map', 'odom', 3, 1)!;
    expect(o.x).toBeCloseTo(2); expect(o.y).toBeCloseTo(1);
    const b = framePoint(tree, 'map', 'base_link', 3, 1)!;   // 1 m ahead of the robot
    expect(b.x).toBeCloseTo(1); expect(b.y).toBeCloseTo(0);
    expect(framePoint(tree, 'map', 'laser', 0, 0)).toBeNull();
  });

  it('lists every frame TF has, with the distance from the robot', () => {
    expect(hoverLines({ tf: tree, fixedFrame: 'map' }, { x: 3, y: 1 })).toEqual([
      'map  x 3.00  y 1.00',
      'odom  x 2.00  y 1.00',
      'base_link  x 1.00  y 0.00  1.00 m',
    ]);
    expect(hoverLines({ tf: tree, fixedFrame: 'map' }, null)).toEqual([]);
    expect(hoverLines({ tf: tree, fixedFrame: '' }, { x: 0, y: 0 })).toEqual([]);
  });
});

describe('navigation start picker', () => {
  const maps = [{ name: 'room_2' }, { name: 'room_1' }];
  it('starts on the newest saved map, or a new map when there is none', () => {
    expect(pickStartMap(null, maps)).toBe('room_2');
    expect(pickStartMap(null, [])).toBe(NEW_MAP);
  });
  it('keeps the choice while it still exists', () => {
    expect(pickStartMap('room_1', maps)).toBe('room_1');
    expect(pickStartMap(NEW_MAP, maps)).toBe(NEW_MAP);
    expect(pickStartMap('gone', maps)).toBe('room_2');
  });
});

describe('SLAM / Navigation sub-tabs', () => {
  const nm = (o: Partial<NavManagerState>): NavManagerState =>
    ({ mode: 'mapping', map: '', busy: false, message: '', maps_dir: '', ...o });
  const ms = (mode: ModeState['mode'], status: string): ModeState =>
    ({ mode, status, message: '', model: {}, maps: [] } as ModeState);

  it('save then stop: stops only after nav_manager has saved this very map', () => {
    expect(saveOutcome(nm({ map: 'room', message: "saved map 'room'" }), 'room', false)).toBe('waiting');
    expect(saveOutcome(nm({ busy: true }), 'room', true)).toBe('waiting');
    expect(saveOutcome(nm({ map: 'room', message: "saved map 'room'" }), 'room', true)).toBe('done');
    expect(saveOutcome(nm({ message: 'map_saver failed: timeout' }), 'room', true)).toBe('failed');
    expect(saveOutcome(null, 'room', true)).toBe('failed');
  });

  it('one button: Stop while its own side runs, else Start', () => {
    expect(toggleState('mapping', ms('nav', 'running'), nm({ mode: 'mapping' }))).toBe('stop');
    expect(toggleState('navigation', ms('nav', 'running'), nm({ mode: 'mapping' }))).toBe('start');
    expect(toggleState('navigation', ms('nav', 'running'), nm({ mode: 'navigation' }))).toBe('stop');
    expect(toggleState('mapping', ms('plan', 'running'), null)).toBe('start');
    expect(toggleState('mapping', ms('nav', 'starting'), null)).toBe('starting');
    expect(toggleState('mapping', ms('none', 'idle'), null)).toBe('start');
  });
});

describe('switching between SLAM and Navigation', () => {
  const nm = (mode: NavManagerState['mode'], map = ''): NavManagerState =>
    ({ mode, map, busy: false, message: '', maps_dir: '' });
  const running = { mode: 'nav', status: 'running', message: '', model: {}, maps: [] } as ModeState;

  it('asks before stopping the other side', () => {
    expect(switchWarning('mapping', running, nm('navigation', 'room'))).toContain('Navigation on "room" is running');
    expect(switchWarning('navigation', running, nm('mapping'), 'room')).toContain('SLAM is running');
  });

  it('does not ask when nothing else runs', () => {
    expect(switchWarning('mapping', running, nm('mapping'))).toBeNull();
    expect(switchWarning('navigation', running, nm('off'), 'room')).toBeNull();
    expect(switchWarning('mapping', null, null)).toBeNull();
  });
});
