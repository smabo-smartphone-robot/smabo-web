// Standard layout templates.
//
// One template per guide that uses smabo-web (guides that don't — smabo-brain,
// base parts, brain-ros setup — have none), plus a few general ones. A guide
// can open its template directly: http://<smabo-web>/?template=<id>.
//
// Templates are fixed: users' resizes are stored separately (useLayout.ts).
import type { LayoutNode, Template } from './types';

export const GUIDE_BASE = 'https://smabo-smartphone-robot.github.io/guides/';

const row = (ratio: number, a: LayoutNode, b: LayoutNode): LayoutNode => ({ split: 'row', ratio, a, b });
const col = (ratio: number, a: LayoutNode, b: LayoutNode): LayoutNode => ({ split: 'column', ratio, a, b });

export const TEMPLATES: Template[] = [
  // ── general ──────────────────────────────────────────────────────────
  {
    id: 'overview', title: 'Overview', phase: 'general', requires: ['brain'],
    note: 'camera, driving, speech and log at a glance',
    layout: row(0.62,
      col(0.58,
        { panel: 'sensors', props: { sections: ['camera'] }, title: 'Camera' },
        { panel: 'drive', props: { sections: ['joystick', 'telem'] } }),
      col(0.55,
        { panel: 'face', props: { sections: ['speech', 'say', 'expression'] }, title: 'Speech & face' },
        { panel: 'log' })),
  },
  {
    id: 'tabs', title: 'Tabs (classic)', phase: 'general', requires: [],
    note: 'the previous tabbed screen',
    layout: { panel: 'tabs' },
  },

  // ── smabo-brain phase ────────────────────────────────────────────────
  {
    id: 'web', title: 'smabo-web', guide: 'smabo-web', phase: 'brain', requires: ['brain'],
    layout: row(0.5,
      { panel: 'connection', props: { parts: ['brain'], next: 'Next guide: smabo-app — install the app and connect it to the brain.' } },
      { panel: 'log' }),
  },
  {
    id: 'app', title: 'smabo-app', guide: 'smabo-app', phase: 'brain', requires: ['brain', 'phone'],
    layout: row(0.6,
      { panel: 'sensors', props: { sections: ['camera'] }, title: 'Camera' },
      col(0.5,
        { panel: 'connection', props: { parts: ['brain', 'app'] } },
        { panel: 'sensors', props: { sections: ['imu'] }, title: 'IMU' })),
  },
  {
    id: 'face', title: 'smaboの顔', guide: 'smabo_face', phase: 'brain', requires: ['phone'],
    layout: row(0.5,
      { panel: 'face', props: { sections: ['gaze'] }, title: 'Gaze control' },
      { panel: 'face', props: { sections: ['expression'] }, title: 'Expression' }),
  },
  {
    id: 'sensors', title: 'スマホのセンサー', guide: 'smabo_sensors', phase: 'brain', requires: ['phone'],
    layout: row(0.6,
      { panel: 'sensors', props: { sections: ['camera'] }, title: 'Camera' },
      col(0.6,
        { panel: 'sensors', props: { sections: ['imu'] }, title: 'IMU' },
        { panel: 'sensors', props: { sections: ['gps'] }, title: 'GPS' })),
  },
  {
    id: 'voice', title: '音声処理', guide: 'audioproc', phase: 'brain', requires: ['phone'],
    layout: row(0.55,
      { panel: 'face', props: { sections: ['speech'] }, title: 'Recognized speech' },
      col(0.5,
        { panel: 'face', props: { sections: ['say'] }, title: 'Speech / Say' },
        { panel: 'log' })),
  },
  {
    id: 'imgproc', title: '画像処理', guide: 'imgproc', phase: 'brain', requires: ['phone'],
    layout: row(0.66,
      { panel: 'vision' },
      { panel: 'face', props: { sections: ['gaze'] }, title: 'Gaze (eye control)' }),
  },

  // ── smabo-esp32 phase ────────────────────────────────────────────────
  {
    id: 'esp32', title: 'smabo-esp32', guide: 'smabo-esp32', phase: 'esp32', requires: ['brain', 'esp32'],
    layout: row(0.42,
      { panel: 'connection', props: { parts: ['brain', 'esp32'] } },
      { panel: 'config' }),
  },
  {
    id: 'neck', title: '首振り', guide: 'neck', phase: 'esp32', requires: ['esp32', 'servos.head'],
    layout: row(0.45,
      col(0.5, { panel: 'servo' }, { panel: 'vision' }),
      { panel: 'config' }),
  },
  {
    id: 'hand', title: 'ハンド', guide: 'hand', phase: 'esp32', requires: ['esp32', 'servos.hand'],
    layout: row(0.45, { panel: 'servo' }, { panel: 'config' }),
  },
  {
    id: 'arm', title: 'ロボットアーム', guide: 'arm', phase: 'esp32', requires: ['esp32', 'servos.arm'],
    layout: row(0.45, { panel: 'servo' }, { panel: 'config' }),
  },
  {
    id: 'mobile', title: '移動ロボット', guide: 'mobile', phase: 'esp32', requires: ['esp32', 'wheels'],
    layout: row(0.55,
      col(0.55,
        { panel: 'drive', props: { sections: ['joystick', 'telem'] } },
        { panel: 'vision' }),
      { panel: 'config' }),
  },
  {
    id: 'encmobile', title: 'エンコーダ付移動ロボット', guide: 'encmobile', phase: 'esp32', requires: ['esp32', 'wheels', 'encoder'],
    layout: row(0.6,
      { panel: 'drive' },
      { panel: 'config' }),
  },

  // ── brain-ros phase ──────────────────────────────────────────────────
  {
    id: 'nav', title: 'ナビゲーション', guide: 'nav', phase: 'ros', requires: ['ros', 'wheels', 'encoder', 'lidar'],
    note: 'guide in progress',
    layout: row(0.68,
      { panel: 'nav' },
      col(0.5,
        { panel: 'sensors', props: { sections: ['camera'] }, title: 'Camera' },
        { panel: 'drive', props: { sections: ['joystick'] }, title: 'Manual drive' })),
  },
  {
    id: 'plan', title: '動作計画', guide: 'plan', phase: 'ros', requires: ['ros', 'servos.arm'],
    note: 'guide in progress',
    layout: row(0.72, { panel: 'plan' }, { panel: 'servo' }),
  },
];

export const DEFAULT_TEMPLATE = 'overview';

export const templateById = (id: string): Template | undefined => TEMPLATES.find(t => t.id === id);

export const PHASE_LABEL: Record<Template['phase'], string> = {
  mine: 'My layouts',
  general: 'General',
  brain: 'smabo-brain phase',
  esp32: 'smabo-esp32 phase',
  ros: 'brain-ros phase',
};
