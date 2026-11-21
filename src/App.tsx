import { useEffect } from 'react';
import { useBrain } from './store/useBrain';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { PairingScreen } from './components/PairingScreen';
import { Workspace } from './workspace/Workspace';
import { rosClient } from './ros/ros';

export default function App() {
  const autoConnect = useBrain(s => s.autoConnect);
  const refreshConfigQuietly = useBrain(s => s.refreshConfigQuietly);
  const unpaired = useBrain(s => s.status === 'unpaired');

  useEffect(() => {
    autoConnect();
    // ROS (rosbridge) too, when it was connected before the reload
    rosClient.restore(useBrain.getState().host);
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
