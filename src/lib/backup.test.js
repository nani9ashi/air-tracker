// ============================================================
// backup.test.js — 書き出しが「実際の結果」を返すことを固定する。
// v2.1.9 までは Blob + <a download>（Web 前提）で、Android では何も
// 起きないのに無条件で成功トーストを出していた。その形に戻らないよう、
// 失敗経路で ok:false になることを重点的に押さえる。
//
// native/web は Capacitor.isNativePlatform() でモジュールロード時に確定するので、
// 経路ごとにファイルを分けず vi.resetModules() + 動的 import で切り替える
// （React が絡まないので store シングルトンの罠は無い）。
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  native: true,
  writeFile: vi.fn(),
  getUri: vi.fn(),
  canShare: vi.fn(),
  share: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => h.native } }))
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: h.writeFile, getUri: h.getUri },
  Directory: { Cache: 'CACHE', Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' },
}))
vi.mock('@capacitor/share', () => ({ Share: { canShare: h.canShare, share: h.share } }))

const JSON_TEXT = '{"version":3}'

// 経路を選んでモジュールを読み直す。
async function load(native) {
  h.native = native
  vi.resetModules()
  return import('./backup.js')
}

beforeEach(() => {
  vi.clearAllMocks()
  h.writeFile.mockResolvedValue(undefined)
  h.getUri.mockResolvedValue({ uri: 'file:///cache/quuki-backup-2026-08-14.json' })
  h.canShare.mockResolvedValue({ value: true })
  h.share.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('backupFileName', () => {
  it('日付入りの .json 名になる', async () => {
    const { backupFileName } = await load(true)
    expect(backupFileName(new Date(2026, 7, 14))).toBe('quuki-backup-2026-08-14.json')
  })
})

describe('native — Filesystem + Share', () => {
  it('cache に UTF8 で書き、その URI を共有する', async () => {
    const { exportBackup } = await load(true)
    const res = await exportBackup(JSON_TEXT, 'b.json')

    expect(res).toEqual({ ok: true })
    expect(h.writeFile).toHaveBeenCalledWith({
      path: 'b.json',
      data: JSON_TEXT,
      directory: 'CACHE', // ⚠ Capacitor は cache からしか共有できない
      encoding: 'utf8',
    })
    expect(h.getUri).toHaveBeenCalledWith({ path: 'b.json', directory: 'CACHE' })
    expect(h.share).toHaveBeenCalledWith(
      expect.objectContaining({ files: ['file:///cache/quuki-backup-2026-08-14.json'] }),
    )
  })

  it('書き込みは共有より先（URI を取る前に実体が要る）', async () => {
    const { exportBackup } = await load(true)
    await exportBackup(JSON_TEXT)
    expect(h.writeFile.mock.invocationCallOrder[0]).toBeLessThan(h.share.mock.invocationCallOrder[0])
  })

  it('writeFile が失敗したら ok:false / failed で、共有もしない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { exportBackup } = await load(true)
    h.writeFile.mockRejectedValueOnce(new Error('ENOSPC'))

    expect(await exportBackup(JSON_TEXT)).toEqual({ ok: false, reason: 'failed' })
    expect(h.share).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('共有できない端末は ok:false / unsupported', async () => {
    const { exportBackup } = await load(true)
    h.canShare.mockResolvedValueOnce({ value: false })

    expect(await exportBackup(JSON_TEXT)).toEqual({ ok: false, reason: 'unsupported' })
    expect(h.share).not.toHaveBeenCalled()
  })

  it.each(['Share canceled', 'User cancelled the share', 'Activity aborted', 'dialog dismissed'])(
    '共有シートを閉じただけ（%s）は cancelled 扱いで失敗にしない',
    async (message) => {
      const { exportBackup } = await load(true)
      h.share.mockRejectedValueOnce(new Error(message))
      expect(await exportBackup(JSON_TEXT)).toEqual({ ok: false, reason: 'cancelled' })
    },
  )

  it('それ以外の共有エラーは failed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { exportBackup } = await load(true)
    h.share.mockRejectedValueOnce(new Error('no activity found'))
    expect(await exportBackup(JSON_TEXT)).toEqual({ ok: false, reason: 'failed' })
    warn.mockRestore()
  })

  it('一時ファイルを消さない（共有先が読み終わる時点を知る手段が無い）', async () => {
    const fsMod = await import('@capacitor/filesystem')
    const { exportBackup } = await load(true)
    await exportBackup(JSON_TEXT)
    expect(fsMod.Filesystem.deleteFile).toBeUndefined()
  })

  it('native では <a download> を使わない', async () => {
    const click = vi.fn()
    const orig = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = orig(tag)
      if (tag === 'a') el.click = click
      return el
    })
    const { exportBackup } = await load(true)
    await exportBackup(JSON_TEXT)
    expect(click).not.toHaveBeenCalled()
    document.createElement.mockRestore()
  })
})

describe('web/PWA — <a download>', () => {
  let click, createObjectURL, revokeObjectURL

  beforeEach(() => {
    click = vi.fn()
    createObjectURL = vi.fn(() => 'blob:mock')
    revokeObjectURL = vi.fn()
    // jsdom は createObjectURL を実装していないので生やす。
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    const orig = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = orig(tag)
      if (tag === 'a') el.click = click
      return el
    })
  })
  afterEach(() => {
    document.createElement.mockRestore?.()
    delete URL.createObjectURL
    delete URL.revokeObjectURL
  })

  it('ダウンロードを開始し ok:true（＝「開始できた」までの意味）', async () => {
    const { exportBackup } = await load(false)
    const res = await exportBackup(JSON_TEXT, 'b.json')

    expect(res).toEqual({ ok: true })
    expect(click).toHaveBeenCalledOnce()
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock') // リークさせない
  })

  it('web では Filesystem / Share を触らない', async () => {
    const { exportBackup } = await load(false)
    await exportBackup(JSON_TEXT)
    expect(h.writeFile).not.toHaveBeenCalled()
    expect(h.share).not.toHaveBeenCalled()
  })

  it('createObjectURL が投げたら ok:false / failed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { exportBackup } = await load(false)
    createObjectURL.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    expect(await exportBackup(JSON_TEXT)).toEqual({ ok: false, reason: 'failed' })
    expect(click).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
