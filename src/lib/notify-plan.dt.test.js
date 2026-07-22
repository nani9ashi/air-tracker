// ============================================================
// notify-plan.js — ISTQB デシジョンテーブル + 時刻境界(BVA)
// 設計書: docs/test-design-istqb.md §2
//
// 条件:
//   C1 due 算出可能（lastReset 有 & intervalDays >= 1）
//   C2 primaryAt（予定日前日 20:00）> now
//   C3 renudgeAt（予定日+2日 20:00）> now
//   C4 userAction
//
// | 条件            | R1 | R2 | R3 | R4 | R5 | R6       |
// |-----------------|----|----|----|----|----|----------|
// | C1 due算出可能  | N  | Y  | Y  | Y  | Y  | Y        |
// | C2 primary未来  | -  | Y  | N  | N  | N  | Y        |
// | C3 renudge未来  | -  | -  | -  | Y  | N  | N        |
// | C4 userAction   | -  | -  | Y  | N  | N  | -        |
// | 出力            | [] |P+R |[C] |[R] | [] | [primary] |
//
// R6 は現実的な入力域（プリセット 7〜28日）では成立しない。renudgeAt は primaryAt の
// ちょうど3日後なので、C2=Y なら C3=Y が確定するため。
// ただし Date の表現上限付近では renudgeAt だけが Invalid Date になり、C3=N が成立する。
// したがって notify-plan.js:59 の内側 if は「常に真のデッドコード」ではなく、
// Invalid Date の通知を作らせない実働ガードである（削除禁止）。§2-4 で両方を固定する。
// ============================================================
import { describe, it, expect } from 'vitest'
import { planNotifications, reminderStatus, REMINDER_HOUR, RENUDGE_DAYS } from './notify-plan.js'

// lastReset=2026-06-01(正午) / interval=14
//   → 予定日(due) = 6/15 0:00 / primary = 6/14 20:00 / renudge = 6/17 20:00
const LAST_RESET = new Date(2026, 5, 1, 12).toISOString()
const at = (y, m, d, h = 0, mi = 0, s = 0, ms = 0) => new Date(y, m - 1, d, h, mi, s, ms)
const ms = (...args) => at(...args).getTime()

const PRIMARY_AT = at(2026, 6, 14, REMINDER_HOUR)
const RENUDGE_AT = at(2026, 6, 17, REMINDER_HOUR)

const kinds = (out) => out.map((n) => n.kind)

// ------------------------------------------------------------
// §2-1 デシジョンテーブル本体（各列＝1テスト）
// ------------------------------------------------------------
describe('planNotifications — デシジョンテーブル', () => {
  it.each([
    ['lastReset が null', null, 14],
    ['lastReset が空文字', '', 14],
    ['lastReset が undefined', undefined, 14],
    ['intervalDays が 0', LAST_RESET, 0],
    ['intervalDays が -1', LAST_RESET, -1],
    ['intervalDays が NaN', LAST_RESET, NaN],
    ["intervalDays が 'abc'", LAST_RESET, 'abc'],
    ['intervalDays が Infinity', LAST_RESET, Infinity],
    ['intervalDays が undefined', LAST_RESET, undefined],
  ])('DT-R1: C1=N（%s）→ 通知なし', (_label, lastReset, interval) => {
    expect(planNotifications('車', lastReset, interval, { now: ms(2026, 6, 10, 10) })).toEqual([])
    expect(
      planNotifications('車', lastReset, interval, { userAction: true, now: ms(2026, 6, 10, 10) }),
    ).toEqual([])
  })

  it('DT-R2: C2=Y / C4=N → primary + renudge の2本', () => {
    const out = planNotifications('テスト車', LAST_RESET, 14, {
      userAction: false,
      now: ms(2026, 6, 10, 10),
    })
    expect(kinds(out)).toEqual(['primary', 'renudge'])
    expect(out[0].at).toEqual(PRIMARY_AT)
    expect(out[1].at).toEqual(RENUDGE_AT)
  })

  // 未カバーだった列: ユーザーが間隔を延長して予定日がまだ未来になったケース。
  // catchup ではなく通常の2本が出る（回帰すると通知が1本に減る）。
  it('DT-R2: C2=Y / C4=Y でも catchup ではなく primary + renudge の2本', () => {
    const out = planNotifications('テスト車', LAST_RESET, 14, {
      userAction: true,
      now: ms(2026, 6, 10, 10),
    })
    expect(kinds(out)).toEqual(['primary', 'renudge'])
    expect(out[0].at).toEqual(PRIMARY_AT)
  })

  it.each([
    ['renudge がまだ未来', ms(2026, 6, 16, 10), at(2026, 6, 16, REMINDER_HOUR)],
    ['renudge も過去', ms(2026, 6, 20, 10), at(2026, 6, 20, REMINDER_HOUR)],
  ])('DT-R3: C2=N / C4=Y（%s）→ catchup 1本のみ', (_label, now, expectedAt) => {
    const out = planNotifications('車', LAST_RESET, 14, { userAction: true, now })
    expect(kinds(out)).toEqual(['catchup'])
    expect(out[0].at).toEqual(expectedAt)
  })

  it('DT-R4: C2=N / C3=Y / C4=N → renudge 1本のみ（起動時の再同期）', () => {
    const out = planNotifications('車', LAST_RESET, 14, {
      userAction: false,
      now: ms(2026, 6, 16, 10),
    })
    expect(kinds(out)).toEqual(['renudge'])
    expect(out[0].at).toEqual(RENUDGE_AT)
  })

  it('DT-R5: C2=N / C3=N / C4=N → 通知なし（無音・スパム回避）', () => {
    expect(
      planNotifications('車', LAST_RESET, 14, { userAction: false, now: ms(2026, 6, 20, 10) }),
    ).toEqual([])
  })

  it('DT: options 省略時は userAction=false / now=現在 として扱う', () => {
    // 十分過去の lastReset なら primary も renudge も過去 → R5
    const longAgo = new Date(2020, 0, 1, 12).toISOString()
    expect(planNotifications('車', longAgo, 14)).toEqual([])
  })
})

