import React from 'react'
import { Stage, Layer, Transformer } from 'react-konva'
import LayerImage from './LayerImage'
import BackgroundImage from './BackgroundImage'

function KonvaCanvas({
  baseImage,
  imageSize,
  layers,
  selectedLayerIndex,
  selectedLayers,
  canvasScale,
  onLayerClick,
  onLayerPointerDown,
  onStageClick,
  onStagePointerMove,
  onStagePointerUp,
  onLayerMouseEnter,
  onLayerMouseLeave,
  onTransformEnd,
  transformerRef,
  selectedLayerRef,
  stageRef
}) {
  return (
    <div style={{ 
      backgroundColor: '#f9f9f9',
      display: 'inline-block',
      width: '1000px',
      height: '800px',
      overflow: 'hidden'
    }}>
      <Stage 
        ref={stageRef}
        width={1000} 
        height={800}
        style={{ border: '1px solid #ddd', borderRadius: '4px' }}
        scaleX={canvasScale}
        scaleY={canvasScale}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onClick={onStageClick}
      >
        <Layer>
          {/* 背景圖片（原始圖片預覽） */}
          {baseImage && (
            <BackgroundImage
              src={baseImage}
              imageSize={imageSize}
              canvasScale={canvasScale}
            />
          )}
          
          {/* 分割圖層 */}
          {/* Konva 的 z-index 順序：後渲染的圖層在上層，所以如果多個圖層重疊，最後渲染的（index 最大的）會優先觸發事件 */}
          {layers.map((layer, index) => {
            const isSelected = selectedLayerIndex === index || selectedLayers.includes(index)
            
            return (
              <LayerImage
                key={layer.id}
                layer={layer}
                index={index}
                isSelected={isSelected && selectedLayerIndex === index}
                layerRef={selectedLayerIndex === index ? selectedLayerRef : null}
                onTransformEnd={onTransformEnd}
                onPointerDown={(e) => onLayerPointerDown(index, e)}
                onClick={(e) => onLayerClick(index, e)}
                onMouseEnter={() => onLayerMouseEnter(index)}
                onMouseLeave={onLayerMouseLeave}
              />
            )
          })}
          
          {/* Transformer - 變換控制手柄 */}
          {/* 只在選中單個圖層時顯示 Transformer */}
          {selectedLayerIndex !== null && selectedLayers.length === 1 && (
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                // 限制最小尺寸
                if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
                  return oldBox
                }
                return newBox
              }}
              rotateEnabled={true}
              enabledAnchors={[
                'top-left', 'top-right', 'bottom-left', 'bottom-right', // 四個角的旋轉手柄
                'middle-left', 'middle-right', 'top-center', 'bottom-center' // 邊緣的縮放手柄
              ]}
              borderEnabled={true}
              borderStroke="#4a90e2"
              borderStrokeWidth={2}
              anchorFill="#4a90e2"
              anchorStroke="#fff"
              anchorStrokeWidth={2}
              anchorSize={12}
              anchorCornerRadius={6}
              keepRatio={false}
              flipEnabled={false}
              // 自定義手柄樣式
              anchorShapeFunc={(ctx, anchor) => {
                const size = anchor.size()
                const x = anchor.x()
                const y = anchor.y()
                
                ctx.beginPath()
                
                // 判斷是旋轉手柄（四個角）還是縮放手柄（邊緣）
                const isRotateAnchor = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(anchor.name())
                
                if (isRotateAnchor) {
                  // 繪製旋轉手柄（圓形，暗示可以旋轉）
                  ctx.arc(x, y, size / 2, 0, Math.PI * 2)
                  ctx.fillStyle = '#4a90e2'
                  ctx.fill()
                  ctx.strokeStyle = '#fff'
                  ctx.lineWidth = 2
                  ctx.stroke()
                  
                  // 繪製彎曲箭頭
                  ctx.beginPath()
                  ctx.arc(x, y, size / 2 - 3, 0, Math.PI * 1.5)
                  ctx.strokeStyle = '#fff'
                  ctx.lineWidth = 2
                  ctx.stroke()
                  
                  // 箭頭頭部
                  ctx.beginPath()
                  ctx.moveTo(x - size / 4, y - size / 2)
                  ctx.lineTo(x, y - size / 2 - 3)
                  ctx.lineTo(x + size / 4, y - size / 2)
                  ctx.fillStyle = '#fff'
                  ctx.fill()
                } else {
                  // 繪製縮放手柄（方形，帶箭頭）
                  const halfSize = size / 2
                  ctx.fillStyle = '#4a90e2'
                  ctx.fillRect(x - halfSize, y - halfSize, size, size)
                  ctx.strokeStyle = '#fff'
                  ctx.lineWidth = 2
                  ctx.strokeRect(x - halfSize, y - halfSize, size, size)
                  
                  // 根據位置繪製箭頭方向
                  if (anchor.name() === 'top-center' || anchor.name() === 'middle-left') {
                    // 朝內箭頭
                    ctx.beginPath()
                    ctx.moveTo(x, y - halfSize + 2)
                    ctx.lineTo(x - 3, y - halfSize + 6)
                    ctx.lineTo(x + 3, y - halfSize + 6)
                    ctx.closePath()
                    ctx.fillStyle = '#fff'
                    ctx.fill()
                  } else {
                    // 朝外箭頭
                    ctx.beginPath()
                    ctx.moveTo(x, y + halfSize - 2)
                    ctx.lineTo(x - 3, y + halfSize - 6)
                    ctx.lineTo(x + 3, y + halfSize - 6)
                    ctx.closePath()
                    ctx.fillStyle = '#fff'
                    ctx.fill()
                  }
                }
              }}
            />
          )}
        </Layer>
      </Stage>
    </div>
  )
}

export default KonvaCanvas
