import { useBrain } from '../store/useBrain';

export function Header() {
  const status = useBrain(s => s.status);
  const host = useBrain(s => s.host);
  const esp32Host = useBrain(s => s.esp32Host);
  const msgRate = useBrain(s => s.msgRate);
  const setHost = useBrain(s => s.setHost);
  const connect = useBrain(s => s.connect);
  const setEsp32Host = useBrain(s => s.setEsp32Host);
  const refreshConfig = useBrain(s => s.refreshConfig);

  const isConnectedOrConnecting = status === 'connected' || status === 'connecting';
  const btnLabel = isConnectedOrConnecting ? '切断' : '接続';

  return (
    <header>
      <div className="hrow">
        <h1>smabo-web</h1>
        <div className={`dot ${status}`} title={status} />
        <input
          type="text"
          value={host}
          onChange={e => setHost(e.target.value)}
          placeholder="brain host:port"
          style={{ width: 160 }}
          onKeyDown={e => { if (e.key === 'Enter') connect(); }}
        />
        <button onClick={connect}>{btnLabel}</button>

        <input
          type="text"
          value={esp32Host}
          onChange={e => setEsp32Host(e.target.value)}
          placeholder="esp32 host (REST)"
          style={{ width: 160 }}
          onKeyDown={e => { if (e.key === 'Enter') refreshConfig(); }}
        />
        <button onClick={refreshConfig} disabled={!esp32Host}>Config取得</button>

        <span className="msg-rate">{msgRate} msg/s</span>
      </div>
    </header>
  );
}
