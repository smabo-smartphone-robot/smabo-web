// A Start button that also connects to brain-ros: there is no Connect ROS button.
// Pressed while connected and ready, it starts at once. Pressed while not connected,
// it opens the rosbridge connection and starts once brain-ros has reported its state
// (`ready`) — with that state, so the start decides as if it had been connected all
// along (confirm a switch, or do nothing when that mode already runs).
import { useEffect, useRef, useState } from 'react';
import { rosClient, SETTLE_MS } from './ros';

/** how long to wait for brain-ros to answer after connecting */
export const CONNECT_WAIT_MS = 15000;

/** host: brain-ros's rosbridge (the brain host, :9090 by default) */
export function useConnectThenStart(host: string, ready: boolean, start: () => void): { press: () => void; connecting: boolean } {
  const startRef = useRef(start);
  startRef.current = start;            // the start of the latest render (latest state)
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!(connecting && ready)) return;
    // a command sent the moment the connection is up can be lost (see SETTLE_MS)
    const t = setTimeout(() => { setConnecting(false); startRef.current(); },
      Math.max(0, SETTLE_MS - rosClient.connectedFor));
    return () => clearTimeout(t);
  }, [connecting, ready]);
  // no answer (brain-ros not running, or no mode manager): stop waiting
  useEffect(() => {
    if (!connecting) return;
    const t = setTimeout(() => setConnecting(false), CONNECT_WAIT_MS);
    const off = rosClient.onStatus(s => { if (s === 'error' || s === 'disconnected') setConnecting(false); });
    return () => { clearTimeout(t); off(); };
  }, [connecting]);

  const press = () => {
    if (ready) { start(); return; }
    setConnecting(true);
    rosClient.open(host);
  };
  return { press, connecting };
}
