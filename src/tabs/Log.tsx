import { useState, useEffect, useRef } from 'react';
import { useBrain } from '../store/useBrain';
import { brain } from '../ws/brain';

export function Log() {
  const logs = useBrain(s => s.logs);
  const clearLogs = useBrain(s => s.clearLogs);
  const addSentLog = useBrain(s => s.addSentLog);

  const [filter, setFilter] = useState('');
  const [paused, setPaused] = useState(false);
  const [sendText, setSendText] = useState('{"op":"publish","topic":"/test","msg":{}}');

  const listRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Auto-scroll
  useEffect(() => {
    if (!pausedRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs]);

  const filtered = filter
    ? logs.filter(l => l.text.includes(filter) || (l.topic && l.topic.includes(filter)))
    : logs;

  const handleSend = () => {
    const text = sendText.trim();
    if (!text) return;
    try {
      const obj = JSON.parse(text) as object;
      brain.send(obj);
      addSentLog(text);
    } catch {
      addSentLog(`[PARSE ERROR] ${text}`);
    }
  };

  const renderEntry = (log: typeof logs[number]) => {
    if (log.type === 'recv') {
      try {
        const parsed = JSON.parse(log.text) as Record<string, unknown>;
        const topic = log.topic ?? parsed['topic'];
        return (
          <>
            {topic && <span className="log-topic">{String(topic)}</span>}
            <span className="log-msg-json">
              {JSON.stringify(parsed, null, 2)}
            </span>
          </>
        );
      } catch {
        return <span>{log.text}</span>;
      }
    }
    if (log.type === 'sent') {
      return <span style={{ color: 'var(--green)' }}>[SENT] {log.text}</span>;
    }
    return <span style={{ color: 'var(--dim)' }}>[INFO] {log.text}</span>;
  };

  return (
    <div className="log-layout">
      <div className="log-toolbar">
        <input
          type="text"
          placeholder="Filter..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <button onClick={() => setPaused(p => !p)}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button onClick={clearLogs}>Clear</button>
        <span style={{ fontSize: '.75rem', color: 'var(--dim)' }}>
          {filtered.length} / {logs.length}
        </span>
      </div>

      <div className="log-list" ref={listRef}>
        {filtered.map(log => (
          <div key={log.id} className={`log-entry ${log.type}`}>
            {renderEntry(log)}
          </div>
        ))}
      </div>

      {/* Send form (shown from App.tsx footer slot) */}
      <div className="log-send-row" style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <textarea
          value={sendText}
          onChange={e => setSendText(e.target.value)}
          style={{ flex: 1, height: 36, resize: 'none', fontSize: '.78rem' }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button onClick={handleSend} style={{ whiteSpace: 'nowrap' }}>Send</button>
      </div>
    </div>
  );
}
