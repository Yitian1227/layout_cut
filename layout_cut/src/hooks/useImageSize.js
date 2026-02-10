import { useState, useEffect } from 'react'

/**
 * 管理图片尺寸和画布缩放的 hook
 */
export function useImageSize(baseImage) {
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [canvasScale, setCanvasScale] = useState(1)

  useEffect(() => {
    if (baseImage) {
      const img = new window.Image()
      img.onload = () => {
        const naturalWidth = img.naturalWidth
        const naturalHeight = img.naturalHeight
        setImageSize({ width: naturalWidth, height: naturalHeight })
        
        // 計算縮放比例，讓圖片等比例縮放到固定畫布尺寸內
        const canvasMaxWidth = 1000  // 固定畫布寬度
        const canvasMaxHeight = 800  // 固定畫布高度
        
        const scaleX = canvasMaxWidth / naturalWidth
        const scaleY = canvasMaxHeight / naturalHeight
        const scale = Math.min(scaleX, scaleY, 1) // 不放大，只縮小
        
        setCanvasScale(scale)
      }
      img.src = baseImage
    } else {
      setImageSize({ width: 0, height: 0 })
      setCanvasScale(1)
    }
  }, [baseImage])

  return { imageSize, canvasScale }
}
