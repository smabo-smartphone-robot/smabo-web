// Panel registry: every panel a template can place.
//
// Panels are the existing tab components; some take a `sections` prop so a
// template can show only the cards a guide uses. New features add an entry
// here (and usually a template), without touching the layout engine.
import type { ComponentType } from 'react';
import { Face } from '../tabs/Face';
import { Sensors } from '../tabs/Sensors';
import { Drive } from '../tabs/Drive';
import { Arm } from '../tabs/Arm';
import { Vision } from '../tabs/Vision';
import { Nav } from '../tabs/Nav';
import { Plan } from '../tabs/Plan';
import { Config } from '../tabs/Config';
import { Log } from '../tabs/Log';
import { ConnectionPanel } from '../components/ConnectionPanel';
import { DevicesCard } from '../components/DevicesCard';
import { ClassicTabs } from './ClassicTabs';
import type { PanelId, PanelLeaf } from './types';

export interface PanelDef {
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  flush?: boolean;              // no inner padding (the panel brings its own chrome)
  narrowMinHeight?: number;     // height to keep when stacked on a phone
}

export const PANELS: Record<PanelId, PanelDef> = {
  face:       { title: 'Face',              component: Face },
  sensors:    { title: 'Sensors',           component: Sensors },
  drive:      { title: 'Drive',             component: Drive },
  servo:      { title: 'Servo',             component: Arm },
  vision:     { title: 'Vision',            component: Vision },
  nav:        { title: 'Navigation',        component: Nav, narrowMinHeight: 520 },
  plan:       { title: 'Motion Plan',       component: Plan, narrowMinHeight: 560 },
  config:     { title: 'Config',            component: Config },
  log:        { title: 'Log',               component: Log, narrowMinHeight: 320 },
  connection: { title: 'Connection',        component: ConnectionPanel },
  devices:    { title: 'Devices',           component: DevicesCard },
  tabs:       { title: 'All tabs',          component: ClassicTabs, flush: true },
  empty:      { title: 'New panel',         component: () => null },   // SplitLayout shows the chooser
};

/** What the "add / change panel" chooser offers: whole panels and single sections. */
export const PANEL_PRESETS: { group: string; leaf: PanelLeaf }[] = [
  { group: 'Phone', leaf: { panel: 'sensors', props: { sections: ['camera'] }, title: 'Camera' } },
  { group: 'Phone', leaf: { panel: 'sensors', props: { sections: ['imu'] }, title: 'IMU' } },
  { group: 'Phone', leaf: { panel: 'sensors', props: { sections: ['gps'] }, title: 'GPS' } },
  { group: 'Phone', leaf: { panel: 'sensors' } },
  { group: 'Face & voice', leaf: { panel: 'face', props: { sections: ['gaze'] }, title: 'Gaze control' } },
  { group: 'Face & voice', leaf: { panel: 'face', props: { sections: ['expression'] }, title: 'Expression' } },
  { group: 'Face & voice', leaf: { panel: 'face', props: { sections: ['speech'] }, title: 'Recognized speech' } },
  { group: 'Face & voice', leaf: { panel: 'face', props: { sections: ['say'] }, title: 'Speech / Say' } },
  { group: 'Face & voice', leaf: { panel: 'face' } },
  { group: 'Robot', leaf: { panel: 'drive', props: { sections: ['joystick'] }, title: 'Manual drive' } },
  { group: 'Robot', leaf: { panel: 'drive', props: { sections: ['telem'] }, title: 'Telemetry' } },
  { group: 'Robot', leaf: { panel: 'drive', props: { sections: ['trail'] }, title: 'Trail map' } },
  { group: 'Robot', leaf: { panel: 'drive' } },
  { group: 'Robot', leaf: { panel: 'servo' } },
  { group: 'Robot', leaf: { panel: 'config' } },
  { group: 'Robot', leaf: { panel: 'connection' } },
  { group: 'Robot', leaf: { panel: 'devices' } },
  { group: 'Processing', leaf: { panel: 'vision' } },
  { group: 'Processing', leaf: { panel: 'nav' } },
  { group: 'Processing', leaf: { panel: 'plan' } },
  { group: 'Other', leaf: { panel: 'log' } },
  { group: 'Other', leaf: { panel: 'tabs' } },
];

export const leafTitle = (leaf: PanelLeaf) => leaf.title ?? PANELS[leaf.panel].title;
