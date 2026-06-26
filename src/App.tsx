import { useState } from 'react';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { Drive } from './tabs/Drive';
import { Sensors } from './tabs/Sensors';
import { Arm } from './tabs/Arm';
import { Face } from './tabs/Face';
import { Config } from './tabs/Config';
import { Log } from './tabs/Log';
import { Nav } from './tabs/Nav';
import { Plan } from './tabs/Plan';
import { Vision } from './tabs/Vision';

type TabId = 'drive' | 'sensors' | 'arm' | 'face' | 'vision' | 'config' | 'log' | 'nav' | 'plan';

const TABS: { id: TabId; label: string }[] = [
  { id: 'face',    label: 'Face' },
  { id: 'sensors', label: 'Sensors' },
  { id: 'drive',   label: 'two wheel mobile robot' },
  { id: 'arm',     label: 'Servo' },
  { id: 'vision',  label: 'Vision' },
  { id: 'nav',     label: 'Navigation' },
  { id: 'plan',    label: 'Motion Plan' },
  { id: 'config',  label: 'Config' },
  { id: 'log',     label: 'Log' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('face');

  return (
    <>
      <Header />
      <nav className="tab-nav">
        {TABS.map(t => (
          <button
            key={t.id}
            className={activeTab === t.id ? 'active' : ''}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="tab-panels">
        <div className={`tab-panel ${activeTab === 'drive'   ? 'active' : ''}`}><Drive /></div>
        <div className={`tab-panel ${activeTab === 'sensors' ? 'active' : ''}`}><Sensors /></div>
        <div className={`tab-panel ${activeTab === 'arm'     ? 'active' : ''}`}><Arm /></div>
        <div className={`tab-panel ${activeTab === 'vision'  ? 'active' : ''}`}><Vision /></div>
        <div className={`tab-panel ${activeTab === 'nav'     ? 'active' : ''}`}><Nav /></div>
        <div className={`tab-panel ${activeTab === 'plan'    ? 'active' : ''}`}><Plan /></div>
        <div className={`tab-panel ${activeTab === 'face'    ? 'active' : ''}`}><Face /></div>
        <div className={`tab-panel ${activeTab === 'config'  ? 'active' : ''}`}><Config /></div>
        <div className={`tab-panel ${activeTab === 'log'     ? 'active' : ''}`}><Log /></div>
      </div>

      <Toast />
    </>
  );
}
