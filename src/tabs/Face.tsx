import { useState, useRef } from 'react';
import { brain } from '../ws/brain';
import { useBrain } from '../store/useBrain';
import { GazePad } from '../components/GazePad';

export function Face() {
  const [sayText, setSayText] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [exprId, setExprId] = useState('');

  const recognized = useBrain(s => s.recognized);
  const clearRecognized = useBrain(s => s.clearRecognized);

  // /look_at 送信のスロットリング（ドラッグ中の publish 過多を防ぐ）
  const lastLookAtRef = useRef(0);

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

  // 画面 (右+, 下+) の視線方向を ROS 座標 (前x / 左y / 上z) の PoseStamped に変換して送る。
  // アプリの parseLookAt は gazeX=-y/x, gazeY=-z/x で解釈するため、前方=1 として y=-gx, z=-gy。
  const sendLookAt = (gx: number, gy: number, force = false) => {
    const now = performance.now();
    if (!force && now - lastLookAtRef.current < 50) return;
    lastLookAtRef.current = now;
    brain.publish('/look_at', {
      header: { stamp: { sec: 0, nanosec: 0 }, frame_id: 'base_link' },
      pose: {
        position: { x: 1.0, y: -gx, z: -gy },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    });
  };

  const fmtTime = (t: number) =>
    new Date(t).toLocaleTimeString('en-GB', { hour12: false });

  return (
    <div className="face-layout">

      {/* Recognized speech (app → web) */}
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Recognized speech (from app)</span>
          {recognized.length > 0 && (
            <button onClick={clearRecognized} style={{ fontSize: '.7rem', padding: '2px 8px' }}>Clear</button>
          )}
        </div>
        {recognized.length === 0 ? (
          <div className="no-data">Nothing received yet (/speech/recognized)</div>
        ) : (
          <div className="recognized-list">
            {recognized.map((r, i) => (
              <div key={`${r.t}-${i}`} className="recognized-item">
                <span className="recognized-time">{fmtTime(r.t)}</span>
                <span className="recognized-text">{r.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gaze control (web → app, /look_at) */}
      <div className="card">
        <div className="card-title">Gaze control</div>
        <div className="expr-hint" style={{ marginBottom: 8 }}>
          Set the app's eyes to <b>Follow</b> mode to control the gaze direction with this pad.
        </div>
        <GazePad onGaze={(x, y) => sendLookAt(x, y)} />
      </div>

      {/* Expression */}
      <div className="card">
        <div className="card-title">Expression</div>
        <div className="expr-row">
          <span className="expr-hint">Expression ID (number defined in the app)</span>
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
            placeholder="Speech text..."
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
