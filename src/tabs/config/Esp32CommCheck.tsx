import { useBrain } from '../../store/useBrain';

// ── ESP32 connectivity check ─────────────────────────────────
// Verifies two paths:
//   1. REST (web → ESP32 direct): GET /config ping
//   2. WS telemetry (ESP32 → brain → web): freshness of /odom and /joint_states
export function Esp32CommCheck() {
  const esp32Host = useBrain(s => s.esp32Host);
  const esp32Ping = useBrain(s => s.esp32Ping);
  const esp32WsPing = useBrain(s => s.esp32WsPing);
  const status = useBrain(s => s.status);
  const pingEsp32 = useBrain(s => s.pingEsp32);
  const pingEsp32Ws = useBrain(s => s.pingEsp32Ws);

  const brainConnected = status === 'connected';

  const restDot = esp32Ping == null ? '' : esp32Ping.ok ? 'live' : 'err';
  const restText = esp32Ping == null
    ? 'Not checked'
    : esp32Ping.ok
      ? `OK ${esp32Ping.latencyMs}ms`
      : 'No response';

  const wsPingDot = esp32WsPing == null ? '' : esp32WsPing.ok ? 'live' : 'err';
  const wsPingText = esp32WsPing == null
    ? 'Not checked'
    : esp32WsPing.ok
      ? `OK ${esp32WsPing.latencyMs}ms`
      : 'No response';

  return (
    <div className="card esp32-check">
      <div className="card-title">ESP32 connection check</div>

      <div className="esp32-check-row">
        <span className={`live-dot ${restDot}`} />
        <span className="esp32-check-label" title="Direct HTTP from web → ESP32 (GET /config)">
          REST (web↔ESP32)
        </span>
        <span className="esp32-check-val">{restText}</span>
        <button
          style={{ fontSize: '.72rem', padding: '2px 10px' }}
          disabled={!esp32Host}
          onClick={pingEsp32}
        >Ping</button>
      </div>

      <div className="esp32-check-row">
        <span className={`live-dot ${wsPingDot}`} />
        <span className="esp32-check-label"
          title="Echoes /ping→/pong via the brain. Only works while web↔brain is connected, so the result indicates brain↔ESP32 WS connectivity.">
          WS (brain↔ESP32)
        </span>
        <span className="esp32-check-val">{wsPingText}</span>
        <button
          style={{ fontSize: '.72rem', padding: '2px 10px' }}
          disabled={!brainConnected}
          onClick={pingEsp32Ws}
        >Ping</button>
      </div>

      {!esp32Host && (
        <div className="expr-hint" style={{ marginTop: 4 }}>
          Set the ESP32 host in the header to enable REST Ping. WS ping needs the brain connected.
        </div>
      )}
    </div>
  );
}
