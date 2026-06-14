import { useState } from 'react';
import { useBrain } from '../store/useBrain';
import { brain } from '../ws/brain';
import { Joystick } from '../components/Joystick';
import { TrailMap } from '../components/TrailMap';
import { useDragOrder } from '../hooks/useDragOrder';

const DRIVE_PANELS = ['telem', 'joystick', 'trail'] as const;
type DP = (typeof DRIVE_PANELS)[number];

export function Drive() {
  const odom = useBrain(s => s.odom);
  const trail = useBrain(s => s.trail);
  const clearTrail = useBrain(s => s.clearTrail);
  const { sort, handleProps, dropProps } = useDragOrder('smabo-drive-order');

  const [maxLin, setMaxLin] = useState(0.3);
  const [maxAng, setMaxAng] = useState(1.0);
  const [cmdLin, setCmdLin] = useState(0);
  const [cmdAng, setCmdAng] = useState(0);

  const handleCmd = (lin: number, ang: number) => {
    setCmdLin(lin);
    setCmdAng(ang);
    brain.publish('/cmd_vel', {
      linear: { x: lin, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: ang },
    });
  };

  const handleStop = () => {
    setCmdLin(0);
    setCmdAng(0);
    brain.publish('/cmd_vel', {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    });
  };

  const fmt = (v: number, d = 3) => v.toFixed(d);
  const sorted = sort(DRIVE_PANELS) as DP[];

  function renderPanel(k: DP) {
    const drop = dropProps(k, DRIVE_PANELS);
    const hdl = handleProps(k);

    if (k === 'telem') return (
      <div key="telem" className="drive-col-telem" {...drop}>
        <span className="drag-handle" {...hdl}>⠿</span>
        <div className="drive-telem">
          <div className="card">
            <div className="card-title">Velocity /odom</div>
            <div className="telem-row">
              <span className="telem-label">vx</span>
              <span className="telem-val">{odom ? fmt(odom.vx) : '--'} m/s</span>
            </div>
            <div className="telem-row">
              <span className="telem-label">wz</span>
              <span className="telem-val">{odom ? fmt(odom.wz) : '--'} rad/s</span>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Position</div>
            <div className="telem-row">
              <span className="telem-label">x</span>
              <span className="telem-val">{odom ? fmt(odom.x) : '--'} m</span>
            </div>
            <div className="telem-row">
              <span className="telem-label">y</span>
              <span className="telem-val">{odom ? fmt(odom.y) : '--'} m</span>
            </div>
            <div className="telem-row">
              <span className="telem-label">θ</span>
              <span className="telem-val">{odom ? fmt(odom.th, 1) : '--'} °</span>
            </div>
          </div>

          <div className="card">
            <div className="card-title">cmd_vel</div>
            <div className="telem-row">
              <span className="telem-label">lin</span>
              <span className="telem-val">{fmt(cmdLin)} m/s</span>
            </div>
            <div className="telem-row">
              <span className="telem-label">ang</span>
              <span className="telem-val">{fmt(cmdAng)} rad/s</span>
            </div>
          </div>

          <div className="card speed-controls">
            <div className="card-title">Speed Limit</div>
            <div className="speed-row">
              <label>Linear</label>
              <input
                type="range"
                min={0.05} max={1.0} step={0.05}
                value={maxLin}
                onChange={e => setMaxLin(Number(e.target.value))}
              />
              <span className="val">{maxLin.toFixed(2)}</span>
            </div>
            <div className="speed-row">
              <label>Angular</label>
              <input
                type="range"
                min={0.1} max={3.0} step={0.1}
                value={maxAng}
                onChange={e => setMaxAng(Number(e.target.value))}
              />
              <span className="val">{maxAng.toFixed(1)}</span>
            </div>
          </div>

          <button className="stop-btn danger" onClick={handleStop}>STOP</button>
        </div>
      </div>
    );

    if (k === 'joystick') return (
      <div key="joystick" className="drive-col-joystick" {...drop}>
        <span className="drag-handle" {...hdl}>⠿</span>
        <Joystick maxLin={maxLin} maxAng={maxAng} onCmd={handleCmd} onStop={handleStop} />
      </div>
    );

    return (
      <div key="trail" className="drive-right" {...drop}>
        <span className="drag-handle" {...hdl}>⠿</span>
        <div className="card" style={{ flex: 1 }}>
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Trail Map</span>
            <button onClick={clearTrail} style={{ fontSize: '.7rem', padding: '2px 8px' }}>Clear</button>
          </div>
          <TrailMap
            trail={trail}
            robotTh={odom?.th ?? 0}
            robotX={odom?.x ?? 0}
            robotY={odom?.y ?? 0}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="drive-layout">
      {sorted.map(k => renderPanel(k))}
    </div>
  );
}
