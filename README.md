# Air Tracker（空気入れリマインダー）

自転車のタイヤに空気を入れてからの経過日数を記録する、モバイル前提のアプリ。
「あと○日」を画面の主役にし、サイクルが近づくと色とメッセージで知らせる。

> **このREADMEは2026-06-29に方針改訂したもの。** 旧版（バニラHTML/CSS/JS・Warm Craftライト基調・GitHub Pages のみ）から、
> 「スマホアプリ提供」というゴールに合わせて技術・配信・デザインを更新した。旧版との差分は末尾「改訂メモ」を参照。

---

## 1. ゴールとプロダクトの方針

- **ゴール**: 最終的に **スマホアプリ**として提供する（ストア配信を視野に入れる）。
- **出し方の原則**: まず最小で世に出す。v1は欲張らずコアだけ。出してから直す。
- **段階配信**: v1は**インストール型PWA**として無料・即リリース → コア価値を検証 → **Capacitor**で同じコードをストア化（Android/Google Play先行、iOS/App Storeは後述の理由で後日）。

---

## 2. 技術スタック（v1）

| 項目 | 採用 | 理由 |
|---|---|---|
| UI | **React + Vite**（プレーンJS） | プロトタイプ（React製CADENCEデザイン）をほぼ移植でき、Capacitorでそのままストア化できる。ビルドは標準的でClaude Codeが扱える。 |
| 配信(v1) | **PWA**（Service Worker + manifest） | 無料・即配信・1コードベース。iOS/Android両方で「ホーム画面に追加」可能。 |
| 配信(v1.1+) | **Capacitor** | 同じWebコードをネイティブシェルに包み、Google Play / App Storeへ。 |
| 状態管理 | プレーンなstore + localStorage | 小さく保つ。外部ライブラリは入れない。 |
| 型 | v1はプレーンJS | 最小化優先。TypeScript化はv1.1の安価なアップグレードとして余地を残す。 |

> **注**: TypeScript・状態管理ライブラリ・UIフレームワークは**v1では入れない**（スコープ肥大を防ぐ）。

---

## 3. v1スコープ（コアに絞る）

**v1でやること**

| 機能 | 内容 |
|---|---|
| 経過日数表示 | 「あと○日」を画面の主役に（ProgressRing）。状態に応じて色／メッセージ変化。 |
| リセット | 「空気入れた！」ボタン → 今日 / 昨日 / カレンダー選択。 |
| 推奨サイクル | **7 / 14 / 21 / 28 日** + カスタム（カスタムは `isPremium` ガード）。 |
| オフライン動作 | Service Worker による完全オフライン化。 |

**v1でやらないこと（→ v1.1以降）**

- 履歴一覧・平均間隔・連続達成数
- ヒートマップ（草風）
- 履歴の編集・削除
- 複数自転車の切り替えUI（データ構造だけ先に対応、UIは出さない）
- データのエクスポート／インポート
- 通知（プッシュ／ローカル）※下の「要検討事項」参照

---

## 4. 要検討事項（v1着手前 or v1.1で判断）

1. **テーマ切替（ダーク⇄ライト）** — プロトタイプには既に `data-theme="light"` のライトパレットが定義済み（`design-reference.css`参照）。判断点は (a) v1のUIに切替トグルを出すか、(b) `prefers-color-scheme` の自動追従だけにするか／手動固定も許すか、(c) 選択をlocalStorageで永続化するか。**最小案**: v1はOS設定に自動追従（dark既定）＋設定画面に手動トグルだけ用意。本格的な切替UIはv1.1で磨く。
2. **通知をどの段階で入れるか** — v1は「視覚トラッカー」で通知なし。リマインダーとしての本命価値（通知）はCapacitor化（v1.1+）で `LocalNotifications` として実装するのが筋。PWAのiOS通知は不安定なため、PWA段階では深追いしない。
3. **iOSストア配信の手段** — 開発機がWindowsのみ（Macなし）。App Store提出にはmacOSビルドが要るため、クラウドMacビルド（Codemagic / GitHub Actions の macOS ランナー等）を要検討。Android/Google Play はWindowsで完結できるため先行する。
4. **プロダクト名の確定** — 「Air Tracker / 空気入れトラッカー / 空気入れリマインダー」が混在。v1は通知なしのトラッカーなので「トラッカー」が実態に近いが、最終名は要決定。

---

## 5. データ設計（将来拡張を先に効かせる）

