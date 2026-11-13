import { useState } from 'react';
import { ImprovDevice, State, bluetoothAvailable } from '../../ble/improv';
import { useBrain } from '../../store/useBrain';
import { createInvite } from '../../ws/brainApi';

// ── Wi-Fi setup over Bluetooth (Improv) ───────────────────────
// For an ESP32 that cannot join Wi-Fi: it advertises over Bluetooth until it
// has a working network (smabo-esp32 improv.py).
type Phase = 'idle' | 'connecting' | 'ready' | 'sending' | 'done' | 'error';

export function ImprovWifiSetup() {
  const setEsp32Host = useBrain(s => s.setEsp32Host);
  const refreshConfig = useBrain(s => s.refreshConfig);
  const addToast = useBrain(s => s.addToast);
  const brainHost = useBrain(s => s.host);
  const pairing = useBrain(s => s.status === 'connected' && s.brainInfo?.auth === true);

  const [device, setDevice] = useState<ImprovDevice | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');

  const supported = bluetoothAvailable();

  const pick = async () => {
    setPhase('connecting');
    setMessage('');
    try {
      const d = await ImprovDevice.request();
      setDevice(d);
      setPhase('ready');
      if (await d.state() === State.Provisioned) setMessage(`${d.name} is already on Wi-Fi. Sending again replaces the network.`);
    } catch (e) {
      // Closing the picker is not an error worth showing
      const err = e as Error;
      setPhase('idle');
      if (err.name !== 'NotFoundError') setMessage(err.message);
    }
  };

  const send = async () => {
    if (!device) return;
    setPhase('sending');
    setMessage('Sending… the ESP32 is joining the network (up to 20 s)');
    try {
      // A brain with pairing: the ESP32 also gets the brain's address and an
      // invite, and pairs by itself once it is on Wi-Fi.
      if (pairing) {
        const invite = await createInvite('esp32');
        if (!await device.sendBrainInvite(brainHost, invite.code)) {
          addToast('This ESP32 firmware cannot pair over Bluetooth; add it from Devices after Wi-Fi is set', 'err');
        }
      }
      const url = await device.provision(ssid, password, s => {
        if (s === State.Provisioning) setMessage('The ESP32 is joining the network…');
      });
      setPhase('done');
      setPassword('');
      if (url) {
        const host = url.replace(/\/$/, '');
        setEsp32Host(host);
        refreshConfig();
        setMessage(`Connected. Config API: ${host}`);
      } else {
        setMessage('Connected.');
      }
      addToast(`${device.name} joined ${ssid}`, 'ok');
      device.disconnect();
      setDevice(null);
    } catch (e) {
      setPhase('error');
      setMessage((e as Error).message);
    }
  };

  const busy = phase === 'connecting' || phase === 'sending';

  return (
    <div className="card improv-setup">
      <div className="card-title">ESP32 Wi-Fi setup over Bluetooth</div>
      <div className="expr-hint">
        If the ESP32 cannot join Wi-Fi, it waits here for a network name and password.
        {!supported && ' This needs Chrome or Edge, opened at https:// or http://localhost.'}
      </div>

      {!device ? (
        <button disabled={!supported || busy} onClick={pick}>
          {phase === 'connecting' ? 'Searching…' : 'Find ESP32'}
        </button>
      ) : (
        <form
          className="improv-form"
          onSubmit={e => { e.preventDefault(); void send(); }}
        >
          <span className="improv-device">{device.name}</span>
          <label>
            Network name (SSID)
            <input value={ssid} onChange={e => setSsid(e.target.value)} autoComplete="off" required maxLength={32} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete="new-password" maxLength={64} />
          </label>
          <div className="improv-actions">
            <button type="submit" disabled={busy || !ssid}>{phase === 'sending' ? 'Sending…' : 'Send'}</button>
            <button type="button" disabled={busy} onClick={() => { device.disconnect(); setDevice(null); setPhase('idle'); setMessage(''); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {message && <div className={`improv-msg ${phase === 'error' ? 'err' : phase === 'done' ? 'ok' : ''}`} role="status">{message}</div>}
    </div>
  );
}
