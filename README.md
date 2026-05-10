# 空気入れトラッカー (Air Tracker)

自転車のタイヤに空気を入れてからの経過日数を記録する PWA。
GitHub Pages にデプロイし、Chrome の「ホーム画面に追加」でネイティブアプリのように使える。

将来的にチェーン注油・ブレーキ点検などのメンテ項目を追加しても **空気入れの体験を崩さない** よう、
データ構造とUIは最初から「複数自転車 × 複数項目」前提で組まれている（v1 では空気入れのみ表示）。

---

## ファイル構成

```
air-tracker/
├── index.html               マークアップ（aria属性付き）
├── style.css                Warm Craft パレット / light + dark / 部分ニューモーフィズム
├── app.js                   ロジック（store パターン、IIFE）
├── sw.js                    Service Worker（v2、Google Fonts ランタイムキャッシュ）
├── manifest.json            PWA マニフェスト（purpose 分離、SVG アイコン）
├── icon.svg                 マスターアイコン
├── icon-192.png             PWA アイコン (Android)
├── icon-512.png             PWA アイコン (Android)
├── apple-touch-icon-180.png iOS ホーム画面アイコン
├── icon-generator.html      アイコンPNG一括生成ツール（1回限り使用）
└── README.md                このファイル
```

---

## ローカルで動かす

ブラウザの `file://` では Service Worker・manifest・fetch が動かないので、必ず静的サーバ経由で開く。

```bash
# 例: Python が入っていれば
cd air-tracker
python -m http.server 8000
# → http://localhost:8000/ をブラウザで開く
```

Node.js なら `npx serve .` でも可。

---

## アイコン PNG の再生成

`icon.svg` を編集したら、`icon-generator.html` をローカルサーバ経由で開き
「すべてをダウンロード」をクリック。書き出された 3 ファイルを `air-tracker/` 直下に
上書き配置する。

```
icon-192.png
icon-512.png
apple-touch-icon-180.png
```

---

## GitHub Pages へのデプロイ

1. GitHub リポジトリを作成し、`air-tracker/` の中身をルートまたはサブパスに push
2. Settings → Pages → Branch を選択して Save
3. 数十秒〜数分で `https://<user>.github.io/<repo>/` で配信開始
4. スマホの Chrome で開き、メニュー → 「ホーム画面に追加」

> **注意**: PWA は **HTTPS でのみ動作**（localhost と GitHub Pages はOK）。

---

## デザインシステム

- **配色**: Warm Craft（オフホワイト #F5F2ED + くすみ抹茶 #6B8E7F）
- **タイポ**: Zen Maru Gothic（日本語）+ Outfit（数字）
- **ニューモーフィズム**: 情報パネル・履歴カード・サイクル選択中など **情報表示部のみ** に適用。
  メインアクションボタンは明確な色＋影で「押せる」と分かるようにする
- **ライト / ダーク**: `prefers-color-scheme` 既定。設定画面で固定可能

---

## 機能（v1）

| 機能 | 内容 |
|---|---|
| 経過日数表示 | 「あと○日」を画面の主役に。状態に応じて色 / メッセージ変化 |
| リセット | 「空気入れた！」ボタン → 今日 / 昨日 / カレンダー選択 |
| 推奨サイクル | 7 / 14 / 21 / 30 日 + カスタム（カスタムは `isPremium` ガード） |
| 履歴 | 最大 30 件、平均間隔 / 連続達成数 / 直近傾向の自動メッセージ |
| ヒートマップ | 直近 3 ヶ月の記録を GitHub の草風に表示 |
| 履歴の編集・削除 | 長押し → 編集 / 削除（モバイル）、右クリック対応（PC） |
| 設定 | 自転車名 / テーマ / データの書き出し・読み込み |
| データバックアップ | JSON エクスポート / インポート |
| アクセシビリティ | aria 属性・キーボード操作・色だけに頼らない状態表示 |
| オフライン動作 | Service Worker による完全オフライン化（Google Fonts 含む） |

---

## 状態（store）構造

```js
{
  version: 2,
  bikes: [
    {
      id: 'bike-1',
      name: 'マイバイク',
      items: [
        {
          type: 'air',
          lastReset: '2025-05-01T...',
          intervalDays: 14,
          history: [{ date: '2025-04-15T...' }]
        }
      ]
    }
  ],
  settings: {
    theme: 'auto',
    isPremium: false,
    activeBikeId: 'bike-1'
  }
}
```

v1 の旧データ（`{ lastPump, intervalDays, history }`）は起動時に自動マイグレーション。

---

## 将来計画（参考）

- v2: チェーン注油 / ブレーキ点検 / タイヤ交換 などの項目追加
- v3: TWA で Google Play 配信、AdMob バナー導入
- 有料版: カスタムサイクル / 複数自転車登録 / 履歴無制限 / ヒートマップ全期間 / 広告非表示

---

## ライセンス

このリポジトリ内のコード・素材は MIT 相当として扱う（明記がなければ）。
