# smabo-web

smabo ロボットの操作・可視化用 web フロントエンド。

中継サーバ **smabo-brain** に WebSocket クライアントとして接続し、
走行・アーム操作・センサ可視化を行います。
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
| Brain host:port | smabo-brain | `ws://<host>/ui` |
| ESP32 host (REST) | smabo-esp32 | `http://<host>/config`, `/mode` |

- **Brain** 欄を入力して「接続」（または Enter）→ WebSocket 接続
- **ESP32** 欄を入力して「Config 取得」（または Enter）→ `GET /config` で設定を取得

送信トピックにはすべて `/web` prefix が自動付与されます（brain 側で剥がして再配信）。

## 画面

| タブ | 役割 |
|------|------|
| Drive | バーチャルジョイスティックで `/cmd_vel` を送信。速度上限スライダー・オドメトリ表示・Trail Map 付き |
| Sensors | IMU (Roll/Pitch/Yaw/Gyro/Accel)・GPS・Camera 映像をリアルタイム表示 |
| Arm | ESP32 config の `joints` から生成したサーボスライダーで `/servo/command` 送信。Home ボタンで init_angle へ一括復帰 |
| Face | 表情 ID（`/expression`）・音声発話（`/speech/say`）送信 |
| Config | ESP32 config の表示・編集。Modes・Servo・Drive(DC)・Encoder・Advanced（ピン/WiFi）を GUI で操作。Advanced はステージ制で一括 POST |
| Log | brain から受信したメッセージの一覧・フィルタ・手動 JSON 送信 |

Drive / Sensors / Arm の各パネルはドラッグで並べ替えができます（順序は localStorage に保存）。
