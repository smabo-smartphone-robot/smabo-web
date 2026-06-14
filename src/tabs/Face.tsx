import { useState } from 'react';
import { brain } from '../ws/brain';

export function Face() {
  const [sayText, setSayText] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [exprId, setExprId] = useState('');

  const handleExpression = () => {
    const id = parseInt(exprId);
    if (isNaN(id) || id < 1) return;
    brain.publish('/expression', { data: id });
  };

  const handleSay = () => {
    const text = sayText.trim();
    if (!text) return;
    brain.publish('/speech/say', { data: text });
    setHistory(prev => [text, ...prev].slice(0, 10));
    setSayText('');
  };

  return (
    <div className="face-layout">

      {/* Expression */}
      <div className="card">
        <div className="card-title">Expression</div>
        <div className="expr-row">
          <span className="expr-hint">表情ID（アプリ側で定義した番号）</span>
          <input
            type="number"
            min={1}
            placeholder="ID"
            value={exprId}
            onChange={e => setExprId(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleExpression(); }}
            style={{ width: 80 }}
          />
          <button onClick={handleExpression}>Set</button>
        </div>
      </div>

      {/* Speech / Say */}
      <div className="card">
        <div className="card-title">Speech / Say</div>
        <div className="say-input-row">
          <input
            type="text"
            placeholder="発話テキスト..."
            value={sayText}
            onChange={e => setSayText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSay(); }}
          />
          <button onClick={handleSay}>Say</button>
        </div>
        {history.length > 0 && (
          <div className="say-history">
            {history.map((h, i) => (
              <div key={i} className="say-history-item" onClick={() => setSayText(h)}>
                {h}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