将来チェーン注油・ブレーキ点検などを足しても**空気入れの体験を崩さない**よう、
データは最初から「複数自転車 × 複数項目」前提で持つ。**v1は air のみ表示**。

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
          lastReset: '2026-06-01T...',
          intervalDays: 14,          // 7 / 14 / 21 / 28 / custom
          history: [{ date: '2026-05-18T...' }]
        }
      ]
    }
  ],
  settings: {
    theme: 'auto',                   // auto / dark / light（要検討事項1）
    isPremium: false,
    activeBikeId: 'bike-1'
  }
}
```

旧データ（`{ lastPump, intervalDays, history }`）は起動時に自動マイグレーション（フックだけ用意）。

---

## 6. デザイン（CADENCE）

> v1.2 でプロトタイプ（CADENCE デザインシステム）にデザイン忠実化。製品の通称は **「TIRE AIR · メンテナンス」**。

- **出典**: アップロードされたプロトタイプ。トークンは `design-reference.css`（=`src/styles/tokens.css`）に抽出済み。各コンポーネントはプロト同梱の Cadence デザインシステム（Button/Chip/IconButton/ProgressRing/StatTile/GlassCard/BottomNav/ListRow）に準拠して実装。
- **配色**: ダークなティール基調（`--bg-app: #07110F` / primary `--teal-500: #15C2C2`）＋エネルギー色 ember。**ライトテーマ併存**（`data-theme="light"`）。
- **アイコン**: **Lucide**（`lucide-react`）。ボトムナビ＝`gauge`/`history`/`bar-chart-3`/`settings`、操作系＝`calendar-check/minus/days/cog`・`moon`/`sun`/`smartphone`・`download`/`upload`・`trash-2`・`plus-circle`・`more-vertical` など。
- **質感**: グラスモーフィズム（`--blur-glass`）。`GlassCard` は glass / solid / **spotlight**（`--grad-spotlight` 地）。主アクションは色＋グロー。
- **主役（HERO A）**: ホームは spotlight ガラスカードに **ProgressRing**（SVG **linearGradient** ストローク・tone 切替・gloss リム）＋白の状態ピル＋メッセージ。「あと○日」が主役。
- **主CTA**: 「空気入れた！」は **energy（ember）** ボタン＋`plus-circle`。
- **ボトムナビ**: 浮遊ガラスドック。アクティブタブはアイコンに **角丸グラデスクエア＋グロー**（Cadence シグネチャ）。**4タブ**（ホーム/履歴/統計/設定）。
- **ヒートマップ**: 日ごとのタイヤ状態で段階配色（teal の鮮度グラデ＋`期限間近`=amber／`超過`=red／記録日=accent）。
- **ボタン**: 角丸長方形（`--radius-md`）、size sm/md/lg、variant primary/energy/secondary/ghost。**チップ**は選択時グラデ塗り。**IconButton** は角丸スクエア。
- **タイポ**: 本文＝**Noto Sans JP**、数字＝**Saira / Saira Condensed**（メトリクスは `--font-metric`）。日本語本文は行間広め（`--lh-body: 1.8`）。
- **モーション**: プロト同梱の `cad-rise` / `cad-sheet` / `cad-fade` のみ（シート・トースト）。`prefers-reduced-motion` 尊重。汎用的な装飾アニメは足さない方針。

> プロトHTMLは bundler 形式（gzip+base64 を実行時解凍）。中身は解凍して参照する。`design-reference.css` とプロトのデザインシステムが「見た目の正」。

---

## 7. ロードマップ

- **v1**: コア（経過日数 / リセット / 推奨サイクル / オフライン）をPWAで公開。
- **v1.1**: 履歴・ヒートマップ・編集削除・バックアップ。テーマ切替UIの作り込み。（必要なら）TypeScript化。
- **v2**: Capacitor化 → Google Play配信。`LocalNotifications` でリマインダー（本命価値）。
- **v2.x**: iOS App Store（クラウドMacビルド）。
- **有料版**: カスタムサイクル / 複数自転車 / 履歴無制限 / ヒートマップ全期間 / バックアップ / 広告非表示。

### 無料 / 有料の対応（v1.4 で整理）

| 機能 | 無料 | 有料（プレミアム） |
|---|---|---|
| 自転車 | 1台 | 複数台（追加・切替） |
| サイクル（空気を入れる間隔） | プリセット（7/14/21/28日） | ＋カスタム日数 |
| 履歴 | **直近3件まで保存（超過は古い順に削除）** | 全件 |
| ヒートマップ | 直近1ヶ月 | 全期間 |
| バックアップ（書き出し/読み込み） | **不可（ロック）** | 可 |
| 広告 | 表示（将来） | 非表示（将来） |

> **課金は未実装。** `settings.isPremium` は現状 false 固定で、有料機能は**ロック表示（ガード）のみ**。
> 上限は `src/store/store.js` の `FREE_LIMITS`（`{ bikes:1, history:3, heatmapWeeks:5 }`）に集約。
> 状態3色（teal=順調 / amber=そろそろ / 赤=超過）はリング・直近傾向・ヒートマップ・状態ピルで統一。ember は CTA 専用。
> ※無料の履歴は**破壊的**（3件超で最古を削除）。複数自転車の既存データは温存（追加のみ抑止）。広告は未実装のため「将来」。

---

## 8. 関連ファイル

- `v1実装手順書.md` — Claude Code用のフェーズ別ビルド仕様（受け入れ基準付き）。
- `design-reference.css` — CADENCEデザイントークン（ダーク既定＋ライトテーマ）。
- プロトタイプ（アップロード分）— 見た目・UXの正。

---

## 改訂メモ（2026-06-29）

| 項目 | 旧版 | 改訂版 | 理由 |
|---|---|---|---|
| 技術 | バニラHTML/CSS/JS | React + Vite | 見た目=プロトタイプ準拠に決定、Capacitorでストア化、ポートフォリオ価値 |
| 配信 | GitHub Pages のみ | PWA先行 → Capacitor（Play先行/App Store後日） | ゴールが「スマホアプリ提供」 |
| デザイン | Warm Craft（ライト/オフホワイト＋抹茶） | CADENCE（ダークティール＋ライト併存） | プロトタイプ準拠に決定 |
| タイポ | Zen Maru Gothic + Outfit | Noto Sans JP + Saira | プロトタイプの実態に合わせて訂正 |
| v1スコープ | 履歴・ヒートマップ等まで含む大きめ | コア4機能に縮小 | 「まず最小で出す」方針 |
| 推奨サイクル | 7/14/21/30 | 7/14/21/28 | 28日=4週間で区切りが自然 |