// ------------------------------------------------------------
// §2-2 20:00 スロットの BVA（厳密比較 `>` の境界）
// ------------------------------------------------------------
describe('planNotifications — 20:00 境界 BVA', () => {
  it.each([
    ['primary 境界の直前', ms(2026, 6, 14, 19, 59, 59, 999), ['primary', 'renudge']],
    ['★primary 境界ちょうど（厳密 > のため primary は出ない）', ms(2026, 6, 14, 20, 0, 0, 0), ['renudge']],
    ['primary 境界の直後', ms(2026, 6, 14, 20, 0, 0, 1), ['renudge']],
    ['renudge 境界の直前', ms(2026, 6, 17, 19, 59, 59, 999), ['renudge']],
    ['★renudge 境界ちょうど（通知が尽きる瞬間）', ms(2026, 6, 17, 20, 0, 0, 0), []],
    ['renudge 境界の直後', ms(2026, 6, 17, 20, 0, 0, 1), []],
  ])('BVA: %s', (_label, now, expected) => {
    expect(kinds(planNotifications('車', LAST_RESET, 14, { userAction: false, now }))).toEqual(
      expected,
    )
  })

  it.each([
    ['当日 20:00 の直前 → 当日 20:00', ms(2026, 6, 16, 19, 59, 59, 999), at(2026, 6, 16, 20)],
    ['★当日 20:00 ちょうど → 翌日 20:00', ms(2026, 6, 16, 20, 0, 0, 0), at(2026, 6, 17, 20)],
    ['当日 20:00 の直後 → 翌日 20:00', ms(2026, 6, 16, 20, 0, 0, 1), at(2026, 6, 17, 20)],
    ['0:00 なら当日 20:00', ms(2026, 6, 16, 0, 0, 0, 0), at(2026, 6, 16, 20)],
    ['23:59 なら翌日 20:00', ms(2026, 6, 16, 23, 59, 59, 999), at(2026, 6, 17, 20)],
  ])('BVA: catchup の直近20時スロット — %s', (_label, now, expectedAt) => {
    const out = planNotifications('車', LAST_RESET, 14, { userAction: true, now })
    expect(out[0].at).toEqual(expectedAt)
  })

  it('BVA: 月跨ぎでも catchup は翌日20時（6/30 21:00 → 7/1 20:00）', () => {
    const out = planNotifications('車', LAST_RESET, 14, {
      userAction: true,
      now: ms(2026, 6, 30, 21),
    })
    expect(out[0].at).toEqual(at(2026, 7, 1, 20))
  })
})

