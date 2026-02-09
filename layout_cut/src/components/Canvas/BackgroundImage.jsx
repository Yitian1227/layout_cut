import useImage from 'use-image'
import { Image as KonvaImage } from 'react-konva'

function BackgroundImage({ src, imageSize, canvasScale }) {
  const [image] = useImage(src)
  
  if (!image || !imageSize.width || !imageSize.height) return null
  
  // 計算畫布的實際尺寸（考慮縮放）
  // Stage 的 scaleX/scaleY 會縮放整個畫布，所以我們需要計算實際的畫布尺寸
  const canvasWidth = 1000 / canvasScale
  const canvasHeight = 800 / canvasScale
  
  // 計算圖片在畫布中居中顯示的位置
  // 使用原始圖片尺寸，因為 Stage 已經應用了 canvasScale
  const x = (canvasWidth - imageSize.width) / 2
  const y = (canvasHeight - imageSize.height) / 2
  
  return (
    <KonvaImage
      image={image}
      x={x}
      y={y}
      width={imageSize.width}
      height={imageSize.height}
      listening={false} // 背景圖片不響應事件，避免阻擋圖層交互
    />
  )
}

export default BackgroundImage
