# テスト設計書 — ISTQB テスト設計技法の適用

対象: QUUKI v2.1.9 の純粋ロジック（`src/lib/date.js` / `src/lib/stats.js` / `src/lib/notify-plan.js` / `src/store/store.js`）

この文書は「どのテストを、なぜ、どの技法で導出したか」を記録したものです。
テストコードは本書の表と 1:1 で対応し、テスト名は必ず技法名（`EP:` / `BVA:` / `DT-Rn:` / `ST:` / `ST-invalid:` / `PW-nn:`）で始まります。

## 背景

改修前のテストは 53 件あり、各分岐の**代表値を1つずつ**押さえる構成でした。カバレッジ上は分岐を通っていますが、次が欠けていました。

- **境界値がほぼ無い** — 例: overdue 判定は `elapsed=15`（境界の1日内側）だけで、真の境界 `elapsed=14`（`remaining=0`）が未検証。`<=` と `<` の取り違えを検出できない。
- **無効パーティションが空白** — `setInterval` / `setBikeName` / `setTheme` / `addBike` / `removeBike` / `setActiveBike` / `formatDateJP` はテストが 1 件も無かった。
- **状態遷移が happy path のみ** — 「未記録 → 記録あり → 未記録」の往復や、最後の1台を消せないガードなどの無効遷移が未検証。
- **ルール相互作用がアドホック** — `planNotifications` の 4 条件がデシジョンテーブル化されていない。

本設計では要求から機械的にテストセットを導出し、v2.1.8 で **503 件を追加**しました（合計 556 件）。
その後 v2.1.9 で Findings の修正に伴いテストを更新・追加し、現在は **691 件**です。
既存 53 件は 1 行も変更していません。

### 技法と対象の対応

| 対象 | 主技法 | テストファイル | 件数 |
|---|---|---|---:|
| `date.js` | EP + BVA | `src/lib/date.ep-bva.test.js` | 150 |
| `date.js`（DST） | BVA（TZ 固定） | `src/lib/date.dst-tz.test.js` | 29 |
| `notify-plan.js` | デシジョンテーブル + 時刻 BVA | `src/lib/notify-plan.dt.test.js` | 58 |
| `stats.js` | EP + BVA | `src/lib/stats.ep-bva.test.js` | 83 |
| `store.js`（ミューテータ） | 状態遷移 + 無効遷移マトリクス | `src/store/store.state-transition.test.js` | 109 |
| `store.js`（migrate / import） | EP + ペアワイズ | `src/store/store.migrate-pairwise.test.js` | 173 |
| `reminder-sync.js` | 状態遷移 | `src/lib/reminder-sync.test.js` | 18 |
| `Heatmap.jsx` | DT（`computeStatus` との一致） | `src/components/Heatmap.test.js` | 18 |
| `billing.js`（エラーの分類・v2.5.0 §6-1） | デシジョンテーブル | `src/lib/billing.errors.dt.test.js` | 23 |
| `billing.js`（purchase の結果・v2.5.0 §6-2） | デシジョンテーブル | `src/lib/billing.test.js`（DT-P01〜P09） | 9 |
| `billing.js`（初期化・タイムアウト・競合・更新通知・v2.5.0 §6-3〜6-5） | 状態遷移 + BVA | `src/lib/billing.race.test.js` | 38 |
| `PaywallSheet.jsx`（v2.5.0 §6-6） | 状態遷移 + デシジョンテーブル | `src/components/PaywallSheet.test.jsx` | 28 |
| `store.js`（読み込みとプラン・v2.5.0 §6-7） | 状態遷移 | `src/store/store.migrate-pairwise.test.js` ほか | 3（＋期待値の変更3） |

### 設計方針

