import useImage from 'use-image'
import { Image as KonvaImage } from 'react-konva'

function BackgroundImage({ src, imageSize, canvasScale }) {
  const [image] = useImage(src)
  
  if (!image || !imageSize.width || !imageSize.height) return null
  
  // 移除所有坐标调整，图片从 (0, 0) 开始
  return (
    <KonvaImage
      image={image}
      x={0}
      y={0}
      width={imageSize.width}
      height={imageSize.height}
      listening={false} // 背景圖片不響應事件，避免阻擋圖層交互
    />
  )
}

export default BackgroundImage
