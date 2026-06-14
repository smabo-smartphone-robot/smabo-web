import { useState } from 'react';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { Drive } from './tabs/Drive';
import { Sensors } from './tabs/Sensors';
import { Arm } from './tabs/Arm';
import { Face } from './tabs/Face';
import { Config } from './tabs/Config';
import { Log } from './tabs/Log';

type TabId = 'drive' | 'sensors' | 'arm' | 'face' | 'config' | 'log';

const TABS: { id: TabId; label: string }[] = [
  { id: 'drive',   label: 'Drive' },
  { id: 'sensors', label: 'Sensors' },
  { id: 'arm',     label: 'Arm' },
  { id: 'face',    label: 'Face' },
  { id: 'config',  label: 'Config' },
  { id: 'log',     label: 'Log' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('drive');

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
        <div className={`tab-panel ${activeTab === 'face'    ? 'active' : ''}`}><Face /></div>
        <div className={`tab-panel ${activeTab === 'config'  ? 'active' : ''}`}><Config /></div>
        <div className={`tab-panel ${activeTab === 'log'     ? 'active' : ''}`}><Log /></div>
      </div>

      <Toast />
    </>
  );
}
