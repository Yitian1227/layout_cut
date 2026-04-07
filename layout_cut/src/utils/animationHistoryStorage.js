/**
 * 動畫紀錄：localStorage 鍵名。
 * 登入後可寫入 localStorage.setItem('layout_cut_account_id', '<id>') 以分帳號隔離。
 */
const LEGACY_KEY = 'user_animation_history'
const ACCOUNT_KEY = 'layout_cut_account_id'

export function getAnimationHistoryStorageKey() {
  try {
    const id = localStorage.getItem(ACCOUNT_KEY)
    if (id && String(id).trim()) {
      return `${LEGACY_KEY}_${String(id).trim()}`
    }
  } catch {
    /* ignore */
  }
  return LEGACY_KEY
}

export function normalizeHistoryVideoUrl(url, apiBase) {
  if (!url || typeof url !== 'string') return ''
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (url.startsWith('/')) {
    const base = (apiBase || '').replace(/\/$/, '')
    return `${base}${url}`
  }
  return url
}

export function loadAnimationHistoryRecords(apiBase) {
  try {
    const raw = localStorage.getItem(getAnimationHistoryStorageKey())
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((r) => r && r.id && r.videoUrl)
      .map((r) => ({
        id: String(r.id),
        prompt: r.prompt != null ? String(r.prompt) : '',
        layerName: r.layerName != null ? String(r.layerName) : '',
        videoUrl: normalizeHistoryVideoUrl(r.videoUrl, apiBase),
        createdAt: r.createdAt != null ? r.createdAt : undefined
      }))
  } catch {
    return []
  }
}

export function saveAnimationHistoryRecords(records) {
  try {
    const key = getAnimationHistoryStorageKey()
    const serializable = records.map((r) => ({
      id: r.id,
      prompt: r.prompt,
      layerName: r.layerName,
      videoUrl: r.videoUrl,
      createdAt: r.createdAt ?? Date.now()
    }))
    localStorage.setItem(key, JSON.stringify(serializable))
  } catch (e) {
    console.warn('animation history save failed:', e)
  }
}

/** 供 <video> 預覽用：強制略過第 0 秒黑幀（data URL 不變更） */
export function videoSrcWithPosterFragment(src) {
  if (!src || typeof src !== 'string') return src
  if (src.startsWith('data:') || src.startsWith('blob:')) return src
  const base = src.split('#')[0]
  return `${base}#t=0.1`
}
