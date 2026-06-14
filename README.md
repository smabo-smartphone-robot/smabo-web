# smabo-web

smabo ロボットの操作・可視化用 web フロントエンド。

ロボット本体の「外側」に立つツールで、中継サーバ **smabo-brain** に WebSocket
クライアントとして接続し、走行・アーム操作、ESP32 設定、センサ可視化を行います。

```
smabo-app ──►  smabo-brain  ◄── smabo-web（このリポジトリ）
                   ▲
                   └──  smabo-esp32
```

ビルド不要の単一 HTML（バニラ JS）です。

## 使い方

`index.html` をブラウザで開くだけです。

- ローカルファイルを直接開く（`file://`）
- 任意の静的サーバ経由（例: `python -m http.server`）
- GitHub Pages 等でホスティング

起動後、ヘッダの **Brain** 欄に smabo-brain のホストを入力して「接続」します
（接続先は `ws://<brain-host>:9090/ui`）。

## 画面

| タブ | 役割 |
|------|------|
| Drive | バーチャルジョイスティックで `/cmd_vel` を 10Hz 送信、オドメトリ表示 |
| Arm | ESP32 config から生成したサーボスライダーで `/servo/command` 送信 |
| ESP32 Config | `get_config` / `set_config` / `set_mode` による設定編集 |
| Log | brain 受信メッセージの表示・手動送信 |

すべての送受信は smabo-brain を経由します（ESP32 へ直接は接続しません）。
