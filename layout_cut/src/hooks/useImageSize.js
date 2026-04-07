import { useState, useEffect } from 'react'

/** 左右側欄 + 邊距（與 App 中 LEFT_SIDEBAR + ANIMATION_HISTORY 對齊） */
const DEFAULT_SIDEBAR_GUTTER = 320 + 320 + 56
const DEFAULT_TOP_GUTTER = 96

function readViewportMax() {
  if (typeof window === 'undefined') {
    return { w: 1000, h: 800 }
  }
  const w = Math.max(240, window.innerWidth - DEFAULT_SIDEBAR_GUTTER)
  const h = Math.max(200, window.innerHeight - DEFAULT_TOP_GUTTER)
  return { w, h }
}

/**
 * 依視窗可用區域計算縮放，讓圖片等比例落在 max 框內（行為接近 object-fit: contain）
 */
export function useImageSize(baseImage) {
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [canvasScale, setCanvasScale] = useState(1)
  const [viewportMax, setViewportMax] = useState(readViewportMax)

  useEffect(() => {
    const onResize = () => setViewportMax(readViewportMax())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (baseImage) {
      const img = new window.Image()
      img.onload = () => {
        const naturalWidth = img.naturalWidth
        const naturalHeight = img.naturalHeight
        setImageSize({ width: naturalWidth, height: naturalHeight })

        const canvasMaxWidth = viewportMax.w
        const canvasMaxHeight = viewportMax.h

        const scaleX = canvasMaxWidth / naturalWidth
        const scaleY = canvasMaxHeight / naturalHeight
        const scale = Math.min(scaleX, scaleY, 1)

        setCanvasScale(scale)
      }
      img.src = baseImage
    } else {
      setImageSize({ width: 0, height: 0 })
      setCanvasScale(1)
    }
  }, [baseImage, viewportMax.w, viewportMax.h])

  return { imageSize, canvasScale }
}