// ------------------------------------------------------------
// §2-3 引数と本文の EP
// ------------------------------------------------------------
describe('planNotifications — 引数の EP', () => {
  const now = ms(2026, 6, 10, 10)

  it.each([
    ['通常名', 'ロードバイク', 'ロードバイク'],
    ['空文字 → 既定名', '', 'マイバイク'],
    ['null → 既定名', null, 'マイバイク'],
    ['undefined → 既定名', undefined, 'マイバイク'],
  ])('EP: bikeName %s', (_label, input, expectedName) => {
    const out = planNotifications(input, LAST_RESET, 14, { now })
    expect(out[0].body).toContain(`「${expectedName}」`)
    expect(out[1].body).toContain(`「${expectedName}」`)
  })

  // ※Findings #5: bikeName は trim されないので空白のみの名前が通る。
  //   setBikeName / addBike は trim するが、store.js:131 の normalize は trim しないため、
  //   importJSON や破損 localStorage 経由なら空白のみの名前が実際に到達する（当初「到達不能」
  //   としたのは誤り）。真の修正箇所は notify-plan.js:46 ではなく store.js:131 側。
  it('EP: 空白のみの bikeName はそのまま通る（※Findings #5 / 外部データ経由で到達）', () => {
    const out = planNotifications('   ', LAST_RESET, 14, { now })
    expect(out[0].body).toContain('「   」')
  })

  it.each([
    ['整数', 14, '14日間隔'],
    ['数値文字列', '14', '14日間隔'],
    ['小数（切り捨て側に round）', 14.4, '14日間隔'],
    ['小数（切り上げ側に round）', 14.6, '15日間隔'],
    ['最短プリセット', 7, '7日間隔'],
    ['最長プリセット', 28, '28日間隔'],
  ])('EP: 本文のサイクル表記 — %s', (_label, interval, expectedText) => {
    const out = planNotifications('車', LAST_RESET, interval, { now: ms(2026, 6, 2, 10) })
    expect(out[0].body).toContain(expectedText)
  })

  it('EP: 各 kind のタイトル・本文が仕様どおり', () => {
    const [primary, renudge] = planNotifications('車', LAST_RESET, 14, { now })
    expect(primary.title).toBe('明日は空気入れの日です')
    expect(primary.body).toBe('「車」のタイヤに空気を入れましょう（14日間隔）')
    expect(renudge.title).toBe('空気入れはお済みですか？')
    expect(renudge.body).toBe(`「車」の予定日から${RENUDGE_DAYS}日が経ちました`)

    const [catchup] = planNotifications('車', LAST_RESET, 14, {
      userAction: true,
      now: ms(2026, 6, 16, 10),
    })
    expect(catchup.title).toBe('空気入れの時期になりました')
    expect(catchup.body).toBe('間隔の変更により、「車」の予定日を過ぎています')
  })

  it('EP: 通知は 20:00 ちょうどに積まれる（interval=14 / now 2点 / userAction 両値）', () => {
    for (const now of [ms(2026, 6, 10, 10), ms(2026, 6, 16, 10)]) {
      for (const userAction of [true, false]) {
        for (const n of planNotifications('車', LAST_RESET, 14, { userAction, now })) {
          expect([n.at.getHours(), n.at.getMinutes(), n.at.getSeconds()]).toEqual([
            REMINDER_HOUR,
            0,
            0,
          ])
        }
      }
    }
  })
})

