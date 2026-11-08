import { useState, useRef } from 'react';
import { brain } from '../ws/brain';
import { useBrain } from '../store/useBrain';
import { GazePad } from '../components/GazePad';
import { arr, rec } from './config/fields';

export type FaceSection = 'speech' | 'gaze' | 'expression' | 'say';

/** `sections` limits which cards are shown (all when omitted); used by layout templates. */
export function Face({ sections }: { sections?: FaceSection[] } = {}) {
  const show = (k: FaceSection) => !sections || sections.includes(k);
  const [sayText, setSayText] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [exprName, setExprName] = useState('');

  const recognized = useBrain(s => s.recognized);
  const clearRecognized = useBrain(s => s.clearRecognized);
  const visionConfig = useBrain(s => s.visionConfig);
  // the phone's expression names, when its settings are known (Config tab)
  const phoneConfig = useBrain(s => s.phoneConfig);
  const exprNames = arr<string>(rec(phoneConfig?.['face'])['expressions']).filter(n => typeof n === 'string');

  // Vision の gaze behavior が動いている間は同じ /look_at を奪い合うため、
  // 手動 GazePad を無効化して競合を防ぐ（排他を UI で明示）。
  const visionGazeActive = !!(
    visionConfig &&
    visionConfig.enabled &&
    visionConfig.mode !== 'off' &&
    visionConfig.behaviors.look_at
  );

  // /look_at 送信のスロットリング（ドラッグ中の publish 過多を防ぐ）
  const lastLookAtRef = useRef(0);

  // by name (the phone matches it ignoring case; an unknown name changes nothing)
  const sendExpression = (name: string) => {
    if (name.trim()) brain.publish('/expression', { data: name.trim() });
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
      {show('speech') && <div className="card">
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
      </div>}

      {/* Gaze control (web → app, /look_at) */}
      {show('gaze') && <div className="card">
        <div className="card-title">Gaze control</div>
        {visionGazeActive ? (
          <div className="expr-hint" style={{ marginBottom: 8 }}>
            🟢 <b>Vision is controlling gaze</b> (/look_at). Disable “Gaze (/look_at)”
            in the Vision tab to control the eyes manually here.
          </div>
        ) : (
          <div className="expr-hint" style={{ marginBottom: 8 }}>
            Set the app's eyes to <b>Follow</b> mode to control the gaze direction with this pad.
          </div>
        )}
        <GazePad onGaze={(x, y) => sendLookAt(x, y)} disabled={visionGazeActive} />
      </div>}

      {/* Expression */}
      {show('expression') && <div className="card">
        <div className="card-title">Expression</div>
        <div className="expr-row">
          <span className="expr-hint">Expression name (as named in the app)</span>
          <input
            aria-label="Expression name"
            list="face-expression-names"
            placeholder="Name"
            value={exprName}
            onChange={e => setExprName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendExpression(exprName); }}
            style={{ width: 140 }}
          />
          <datalist id="face-expression-names">
            {exprNames.map(n => <option key={n} value={n} />)}
          </datalist>
          <button onClick={() => sendExpression(exprName)}>Set</button>
        </div>
        {exprNames.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {exprNames.map(n => (
              <button key={n} style={{ fontSize: '.72rem', padding: '2px 8px' }} onClick={() => sendExpression(n)}>{n}</button>
            ))}
          </div>
        )}
      </div>}

      {/* Speech / Say */}
      {show('say') && <div className="card">
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
      </div>}

    </div>
  );
}
