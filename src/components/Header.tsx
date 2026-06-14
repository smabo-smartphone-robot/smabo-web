import { useBrain } from '../store/useBrain';

export function Header() {
  const status = useBrain(s => s.status);
  const host = useBrain(s => s.host);
  const msgRate = useBrain(s => s.msgRate);
  const setHost = useBrain(s => s.setHost);
  const connect = useBrain(s => s.connect);

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
          placeholder="host:port"
          style={{ width: 180 }}
          onKeyDown={e => { if (e.key === 'Enter') connect(); }}
        />
        <button onClick={connect}>{btnLabel}</button>
        <span className="msg-rate">{msgRate} msg/s</span>
      </div>
    </header>
  );
}
