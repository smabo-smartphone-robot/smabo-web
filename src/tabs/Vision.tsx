import { useRef, useEffect } from 'react';
import { useBrain } from '../store/useBrain';

const MODES = ['off', 'aruco', 'color', 'face', 'qr'] as const;
const ARUCO_DICTS = [
  'ALL',
  'DICT_4X4_50', 'DICT_4X4_100', 'DICT_4X4_250',
  'DICT_5X5_50', 'DICT_5X5_100', 'DICT_5X5_250',
  'DICT_6X6_50', 'DICT_6X6_100', 'DICT_6X6_250',
  'DICT_7X7_50', 'DICT_APRILTAG_36h11', 'DICT_ARUCO_ORIGINAL',
] as const;

const arucoDictLabel = (d: string) => (d === 'ALL' ? 'ALL (any dictionary, slower)' : d);

const clamp255 = (c: number) => Math.max(0, Math.min(255, Math.round(c)));
const rgbToHex = (rgb: number[] | null) =>
  rgb && rgb.length === 3
    ? '#' + rgb.map(c => clamp255(c).toString(16).padStart(2, '0')).join('')
    : '#ff0000';
const hexToRgb = (hex: string): number[] => {
  const s = hex.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};

export function Vision() {
  const status       = useBrain(s => s.status);
  const cfg          = useBrain(s => s.visionConfig);
  const detections   = useBrain(s => s.detections);
  const markers      = useBrain(s => s.visionMarkers);
  const setVisionConfig = useBrain(s => s.setVisionConfig);
  const webrtcStream = useBrain(s => s.webrtcStream);
  const previewOn    = useBrain(s => s.previewOn);
  const setPreview   = useBrain(s => s.setPreview);
  const esp32Config  = useBrain(s => s.esp32Config);

  const jointNames: string[] = Object.keys(
    (esp32Config as Record<string, unknown> & { servos?: { joints?: Record<string, unknown> } })
      ?.servos?.joints ?? {}
  );

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = webrtcStream;
  }, [webrtcStream]);

  const connected = status === 'connected';

  // brain がスナップショットを送る前（未接続 / 受信前）はフォームを出せない。
  if (!cfg) {
    return (
      <div className="vision-layout">
        <div className="card">
          <div className="card-title">Vision</div>
          <div className="no-data">
            {connected
              ? 'Waiting for /vision/config snapshot from brain…'
              : 'Connect to the brain to configure vision.'}
          </div>
        </div>
      </div>
    );
  }

  const fmtPct = (cx: number, w: number) => `${(cx / (w || 1)) * 100}%`;
  const imgW = detections?.source_img_width ?? 0;
  const imgH = detections?.source_img_height ?? 0;

  return (
    <div className="vision-layout">

      {/* ── Detection settings ─────────────────────────── */}
      <div className="card">
        <div className="card-title">Detection</div>

        <div className="config-field">
          <label>Enabled</label>
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={e => setVisionConfig({ enabled: e.target.checked })}
          />
        </div>

        <div className="config-field">
          <label>Mode</label>
          <select value={cfg.mode} onChange={e => setVisionConfig({ mode: e.target.value })}>
            {MODES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {cfg.mode === 'color' && (
          <>
            <div className="config-field">
              <label>Target color</label>
              <input
                type="color"
                value={rgbToHex(cfg.color_rgb)}
                onChange={e => setVisionConfig({ color_rgb: hexToRgb(e.target.value) })}
              />
            </div>
            <div className="config-field">
              <label>Hue tolerance</label>
              <input
                type="range"
                min={4} max={40} step={1}
                value={cfg.color_hue_tol}
                onChange={e => setVisionConfig({ color_hue_tol: Number(e.target.value) })}
              />
              <span className="val">{cfg.color_hue_tol}</span>
            </div>
            <div className="config-field">
              <label>Min saturation</label>
              <input
                type="range"
                min={0} max={255} step={5}
                value={cfg.color_s_min}
                onChange={e => setVisionConfig({ color_s_min: Number(e.target.value) })}
              />
              <span className="val">{cfg.color_s_min}</span>
            </div>
            <div className="config-field">
              <label>Min brightness</label>
              <input
                type="range"
                min={0} max={255} step={5}
                value={cfg.color_v_min}
                onChange={e => setVisionConfig({ color_v_min: Number(e.target.value) })}
              />
              <span className="val">{cfg.color_v_min}</span>
            </div>
          </>
        )}

        {cfg.mode === 'aruco' && (
          <>
            <div className="config-field">
              <label>Marker dictionary</label>
              <select
                value={cfg.aruco_dict}
                onChange={e => setVisionConfig({ aruco_dict: e.target.value })}
              >
                {ARUCO_DICTS.map(d => <option key={d} value={d}>{arucoDictLabel(d)}</option>)}
              </select>
            </div>
            <div className="config-field">
              <label>Target marker ID</label>
              <input
                type="text"
                placeholder="(any = largest)"
                value={cfg.target_marker_id ?? ''}
                onChange={e => {
                  const v = e.target.value.trim();
                  setVisionConfig({ target_marker_id: v === '' ? null : v });
                }}
              />
            </div>
            <div className="expr-hint">
              Select the dictionary of the marker you printed. If unsure, use <b>ALL</b> to scan every dictionary (a bit heavier, and may increase false positives).
            </div>
          </>
        )}

        <div className="config-field">
          <label>Speak detected text</label>
          <input
            type="checkbox"
            checked={cfg.speak}
            onChange={e => setVisionConfig({ speak: e.target.checked })}
          />
        </div>

        <div className="config-field">
          <label>Camera HFOV (deg)</label>
          <input
            type="number"
            min={10} max={180} step={1}
            value={cfg.hfov_deg}
            onChange={e => setVisionConfig({ hfov_deg: Number(e.target.value) })}
          />
        </div>

        <div className="config-field">
          <label>Detection rate (fps)</label>
          <input
            type="range"
            min={1} max={30} step={1}
            value={cfg.capture_fps ?? 30}
            onChange={e => setVisionConfig({ capture_fps: Number(e.target.value) })}
          />
          <span className="val">{cfg.capture_fps ?? 30} fps</span>
        </div>
        <div className="expr-hint" style={{ marginTop: -4, marginBottom: 8 }}>
          Frame rate sent from the browser to the brain. Higher is smoother for gaze / servo / drive following, but uses more bandwidth and CPU.
        </div>

        <div className="config-field">
          <label>Min size</label>
          <input
            type="range"
            min={0} max={10} step={0.05}
            value={+(cfg.min_area_frac * 100).toFixed(2)}
            onChange={e => setVisionConfig({ min_area_frac: Number(e.target.value) / 100 })}
          />
          <span className="val">
            {(() => {
              if (imgW > 0 && imgH > 0) {
                const side = Math.round(Math.sqrt(cfg.min_area_frac * imgW * imgH));
                return `min side ≥ ${side}px`;
              }
              return `${(cfg.min_area_frac * 100).toFixed(2)}%`;
            })()}
          </span>
        </div>
      </div>

      {/* ── Behaviors ──────────────────────────────────── */}
      <div className="card">
        <div className="card-title">Behaviors</div>
        <div className="expr-hint" style={{ marginBottom: 8 }}>
          Choose individually whether the detected direction drives the gaze, the servo, and/or the drive.
        </div>

        <div className="config-field">
          <label>Gaze (/look_at)</label>
          <input
            type="checkbox"
            checked={cfg.behaviors.look_at}
            onChange={e => setVisionConfig({ behaviors: { look_at: e.target.checked } })}
          />
        </div>
        {cfg.behaviors.look_at && !cfg.behaviors.servo && (
          <div className="behavior-settings">
            <div className="config-field">
              <label>Lost tolerance (frames)</label>
              <input
                type="number"
                min={0} max={60} step={1}
                value={cfg.target_joints.lost_tolerance ?? 0}
                onChange={e => setVisionConfig({ target_joints: { lost_tolerance: Number(e.target.value) } })}
              />
            </div>
          </div>
        )}

        <div className="config-field">
          <label>Servo follow (/servo/command)</label>
          <input
            type="checkbox"
            checked={cfg.behaviors.servo}
            onChange={e => setVisionConfig({ behaviors: { servo: e.target.checked } })}
          />
        </div>
        {cfg.behaviors.servo && (
          <div className="behavior-settings">
            <div className="config-field">
              <label>Pan joint (horizontal)</label>
              <select
                value={cfg.target_joints.pan}
                onChange={e => setVisionConfig({ target_joints: { pan: e.target.value } })}
              >
                <option value="">(none)</option>
                {jointNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="config-field">
              <label>Tilt joint (vertical)</label>
              <select
                value={cfg.target_joints.tilt}
                onChange={e => setVisionConfig({ target_joints: { tilt: e.target.value } })}
              >
                <option value="">(none)</option>
                {jointNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="expr-hint" style={{ marginTop: -4, marginBottom: 8 }}>
              Joint that follows left/right (pan) and the joint that follows up/down (tilt). Leave one blank to follow on that axis only.
            </div>
            <div className="config-field">
              <label>Pan direction</label>
              <select
                value={cfg.target_joints.pan_sign ?? 1}
                onChange={e => setVisionConfig({ target_joints: { pan_sign: Number(e.target.value) } })}
              >
                <option value={1}>normal (+1)</option>
                <option value={-1}>reversed (−1)</option>
              </select>
            </div>
            <div className="config-field">
              <label>Tilt direction</label>
              <select
                value={cfg.target_joints.tilt_sign ?? 1}
                onChange={e => setVisionConfig({ target_joints: { tilt_sign: Number(e.target.value) } })}
              >
                <option value={1}>normal (+1)</option>
                <option value={-1}>reversed (−1)</option>
              </select>
            </div>
            <div className="config-field">
              <label>Kp (proportional)</label>
              <input
                type="number"
                min={0} max={10} step={0.01}
                value={cfg.target_joints.kp}
                onChange={e => setVisionConfig({ target_joints: { kp: Number(e.target.value) } })}
              />
            </div>
            <div className="config-field">
              <label>Ki (integral)</label>
              <input
                type="number"
                min={0} max={10} step={0.01}
                value={cfg.target_joints.ki}
                onChange={e => setVisionConfig({ target_joints: { ki: Number(e.target.value) } })}
              />
            </div>
            <div className="config-field">
              <label>Kd (derivative)</label>
              <input
                type="number"
                min={0} max={10} step={0.01}
                value={cfg.target_joints.kd}
                onChange={e => setVisionConfig({ target_joints: { kd: Number(e.target.value) } })}
              />
            </div>
            <div className="config-field">
              <label>Lost tolerance (frames)</label>
              <input
                type="number"
                min={0} max={60} step={1}
                value={cfg.target_joints.lost_tolerance ?? 0}
                onChange={e => setVisionConfig({ target_joints: { lost_tolerance: Number(e.target.value) } })}
              />
            </div>
          </div>
        )}

        <div className="config-field">
          <label>Drive follow (/cmd_vel)</label>
          <input
            type="checkbox"
            checked={cfg.behaviors.drive}
            onChange={e => setVisionConfig({ behaviors: { drive: e.target.checked } })}
          />
        </div>
        {cfg.behaviors.drive && (
          <div className="behavior-settings">
            <div className="config-field">
              <label>Target size</label>
              <input
                type="range"
                min={1} max={90} step={0.5}
                value={+(cfg.drive.target_area_frac * 100).toFixed(2)}
                onChange={e => setVisionConfig({ drive: { target_area_frac: Number(e.target.value) / 100 } })}
              />
              <span className="val">
                {(() => {
                  if (imgW > 0 && imgH > 0) {
                    const side = Math.round(Math.sqrt(cfg.drive.target_area_frac * imgW * imgH));
                    return `target side ≈ ${side}px`;
                  }
                  return `${(cfg.drive.target_area_frac * 100).toFixed(2)}%`;
                })()}
              </span>
            </div>
            <div className="config-field">
              <label>Max linear (m/s)</label>
              <input
                type="number"
                min={0.0} max={1.0} step={0.01}
                value={cfg.drive.max_lin}
                onChange={e => setVisionConfig({ drive: { max_lin: Number(e.target.value) } })}
              />
            </div>
            <div className="config-field">
              <label>Max angular (rad/s)</label>
              <input
                type="number"
                min={0.0} max={3.0} step={0.1}
                value={cfg.drive.max_ang}
                onChange={e => setVisionConfig({ drive: { max_ang: Number(e.target.value) } })}
              />
            </div>
            <div className="expr-hint" style={{ marginTop: 4, marginBottom: 4 }}>Angular PID</div>
            <div className="config-field">
              <label>Kp (proportional)</label>
              <input
                type="number"
                min={0} max={10} step={0.01}
                value={cfg.drive.kp_ang}
                onChange={e => setVisionConfig({ drive: { kp_ang: Number(e.target.value) } })}
              />
            </div>
            <div className="config-field">
              <label>Ki (integral)</label>
              <input
                type="number"
                min={0} max={10} step={0.01}
                value={cfg.drive.ki_ang}
                onChange={e => setVisionConfig({ drive: { ki_ang: Number(e.target.value) } })}
              />
            </div>
            <div className="config-field">
              <label>Kd (derivative)</label>
              <input
                type="number"
                min={0} max={10} step={0.01}
                value={cfg.drive.kd_ang}
                onChange={e => setVisionConfig({ drive: { kd_ang: Number(e.target.value) } })}
              />
            </div>
            <div className="expr-hint" style={{ marginTop: 4, marginBottom: 4 }}>Linear PID</div>
            <div className="config-field">
              <label>Kp (proportional)</label>
              <input
                type="number"
                min={0} max={10} step={0.01}
                value={cfg.drive.kp_lin}
                onChange={e => setVisionConfig({ drive: { kp_lin: Number(e.target.value) } })}
              />
            </div>
            <div className="config-field">
              <label>Ki (integral)</label>
              <input
                type="number"
                min={0} max={10} step={0.01}
                value={cfg.drive.ki_lin}
                onChange={e => setVisionConfig({ drive: { ki_lin: Number(e.target.value) } })}
              />
            </div>
            <div className="config-field">
              <label>Kd (derivative)</label>
              <input
                type="number"
                min={0} max={10} step={0.01}
                value={cfg.drive.kd_lin}
                onChange={e => setVisionConfig({ drive: { kd_lin: Number(e.target.value) } })}
              />
            </div>
            <div className="config-field">
              <label>Lost tolerance (frames)</label>
              <input
                type="number"
                min={0} max={60} step={1}
                value={cfg.drive.lost_tolerance ?? 0}
                onChange={e => setVisionConfig({ drive: { lost_tolerance: Number(e.target.value) } })}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Live detections ────────────────────────────── */}
      <div className="card vision-preview">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center' }}>
          <span>Detections</span>
          <button
            style={{ marginLeft: 'auto', fontSize: '.7rem', padding: '2px 8px' }}
            disabled={!connected}
            onClick={() => setPreview(!previewOn)}
          >
            {previewOn ? '■ Stop preview' : '▶ Preview'}
          </button>
        </div>
        <div className="vision-frame">
          {webrtcStream ? (
            <video ref={videoRef} className="camera-img" autoPlay playsInline muted />
          ) : (
            <div className="camera-placeholder">
              {!connected
                ? 'Connect to brain to view camera'
                : previewOn ? 'Connecting preview…' : 'Preview is OFF (detection still running)'}
            </div>
          )}
          {imgW > 0 && imgH > 0 && detections?.detections.map((d, i) => {
            const b = d.bbox;
            const left = fmtPct(b.center.position.x - b.size_x / 2, imgW);
            const top = fmtPct(b.center.position.y - b.size_y / 2, imgH);
            const w = fmtPct(b.size_x, imgW);
            const h = fmtPct(b.size_y, imgH);
            const label = d.results[0]?.hypothesis.class_id ?? '?';
            return (
              <div key={i} className="vision-bbox" style={{ left, top, width: w, height: h }}>
                <span className="vision-bbox-label">{label}</span>
              </div>
            );
          })}
          {imgW > 0 && imgH > 0 && cfg.min_area_frac > 0 && (() => {
            const side = Math.sqrt(cfg.min_area_frac * imgW * imgH);
            return (
              <div
                className="vision-min-size"
                style={{
                  width: `${(side / imgW * 100).toFixed(1)}%`,
                  height: `${(side / imgH * 100).toFixed(1)}%`,
                }}
                title={`Min detection size: ${Math.round(side)}×${Math.round(side)}px`}
              />
            );
          })()}
          {imgW > 0 && imgH > 0 && cfg.behaviors.drive && cfg.drive.target_area_frac > 0 && (() => {
            const side = Math.sqrt(cfg.drive.target_area_frac * imgW * imgH);
            return (
              <div
                className="vision-target-size"
                style={{
                  width: `${(side / imgW * 100).toFixed(1)}%`,
                  height: `${(side / imgH * 100).toFixed(1)}%`,
                }}
                title={`Drive follow target size: ${Math.round(side)}×${Math.round(side)}px`}
              />
            );
          })()}
        </div>

        <div className="telem-row">
          <span className="telem-label">count</span>
          <span className="telem-val">{detections?.detections.length ?? 0}</span>
        </div>
        <div className="telem-row">
          <span className="telem-label">markers</span>
          <span className="telem-val">{markers?.text ?? '--'}</span>
        </div>
      </div>

    </div>
  );
}
