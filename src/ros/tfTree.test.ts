import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TfTree, type TransformStamped } from './tfTree';
import { mapPixels, scanPoints, costColor, yawOf } from './navScene';
import { parseModeState } from './useRosState';
import { modeSummary, switchAwayWarning } from '../components/ModeBar';

const tf = (parent: string, child: string, x: number, y: number, yaw = 0): TransformStamped => ({
  header: { frame_id: parent },
  child_frame_id: child,
  transform: {
    translation: { x, y, z: 0 },
    rotation: { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) },
  },
});

const pos = (m: THREE.Matrix4 | null) => new THREE.Vector3().setFromMatrixPosition(m!);

describe('TfTree', () => {
  it('chains map → odom → base_link → laser', () => {
    const t = new TfTree();
    t.add([tf('map', 'odom', 1, 0), tf('odom', 'base_link', 0, 2, Math.PI / 2), tf('/base_link', 'laser', 0.5, 0)]);
    const p = pos(t.lookup('map', 'laser'));
    expect(p.x).toBeCloseTo(1);     // the laser sits 0.5 m ahead of a base turned 90°: +y
    expect(p.y).toBeCloseTo(2.5);
  });

  it('looks up a frame from a sibling branch', () => {
    const t = new TfTree();
    t.add([tf('odom', 'base_link', 1, 0), tf('odom', 'goal', 3, 0)]);
    expect(pos(t.lookup('base_link', 'goal')).x).toBeCloseTo(2);
  });

  it('keeps only the newest transform of an edge', () => {
    const t = new TfTree();
    t.add([tf('odom', 'base_link', 1, 0)]);
    t.add([tf('odom', 'base_link', 4, 0)]);
    expect(pos(t.lookup('odom', 'base_link')).x).toBeCloseTo(4);
  });

  it('returns null for frames that are not connected', () => {
    const t = new TfTree();
    t.add([tf('odom', 'base_link', 1, 0), tf('map', 'other', 0, 0)]);
    expect(t.lookup('map', 'base_link')).toBeNull();
    expect(t.lookup('map', 'nowhere')).toBeNull();
    expect(t.has('map')).toBe(true);
    expect(t.has('nowhere')).toBe(false);
  });
});

describe('navScene helpers', () => {
  it('colours unknown, free and occupied cells', () => {
    const px = mapPixels([-1, 0, 100], 3);
    expect(px[3]).toBe(0);                  // unknown: clear
    expect([px[4], px[7]]).toEqual([235, 255]);
    expect([px[8], px[11]]).toEqual([25, 255]);
  });

  it('turns ranges into laser-frame points and drops invalid ones', () => {
    const p = scanPoints({
      header: { frame_id: 'laser' }, angle_min: 0, angle_increment: Math.PI / 2,
      range_min: 0.1, range_max: 5, ranges: [1, null, 0.05, 2],
    });
    expect(p.length).toBe(6);
    expect(p[0]).toBeCloseTo(1); expect(p[1]).toBeCloseTo(0);
    expect(p[3]).toBeCloseTo(0); expect(p[4]).toBeCloseTo(-2);   // 270°
  });
});

describe('costmap colours and helpers', () => {
  it('leaves free / unknown cells clear and marks lethal and inscribed cells', () => {
    expect(costColor(0)[3]).toBe(0);
    expect(costColor(-1)[3]).toBe(0);
    expect(costColor(100)).toEqual([255, 0, 255, 200]);
    expect(costColor(99)).toEqual([0, 255, 255, 190]);
    const low = costColor(10), high = costColor(90);
    expect(low[2]).toBeGreaterThan(low[0]);          // blue for low cost
    expect(high[0]).toBeGreaterThan(high[2]);        // red for high cost
  });
  it('reads yaw from a quaternion', () => {
    const h = 0.7 / 2;
    expect(yawOf({ x: 0, y: 0, z: Math.sin(h), w: Math.cos(h) })).toBeCloseTo(0.7);
  });
});

describe('mode state', () => {
  it('parses mode_manager JSON and rejects junk', () => {
    expect(parseModeState('{"mode":"nav","status":"running","message":"ok","model":{"arm":"false"}}'))
      .toEqual({ mode: 'nav', status: 'running', message: 'ok', model: { arm: 'false' }, maps: [] });
    expect(parseModeState('{"mode":"none","status":"stopped","maps":[{"name":"room_1","saved":"x"},{"bad":1}]}')?.maps)
      .toEqual([{ name: 'room_1', saved: 'x' }]);
    expect(parseModeState('nope')).toBeNull();
    expect(parseModeState('{"status":"running"}')).toBeNull();
  });
  it('summarises the state for the mode bar', () => {
    const s = (mode: 'none' | 'nav' | 'plan', status: 'running' | 'starting' | 'error') =>
      ({ mode, status, message: 'boom', model: {}, maps: [] });
    expect(modeSummary('disconnected', null).tone).toBe('off');
    expect(modeSummary('connected', null).tone).toBe('err');
    expect(modeSummary('connected', s('nav', 'running'))).toEqual({ text: 'Navigation: running', tone: 'ok' });
    expect(modeSummary('connected', s('plan', 'starting'))).toEqual({ text: 'Motion Plan: starting…', tone: 'busy' });
    expect(modeSummary('connected', s('nav', 'error')).text).toBe('error: boom');
  });
  it('asks before Start Motion Plan stops a running Navigation', () => {
    const s = (mode: 'none' | 'nav' | 'plan', status: 'running' | 'starting') =>
      ({ mode, status, message: '', model: {}, maps: [] });
    expect(switchAwayWarning('plan', s('nav', 'running'))).toMatch(/^Navigation is running\. Stop it and start Motion Plan\?.*not saved/);
    expect(switchAwayWarning('plan', s('plan', 'running'))).toBeNull();
    expect(switchAwayWarning('plan', s('none', 'running'))).toBeNull();
    expect(switchAwayWarning('plan', s('nav', 'starting'))).toBeNull();
    expect(switchAwayWarning('plan', null)).toBeNull();
  });
});
