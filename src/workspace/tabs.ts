// Every tab smabo-web has, with its label and component. Each pane of the
// workspace shows all of them in its tab bar, in this order (TAB_IDS).
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
import { TAB_IDS, type TabId } from './model';

export interface TabDef {
  id: TabId;
  label: string;
  component: ComponentType;
}

export const TABS: TabDef[] = [
  { id: 'face',    label: 'Face',        component: Face },
  { id: 'sensors', label: 'Sensors',     component: Sensors },
  { id: 'drive',   label: 'Drive',       component: Drive },
  { id: 'servo',   label: 'Servo',       component: Arm },
  { id: 'vision',  label: 'Vision',      component: Vision },
  { id: 'nav',     label: 'Navigation',  component: Nav },
  { id: 'plan',    label: 'Motion Plan', component: Plan },
  { id: 'config',  label: 'Config',      component: Config },
  { id: 'log',     label: 'Log',         component: Log },
];

if (TABS.map(t => t.id).join() !== TAB_IDS.join()) throw new Error('tabs.ts and model.ts list different tabs');
