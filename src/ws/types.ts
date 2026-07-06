export type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface RosbridgeMsg {
  op: string;
  topic?: string;
  msg?: unknown;
}

export interface Vec3 { x: number; y: number; z: number; }
export interface Quat { x: number; y: number; z: number; w: number; }

export interface OdomMsg {
  pose: { pose: { position: Vec3; orientation: Quat } };
  twist: { twist: { linear: Vec3; angular: Vec3 } };
}

export interface ImuMsg {
  orientation: Quat;
  angular_velocity: Vec3;
  linear_acceleration: Vec3;
}

export interface GpsMsg {
  latitude: number;
  longitude: number;
  altitude: number;
  position_covariance: number[];
}

// std_msgs/String — e.g. /speech/recognized (app が認識した発話)
export interface StringMsg {
  data: string;
}

// ── 画像処理（vision）─────────────────────────────────────────
// /vision/config の data に入れる設定 JSON（brain.vision VisionConfig.to_dict 形状）
export interface VisionTargetJoints {
  pan: string;
  tilt: string;
  pan_sign: number;
  tilt_sign: number;
  kp: number;
  ki: number;
  kd: number;
  lost_tolerance: number;
}

export interface VisionBehaviors {
  look_at: boolean;
  servo: boolean;
  drive: boolean;
}

export interface VisionDrive {
  target_area_frac: number;
  kp_ang: number;
  ki_ang: number;
  kd_ang: number;
  kp_lin: number;
  ki_lin: number;
  kd_lin: number;
  max_ang: number;
  max_lin: number;
  deadzone: number;
  lost_tolerance: number;
}

export interface VisionConfigMsg {
  enabled: boolean;
  mode: string;        // off | aruco | color | face | qr
  color: string;       // named preset (fallback when color_rgb is null)
  color_rgb: number[] | null;  // arbitrary target colour [r,g,b] from a palette
  color_hue_tol: number;       // hue half-window for RGB color matching
  color_s_min: number;         // saturation floor (0–255)
  color_v_min: number;         // value/brightness floor (0–255)
  min_area_frac: number;       // minimum detection size (fraction of frame area)
  capture_fps: number;         // browser→brain frame send rate (1–30 fps)
  speak: boolean;
  aruco_dict: string;
  target_marker_id: string | null;
  hfov_deg: number;
  target_joints: VisionTargetJoints;
  behaviors: VisionBehaviors;
  drive: VisionDrive;
}

// vision_msgs/Detection2DArray（brain → web、検出結果）
export interface Detection2D {
  bbox: {
    center: { position: { x: number; y: number }; theta: number };
    size_x: number;
    size_y: number;
  };
  results: { hypothesis: { class_id: string; score: number } }[];
}

export interface Detection2DArrayMsg {
  header: { stamp: { sec: number; nanosec: number }; frame_id: string };
  source_img_width: number;
  source_img_height: number;
  detections: Detection2D[];
}
