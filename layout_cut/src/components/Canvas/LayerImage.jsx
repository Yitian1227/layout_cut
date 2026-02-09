import useImage from 'use-image'
import { Image as KonvaImage } from 'react-konva'

function LayerImage({ layer, index, isSelected, onPointerDown, onClick, onMouseEnter, onMouseLeave, layerRef, onTransformEnd }) {
  const [layerImage] = useImage(layer.src)
  
  if (!layerImage || !layer.visible) return null
  
  // 使用圖層的實際尺寸（裁切後的尺寸），而不是原始圖片尺寸
  // 這樣可以讓 hover 更精準，因為圖層只包含實際物件範圍
  const imageWidth = layer.width || layerImage.width || layerImage.naturalWidth || 0
  const imageHeight = layer.height || layerImage.height || layerImage.naturalHeight || 0
  
  return (
    <KonvaImage
      ref={isSelected ? layerRef : null}
      image={layerImage}
      width={imageWidth}
      height={imageHeight}
      x={layer.x}
      y={layer.y}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      stroke={isSelected ? '#4a90e2' : undefined}
      strokeWidth={isSelected ? 2 : 0}
      shadowColor={isSelected ? '#4a90e2' : undefined}
      shadowBlur={isSelected ? 5 : 0}
      shadowOpacity={isSelected ? 0.3 : 0}
      scaleX={layer.scaleX || 1}
      scaleY={layer.scaleY || 1}
      rotation={layer.rotation || 0}
      onTransformEnd={() => onTransformEnd(index)}
    />
  )
}

export default LayerImage
