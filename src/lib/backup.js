// ============================================================
// backup.js — バックアップ JSON の書き出し（native / web で経路を分ける）。
//
// native(Android): Capacitor の WebView は blob: の download を処理しないため、
//   Blob + <a download> は「例外も出さず何も起きない」。v2.1.9 まではその上で
//   無条件に成功トーストを出していた（SettingsScreen.jsx:97）。
//   代わりに Filesystem で cache に書き、Share でユーザーに渡す。
//   ⚠ 共有できるのは cache ディレクトリのみ（Capacitor の制約。Documents は
//     Android 11+ で制限される）。AndroidManifest の
//     FileProvider(${applicationId}.fileprovider) と res/xml/file_paths.xml の
//     <cache-path> が既にこれを満たしているので、ネイティブ側の追加設定は不要。
// web/PWA: 従来どおり Blob + <a download>。
//
// 呼び出し側がトーストを出し分けられるよう、例外は投げず必ず結果を返す。
//   { ok: true }
//   { ok: false, reason: 'cancelled' | 'unsupported' | 'failed' }
// native/web の分岐は notifications.js / statusbar.js と同じ house pattern
// （Capacitor.isNativePlatform() をロード時に定数化・静的 import）。
// ============================================================
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { toDateInputValue } from './date.js'

const NATIVE = Capacitor.isNativePlatform()

export function backupFileName(d = new Date()) {
  return `quuki-backup-${toDateInputValue(d)}.json`
}

export async function exportBackup(json, fileName = backupFileName()) {
  return NATIVE ? exportNative(json, fileName) : exportWeb(json, fileName)
}

async function exportNative(json, fileName) {
  try {
    await Filesystem.writeFile({
      path: fileName,
      data: json,
      directory: Directory.Cache, // ← Share できるのはここだけ
      encoding: Encoding.UTF8,
    })
    const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache })

    const can = await Share.canShare()
    if (!can?.value) return { ok: false, reason: 'unsupported' }

    await Share.share({
      title: 'QUUKI バックアップ',
      files: [uri],
      dialogTitle: 'バックアップの保存先を選ぶ',
    })
    // ⚠ 一時ファイルは消さない。共有先が読み終わったタイミングを知る手段が無く、
    //   消すと相手がまだ開いていない可能性がある。cache は OS が管理する。
    //   ここに deleteFile を足すと共有と競合する。
    return { ok: true }
  } catch (e) {
    if (isCancellation(e)) return { ok: false, reason: 'cancelled' }
    console.warn('[backup] native export failed', e)
    return { ok: false, reason: 'failed' }
  }
}

// 共有シートを閉じただけを失敗として扱わない（トーストを出さないため）。
// ⚠ Android の Share プラグインが reject するか resolve するかは実機で要確認。
//   観測結果に合わせてここを調整する。
function isCancellation(e) {
  return /cancel|abort|dismiss/i.test(String((e && (e.message || e.errorMessage)) || e))
}

function exportWeb(json, fileName) {
  try {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    // ⚠ ok:true は「例外なくダウンロードを開始できた」までしか意味しない。
    //   ブラウザ側がブロックしても検知する手段は無い。「保存された」と
    //   読み替えないこと。
    return { ok: true }
  } catch (e) {
    console.warn('[backup] web export failed', e)
    return { ok: false, reason: 'failed' }
  }
}
