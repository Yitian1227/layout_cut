import React, { useRef, useEffect } from 'react'
import { Stage, Layer, Transformer, Line, Shape, Rect, Circle } from 'react-konva'
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
  stageRef,
  isBrushMode,
  toolType,
  brushMode,
  brushPath,
  addPaths,
  subtractPaths,
  currentPath,
  brushSize,
  polygonPoints,
  isPolygonClosed,
  rectangleStart,
  rectangleEnd,
  isDrawingRectangle,
  hoverPointRef,
  onBrushPathUpdate,
  onPathComplete,
  onRemovePath,
  onPolygonPointAdd,
  onRectangleStart,
  onRectangleUpdate,
  onRectangleEnd
}) {
  const brushLayerRef = useRef(null)
  const isDrawingRef = useRef(false)
  
  // 检查点是否在路径内（使用射线法）
  const isPointInPath = (point, path) => {
    if (!path || path.length < 3) return false
    
    let inside = false
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const xi = path[i].x, yi = path[i].y
      const xj = path[j].x, yj = path[j].y
      
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)
      if (intersect) inside = !inside
    }
    return inside
  }
  
  // 检查点是否在路径附近（用于检测框线）
  const isPointNearPath = (point, path, threshold = 5) => {
    if (!path || path.length < 2) return false
    
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i]
      const p2 = path[i + 1]
      
      // 计算点到线段的距离
      const A = point.x - p1.x
      const B = point.y - p1.y
      const C = p2.x - p1.x
      const D = p2.y - p1.y
      
      const dot = A * C + B * D
      const lenSq = C * C + D * D
      let param = -1
      if (lenSq !== 0) param = dot / lenSq
      
      let xx, yy
      if (param < 0) {
        xx = p1.x
        yy = p1.y
      } else if (param > 1) {
        xx = p2.x
        yy = p2.y
      } else {
        xx = p1.x + param * C
        yy = p1.y + param * D
      }
      
      const dx = point.x - xx
      const dy = point.y - yy
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      if (distance <= threshold) return true
    }
    return false
  }

  // 获取鼠标样式（黑色画笔图标，hotspot 设置在笔尖位置）
  const getBrushCursor = () => {
    const brushPath = 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'
    const hotspotX = 5
    const hotspotY = 21
    
    const baseBrushSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
      <path d="${brushPath}" fill="#000000"/>
    </svg>`
    
    if (brushMode === 'add') {
      const addSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <path d="${brushPath}" fill="#000000"/>
        <circle cx="18" cy="6" r="5" fill="#28a745" stroke="#fff" stroke-width="1"/>
        <text x="18" y="9" font-size="10" fill="#fff" text-anchor="middle" font-weight="bold">+</text>
      </svg>`
      return `url("data:image/svg+xml;utf8,${encodeURIComponent(addSvg)}") ${hotspotX} ${hotspotY}, auto`
    } else if (brushMode === 'subtract') {
      const subtractSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <path d="${brushPath}" fill="#000000"/>
        <circle cx="18" cy="6" r="5" fill="#dc3545" stroke="#fff" stroke-width="1"/>
        <text x="18" y="9" font-size="10" fill="#fff" text-anchor="middle" font-weight="bold">-</text>
      </svg>`
      return `url("data:image/svg+xml;utf8,${encodeURIComponent(subtractSvg)}") ${hotspotX} ${hotspotY}, auto`
    } else {
      return `url("data:image/svg+xml;utf8,${encodeURIComponent(baseBrushSvg)}") ${hotspotX} ${hotspotY}, auto`
    }
  }

  // 画笔模式下的鼠标事件处理 - 事件绑定在 Stage 上
  const handleBrushPointerDown = (e) => {
    console.log("pointerdown 觸發！isBrushMode:", isBrushMode)
    
    if (!isBrushMode) return
    
    const stage = e.target.getStage()
    if (!stage) {
      console.log("無法獲取 stage")
      return
    }
    
    // 获取 Stage 的缩放和尺寸
    const stageScale = stage.scaleX()
    const stageWidth = stage.width()
    const stageHeight = stage.height()
    
    // 获取容器信息
    const container = stage.container()
    const containerRect = container.getBoundingClientRect()
    
    // 方法1：使用 getPointerPosition()（相对于 Stage 容器）
    const pointerPos = stage.getPointerPosition()
    
    // 方法2：从事件对象获取坐标（相对于页面）
    const evt = e.evt || e
    const pageX = evt.clientX || evt.pageX
    const pageY = evt.clientY || evt.pageY
    
    // 计算相对于容器的坐标
    const relativeX = pageX - containerRect.left
    const relativeY = pageY - containerRect.top
    
    // 使用事件坐标（更可靠）
    const x = relativeX / stageScale
    const y = relativeY / stageScale
    
    // 调试信息
    console.log("pointerdown 觸發！座標：", {
      getPointerPosition: pointerPos,
      eventCoords: { pageX, pageY },
      containerRect: {
        left: containerRect.left,
        top: containerRect.top,
        width: containerRect.width,
        height: containerRect.height
      },
      relativeCoords: { x: relativeX, y: relativeY },
      stageScale: stageScale,
      stageSize: { width: stageWidth, height: stageHeight },
      calculated: { x, y }
    })
    
    // 对于 Brush 工具，初始点击也需要使用实际坐标（不限制），这样可以在任何位置开始绘制
    // 对于 Polygon 和 Rectangle 工具，限制在边界内
    let clickPoint
    if (toolType === 'brush') {
      // Brush 工具：使用实际坐标，不限制边界（允许在画布外开始绘制）
      clickPoint = { x, y }
      console.log("座標（Brush，不限制邊界）:", { x, y })
    } else {
      // Polygon 和 Rectangle 工具：限制在边界内
      const clampedX = Math.max(0, Math.min(stageWidth, x))
      const clampedY = Math.max(0, Math.min(stageHeight, y))
      clickPoint = { x: clampedX, y: clampedY }
      console.log("座標有效，繼續處理:", { x: clampedX, y: clampedY })
    }
    
    // Polygon工具：添加点
    if (toolType === 'polygon') {
      // 减选模式下检查是否点击到已有路径
      if (brushMode === 'subtract') {
        if (brushPath && brushPath.length > 0) {
          if (isPointInPath(clickPoint, brushPath) || isPointNearPath(clickPoint, brushPath, 10)) {
            if (onRemovePath) {
              onRemovePath('main')
            }
            return
          }
        }
        if (addPaths && addPaths.length > 0) {
          for (let i = addPaths.length - 1; i >= 0; i--) {
            const path = addPaths[i]
            if (path && path.length > 0) {
              if (isPointInPath(clickPoint, path) || isPointNearPath(clickPoint, path, 10)) {
                if (onRemovePath) {
                  onRemovePath('add', i)
                }
                return
              }
            }
          }
        }
      }
      if (onPolygonPointAdd) {
        onPolygonPointAdd(clickPoint)
      }
      return
    }
    
    // Rectangle工具：开始绘制矩形
    if (toolType === 'rectangle') {
      // 减选模式下检查是否点击到已有路径
      if (brushMode === 'subtract') {
        if (brushPath && brushPath.length > 0) {
          if (isPointInPath(clickPoint, brushPath) || isPointNearPath(clickPoint, brushPath, 10)) {
            if (onRemovePath) {
              onRemovePath('main')
            }
            return
          }
        }
        if (addPaths && addPaths.length > 0) {
          for (let i = addPaths.length - 1; i >= 0; i--) {
            const path = addPaths[i]
            if (path && path.length > 0) {
              if (isPointInPath(clickPoint, path) || isPointNearPath(clickPoint, path, 10)) {
                if (onRemovePath) {
                  onRemovePath('add', i)
                }
                return
              }
            }
          }
        }
      }
      if (onRectangleStart) {
        onRectangleStart(clickPoint)
      }
      return
    }
    
    // Brush工具 - 减选模式：检查是否点击到已有路径
    if (toolType === 'brush' && brushMode === 'subtract') {
      if (brushPath && brushPath.length > 0) {
        if (isPointInPath(clickPoint, brushPath) || isPointNearPath(clickPoint, brushPath, brushSize / 2)) {
          if (onRemovePath) {
            onRemovePath('main')
          }
          return
        }
      }
      
      if (addPaths && addPaths.length > 0) {
        for (let i = addPaths.length - 1; i >= 0; i--) {
          const path = addPaths[i]
          if (path && path.length > 0) {
            if (isPointInPath(clickPoint, path) || isPointNearPath(clickPoint, path, brushSize / 2)) {
              if (onRemovePath) {
                onRemovePath('add', i)
              }
              return
            }
          }
        }
      }
      
      // 减选模式：开始绘制擦除路径
      if (onPathComplete && currentPath && currentPath.length > 0) {
        onPathComplete()
      }
      isDrawingRef.current = true
      onBrushPathUpdate([clickPoint])
      stage.container().style.cursor = getBrushCursor()
      return
    }
    
    // Brush工具 - 正常模式和加选模式：开始绘制
    if (toolType === 'brush') {
      if (onPathComplete && currentPath && currentPath.length > 0) {
        onPathComplete()
      }
      isDrawingRef.current = true
      onBrushPathUpdate([clickPoint])
      stage.container().style.cursor = getBrushCursor()
    }
  }

  const handleBrushPointerMove = (e) => {
    const stage = e.target.getStage()
    if (!stage) return
    
    // 获取容器信息（与 handleBrushPointerDown 保持一致）
    const container = stage.container()
    const containerRect = container.getBoundingClientRect()
    
    // 从事件对象获取坐标（相对于页面）
    const evt = e.evt || e
    const pageX = evt.clientX || evt.pageX
    const pageY = evt.clientY || evt.pageY
    
    // 计算相对于容器的坐标
    const relativeX = pageX - containerRect.left
    const relativeY = pageY - containerRect.top
    
    const stageScale = stage.scaleX()
    const stageWidth = stage.width()
    const stageHeight = stage.height()
    
    // 将像素坐标转换为逻辑坐标（除以 scale）
    // 注意：对于 Brush 工具，不限制坐标范围，允许超出边界，这样线条可以跟随鼠标
    let x = relativeX / stageScale
    let y = relativeY / stageScale
    
    const movePoint = { x, y }
    
    // Polygon工具：更新悬停点（仅在未完成且有至少一个点时）
    if (toolType === 'polygon') {
      if (hoverPointRef && polygonPoints && polygonPoints.length > 0 && !isPolygonClosed) {
        // 检查坐标是否在画布范围内
        const stageWidth = stage.width()
        const stageHeight = stage.height()
        if (movePoint.x >= 0 && movePoint.x <= stageWidth && movePoint.y >= 0 && movePoint.y <= stageHeight) {
          hoverPointRef.current = movePoint
          // 强制重绘以显示连线
          if (stageRef.current) {
            stageRef.current.batchDraw()
          }
        } else {
          hoverPointRef.current = null
          if (stageRef.current) {
            stageRef.current.batchDraw()
          }
        }
      }
      return
    }
    
    // Rectangle工具：更新矩形结束点
    if (toolType === 'rectangle' && isDrawingRectangle) {
      if (onRectangleUpdate) {
        onRectangleUpdate(movePoint)
      }
      return
    }
    
    // Brush工具
    if (toolType === 'brush') {
      if (!isDrawingRef.current) {
        if (onStagePointerMove) {
          onStagePointerMove(e)
        }
        if (isBrushMode && stageRef.current) {
          stageRef.current.container().style.cursor = getBrushCursor()
        }
        return
      }
      
      // Brush 工具：不限制坐标范围，允许超出边界，线条可以跟随鼠标
      // 直接使用计算出的坐标，不进行边界限制
      if (currentPath && currentPath.length > 0) {
        const newPath = [...currentPath, movePoint]
        onBrushPathUpdate(newPath)
        
        // 使用 stage.batchDraw() 而不是 brushLayerRef.current.batchDraw()
        stage.batchDraw()
      }
    }
  }

  const handleBrushPointerUp = (e) => {
    if (!isBrushMode) {
      if (onStagePointerUp) {
        onStagePointerUp(e)
      }
      return
    }
    
    const stage = e.target.getStage()
    if (!stage) return
    
    // Rectangle工具：结束绘制矩形
    if (toolType === 'rectangle' && isDrawingRectangle) {
      // 手动计算坐标（与 handleBrushPointerDown 保持一致）
      const pointerPos = stage.getPointerPosition()
      if (pointerPos && onRectangleEnd) {
        const stageScale = stage.scaleX()
        const stageWidth = stage.width()
        const stageHeight = stage.height()
        
        // 将像素坐标转换为逻辑坐标（除以 scale）
        let x = pointerPos.x / stageScale
        let y = pointerPos.y / stageScale
        
        // 限制坐标在有效范围内
        x = Math.max(0, Math.min(stageWidth, x))
        y = Math.max(0, Math.min(stageHeight, y))
        
        onRectangleEnd({ x, y })
      }
      return
    }
    
    // Brush工具
    if (toolType === 'brush' && isDrawingRef.current) {
      isDrawingRef.current = false
      
      if (onPathComplete && currentPath && currentPath.length > 0) {
        onPathComplete()
      }
    }
  }

  // 当画笔模式改变时，更新鼠标样式
  useEffect(() => {
    if (!isBrushMode) {
      isDrawingRef.current = false
      if (stageRef.current) {
        stageRef.current.container().style.cursor = 'default'
      }
    } else {
      if (stageRef.current) {
        stageRef.current.container().style.cursor = getBrushCursor()
      }
    }
  }, [isBrushMode, brushMode, stageRef])

  return (
    <div style={{ 
      backgroundColor: '#f9f9f9',
      display: 'inline-block',
      width: '1000px',
      height: '800px',
      // 确保没有 overflow-hidden、padding、transform 影响坐标
      overflow: 'visible',
      padding: 0,
      margin: 0,
      position: 'relative'
    }}>
      <Stage 
        ref={stageRef}
        width={1000} 
        height={800}
        style={{ border: '1px solid #ddd', borderRadius: '4px' }}
        scaleX={canvasScale}
        scaleY={canvasScale}
        // 事件绑定在 Stage 上，确保整个画布都可以响应
        onPointerMove={isBrushMode ? handleBrushPointerMove : onStagePointerMove}
        onPointerUp={isBrushMode ? handleBrushPointerUp : onStagePointerUp}
        onPointerDown={isBrushMode ? handleBrushPointerDown : undefined}
        onClick={isBrushMode ? undefined : onStageClick}
        // 确保 Stage 的 position 为 (0, 0)，避免坐标偏移
        x={0}
        y={0}
        // 确保 Stage 可以接收所有事件
        listening={true}
      >
        <Layer>
          {/* 1. 背景圖片（最底层） */}
          {/* 當圖層列表有圖層時，隱藏 baseImage */}
          {baseImage && layers.length === 0 && (
            <BackgroundImage
              src={baseImage}
              imageSize={imageSize}
              canvasScale={canvasScale}
            />
          )}
          
          {/* 2. 分割圖層 */}
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
                // 在画笔模式下，禁用 LayerImage 的事件处理，让事件冒泡到 Stage
                onPointerDown={isBrushMode ? undefined : (e) => onLayerPointerDown(index, e)}
                onClick={isBrushMode ? undefined : (e) => onLayerClick(index, e)}
                onMouseEnter={isBrushMode ? undefined : () => onLayerMouseEnter(index)}
                onMouseLeave={isBrushMode ? undefined : onLayerMouseLeave}
                // 在画笔模式下，禁用事件监听，确保事件能到达 Stage
                listening={!isBrushMode}
              />
            )
          })}
          
          {/* 3. 已完成的圈選路徑（brushPath、addPaths）- 旧的圈选范围 */}
          {isBrushMode && (
            <>
              {/* 主路徑（紅色線條 + 半透明紅色填充） */}
              {brushPath && brushPath.length > 0 && (
                <>
                  <Line
                    points={brushPath.flatMap(p => [p.x, p.y])}
                    stroke="#ff0000"
                    strokeWidth={brushSize / canvasScale}
                    tension={0.5}
                    lineCap="round"
                    lineJoin="round"
                    closed={true}
                    listening={false}
                  />
                  <Shape
                    sceneFunc={(ctx) => {
                      ctx.beginPath()
                      ctx.moveTo(brushPath[0].x, brushPath[0].y)
                      for (let i = 1; i < brushPath.length; i++) {
                        ctx.lineTo(brushPath[i].x, brushPath[i].y)
                      }
                      ctx.closePath()
                      ctx.fillStyle = 'rgba(255, 0, 0, 0.3)'
                      ctx.fill()
                    }}
                    listening={false}
                  />
                </>
              )}
              
              {/* 加選路徑（紅色線條 + 半透明紅色填充） */}
              {addPaths && addPaths.map((path, index) => (
                path.length > 0 && (
                  <React.Fragment key={`add-${index}`}>
                    <Line
                      points={path.flatMap(p => [p.x, p.y])}
                      stroke="#ff0000"
                      strokeWidth={brushSize / canvasScale}
                      tension={0.5}
                      lineCap="round"
                      lineJoin="round"
                      closed={true}
                      listening={false}
                    />
                    <Shape
                      sceneFunc={(ctx) => {
                        ctx.beginPath()
                        ctx.moveTo(path[0].x, path[0].y)
                        for (let i = 1; i < path.length; i++) {
                          ctx.lineTo(path[i].x, path[i].y)
                        }
                        ctx.closePath()
                        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)'
                        ctx.fill()
                      }}
                      listening={false}
                    />
                  </React.Fragment>
                )
              ))}
            </>
          )}
          
          {/* 4. 當前正在繪製的路徑（currentPath、polygonPoints、rectangleStart/End）- 必须最后渲染，确保显示在最上层 */}
          {isBrushMode && (
            <>
              {/* Brush工具：當前正在繪製的路徑 */}
              {toolType === 'brush' && currentPath && currentPath.length > 0 && (
                <Line
                  ref={brushLayerRef}
                  points={currentPath.flatMap(p => [p.x, p.y])}
                  stroke={brushMode === 'subtract' ? '#007bff' : '#ff0000'}
                  strokeWidth={brushSize / canvasScale}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                  closed={false}
                  listening={false}
                />
              )}
              
              {/* Polygon工具：繪製點和連線 */}
              {toolType === 'polygon' && polygonPoints && polygonPoints.length > 0 && (
                <>
                  {/* 如果已完成封闭，只绘制封闭的多边形边界 */}
                  {isPolygonClosed ? (
                    <>
                      <Line
                        points={[...polygonPoints, polygonPoints[0]].flatMap(p => [p.x, p.y])}
                        stroke="#ff0000"
                        strokeWidth={2 / canvasScale}
                        closed={true}
                        listening={false}
                      />
                      {polygonPoints.map((point, index) => (
                        <Circle
                          key={`polygon-point-${index}`}
                          x={point.x}
                          y={point.y}
                          radius={4 / canvasScale}
                          fill="#ff0000"
                          stroke="#fff"
                          strokeWidth={1 / canvasScale}
                          listening={false}
                        />
                      ))}
                      <Shape
                        sceneFunc={(ctx) => {
                          ctx.beginPath()
                          ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y)
                          for (let i = 1; i < polygonPoints.length; i++) {
                            ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y)
                          }
                          ctx.closePath()
                          ctx.fillStyle = 'rgba(255, 0, 0, 0.3)'
                          ctx.fill()
                        }}
                        listening={false}
                      />
                    </>
                  ) : (
                    <>
                      {/* 未完成時：繪製點和連線 */}
                      {polygonPoints.map((point, index) => (
                        <Circle
                          key={`polygon-point-${index}`}
                          x={point.x}
                          y={point.y}
                          radius={4 / canvasScale}
                          fill="#ff0000"
                          stroke="#fff"
                          strokeWidth={1 / canvasScale}
                          listening={false}
                        />
                      ))}
                      
                      {/* 繪製點之間的連線（已完成的部分） */}
                      {polygonPoints.length > 1 && (
                        <Line
                          points={polygonPoints.flatMap(p => [p.x, p.y])}
                          stroke="#ff0000"
                          strokeWidth={2 / canvasScale}
                          listening={false}
                        />
                      )}
                      
                      {/* 繪製從最後一個點到滑鼠位置的動態連線 */}
                      {hoverPointRef && hoverPointRef.current && (
                        <>
                          <Line
                            points={[
                              polygonPoints[polygonPoints.length - 1].x,
                              polygonPoints[polygonPoints.length - 1].y,
                              hoverPointRef.current.x,
                              hoverPointRef.current.y
                            ]}
                            stroke="#ff0000"
                            strokeWidth={2 / canvasScale}
                            dash={[5, 5]}
                            listening={false}
                          />
                          {/* 檢查是否回到原點附近（自動封閉提示） */}
                          {polygonPoints.length >= 3 && (
                            (() => {
                              const firstPoint = polygonPoints[0]
                              const hoverPoint = hoverPointRef.current
                              const distance = Math.sqrt(
                                Math.pow(hoverPoint.x - firstPoint.x, 2) +
                                Math.pow(hoverPoint.y - firstPoint.y, 2)
                              )
                              if (distance < 15 / canvasScale) {
                                return (
                                  <Line
                                    points={[
                                      polygonPoints[polygonPoints.length - 1].x,
                                      polygonPoints[polygonPoints.length - 1].y,
                                      firstPoint.x,
                                      firstPoint.y
                                    ]}
                                    stroke="#ff0000"
                                    strokeWidth={2 / canvasScale}
                                    listening={false}
                                  />
                                )
                              }
                              return null
                            })()
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              
              {/* Rectangle工具：繪製矩形（包括已完成但未确认的） */}
              {toolType === 'rectangle' && rectangleStart && rectangleEnd && (
                <>
                  <Rect
                    x={Math.min(rectangleStart.x, rectangleEnd.x)}
                    y={Math.min(rectangleStart.y, rectangleEnd.y)}
                    width={Math.abs(rectangleEnd.x - rectangleStart.x)}
                    height={Math.abs(rectangleEnd.y - rectangleStart.y)}
                    stroke="#ff0000"
                    strokeWidth={2 / canvasScale}
                    fill="rgba(255, 0, 0, 0.3)"
                    listening={false}
                  />
                </>
              )}
            </>
          )}
          
          {/* Transformer - 變換控制手柄 */}
          {selectedLayerIndex !== null && selectedLayers.length === 1 && (
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
                  return oldBox
                }
                return newBox
              }}
              rotateEnabled={true}
              enabledAnchors={[
                'top-left', 'top-right', 'bottom-left', 'bottom-right',
                'middle-left', 'middle-right', 'top-center', 'bottom-center'
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
            />
          )}
        </Layer>
      </Stage>
    </div>
  )
}

export default KonvaCanvas
