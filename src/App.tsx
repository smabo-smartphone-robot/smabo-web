import { useEffect } from 'react';
import { useBrain } from './store/useBrain';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { PairingScreen } from './components/PairingScreen';
import { Workspace } from './workspace/Workspace';

export default function App() {
  const autoConnect = useBrain(s => s.autoConnect);
  const refreshConfigQuietly = useBrain(s => s.refreshConfigQuietly);
  const unpaired = useBrain(s => s.status === 'unpaired');

  useEffect(() => {
    autoConnect();
    // ESP32 may not be up yet; it announces /config_url once it reaches the brain.
    refreshConfigQuietly();
  }, []);

  return (
    <>
      <Header />
      {unpaired ? <PairingScreen /> : <Workspace />}
      <Toast />
    </>
  );
}
