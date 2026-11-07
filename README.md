# smabo-web

smabo ロボットの操作・可視化用 web フロントエンド。

中継サーバ **smabo-brain**（または ROS 2 版の **smabo-brain-ros**）に WebSocket クライアントとして接続し、
走行・サーボ操作・センサ可視化・画像処理の設定・ナビゲーション・動作計画を行います。
ESP32 の設定変更は brain を介さず REST で直接行います。

```
smabo-app ──►  smabo-brain  ◄── smabo-web（このリポジトリ）
                   ▲
                   └──  smabo-esp32
                              ▲
                              └── smabo-web（REST: /config, /mode）
```

**スタック:** React 18 / TypeScript / Vite 6

## セットアップ

```bash
npm install
```

## 起動

| コマンド | 用途 |
|----------|------|
| `npm run dev` | 開発サーバ（ホットリロード付き、デフォルト http://localhost:5173） |
| `npm run build` | 本番ビルド → `dist/` |
| `npm run preview` | ビルド結果をローカルで確認 |

### デプロイ

`npm run build` で生成された `dist/` を任意の静的ホスティングに置くだけです。

```bash
# 手元で確認する場合
npm run preview
# または
python -m http.server --directory dist
```

## 接続

ヘッダーに 2 つの接続先を入力します。

| 入力欄 | 接続先 | プロトコル |
|--------|--------|------------|
| Brain host:port | smabo-brain / smabo-brain-ros | `ws://<host>/ui` |
| ESP32 host (REST) | smabo-esp32 | `http://<host>/config`, `/mode` |

- **Brain** 欄を入力して「Connect」（または Enter）→ WebSocket 接続
- **ESP32** 欄を入力して「Get Config」（または Enter）→ `GET /config` で設定を取得

送信トピックにはすべて `/web` prefix が自動付与されます（brain 側で剥がして再配信）。

Navigation / Motion Plan タブは、ヘッダーの Brain 欄と同じホストへ roslib（`ws://<host>`）で
rosbridge_suite（smabo-brain-ros）に別途接続します（各タブの「Connect ROS」）。

## 画面

| タブ | 役割 |
|------|------|
| Face | 表情 ID（`/expression`）・視線（`/look_at`）・発話（`/speech/say`）を送信。音声認識結果（`/speech/recognized`）を表示 |
| Sensors | IMU・GPS の表示、カメラ映像のプレビュー（WebRTC） |
| two wheel mobile robot | バーチャルジョイスティックで `/cmd_vel` を送信。速度上限スライダー・オドメトリ表示・Trail Map 付き |
| Servo | ESP32 config の `joints` から生成したサーボスライダーで `/servo/command` 送信。Home ボタンで init_angle へ一括復帰 |
| Vision | 画像処理設定（`/vision/config`：検出方法・色・ArUco・発話・behaviors）、検出結果の表示、カメラ映像のプレビュー |
| Navigation | rosbridge 接続、`/initialpose` 送信、`navigate_to_pose` アクションのゴール送信、3D 表示（地図・`/scan`・ロボット） |
| Motion Plan | MoveIt の MotionPlanning パネル相当。rosbridge 接続、計画グループ（`arm` / `gripper`）の選択、目標姿勢（関節スライダー・SRDF の登録姿勢・3D で先端をドラッグして IK）、計画パラメータ、Plan（`/plan_kinematic_path`）→ 軌道のアニメーション表示 → Execute（`/execute_trajectory`）、`/servo/command` への直接送信。ロボットは URDF・メッシュを rosbridge 経由で取得して three.js で描画 |
| Config | ESP32 config の表示・編集。Modes・Servo・Drive(DC)・Encoder・Lidar・Advanced（ピン/WiFi）を GUI で操作。Advanced はステージ制で一括 POST。REST / WebSocket の接続確認 |
| Log | brain から受信したメッセージの一覧・フィルタ・手動 JSON 送信 |

Sensors / two wheel mobile robot / Servo / Config の各パネルはドラッグで並べ替えができます（順序は localStorage に保存）。
