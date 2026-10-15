// ============================================================
// android-release.contract.test.js — Android リリースビルドの R8 設定の「規約」を固定する
// （v2.4.6）。
//
// ⚠ これはビルドの実行テストではない。R8 が実際に動くこと・実行時に壊れないことの
//   実証は、release ビルド（mapping.txt の生成・DEX サイズ）とエミュレータでの
//   動作確認で行う。ここで固定するのは「同じ壊れ方が戻ってこないこと」だけ:
//     1. release で R8 を有効にしている（Play Console の「DEX コードの最適化が
//        しきい値を下回っています」= 難読化 5% < 25% の再発防止）
//     2. 通知アイコンが名前参照のままリソースの縮小を有効にしない
//     3. Capacitor の注釈クラスを keep している（R8 のフルモードが注釈の読み出しを
//        `throw null` に置き換え、起動直後に落ちた）
//     4. クラッシュレポートの行番号を残している
// ============================================================
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8')
// コメントは説明に「minifyEnabled false」等の語を含むので取り除いてから検査する。
const gradle = () => read('android/app/build.gradle').replace(/\/\/.*$/gm, '')
const rules = () => read('android/app/proguard-rules.pro').replace(/#.*$/gm, '')
const buildTypes = () => {
  const g = gradle()
  const at = g.indexOf('buildTypes')
  expect(at, 'buildTypes が見つからない').toBeGreaterThan(-1)
  return g.slice(at)
}

describe('release ビルドの R8', () => {
  it('minifyEnabled true（R8 で縮小・最適化・難読化する）', () => {
    expect(buildTypes()).toMatch(/minifyEnabled\s+true/)
    expect(buildTypes()).not.toMatch(/minifyEnabled\s+false/)
  })

  it('最適化ありの既定ルール proguard-android-optimize.txt を使う', () => {
    expect(buildTypes()).toContain("getDefaultProguardFile('proguard-android-optimize.txt')")
  })

  it('通知アイコンが名前参照のまま shrinkResources を有効にしない', () => {
    // capacitor.config.json の smallIcon は名前で参照されるだけで、コードからの参照が
    // 無い。リソースの縮小を有効にすると削除されて通知が壊れる。
    const icon = JSON.parse(read('capacitor.config.json')).plugins?.LocalNotifications?.smallIcon
    expect(icon).toBeTruthy()
    const keepXml = resolve(ROOT, 'android/app/src/main/res/raw/keep.xml')
    if (!existsSync(keepXml) || !readFileSync(keepXml, 'utf8').includes(icon)) {
      expect(buildTypes()).not.toMatch(/shrinkResources\s+true/)
    }
  })
})

describe('proguard-rules.pro', () => {
  it.each([
    'com.getcapacitor.annotation.**',
    'com.getcapacitor.PluginMethod',
    'com.getcapacitor.NativePlugin',
  ])('Capacitor の注釈クラス %s を keep している', (cls) => {
    // R8 のフルモードは、keep されていない注釈クラスを「インスタンスが存在しない」と
    // みなし、getAnnotation() の結果を使う処理を throw null に置き換える。
    const esc = cls.replace(/[.*]/g, (c) => `\\${c}`)
    expect(rules()).toMatch(new RegExp(`-keep\\s+@interface\\s+${esc}\\s*\\{\\s*\\*;\\s*\\}`))
  })

  it('クラッシュレポートの行番号を残す（SourceFile,LineNumberTable）', () => {
    expect(rules()).toMatch(/-keepattributes\s+SourceFile,LineNumberTable/)
    expect(rules()).toMatch(/-renamesourcefileattribute\s+SourceFile/)
  })

  it('難読化そのものを止めていない（-dontobfuscate は Play の指標を 0% にする）', () => {
    expect(rules()).not.toMatch(/-dontobfuscate|-dontshrink|-dontoptimize/)
  })
})
