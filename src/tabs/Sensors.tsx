import { useBrain } from '../store/useBrain';
import { useDragOrder } from '../hooks/useDragOrder';

function ImuBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(1, Math.abs(value) / max) * 50;
  const isPos = value >= 0;
  return (
    <div className="imu-bar-wrap">
      <div
        className="imu-bar"
        style={{
          left: isPos ? '50%' : `${50 - pct}%`,
          width: `${pct}%`,
          background: isPos ? 'var(--cyan)' : 'var(--orange)',
        }}
      />
    </div>
  );
}

const SENSOR_KEYS = ['imu', 'gps', 'camera'] as const;
type SK = (typeof SENSOR_KEYS)[number];

export function Sensors() {
  const imu = useBrain(s => s.imu);
  const gps = useBrain(s => s.gps);
  const cameraJpeg = useBrain(s => s.cameraJpeg);
  const { sort, handleProps, dropProps } = useDragOrder('smabo-sensors-order');

  const fmt = (v: number, d = 2) => v.toFixed(d);
  const sorted = sort(SENSOR_KEYS) as SK[];

  function renderCard(k: SK) {
    const drop = dropProps(k, SENSOR_KEYS);
    const hdl = handleProps(k);

    if (k === 'imu') return (
      <div key="imu" className="sensor-card" {...drop}>
        <div className="sensor-header">
          <span className="drag-handle" {...hdl}>⠿</span>
          <span className="sensor-title">IMU</span>
          <div className={`live-dot ${imu ? 'live' : ''}`} />
        </div>
        {imu ? (
          <>
            <div className="imu-section-label">Orientation</div>
            {([
              ['Roll',  imu.roll,  180],
              ['Pitch', imu.pitch, 90],
              ['Yaw',   imu.yaw,   180],
            ] as [string, number, number][]).map(([label, val, max]) => (
              <div key={label} className="imu-row">
                <span className="imu-label">{label}</span>
                <ImuBar value={val} max={max} />
                <span className="imu-val">{fmt(val, 1)}°</span>
              </div>
            ))}
            <div className="imu-section-label">Gyro (rad/s)</div>
            {([['X', imu.gx], ['Y', imu.gy], ['Z', imu.gz]] as [string, number][]).map(([label, val]) => (
              <div key={`g${label}`} className="imu-row">
                <span className="imu-label">Gyro {label}</span>
                <ImuBar value={val} max={5} />
                <span className="imu-val">{fmt(val)}</span>
              </div>
            ))}
            <div className="imu-section-label">Accel (m/s²)</div>
            {([['X', imu.ax], ['Y', imu.ay], ['Z', imu.az]] as [string, number][]).map(([label, val]) => (
              <div key={`a${label}`} className="imu-row">
                <span className="imu-label">Accel {label}</span>
                <ImuBar value={val} max={20} />
                <span className="imu-val">{fmt(val)}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="no-data">No data</div>
        )}
      </div>
    );

    if (k === 'gps') return (
      <div key="gps" className="sensor-card" {...drop}>
        <div className="sensor-header">
          <span className="drag-handle" {...hdl}>⠿</span>
          <span className="sensor-title">GPS</span>
          <div className={`live-dot ${gps ? 'live' : ''}`} />
        </div>
        {gps ? (
          <>
            {([
              ['Latitude',  gps.lat.toFixed(7)],
              ['Longitude', gps.lon.toFixed(7)],
              ['Altitude',  `${gps.alt.toFixed(2)} m`],
              ['Accuracy',  gps.accuracy != null ? `${gps.accuracy.toFixed(2)} m` : 'N/A'],
            ] as [string, string][]).map(([label, val]) => (
              <div key={label} className="gps-row">
                <span className="gps-label">{label}</span>
                <span className="gps-val">{val}</span>
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              <a
                href={`https://www.google.com/maps?q=${gps.lat},${gps.lon}`}
                target="_blank"
                rel="noreferrer"
              >
                <button style={{ width: '100%', fontSize: '.75rem' }}>Open in Google Maps</button>
              </a>
            </div>
          </>
        ) : (
          <div className="no-data">No data</div>
        )}
      </div>
    );

    return (
      <div key="camera" className="sensor-card" {...drop}>
        <div className="sensor-header">
          <span className="drag-handle" {...hdl}>⠿</span>
          <span className="sensor-title">Camera</span>
          <div className={`live-dot ${cameraJpeg ? 'live' : ''}`} />
        </div>
        {cameraJpeg ? (
          <img
            className="camera-img"
            src={`data:image/jpeg;base64,${cameraJpeg}`}
            alt="camera"
          />
        ) : (
          <div className="camera-placeholder">No camera feed</div>
        )}
      </div>
    );
  }

  return (
    <div className="sensors-layout">
      {sorted.map(k => renderCard(k))}
    </div>
  );
}
