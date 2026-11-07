// Connection status for the setup guides (smabo-web / smabo-app / smabo-esp32):
// the same checks as the guides' common start-up page, in one place.
import { useBrain } from '../store/useBrain';
import { Esp32CommCheck } from '../tabs/Config';

type Part = 'brain' | 'app' | 'esp32';

function Row({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  return (
    <div className="conn-row">
      <span className={`live-dot ${ok == null ? '' : ok ? 'live' : 'err'}`} />
      <span className="conn-label">{label}</span>
      <span className="conn-detail">{detail}</span>
    </div>
  );
}

export function ConnectionPanel({ parts = ['brain', 'app', 'esp32'], next }: { parts?: Part[]; next?: string } = {}) {
  const status = useBrain(s => s.status);
  const host = useBrain(s => s.host);
  const msgRate = useBrain(s => s.msgRate);
  const imu = useBrain(s => s.imu);
  const gps = useBrain(s => s.gps);
  const stream = useBrain(s => s.webrtcStream);

  const brainOk = status === 'connected';
  const appParts = [imu && 'IMU', gps && 'GPS', stream && 'camera'].filter(Boolean) as string[];
  const appOk = appParts.length > 0;

  return (
    <div className="conn-panel">
      {parts.includes('brain') && (
        <div className="card">
          <div className="card-title">smabo-brain ↔ smabo-web</div>
          <Row
            ok={brainOk ? true : status === 'error' ? false : null}
            label={brainOk ? 'Brain connected' : status === 'connecting' ? 'Connecting…' : 'Not connected'}
            detail={brainOk ? `${host} · ${msgRate} msg/s` : 'Enter the brain host in the header and press Connect'}
          />
        </div>
      )}
      {parts.includes('app') && (
        <div className="card">
          <div className="card-title">smabo-app → smabo-brain</div>
          <Row
            ok={brainOk ? appOk : null}
            label={appOk ? 'App connected' : 'Waiting for the app'}
            detail={appOk ? `receiving ${appParts.join(', ')}` : 'Start smabo-app and enter the brain address'}
          />
        </div>
      )}
      {parts.includes('esp32') && <Esp32CommCheck />}
      {next && (
        <div className="card conn-next">
          <div className="card-title">Next</div>
          <div className="expr-hint">{next}</div>
        </div>
      )}
    </div>
  );
}
