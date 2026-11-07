// The original tabbed UI, kept as one panel (the "Tabs (classic)" template).
import { useState } from 'react';
import { Drive } from '../tabs/Drive';
import { Sensors } from '../tabs/Sensors';
import { Arm } from '../tabs/Arm';
import { Face } from '../tabs/Face';
import { Config } from '../tabs/Config';
import { Log } from '../tabs/Log';
import { Nav } from '../tabs/Nav';
import { Plan } from '../tabs/Plan';
import { Vision } from '../tabs/Vision';

type TabId = 'drive' | 'sensors' | 'arm' | 'face' | 'vision' | 'config' | 'log' | 'nav' | 'plan';

const TABS: { id: TabId; label: string; el: JSX.Element }[] = [
  { id: 'face',    label: 'Face',                   el: <Face /> },
  { id: 'sensors', label: 'Sensors',                el: <Sensors /> },
  { id: 'drive',   label: 'two wheel mobile robot', el: <Drive /> },
  { id: 'arm',     label: 'Servo',                  el: <Arm /> },
  { id: 'vision',  label: 'Vision',                 el: <Vision /> },
  { id: 'nav',     label: 'Navigation',             el: <Nav /> },
  { id: 'plan',    label: 'Motion Plan',            el: <Plan /> },
  { id: 'config',  label: 'Config',                 el: <Config /> },
  { id: 'log',     label: 'Log',                    el: <Log /> },
];

export function ClassicTabs() {
  const [active, setActive] = useState<TabId>('face');
  return (
    <div className="classic-tabs">
      <nav className="tab-nav">
        {TABS.map(t => (
          <button key={t.id} className={active === t.id ? 'active' : ''} onClick={() => setActive(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="tab-panels">
        {TABS.map(t => (
          <div key={t.id} className={`tab-panel ${active === t.id ? 'active' : ''}`}>{t.el}</div>
        ))}
      </div>
    </div>
  );
}