- **v2.1.8 ではテストで現行挙動を固定し、ソースコードは変更しませんでした。** 設計中に見つかった疑義は末尾の [Findings](#findings) に列挙してあります。
- **v2.1.9 でその Findings を修正しました。** 期待値を変更したテストには、旧挙動と修正の経緯をコメントで残しています。
- **日付は必ずローカル `Date` コンストラクタで構築**し、ISO 文字列リテラルを直書きしません。既存テストと同じ規律で TZ 非依存を保ちます。

---

## §1 `date.js` — 同値分割 + 境界値分析

### §1-1 `computeStatus` の状態境界（最重要）

判定式（[date.js:61](../src/lib/date.js#L61), [date.js:76](../src/lib/date.js#L76)）:

```
remaining <= 0                              → overdue
remaining / interval <= 0.25 || remaining <= 2 → soon
それ以外                                     → ok
```

比率条件と絶対日数条件の **OR** なので、境界は `interval` ごとに変わります。プリセット 4 サイクル全てで境界とその両隣を検証します。

| interval | ok↔soon 境界（elapsed） | soon↔overdue 境界（elapsed） | 備考 |
|---|---|---|---|
| 7 | 4 = ok / **5 = soon** | 6 = soon / **7 = overdue** | `remaining<=2` が先に効く（比率境界は 1.75） |
| 14 | 10 = ok / **11 = soon** | 13 = soon / **14 = overdue** | ★既存テストは 15 のみで境界を跨いでいなかった |
| 21 | 15 = ok / **16 = soon** | 20 = soon / **21 = overdue** | 比率境界 5.25 |
| 28 | 20 = ok / **21 = soon** | 27 = soon / **28 = overdue** | ★remaining=7 は比率が**ちょうど 0.25** |

`interval=28 / remaining=7` は `<= 0.25` を `< 0.25` に書き換えると落ちる唯一のケースで、比率条件の等号を守る番人です。
各行では `state` に加えて `tone` / `icon` / `message` / `progress` / `fill` / `overdueBy` の整合も検証します（色だけに依存せず状態を判別できる、という設計意図の固定）。

### §1-2 `computeStatus` の入力パーティション

| 入力 | 区分 | 代表値 | 期待 |
|---|---|---|---|
| lastReset | 有効 | `Date` / ISO 文字列 | elapsed を算出 |
| lastReset | 無効 | `null` / `undefined` / `''` / `0` | `state:'unset'`、`remaining:null`、`fill:0` |
| lastReset | 無効（未来日） | 翌日 | elapsed 負 → `progress` は 1、`fill` は 0 にクランプ |
| intervalDays | 無効 → 既定 14 | `0` / `NaN` / `'abc'` / `null` / `undefined` / `''` | 14 として扱う |
| intervalDays | 有効（数値文字列） | `'21'` | 21 として扱う |
| intervalDays | 無効（負数） | `-5` / `-1` | `computeStatus` 単体では**素通りする**（過去日なら overdue、未来日なら soon）。v2.1.9 以降 `normalize` が入口で 14 に矯正するため、保存データには載らない |

### §1-3 `computeNextDueDate`

**数値 BVA** — `null` を返す下限は `n < 1`:

- 無効: `0` / `0.9` / `-1` / `NaN` / `'abc'` / `Infinity` / `null` / `undefined`
- 有効: **`1`（下限ちょうど）** / `1.4`→+1日 / `1.5`→+2日 / `14` / `'14'` / `28`

**カレンダー境界** — `setDate` によるロールオーバーの検証:

| ケース | 期待 |
|---|---|
| 月末 1/31 +1日 | 2/1 |
| 非うるう年 2/28 +1日 | 3/1 |
| **うるう年 2028/2/28 +1日** | 2/29 |
| うるう日 2028/2/29 +1日 | 3/1 |
| 年末 12/31 +1日 | 翌年 1/1 |
| 1/31 +28日 | 2/28 |

### §1-4 `toDateInputValue` / `dateInputToISO` / `formatDateJP`

- `toDateInputValue`: 1桁月日のゼロ埋め、0:00 / 23:59:59.999 でも当日、うるう日
- `dateInputToISO`: 6 つの境界日で往復（`YYYY-MM-DD` → ISO → `YYYY-MM-DD`）、保存時刻が正午であること
- `dateInputToISO` の無効パーティション: `''` / `'abc'` / `'2026-06'` / `'2026-06-20x'` / `'2026/06/20'` / `null` / `undefined` → **`null` を返す**（v2.1.9 で Findings #2 を修正。以前は RangeError を投げていた）
- `toStoredDateISO`（v2.1.9 追加）: 保存する日付を検証し **ISO 表現へ正規化**する。`recomputeLastReset` と `sortedHistory` が辞書順ソートに依存しているため、`'2026/06/01'` のような別表現が混ざると最新判定が壊れる
- `formatDateJP`: **これまでテストゼロ**。2026-06-01（月）を起点に**曜日7通り**を網羅、加えて月末・年末・うるう日・ISO 文字列入力

---

## §2 `notify-plan.js` — デシジョンテーブル

### §2-1 `planNotifications` のルール表

条件:

- **C1** due 算出可能（lastReset 有 かつ intervalDays ≥ 1）
- **C2** `primaryAt`（予定日前日 20:00）> now
- **C3** `renudgeAt`（予定日+2日 20:00）> now
- **C4** `userAction`

| 条件 | R1 | R2 | R3 | R4 | R5 | R6 |
|---|---|---|---|---|---|---|
| C1 due 算出可能 | N | Y | Y | Y | Y | Y |
| C2 primary 未来 | - | Y | N | N | N | Y |
| C3 renudge 未来 | - | - | - | Y | N | N |
| C4 userAction | - | - | Y | N | N | - |
| **出力** | `[]` | `[primary, renudge]` | `[catchup]` | `[renudge]` | `[]` | `[primary]` |

- **R2 は C4 に依存しない**（2列を1列に畳んだ）。改修前は `C4=Y` 側が未検証でした。これは**ユーザーがサイクルを延長して予定日がまだ未来になったケース**で、回帰すると通知が 2 本から 1 本に減ります。
- **R3 は C3 に依存しない**（renudge の未来／過去いずれでも catchup 1 本）。両方をテストしています。
- **R6 は現実的な入力域では成立しない**（が、到達不能ではない）: プリセット 7〜28 日の範囲では `renudgeAt` が常に `primaryAt` のちょうど 3 日後なので、C2=Y なら C3=Y が確定します。**4サイクル × 予定日±30日 × 4時刻の総当たりで反例が無いことを確認**しました（`DT-R6`）。
  > **訂正（2026-07-22）**: 当初この欄を「幾何的に到達不能」「[notify-plan.js:59](../src/lib/notify-plan.js#L59) の内側 `if` は常に真＝削除可能な防御的コード」と記述していましたが、**誤りでした**。上記の総当たりは探索範囲を現実的な入力域に限っていたためです。`interval = 99979393〜99979395` の **3 日ぶんの窓**では予定日が Date の表現上限（西暦 275760 年）付近に達し、`renudgeAt` だけが Invalid Date になって **R6 が実際に成立**します（99979396 以上は予定日ごと表現不能になり通知は 0 本）。したがってこの内側 `if` は「Invalid Date の通知を作らせない実働ガード」であり、**削除してはいけません**（削除すると `notifications.js:77` の `schedule` が例外を投げ、直前 `:64` の `cancel` と相まって primary ごと登録されず、リマインダーが無言で全滅します）。境界は `notify-plan.dt.test.js` §2-4 で固定済み。経緯は [テスト完了レポート §5](./test-completion-report.md) を参照。

### §2-2 20:00 スロットの境界値（厳密比較 `>`）

lastReset = 2026-06-01 / interval = 14 → due = 6/15、primary = 6/14 20:00、renudge = 6/17 20:00

| now | 期待 | 狙い |
|---|---|---|
| 6/14 19:59:59.999 | R2 `[primary, renudge]` | 境界の直前 |
| **6/14 20:00:00.000** | R4 `[renudge]` | **厳密 `>` のため primary は出ない** |
| 6/14 20:00:00.001 | R4 `[renudge]` | 境界の直後 |
| 6/17 19:59:59.999 | R4 `[renudge]` | renudge 境界の直前 |
| **6/17 20:00:00.000** | R5 `[]` | 通知が尽きる瞬間 |
| 6/17 20:00:00.001 | R5 `[]` | 境界の直後 |

`nextHour`（catchup のスロット決定）も同じ 3 点 + 0:00 / 23:59 / 月跨ぎ:

| now | catchup の時刻 |
|---|---|
| 6/16 19:59:59.999 | 当日 20:00 |
| **6/16 20:00:00.000** | **翌日 20:00** |
| 6/16 20:00:00.001 | 翌日 20:00 |
| 6/30 21:00 | 7/1 20:00（月跨ぎ） |

### §2-3 引数と本文の同値分割

- `bikeName`: 通常名 / `''`・`null`・`undefined` → 既定名「マイバイク」/ `'   '`（空白のみ）は `planNotifications` 単体では素通りする。v2.1.9 以降 `normalize` が `setBikeName` / `addBike` と同じ trim をするため、保存データには載らない（Findings #5 を修正。真の欠陥箇所は `notify-plan.js` ではなく `store.js` の `normalize` だった）
- `intervalDays` の本文表記: `14` / `'14'` / `14.4` → 「14日間隔」、`14.6` → 「15日間隔」（`Math.round`）
- 各 kind のタイトル・本文の完全一致、および**全通知が 20:00 ちょうど**であること
- `reminderStatus` は同じ表を `none` / `scheduled(primary)` / `scheduled(renudge)` / `overdue` の 4 状態に畳んで再検証。さらに**`reminderStatus.at` が `planNotifications` の先頭と一致する**こと（画面表示と実際の登録の整合）を検証します。

---

## §3 `stats.js` — 同値分割 + 境界値分析

### §3-1 `currentStreak` の間隔境界（`gap <= intervalDays`）

| interval | 継続する gap | 打ち切る gap |
|---|---|---|
| 7 | 6, **7（境界ちょうど）** | **8** |
| 14 | 0（同日）, 13, **14（境界ちょうど）** | **15** |
| 28 | **28（境界ちょうど）** | **29** |

改修前は gap=20 / interval=14 のみで、境界から 6 日離れていました。
件数境界（0件→0 / 1件→1）、途中超過時に直近側だけ数えること、未ソート入力、`intervalDays` 無効時の既定 14 も併せて検証します。

### §3-2 `cycleTrend` の比率境界（`<= 1.0` / `<= 1.25`）

`averageIntervalDays` は**小数第1位に丸めてから**比較されるため（[stats.js:24](../src/lib/stats.js#L24)）、境界の「1目盛り上」は 0.1 刻みで構成します。

| interval | avg | 比率 | 期待 | 構成（間隔の並び） |
|---|---|---|---|---|
| 14 | 7 | 0.50 | 順調 | `[7]` |
| 14 | **14.0** | **1.00 ちょうど** | 順調 | `[14]` |
| 14 | **14.1** | 1.007（1目盛り上） | やや遅れ | `[14×5, 15, 14×4]` |
| 10 | 12 | 1.20 | やや遅れ | `[12]` |
| 10 | **12.5** | **1.25 ちょうど** | やや遅れ | `[12, 13]` |
| 10 | **12.6** | 1.26（1目盛り上） | 遅れ | `[12, 13, 13, 13, 12]` |
| 14 | 28 | 2.00 | 遅れ | `[28]` |

丸めが判定より先に効くことも固定します（間隔 14×24 + 15×1 = 平均 14.04 → 14.0 → **順調**）。

### §3-3 無効パーティション

| 関数 | 非配列 (`null`/`undefined`/`{}`/`'x'`/`42`) | 不正要素（`null` / date 欠損 / 文字列要素） | 件数境界 |
|---|---|---|---|
| `sortedHistory` | `[]` | 除外される | 0 / 1 / 同一日時2件 |
| `averageIntervalDays` | `null` | 除外後 1 件なら `null` | 0→null / 1→null / **2→算出** |
| `currentStreak` | `0` | — | 0→0 / 1→1 |
| `totalCount` | `0` | **除外しない**（Findings #7） | 0 / 1 / 3 |

丸めの検証: `[7,8]`→7.5 / `[7,7,8]`→7.3 / `[7,8,8]`→7.7 / `[30,31]`→30.5

---

## §4 `store.js`（ミューテータ）— 状態遷移テスト

テストは既存の `freshStore()` パターンを `src/store/__helpers__/freshStore.js` に切り出して共有します（`vi.resetModules()` + `localStorage.clear()` + 動的 import。`store.js` はモジュールロード時に localStorage を読むため、この隔離が必須）。

### §4-1 記録状態のライフサイクル

```
未記録(lastReset=null) --pump--> 記録あり --removeHistory(最後の1件)--> 未記録
                                    |
                                    +--pump / editHistory--> 記録あり(lastReset 再計算)
```

| 現状態 ＼ イベント | pump | editHistory(有効ID) | removeHistory(最後の1件) | removeHistory(複数のうち1件) |
|---|---|---|---|---|
| **未記録** | → 記録あり | **no-op** | **no-op** | **no-op** |
| **記録あり** | 記録あり（最新日を採用） | 記録あり（lastReset 再計算） | **→ 未記録** | 記録あり（再計算） |

0-switch（全有効遷移）に加えて、1-switch として「pump → 全削除 → pump」の連鎖も検証します。
`editHistory` は**最新を過去へずらすと lastReset が別レコードへ移る**／**最古を未来へずらすと lastReset がそれに移る**の両方向を確認します。

### §4-2 無効遷移マトリクス（拒否されること）

上表の太字セルに加えて:

| 操作 | 入力 | 期待 |
|---|---|---|
| `removeHistory` | 存在しない id / `undefined` | no-op（state 完全一致） |
| `editHistory` | 存在しない id / `''` / `null` | no-op |
| `editHistory` | dateISO が `''` / `null` / `undefined` | no-op |
| `editHistory` | dateISO が不正文字列 | **素通しして lastReset が壊れる**（Findings #3） |

**無効な操作では購読者に通知が飛ばない**こと（`subscribe` + spy）、および `unsubscribe` 後は届かないことも検証します。

### §4-3 自転車のライフサイクル

| 現状態 ＼ イベント | addBike | removeBike(アクティブ) | removeBike(非アクティブ) | removeBike(不明ID) | setActiveBike(有効) | setActiveBike(不明ID) |
|---|---|---|---|---|---|---|
| **1台** | → 複数台（新規がアクティブ） | **no-op（最後の1台ガード）** | — | **no-op** | 自身のまま | **no-op** |
| **複数台** | 複数台 | 先頭がアクティブへ | アクティブ維持 | **no-op** | 切替 | **no-op** |

併せて検証すること:

- 追加した自転車は **未記録・14日・履歴空**で始まる
- **記録は自転車ごとに独立**（切り替えても他方の履歴は無傷）
- 3 台にして真ん中を消しても他は無傷
- `addBike` の名前 EP（`''` / 空白のみ / `null` → 既定名、前後空白は trim）、id が毎回異なること
- **store 層はプラン上限を強制しない**（free でも `addBike` は成功する）。ゲートは UI 層のみ（[BikeSheet.jsx:19](../src/screens/BikeSheet.jsx#L19) / [SettingsScreen.jsx:35](../src/screens/SettingsScreen.jsx#L35)）。この設計を 3 プランで明示的に固定しています。

### §4-4 セッターの入力境界（すべて新規）

**`setInterval` BVA** — 受理条件は `Number.isFinite(d) && d >= 1`、採用値は `Math.round(d)`:

- 受理: **`1`（下限ちょうど）** / `1.4`→1 / `1.5`→2 / `2.5`→3 / `7` / `14` / `21` / `28` / `'21'` / `365` / `true`→1
- 拒否: `0` / `0.9` / `0.4` / `-1` / `-14` / `NaN` / `'abc'` / `''` / `null` / `undefined` / `Infinity` / `-Infinity` / `[]` / `{}`
- 拒否時は**購読者に通知されず localStorage も変わらない**こと、受理時も履歴と lastReset を変えないこと

**`setBikeName` EP**: 通常名 / 前後空白は trim / `''`・`'   '`・`'\t\n '`・`null`・`undefined`・`0` → 既定名 / 数値は文字列化 / 1文字 / 絵文字 / 200文字（切り詰めない）／改名はアクティブな1台だけ

**`setTheme` EP**: `auto` / `dark` / `light` を受理、`'blue'` / `'DARK'` / `''` / `null` / `undefined` / `0` / `[]` を拒否（通知も飛ばない）

### §4-5 永続化とセレクタ

- 主要な 4 操作（`pump` / `setInterval` / `setBikeName` / `setTheme`）が localStorage に反映され、再読み込み後も復元されること
- `getActiveBike`: `activeBikeId` が実在しない state でも先頭を返す
- `getActiveAirItem`: `type:'air'` が無ければ先頭 item、複数あれば `air` を選ぶ

---

## §5 `store.js`（migrate / normalize / load / import）— 同値分割 + ペアワイズ

### §5-1 バージョン振り分けの同値分割

[store.js:97](../src/store/store.js#L97) の分岐に対応:

| 入力 | 区分 | 期待 |
|---|---|---|
| `version:3` + bikes 配列 | 有効 | normalize を通る（plan 維持） |
| `version:2` + bikes 配列 | 有効 | v3 化（`isPremium` → `plan`） |
| v1 フラット（`lastPump` / `intervalDays` / `history` のいずれか） | 有効 | 移植（4パターン） |
| `version:1` + bikes | 無効 | 初期 state |
| **`version:4` / `5` / `99` + bikes** | 無効（未来版） | **初期 state ＝ データ喪失**（Findings #1） |
| `version:'3'`（文字列） | 無効 | 初期 state（厳密比較） |
| `version:3` + bikes 非配列 / bikes 欠落 | 無効 | 初期 state |
| `null` / `undefined` / `42` / `'x'` / `true` / `{}` / `[]` | 無効 | 初期 state |

### §5-2 `normalize` の欠損補完 — ペアワイズ

因子（4 × 3 × 3 × 4 = **144 通り**、全ペア **73**）:

| 因子 | 水準 |
|---|---|
| settings | 正常plan / 未知plan(`'gold'`) / `isPremium:true` / 欠落 |
| bikes | 1台正常 / 2台 / id・name 欠損 |
| items | 正常 / 空配列 / 欠落 |
| history | オブジェクト配列 / 文字列配列（旧形式）/ id 欠損 / `null` |

貪欲 IPO 法で **17 行**に圧縮しました（全 73 ペアを被覆）。生成スクリプト（再現用）:

```js
const F = [
  ['settings', ['正常plan', '未知plan', 'isPremium:true', '欠落']],
  ['bikes', ['1台正常', '2台', 'id/name欠損']],
  ['items', ['正常', '空配列', '欠落']],
  ['history', ['オブジェクト配列', '文字列配列', 'id欠損', 'null']],
]
const sizes = F.map(([, v]) => v.length)
const all = []
;(function rec(i, acc) {
  if (i === sizes.length) return all.push([...acc])
  for (let v = 0; v < sizes[i]; v++) rec(i + 1, [...acc, v])
})(0, [])
const key = (i, j, a, b) => `${i}:${a}|${j}:${b}`
const need = new Set()
for (let i = 0; i < sizes.length; i++)
  for (let j = i + 1; j < sizes.length; j++)
    for (let a = 0; a < sizes[i]; a++)
      for (let b = 0; b < sizes[j]; b++) need.add(key(i, j, a, b))
const chosen = []
while (need.size) {
  let best = null, bestGain = -1
  for (const c of all) {
    let gain = 0
    for (let i = 0; i < sizes.length; i++)
      for (let j = i + 1; j < sizes.length; j++) if (need.has(key(i, j, c[i], c[j]))) gain++
    if (gain > bestGain) { bestGain = gain; best = c }
  }
  chosen.push(best)
  for (let i = 0; i < sizes.length; i++)
    for (let j = i + 1; j < sizes.length; j++) need.delete(key(i, j, best[i], best[j]))
}
console.log(chosen.map((c) => c.map((v, i) => F[i][1][v])))
```

| # | settings | bikes | items | history |
|---|---|---|---|---|
| PW-01 | 正常plan | 1台正常 | 正常 | オブジェクト配列 |
| PW-02 | 正常plan | 2台 | 空配列 | 文字列配列 |
| PW-03 | 正常plan | id/name欠損 | 欠落 | id欠損 |
| PW-04 | 未知plan | 1台正常 | 空配列 | id欠損 |
| PW-05 | 未知plan | 2台 | 正常 | null |
| PW-06 | isPremium:true | 1台正常 | 欠落 | 文字列配列 |
| PW-07 | isPremium:true | id/name欠損 | 空配列 | オブジェクト配列 |
| PW-08 | 欠落 | 2台 | 欠落 | オブジェクト配列 |
| PW-09 | 欠落 | id/name欠損 | 正常 | 文字列配列 |
| PW-10 | isPremium:true | 2台 | 正常 | id欠損 |
| PW-11 | 欠落 | 1台正常 | 空配列 | null |
| PW-12 | 未知plan | id/name欠損 | 欠落 | null |
| PW-13 | 正常plan | 1台正常 | 正常 | null |
| PW-14 | 未知plan | 1台正常 | 正常 | オブジェクト配列 |
| PW-15 | 未知plan | 1台正常 | 正常 | 文字列配列 |
| PW-16 | isPremium:true | 1台正常 | 正常 | null |
| PW-17 | 欠落 | 1台正常 | 正常 | id欠損 |

**全 17 行で確認する不変条件**（v3 データの定義そのもの）:

1. `version === 3`
2. `settings.plan ∈ PLANS` かつ期待値どおり（正常plan→`pro` / 未知plan→`free` / `isPremium:true`→`pro` / 欠落→`free`）、`'isPremium' in settings === false`
3. 自転車は 1 台以上、全台に非空の `id` と `name`
4. 各台に item が 1 つ以上、各 item に `type` / 数値の `intervalDays`(≥1) / `lastReset` キー
5. `history` は必ず配列で、全要素に `id` と文字列の `date`
6. `activeBikeId` が実在する自転車を指す

さらに 17 行それぞれで **冪等性**（`normalize(normalize(x))` === `normalize(x)`）、**history 件数の保存**、**`migrate(version:3)` と `normalize` の一致**を検証します（合計 68 テスト）。

補足の EP（ペアワイズと直交しない回復パス）: bikes が空配列 / 欠落 / `null` → 既定 1 台に回復（プランは保持）、`activeBikeId` 不整合 → 先頭へ寄せる、`intervalDays` の `0`/`null`/欠落 → 14、**負値 → そのまま残る**（Findings #4）、history の不正要素の除去。

### §5-3 保存データの読み込み経路（`load`）

| ケース | 期待 |
|---|---|
| 保存なし | 初期 state を作り、その場で書き出す |
| 旧バニラ版キー `airTracker` に v1 データ | 取り込んで**新キーへ書き出す**（これまで未検証の経路） |
| 新旧両方のキーが存在 | 新キーを優先し旧キーは無視 |
| 壊れた JSON / 途中で切れた JSON / 空文字列 | 初期 state へフォールバック |
| **`version:4` のデータ** | **破棄され、localStorage も初期 state で上書きされる**（Findings #1） |

### §5-4 `importJSON` / `exportJSON`

**有効**: v3 のエクスポート往復（複数台・履歴つき）/ v2(`isPremium:false`) / v1 フラット / 未知 plan は free に矯正 / localStorage への反映

**無効**:

| 入力 | 期待 |
|---|---|
| `'not json'` / `''` / `'{"bikes":['` / `'{'` | `{ ok:false, error:'JSONを読み取れませんでした' }` |
| `'{"foo":1}'` / `'{}'` / `'null'` / `'[]'` / `'123'` / `'"hello"'` / `'true'` | `{ ok:false, error:'対応していないデータ形式です' }` |

失敗時に既存 state が変わらないことも検証します。

**グレーゾーン**: `'{"bikes":[]}'` や `'{"version":9,"bikes":[…]}'` は `looksLikeData` を通過するのに `migrate` が初期 state に落とすため、**`ok:true` を返しながら既存データを消します**（Findings #8）。

---

## §6 `billing.js` / `PaywallSheet.jsx` — 課金の異常系（v2.5.0）

v2.5.0 で追加。**この節はテストコードより先に書いた**（テスト先行）。以降のテストは
ここで振った ID をテスト名の先頭に付けて対応させる。

### 前提と設計原則（変更しない）

- 課金状態の正は RevenueCat。`settings.plan` は表示用のキャッシュ。
- 照会が「不明」（オフライン・タイムアウト・未初期化）のときは**絶対に降格しない**（既存の決定表8行 `billing.reconcile.dt.test.js`）。
- billing.js の関数は例外を投げず `{ ok, reason }` を返す（house pattern）。
- SDK のエラーは Capacitor 経由で `{ code: '1', message, data }` の形で届く（`code` は数値の文字列。
  `purchases-capacitor` の `rejectWithErrorContainer`）。configure 前の呼び出しは
  `code` なし・`"Purchases must be configured before calling this function"` で拒否される
  （`rejectIfNotConfigured`）。

### §6-1 エラーの分類 `classifyPurchaseError(e)` — デシジョンテーブル

判定の優先順位: ① SDK の `userCancelled` フラグ → ② `code`（文字列・数値のどちらでも）→
③ `code` が無いときだけ文言。**`code` があるときは文言を見ない**（失敗をキャンセルと
取り違えると何も表示されず、利用者が状況を知れないため。逆の取り違えは文言が出るだけで済む）。

| ID | 入力 | reason |
|---|---|---|
| DT-E01 | `{ code: '1' }` | cancelled |
| DT-E02 | `{ code: 1 }`（数値） | cancelled |
| DT-E03 | `{ userCancelled: true }`（code なし） | cancelled |
| DT-E04 | `{ code: '2', userCancelled: true }` | cancelled（SDK のフラグが優先） |
| DT-E05 | `{ data: { userCancelled: true } }` | cancelled |
| DT-E06 | `{ code: '20' }` 支払い保留 | pending |
| DT-E07 | `{ code: '6' }` 購入済み | already-owned |
| DT-E08 | `{ code: '3' }` 購入が許可されていない | not-allowed |
| DT-E09 | `{ code: '10' }` 通信エラー | network |
| DT-E10 | `{ code: '35' }` オフライン | network |
| DT-E11 | `{ code: '15' }` 処理中 | in-progress |
| DT-E12 | `{ code: '5' }` 商品が購入できない | unavailable |
| DT-E13 | `{ code: '0' }` 不明 | failed |
| DT-E14 | `{ code: '2' }` ストアの問題 | failed |
| DT-E15 | `{ code: '23' }` 設定エラー | failed |
| DT-E16 | `{ code: '2', message: '…cancelled…' }` | failed（code が優先） |
| DT-E17 | code なし・`'Purchases must be configured…'` | not-ready |
| DT-E18 | code なし・`'Purchase was cancelled by the user'` | cancelled（v2.4 までの互換） |
| DT-E19 | `new Error('network error')`（code なし） | failed |
| DT-E20 | `null` / `undefined` | failed |
| DT-E21 | 文字列 `'boom'` | failed |
| DT-E22 | `{ code: '' }`（空） | failed（code なし扱い） |

### §6-2 `purchase()` の結果 — デシジョンテーブル

| ID | 条件 | 結果 | setPlan |
|---|---|---|---|
| DT-P01 | code 20 | `{ ok:false, reason:'pending' }` | 呼ばない |
| DT-P02 | code 6 → 復元で権利あり | `{ ok:true, restored:true }` | 'paid' |
| DT-P03 | code 6 → 復元で権利なし | `{ ok:false, reason:'already-owned' }` | 呼ばない |
| DT-P04 | code 6 → 復元が失敗 | `{ ok:false, reason:'already-owned' }` | 呼ばない |
| DT-P05 | 購入成功だが権利なし → 再照会で権利あり | `{ ok:true }` | 'paid' |
| DT-P06 | 購入成功だが権利なし → 再照会でも権利なし | `{ ok:false, reason:'not-entitled' }` | 呼ばない |
| DT-P07 | code 10 | `{ ok:false, reason:'network' }` | 呼ばない |
| DT-P08 | 購入の途中でもう一度 `purchase()` | 2回目は SDK を呼ばず `{ ok:false, reason:'in-progress' }` | — |
| DT-P09 | 購入が終わったあとの `purchase()` | 再び購入できる（ガードが解除される） | — |

既存の「購入成功だが権利なし → not-entitled」のテストは、DT-P06 に合わせて
「再照会でも権利なし」の前提を明示する（仕様変更による前提の追加）。

### §6-3 初期化の状態遷移

```
未初期化 --initBilling()--> 初期化中 --configure 成功--> 準備完了
                                     \--configure 失敗／web／APIキーなし--> 利用不可
```

| ID | 現状態 ＼ イベント | 期待 |
|---|---|---|
| ST-I01 | 未初期化で `initBilling()` を2回 | configure は1回だけ（冪等） |
| ST-I02 | 初期化中に `getPriceLabel()` | configure の完了を待ってから getOfferings を呼び、価格を返す |
| ST-I03 | 初期化中に `purchase()` | configure の完了を待ってから購入する |
| ST-I04 | 未初期化のまま `checkEntitlement()` | 自動で初期化してから照会する |
| ST-I05 | 利用不可（configure 失敗）で `getPriceLabel()` | SDK を呼ばず null |
| ST-I06 | 利用不可で `purchase()` | SDK を呼ばず `{ ok:false, reason:'unavailable' }` |
| ST-I07 | 利用不可で `checkEntitlement()` | `{ ok:false, status:'unknown', reason:'unavailable' }` |
| ST-I08 | APIキーなし（native） | configure を呼ばず、利用不可と同じ扱い |
| ST-I09 | web | 既存どおり（web-unsupported／DEV のシミュレーション）。初期化を待たない |

### §6-4 タイムアウト — 境界値（偽のタイマー）

上限は `PRICE_TIMEOUT_MS = QUERY_TIMEOUT_MS = 10000`。初期化待ちも上限に含める。

| ID | 対象 | 入力 | 期待 |
|---|---|---|---|
| BVA-T01 | 価格 | getOfferings が戻らない・9,999ms 時点 | まだ未確定 |
| BVA-T02 | 価格 | 同・10,000ms 時点 | null |
| BVA-T03 | 価格 | getOfferings が 9,999ms で解決 | 価格を返す |
| BVA-T04 | 照会 | getCustomerInfo が戻らない・10,000ms | `{ ok:false, status:'unknown', reason:'timeout' }` |
| BVA-T05 | 起動時リストア | 照会がタイムアウト（cached paid） | setPlan を呼ばない（降格しない） |
| BVA-T06 | 復元 | restorePurchases が戻らない・10,000ms | `{ ok:false, status:'unknown', reason:'timeout' }`、setPlan なし |
| BVA-T07 | 購入 | getOfferings が戻らない・10,000ms | `{ ok:false, reason:'timeout' }`、purchasePackage は呼ばない |
| BVA-T08 | 購入 | purchasePackage が 60,000ms 後に成功 | 成功（購入そのものはタイムアウトしない） |
| BVA-T09 | 価格 | configure が戻らない・10,000ms | null |

### §6-5 権利の反映と競合 — 状態遷移

反映の経路は4つ: 起動時の照会・購入・復元・SDK からの更新通知。照会は開始時点の番号を
持ち、そのあとに別の経路で権利が確定していたら結果を捨てる。購入・復元・更新通知は
常にその時点で最新とみなす。

| ID | シナリオ | 期待 |
|---|---|---|
| ST-R01 | 起動時の照会が遅い間に購入が成功 → 照会が「未購入」で届く | **降格しない**（plan は paid のまま） |
| ST-R02 | 起動時の照会だけが届く（競合なし） | 既存の決定表どおり反映 |
| ST-R03 | 照会の途中で更新通知（権利あり）→ 照会が「未購入」で届く | 降格しない |
| ST-R04 | 照会の途中で復元が成功 → 照会が「未購入」で届く | 降格しない |
| ST-L01 | `initBilling()` で更新通知を1回だけ登録（2回呼んでも1回） | addCustomerInfoUpdateListener が1回 |
| ST-L02 | 更新通知: 権利あり（cached free） | setPlan('paid')（保留中の支払いの完了） |
| ST-L03 | 更新通知: 権利なし（cached paid） | setPlan('free')（返金・失効） |
| ST-L04 | 更新通知: 中身が null や entitlements なし | 何もしない |
| ST-L05 | 登録が失敗 | 初期化は準備完了のまま（起動を止めない） |
| ST-L06 | web／APIキーなし | 登録しない |
| ST-S01 | `restorePurchases()` 権利あり（cached free） | setPlan('paid') |
| ST-S02 | `restorePurchases()` 権利なし（cached paid） | setPlan('free')（確定した照会結果） |
| ST-S03 | `restorePurchases()` 失敗 | setPlan を呼ばない |

> **ST-R01 についての訂正（C3 の Red で判明）**: 計画時は「v2.4 の実装では、起動時の照会が
> 遅い間に購入すると無料へ降格する」と見立てていたが、**ST-R01 は v2.4 の実装のままで成功した**。
> `restoreEntitlementOnStartup` は照会を**始めた時点**の plan と結果を比べ、違うときだけ反映して
> いたため、この順序（free で開始 → 購入で paid → 「未購入」が届く）では何も変更しなかった。
> v2.5.0 では、更新通知・復元・購入・起動時の照会を1つの反映関数にまとめ、**結果が届いた時点**の
> plan と比べるようにする。そのままだとこの順序で降格が起きるため、照会の開始時点の番号で古い結果を
> 捨てる。ST-R01 はその回帰テストとして残す（ST-R03・R04 も同じ）。

### §6-6 購入画面（PaywallSheet）— 状態遷移

```
閉 --open--> 価格取得中 --価格--> 準備完了 --購入--> 購入中 --+--> 成功（自動で閉じる）
                  \--null--> 価格なし(再読み込み)            +--> 保留
                                                            +--> エラー(種別ごとの文言)
             準備完了 --復元--> 復元中 --> 復元成功（自動で閉じる）／履歴なし／確認できず
```

| ID | 遷移 | 期待 |
|---|---|---|
| ST-U01 | 購入 → pending | 「お支払いの手続き中」の案内（エラー表示ではない）。購入ボタンは出さない。EV.PURCHASE pending |
| DT-U02 | 購入 → 各エラー reason | reason ごとの文言（下表）。EV.PURCHASE failed |
| ST-U03 | 購入 → `{ ok:true, restored:true }` | 「購入済みの記録を確認し、Proを有効にしました」。EV.PURCHASE restored |
| ST-U04 | 復元 → 権利あり | 「購入を復元しました」→ 自動で閉じる。EV.PURCHASE restored |
| ST-U05 | 復元 → 権利なし | 「購入履歴が見つかりませんでした…」 |
| ST-U06 | 復元 → 失敗・不明 | 「確認できませんでした…」 |
| ST-U07 | 復元中 | 購入ボタンと復元ボタンを無効化 |
| ST-U08 | 購入中 | 復元ボタンを無効化 |
| ST-U09 | 価格なし → 再読み込み | もう一度 getPriceLabel を呼び、価格を表示 |
| ST-invalid-U10 | 購入中に閉じる → 開き直す → 古い購入が成功で届く | 新しい画面は成功にならない。onClose は呼ばれない |
| ST-invalid-U11 | 成功 → 自動で閉じる前に自分で閉じる | onClose は1回だけ（タイマーが解除される） |
| ST-U12 | 開いている間に plan が paid になる（更新通知） | 「Proが有効になりました」→ 自動で閉じる |
| ST-U13 | 非native（PWA本番） | 復元ボタンも出さない |
| ST-U14 | 購入中に plan が paid になる（billing が購入の完了前に反映する）→ 購入が成功で届く | 途中で「Proが有効になりました」を出さず、「購入が完了しました」を表示。onClose は1回 |
| ST-U15 | 復元中に plan が paid になる → 復元が成功で届く | 途中で「Proが有効になりました」を出さず、「購入を復元しました」を表示 |

| reason | 文言 |
|---|---|
| network / timeout | 通信できませんでした。通信環境を確認して、もう一度お試しください。 |
| not-allowed | この端末またはアカウントでは購入できません。Google Play の設定をご確認ください。 |
| unavailable / no-offering / not-ready | 現在購入できません。時間をおいてお試しください。 |
| in-progress | 購入処理中です。しばらくお待ちください。 |
| not-entitled | 購入は完了しましたが、まだ反映されていません。少し待ってから「購入を復元」をお試しください。 |
| already-owned | 購入済みの記録を確認できませんでした。「購入を復元」をお試しください。 |
| failed ほか | 購入できませんでした。時間をおいてお試しください。（従来どおり） |

### §6-7 バックアップの読み込みとプラン（§5-4 への追加）

`importJSON` は読み込み前の `settings.plan` を保つ（課金状態の正は RevenueCat）。

| ID | 現在の plan | ファイルの plan | 読み込み後 |
|---|---|---|---|
| ST-IMP01 | paid | free（購入前の古いバックアップ） | **paid のまま**（記録は置き換わる） |
| ST-IMP02 | free | paid | **free のまま** |
| ST-IMP02b | free | paid（テーマ light） | free のまま、テーマは light に復元（plan 以外の設定はファイルから） |
| ST-IMP03 | free | v2 `isPremium:true` | free のまま（既存テストの期待値を変更） |
| ST-IMP04 | free | 'pro' | 保存されるのも free（既存テストの期待値を変更） |
| ST-IMP05 | paid | 自分の書き出し（paid） | 往復で同一（既存どおり） |

### §6-8 v2.5.1 での追加 — 不正な応答と初期化の再試行

v2.5.0 の残存リスク2件（[完了レポート §17](./test-completion-report.md)）を、テスト先行で閉じる。

**不正な応答は「不明」**: 照会・復元の応答で `entitlements.active` が読めないときは、
「未購入で確定」ではなく「不明」として扱う（更新通知の ST-L04 と同じ扱い。降格しない側）。

| ID | 入力 | 期待 |
|---|---|---|
| ST-Q01 | 照会の応答に `customerInfo` が無い | `{ ok:false, status:'unknown', reason:'invalid' }` |
| ST-Q02 | `customerInfo` に `entitlements` が無い | 同上 |
| ST-Q03 | `entitlements.active` が無い・null | 同上 |
| ST-Q04 | 起動時リストア（cached paid）で応答が不正 | setPlan を呼ばない（降格しない） |
| ST-Q05 | 復元の応答が不正 | unknown/invalid、setPlan を呼ばない |
| （回帰） | `entitlements.active` が `{}` | confirmed/false のまま（既存） |

**初期化の再試行**: configure が失敗したら結果を記憶せず、次に SDK を使うときに再試行する。

```
利用不可（configure 失敗）--次の呼び出し--> 初期化中 --成功--> 準備完了（以後 configure しない）
                                                  \--失敗--> 利用不可（次の呼び出しでまた再試行）
APIキー未設定 --> 利用不可（再試行しない）
```

| ID | シナリオ | 期待 |
|---|---|---|
| ST-I10 | 1回目の configure が失敗 → 価格は null。次の呼び出しで再試行して成功 | 価格を返す。configure は計2回 |
| ST-I11 | 失敗のあと、同時に価格と照会を呼ぶ | configure は1回にまとまる（計2回） |
| ST-I12 | APIキー未設定で何度呼んでも | configure を呼ばない |
| ST-I13 | 失敗 → 再試行で成功 → さらに呼び出し | 更新通知の登録は1回だけ。configure も成功後は増えない |
| （回帰） | configure が毎回失敗（ST-I05〜I07） | 毎回 unavailable／null（既存） |

---

## §7 `Heatmap.jsx` — 凡例の向きと表示位置（v2.5.1）

描画の確認（`@testing-library/react`）。jsdom はレイアウトを計算しないため、スクロールは
`scrollWidth` と `scrollLeft` の setter を差し替えて確認する。

| ID | 対象 | 期待 |
|---|---|---|
| UI-H01 | 凡例の並び | 「多・pump・fresh・mid・empty・少」→ 区切り →「soon・期限間近」→「over・超過」（目盛りごと反転。明るい色＝多 の意味は変えない） |
| UI-H02 | 描画の直後 | `.heatmap__scroll` を右端（最新の週）までスクロールする |
| UI-H03 | 列数が増えたとき（再描画） | もう一度右端までスクロールする |
| UI-H04 | 列数が変わらない再描画（間隔の変更など） | スクロールしない（利用者が戻したスクロール位置を保つ） |

---

## Findings

設計中（v2.1.8）に判明した実装／要件の疑義です。当時はテストで現行挙動を固定するにとどめ、
**v2.1.9 で 8 件すべてを修正しました**（#6 のみコード変更ではなく「削除禁止」の注記）。
修正時に新たに見つかった #9 も併せて記載しています。

> **深刻度は独立検証後の値です。** 反証を試みる独立検証によって、8 件中 **7 件が下方修正**されました
> （#1 高→中、#2/#3/#4/#8 中→低、#6/#7 低→情報。#5 のみ「低」で据え置き）。上方修正は 0 件です。
> 到達経路つきの詳細と、この過大評価が起きた理由は [テスト完了レポート §6・§9](./test-completion-report.md) を参照してください。

| # | 内容 | 箇所 | 深刻度 | v2.1.9 での対応 |
|---|---|---|---|---|
| 1 | **未知の将来バージョンのデータが初期化される。** `version:4` の state は v1 フラット判定にも該当せず `makeDefaultState()` に落ちる。さらに起動時 `persist()` が localStorage を上書きするため**復元不能**。将来 v4 を出した後にユーザーが旧版へ戻ると全記録を失う。 | [store.js:100](../src/store/store.js#L100), [store.js:176](../src/store/store.js#L176) | 中 | `migrate` はバージョン番号を見ず bikes の形で判定。`load` が由来を返し、解釈できなかったデータは**上書きしない** |
| 2 | **`dateInputToISO` の不正入力が RangeError を投げる。** Invalid Date に `toISOString()` を呼ぶため。現状は呼び出し側の `value &&` ガード頼み。 | [date.js:116](../src/lib/date.js#L116), [PumpSheet.jsx:73](../src/screens/PumpSheet.jsx#L73), [HistoryScreen.jsx:66](../src/screens/HistoryScreen.jsx#L66) | 低 | 例外ではなく `null` を返す。呼び出し側2箇所も戻り値で判定 |
| 3 | **`editHistory` が日付形式を検証しない。** 不正文字列がそのまま保存され、`recomputeLastReset` の文字列ソートを通じて `lastReset` まで壊れる。 | [store.js:227](../src/store/store.js#L227) | 低 | `toStoredDateISO` で検証・正規化。`pump` も同様 |
| 4 | **負の `intervalDays` が素通りする。** `Number(x) || 14` は負数を弾かない。`setInterval` は `d < 1` を拒否するが `normalize` は負数を残すため、`importJSON` 経由の外部データが負サイクルを持ち得る（過去日なら overdue、未来日なら soon になり、いずれも実状態と無関係な表示になる）。 | [date.js:39](../src/lib/date.js#L39), [store.js:137](../src/store/store.js#L137) | 低 | `normalize` が `normalizeIntervalDays` で 1 以上の整数へ矯正（`date.js:39` は**意図的に変更せず**。触ると M06 を殺す唯一のテストが等価ミュータント化する） |
| 5 | **空白のみの自転車名が trim されない。** `setBikeName` / `addBike` は trim するが [store.js:131](../src/store/store.js#L131) の `normalize` はしないため、`importJSON` 経由で到達する。症状は通知本文だけでなくホーム画面・自転車リスト・削除確認ダイアログにも及ぶ（**真の修正箇所は `notify-plan.js` ではなく `store.js` 側**）。 | [store.js:131](../src/store/store.js#L131), [notify-plan.js:46](../src/lib/notify-plan.js#L46) | 低 | `normalize` が `setBikeName` / `addBike` と同じ trim をする |
| 6 | **内側の `if` は削除禁止の実働ガード。** Date の表現上限付近（`interval ≥ 99979393`）で `renudgeAt` だけが Invalid Date になり、この `if` が偽になる。削除すると Invalid Date が `schedule` に渡り、通知計画全体の登録が失敗する。 | [notify-plan.js:59](../src/lib/notify-plan.js#L59) | 情報 | コードに「削除禁止」のコメント。境界5点をテストで固定 |
| 7 | **`totalCount` が date 欠損要素も数える。** `sortedHistory().length` と食い違い得る。`normalizeHistory` が保存時に弾くため到達不能。 | [stats.js:44](../src/lib/stats.js#L44) | 情報 | `sortedHistory(history).length` に変更 |
| 8 | **`importJSON` がサイレントにデータを消す。** `looksLikeData` は `bikes` が配列でありさえすれば通すが、`migrate` が version 不一致で初期 state に落とすため、`ok:true` を返しながら既存データが消える。 | [store.js:315](../src/store/store.js#L315) | 低 | 受理条件を `canMigrate` / `hasRestorableData` に統一。空のバックアップは専用メッセージで拒否 |
| 9 | **`normalize` が `{"bikes":[null]}` で TypeError を投げる。** `importJSON` の `commit` は try の外にあるため、例外が `SettingsScreen` の `reader.onload` まで抜け、成功トーストもエラートーストも出ない。**v2.1.9 の設計中に発見**（v2.1.8 時点で既に存在した実バグ）。 | [store.js](../src/store/store.js) | 低 | `bikes` / `items` の非オブジェクト要素を間引く。`importJSON` の `commit` も try で包む |

---

## 検証

### テストの実行

```bash
npm test
```

9 ファイル / 556 件（既存 53 + 新規 503）が通ります。

### 境界テストの有効性確認（ミューテーション）

「テスト件数」ではなく「境界を守れているか」を確認するため、意図的にオフバイワンを注入して**新規テストだけが落ちる**ことを確認しました（実施後にソースは復元済み）。

| 注入した変更 | 落ちたテスト | 既存 53 件 |
|---|---|---|
| [date.js:61](../src/lib/date.js#L61) `remaining <= 0` → `< 0` | 新規 **8 件**（4サイクル × 状態/付随フィールド） | **全通過（検出できず）** |
| [date.js:76](../src/lib/date.js#L76) `<= 0.25` → `< 0.25` | 新規 **2 件**（interval=28 / remaining=7） | **全通過（検出できず）** |
| [stats.js:37](../src/lib/stats.js#L37) `gap <= limit` → `gap < limit` | 新規 **10 件** | **全通過（検出できず）** |
| [notify-plan.js:52](../src/lib/notify-plan.js#L52) `> now` → `>= now` | 新規 **1 件**（20:00 ちょうど） | **全通過（検出できず）** |

4 つの取り違えはいずれも改修前のスイートを素通りします。境界を明示的に置いたことで検出できるようになりました。

## スコープ外（意図的）

- **DST 跨ぎの `daysBetween`** — Windows では `process.env.TZ` の実行時変更が不安定なため。対象ユーザーは JST（DST なし）で、`Math.round` による吸収がコード上の対策です。必要になれば `test.env: { TZ: 'America/New_York' }` を持つ Vitest プロジェクトを別途追加します。
- **UI コンポーネントテスト** — `@testing-library/react` 未導入のため。プラン上限の UI 反映（`limits.*` の表示ゲート）は本設計の対象外です。store 層が上限を強制しないことは §4-3 で固定してあります。
- **ソースコードの修正** — Findings は報告のみ。