// ------------------------------------------------------------
// §2-4 R6（primary だけが積まれる列）
//
// 設計時は「R6 は幾何的に到達不能」と結論したが、それは探索範囲を
// 現実的な入力域に限っていたための誤りだった。Date の表現上限付近では
// renudgeAt だけが Invalid Date になり R6 が実際に成立する。
// → notify-plan.js:59 の内側 if は削除してはいけない実働ガードである。
//   （経緯は docs/test-completion-report.md §5 を参照）
// ------------------------------------------------------------
describe('planNotifications — R6（primary のみ）と探索範囲', () => {
  it('DT-R6: 現実的な入力域では primary が出れば renudge も必ず出る（探索: 4サイクル × 予定日±30日 × 4時刻）', () => {
    // これは「到達不能の証明」ではなく、探索範囲を明示した不変条件の確認である。
    // 範囲を Date の表現上限まで広げると下のテストのとおり反例が存在する。
    for (const interval of [7, 14, 21, 28]) {
      for (let offset = -30; offset <= 30; offset++) {
        for (const hour of [0, 19, 20, 23]) {
          const now = at(2026, 6, 15 + offset, hour).getTime()
          const out = kinds(planNotifications('車', LAST_RESET, interval, { now }))
          if (out.includes('primary')) expect(out).toContain('renudge')
        }
      }
    }
  })

  // Date の表現上限（西暦 275760年9月13日）付近の境界。
  // renudgeAt = 予定日+2日 が先に表現不能になり、primaryAt = 予定日-1日 はまだ有効、という窓がある。
  // このとき内側 if が偽になり primary だけが積まれる＝R6 が成立する。
  it.each([
    ['境界の内側（両方とも表現可能）', 99979392, ['primary', 'renudge']],
    ['★R6 成立の最小値（renudge だけ表現不能）', 99979393, ['primary']],
    ['R6 の窓の内側', 99979394, ['primary']],
    ['R6 の窓の最大値', 99979395, ['primary']],
    ['予定日ごと表現不能（due=Invalid → 通知なし）', 99979396, []],
  ])('BVA: Date 表現上限の境界 — %s (interval=%i)', (_label, interval, expected) => {
    const out = planNotifications('車', LAST_RESET, interval, { now: ms(2026, 6, 10, 10) })
    expect(kinds(out)).toEqual(expected)
  })

  it('DT-R6: notify-plan.js:59 の内側 if は削除禁止（Invalid Date を schedule に渡さないため）', () => {
    // 内側 if を外して無条件 push にすると、ここで at が Invalid Date の通知が混入する。
    // それが notifications.js:77 の schedule に渡ると例外になり、同 :81 の catch で握り潰され、
    // 直前 :64 の cancel と相まって primary ごと登録されない（＝リマインダーが無言で全滅する）。
    const out = planNotifications('車', LAST_RESET, 99979393, { now: ms(2026, 6, 10, 10) })
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('primary')
    for (const n of out) expect(Number.isNaN(n.at.getTime())).toBe(false)
  })
})

// ------------------------------------------------------------
// §2-5 reminderStatus — 同じ表を4状態に畳んで再検証
// ------------------------------------------------------------
describe('reminderStatus — 状態と境界', () => {
  it.each([
    ['lastReset が null', null, 14],
    ['intervalDays が 0', LAST_RESET, 0],
    ["intervalDays が 'abc'", LAST_RESET, 'abc'],
  ])('EP: due 算出不可(%s)は none', (_label, lastReset, interval) => {
    expect(reminderStatus(lastReset, interval, at(2026, 6, 10, 10))).toEqual({
      at: null,
      state: 'none',
    })
  })

  it.each([
    ['primary 境界の直前 → primary を返す', at(2026, 6, 14, 19, 59, 59, 999), 'scheduled', PRIMARY_AT],
    ['★primary 境界ちょうど → 次は renudge', at(2026, 6, 14, 20, 0, 0, 0), 'scheduled', RENUDGE_AT],
    ['primary 境界の直後 → renudge', at(2026, 6, 14, 20, 0, 0, 1), 'scheduled', RENUDGE_AT],
    ['renudge 境界の直前 → renudge', at(2026, 6, 17, 19, 59, 59, 999), 'scheduled', RENUDGE_AT],
    ['★renudge 境界ちょうど → overdue', at(2026, 6, 17, 20, 0, 0, 0), 'overdue', null],
    ['renudge 境界の直後 → overdue', at(2026, 6, 17, 20, 0, 0, 1), 'overdue', null],
  ])('BVA: %s', (_label, now, expectedState, expectedAt) => {
    const r = reminderStatus(LAST_RESET, 14, now)
    expect(r.state).toBe(expectedState)
    expect(r.at).toEqual(expectedAt)
  })

  it('EP: reminderStatus の at は planNotifications の先頭と一致する（表示と実登録の整合）', () => {
    for (const now of [at(2026, 6, 10, 10), at(2026, 6, 16, 10)]) {
      const r = reminderStatus(LAST_RESET, 14, now)
      const [first] = planNotifications('車', LAST_RESET, 14, { now: now.getTime() })
      expect(r.at).toEqual(first.at)
    }
  })
})
