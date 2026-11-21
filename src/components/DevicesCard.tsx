import { useCallback, useEffect, useState } from 'react';
import { useBrain } from '../store/useBrain';
import {
  createInvite, listPairings, removePairing, renamePairing, sendInviteToDevice,
  type Invite, type PairingItem, type PairRole,
} from '../ws/brainApi';

// Clients paired with the brain, and adding / removing them (smabo-brain
// pairing). Only shown when the brain uses pairing (/brain/info auth: true).
const LABEL: Record<PairRole, string> = { web: 'Browser', app: 'Phone', esp32: 'ESP32' };

function ago(t: number): string {
  if (!t) return 'never';
  const s = Math.max(0, Date.now() / 1000 - t);
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

function InviteBox({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  const addToast = useBrain(s => s.addToast);
  const [left, setLeft] = useState(invite.expires_in);
  const [device, setDevice] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setLeft(Math.max(0, invite.expires_in - Math.round((Date.now() - t0) / 1000))), 1000);
    return () => clearInterval(id);
  }, [invite]);

  const send = async () => {
    setSending(true);
    try {
      await sendInviteToDevice(device, invite.code);
      addToast('Code sent. The device pairs when it reconnects to the brain', 'ok');
    } catch (e) {
      addToast((e as Error).message, 'err');
    } finally {
      setSending(false);
    }
  };

  const expired = left === 0;
  return (
    <div className="invite-box" role="status">
      <div className="invite-head">
        <span>Invite for a {LABEL[invite.role].toLowerCase()}</span>
        <button type="button" className="link" onClick={onClose}>Close</button>
      </div>
      <div className={`invite-code ${expired ? 'expired' : ''}`}>{invite.code}</div>
      <div className="invite-ttl">
        {expired ? 'Expired. Make a new one.' : `Works once, for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} more`}
      </div>
      {invite.role === 'web' && (
        <p className="invite-how">Open smabo-web in the other browser and enter this code on its pairing screen.</p>
      )}
      {invite.role === 'app' && (
        <p className="invite-how">In smabo-app, open <b>Settings → Brain → Pair</b> and enter this code.</p>
      )}
      {invite.role === 'esp32' && (
        <p className="invite-how">
          Setting up Wi-Fi over Bluetooth sends it for you. smabo-sim: start it with <code>--invite {invite.code}</code>.
        </p>
      )}
      {invite.role !== 'web' && !expired && (
        <div className="invite-send">
          <label>
            Or send it to a {LABEL[invite.role].toLowerCase()} that is on the network but not paired
            <input value={device} onChange={e => setDevice(e.target.value)}
              placeholder={invite.role === 'esp32' ? 'http://192.168.1.42' : 'http://192.168.1.20:8081'} />
          </label>
          <button type="button" disabled={!device.trim() || sending} onClick={send}>{sending ? 'Sending…' : 'Send'}</button>
        </div>
      )}
    </div>
  );
}

export function DevicesCard() {
  const auth = useBrain(s => s.brainInfo?.auth);
  const status = useBrain(s => s.status);
  const addToast = useBrain(s => s.addToast);
  const unpairBrowser = useBrain(s => s.unpairBrowser);
  const [items, setItems] = useState<PairingItem[]>([]);
  const [you, setYou] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    listPairings()
      .then(r => { setItems(r.pairings); setYou(r.you); setError(''); })
      .catch(e => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (!auth || status !== 'connected') return;
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [auth, status, load]);

  if (!auth || status !== 'connected') return null;

  const add = (role: PairRole) => {
    createInvite(role).then(setInvite).catch(e => addToast((e as Error).message, 'err'));
  };

  const remove = (p: PairingItem) => {
    const self = p.id === you;
    const msg = self
      ? 'Remove this browser? You will not be able to control the robot from here until it is paired again.'
      : `Remove ${LABEL[p.role].toLowerCase()} "${p.name}"? It is disconnected now and must be paired again to come back.`;
    if (!confirm(msg)) return;
    removePairing(p.id)
      .then(() => { if (self) unpairBrowser(); else load(); })
      .catch(e => addToast((e as Error).message, 'err'));
  };

  const saveName = () => {
    if (!editing) return;
    renamePairing(editing.id, editing.name)
      .then(() => { setEditing(null); load(); })
      .catch(e => addToast((e as Error).message, 'err'));
  };

  const browsers = items.filter(p => p.role === 'web').length;

  return (
    <div className="card devices-card">
      <div className="card-title">Devices paired with the brain</div>
      {error && <div className="devices-error" role="alert">{error}</div>}
      <ul className="devices-list">
        {items.map(p => (
          <li key={p.id} className="devices-row">
            <span className={`live-dot ${p.online ? 'live' : ''}`} title={p.online ? 'connected' : 'not connected'} />
            <span className="devices-role">{LABEL[p.role]}</span>
            {editing?.id === p.id ? (
              <form className="devices-rename" onSubmit={e => { e.preventDefault(); saveName(); }}>
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                  maxLength={40} autoFocus aria-label="New name" />
                <button type="submit">Save</button>
                <button type="button" onClick={() => setEditing(null)}>Cancel</button>
              </form>
            ) : (
              <span className="devices-name">
                {p.name}{p.id === you && <span className="devices-you">this browser</span>}
              </span>
            )}
            <span className="devices-seen">{p.online ? 'online' : ago(p.last_seen)}</span>
            {editing?.id !== p.id && (
              <span className="devices-actions">
                <button type="button" onClick={() => setEditing({ id: p.id, name: p.name })}>Rename</button>
                <button type="button" className="danger"
                  disabled={p.role === 'web' && browsers <= 1}
                  title={p.role === 'web' && browsers <= 1 ? 'The last browser cannot be removed' : undefined}
                  onClick={() => remove(p)}>Remove</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="devices-add">
        <span>Add</span>
        <button type="button" onClick={() => add('app')}>Phone</button>
        <button type="button" onClick={() => add('esp32')}>ESP32</button>
        <button type="button" onClick={() => add('web')}>Browser</button>
      </div>
      {invite && <InviteBox key={invite.code} invite={invite} onClose={() => setInvite(null)} />}
    </div>
  );
}
