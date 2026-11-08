import { useEffect } from 'react';
import { useBrain } from './store/useBrain';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { TemplatePicker } from './components/TemplatePicker';
import { PairingScreen } from './components/PairingScreen';
import { SplitLayout } from './layout/SplitLayout';
import { useTemplate, useTree } from './layout/useLayout';

export default function App() {
  const autoConnect = useBrain(s => s.autoConnect);
  const refreshConfigQuietly = useBrain(s => s.refreshConfigQuietly);
  const template = useTemplate();
  const tree = useTree();
  const unpaired = useBrain(s => s.status === 'unpaired');

  useEffect(() => {
    autoConnect();
    // ESP32 may not be up yet; it announces /config_url once it reaches the brain.
    refreshConfigQuietly();
  }, []);

  return (
    <>
      <Header />
      {/* key: a new template remounts its panels instead of reusing another template's */}
      {unpaired ? <PairingScreen /> : <SplitLayout key={template.id} layout={tree} />}
      <TemplatePicker />
      <Toast />
    </>
  );
}
