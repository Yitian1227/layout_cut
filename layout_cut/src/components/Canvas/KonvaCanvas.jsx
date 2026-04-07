import React, { useRef, useEffect, useMemo } from 'react'
import { Stage, Layer, Transformer, Line, Shape, Rect, Circle } from 'react-konva'
import LayerImage from './LayerImage'
import BackgroundImage from './BackgroundImage'

function KonvaCanvas({
  baseImage,
  imageSize,
  layers,
  autoMasks,
  showAutoMasks,
  interactionMode,
  hoveredAutoMaskId,
  selectedAutoMaskIds,
  onAutoMaskHover,
  onAutoMaskClick,
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
  const lastHoverMaskIdRef = useRef(null)
  const autoMaskCanvasCacheRef = useRef(new Map())
  const globalPointerListenerCleanupRef = useRef(null)

  // 保留所有 autoMasks（包含大面積背景）
  const displayedAutoMasks = useMemo(() => {
    return Array.isArray(autoMasks) ? autoMasks : []
  }, [autoMasks])

  /** Stage 像素尺寸貼合內容，避免固定 1000×800 留白底 */
  const stagePixelSize = useMemo(() => {
    if (!imageSize?.width) {
      return { width: 1000, height: 800 }
    }
    let logicalW = imageSize.width
    let logicalH = imageSize.height
    for (const l of layers || []) {
      const rw = (l.x || 0) + (l.width || 0) * (l.scaleX || 1)
      const bh = (l.y || 0) + (l.height || 0) * (l.scaleY || 1)
      logicalW = Math.max(logicalW, rw)
      logicalH = Math.max(logicalH, bh)
    }
    const scale = canvasScale || 1
    return {
      width: Math.max(1, Math.ceil(logicalW * scale)),
      height: Math.max(1, Math.ceil(logicalH * scale))
    }
  }, [imageSize, canvasScale, layers])

  // 為了讓 opacity 可用 globalAlpha 真正控制，將每個遮罩 imageData 轉成 offscreen canvas（只做一次）
  useEffect(() => {
    autoMaskCanvasCacheRef.current.clear()
    if (typeof document === 'undefined') return

    displayedAutoMasks.forEach((mask) => {
      const info = mask?.imageDataInfo
      if (!info || !info.width || !info.height || !info.data) return

      try {
        const c = document.createElement('canvas')
        c.width = info.width
        c.height = info.height

        const ctx2 = c.getContext('2d')
        if (!ctx2) return

        const imageData = new ImageData(info.data, info.width, info.height)
        ctx2.putImageData(imageData, 0, 0)

        autoMaskCanvasCacheRef.current.set(mask.id, c)
      } catch (e) {
        console.error('建立 autoMask offscreen canvas 失敗:', e)
      }
    })
  }, [displayedAutoMasks])

  // selected 狀態變化時，強制刷新 Konva 畫面
  useEffect(() => {
    if (stageRef?.current) {
      stageRef.current.batchDraw()
    }
  }, [selectedAutoMaskIds, hoveredAutoMaskId, displayedAutoMasks.length, stageRef])
  
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
    
    const evt = e.evt || e
    const startPoint = getLogicalPointFromNativeEvent(stage, evt)
    if (!startPoint) return
    const clickPoint = { x: startPoint.x, y: startPoint.y }
    
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
        setupGlobalPointerListeners(stage)
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
      setupGlobalPointerListeners(stage)
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
      setupGlobalPointerListeners(stage)
    }
  }

  const handleBrushPointerMove = (e) => {
    const stage = e.target.getStage()
    if (!stage) return
    
    const evt = e.evt || e
    const logicalResult = getLogicalPointAndBoundsFromNativeEvent(stage, evt)
    if (!logicalResult) return
    const { point, maxX: stageWidth, maxY: stageHeight } = logicalResult

    // 畫布內保持自由移動；出界時僅超出軸被 clamp（形成邊界滑行）
    const clampedX = Math.max(0, Math.min(stageWidth, point.x))
    const clampedY = Math.max(0, Math.min(stageHeight, point.y))
    const movePoint = { x: clampedX, y: clampedY }
    
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
      
      if (currentPath && currentPath.length > 0) {
        const newPath = [...currentPath, movePoint]
        onBrushPathUpdate(newPath)
        
        // 使用 stage.batchDraw() 而不是 brushLayerRef.current.batchDraw()
        stage.batchDraw()
      }
    }
  }

  const clearGlobalPointerListeners = () => {
    if (globalPointerListenerCleanupRef.current) {
      globalPointerListenerCleanupRef.current()
      globalPointerListenerCleanupRef.current = null
    }
  }

  const getLogicalPointAndBoundsFromNativeEvent = (stage, nativeEvt) => {
    if (!stage || !nativeEvt) return null

    const containerRect = stage.container().getBoundingClientRect()
    const clientX = nativeEvt.clientX ?? nativeEvt.pageX
    const clientY = nativeEvt.clientY ?? nativeEvt.pageY
    if (clientX == null || clientY == null) return null

    const rawX = clientX - containerRect.left
    const rawY = clientY - containerRect.top

    // DOM 顯示尺寸可能被 CSS 縮放（max-width/max-height），先換回 stage 內部像素座標
    const stagePixelWidth = Math.max(1, Number(stage.width()) || 1)
    const stagePixelHeight = Math.max(1, Number(stage.height()) || 1)
    const domToStageX = containerRect.width > 0 ? stagePixelWidth / containerRect.width : 1
    const domToStageY = containerRect.height > 0 ? stagePixelHeight / containerRect.height : 1
    const stagePoint = {
      x: rawX * domToStageX,
      y: rawY * domToStageY
    }

    // 轉為 Konva 邏輯座標（與 currentPath 使用同一座標系）
    const transform = stage.getAbsoluteTransform().copy().invert()
    const point = transform.point(stagePoint)

    const scaleX = Math.abs(stage.scaleX()) || 1
    const scaleY = Math.abs(stage.scaleY()) || 1
    const maxX = stagePixelWidth / scaleX
    const maxY = stagePixelHeight / scaleY

    return { point, maxX, maxY }
  }

  const getLogicalPointFromNativeEvent = (stage, nativeEvt) => {
    const result = getLogicalPointAndBoundsFromNativeEvent(stage, nativeEvt)
    if (!result) return null
    const { point, maxX, maxY } = result

    const x = Math.max(0, Math.min(maxX, point.x))
    const y = Math.max(0, Math.min(maxY, point.y))
    return { x, y }
  }

  const finishBrushInteraction = (stage, nativeEvt) => {
    if (!isBrushMode || !stage) return

    if (toolType === 'rectangle' && isDrawingRectangle) {
      const endPoint = getLogicalPointFromNativeEvent(stage, nativeEvt)
      if (endPoint && onRectangleEnd) {
        onRectangleEnd(endPoint)
      }
      return
    }

    if (toolType === 'brush' && isDrawingRef.current) {
      isDrawingRef.current = false
      if (currentPath && currentPath.length > 0) {
        const startPoint = currentPath[0]
        const releasePoint =
          getLogicalPointFromNativeEvent(stage, nativeEvt) ||
          currentPath[currentPath.length - 1]

        // 在放開滑鼠時補上「鬆開點 -> 起點」，確保路徑自動閉合
        const closedPath = [...currentPath, releasePoint, startPoint]
        onBrushPathUpdate(closedPath)
        stage.batchDraw()
      }

      if (onPathComplete) {
        // 等 currentPath 狀態同步後再收尾，避免使用到舊路徑
        requestAnimationFrame(() => {
          onPathComplete()
        })
      }
    }
  }

  const setupGlobalPointerListeners = (stage) => {
    clearGlobalPointerListeners()

    const handleGlobalPointerEnd = (nativeEvt) => {
      finishBrushInteraction(stage, nativeEvt)
      clearGlobalPointerListeners()
    }

    const handleGlobalMouseLeave = (nativeEvt) => {
      if (nativeEvt?.relatedTarget == null) {
        handleGlobalPointerEnd(nativeEvt)
      }
    }

    window.addEventListener('pointerup', handleGlobalPointerEnd)
    window.addEventListener('mouseup', handleGlobalPointerEnd)
    window.addEventListener('pointercancel', handleGlobalPointerEnd)
    window.addEventListener('mouseleave', handleGlobalMouseLeave)
    window.addEventListener('blur', handleGlobalPointerEnd)

    globalPointerListenerCleanupRef.current = () => {
      window.removeEventListener('pointerup', handleGlobalPointerEnd)
      window.removeEventListener('mouseup', handleGlobalPointerEnd)
      window.removeEventListener('pointercancel', handleGlobalPointerEnd)
      window.removeEventListener('mouseleave', handleGlobalMouseLeave)
      window.removeEventListener('blur', handleGlobalPointerEnd)
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

    finishBrushInteraction(stage, e.evt || e)
    clearGlobalPointerListeners()
  }

  // 当画笔模式改变时，更新鼠标样式
  useEffect(() => {
    if (!isBrushMode) {
      isDrawingRef.current = false
      clearGlobalPointerListeners()
      if (stageRef.current) {
        stageRef.current.container().style.cursor = 'default'
      }
    } else {
      if (stageRef.current) {
        stageRef.current.container().style.cursor = getBrushCursor()
      }
    }
  }, [isBrushMode, brushMode, stageRef])

  useEffect(() => {
    return () => {
      clearGlobalPointerListeners()
    }
  }, [])

  // 智慧點擊模式下：根據滑鼠位置計算 hover 的自動遮罩
  const hitTestAutoMasks = (stage, evt) => {
    if (!displayedAutoMasks || displayedAutoMasks.length === 0) return null

    const container = stage.container()
    const rect = container.getBoundingClientRect()

    const e = evt || {}
    const pageX = e.clientX || e.pageX
    const pageY = e.clientY || e.pageY
    if (pageX == null || pageY == null) return null

    const relX = pageX - rect.left
    const relY = pageY - rect.top

    const scale = stage.scaleX() || 1
    const x = relX / scale
    const y = relY / scale

    // 由後往前掃描，模擬「上層優先」
    for (let i = displayedAutoMasks.length - 1; i >= 0; i--) {
      const mask = displayedAutoMasks[i]
      if (!mask || !mask.imageDataInfo) continue

      const [bx, by, bw, bh] = mask.bbox || [0, 0, 0, 0]
      if (x < bx || x >= bx + bw || y < by || y >= by + bh) {
        continue
      }

      const { width, height, data, offsetX, offsetY } = mask.imageDataInfo
      if (!width || !height || !data) continue

      const ix = Math.floor(x - offsetX)
      const iy = Math.floor(y - offsetY)
      if (ix < 0 || ix >= width || iy < 0 || iy >= height) continue

      const idx = (iy * width + ix) * 4
      const alpha = data[idx + 3]
      if (alpha > 0) {
        return mask.id
      }
    }

    return null
  }

  // Stage 層級統一更新 hover（畫筆模式也發光，且不攔截子節點事件）
  const syncAutoMaskHover = (stage, evt) => {
    const id = hitTestAutoMasks(stage, evt)
    if (id !== lastHoverMaskIdRef.current) {
      lastHoverMaskIdRef.current = id
      if (onAutoMaskHover) {
        onAutoMaskHover(id)
      }
    }
    return id
  }

  const handleStagePointerMoveUnified = (e) => {
    const stage = e.target.getStage()
    if (!stage) return

    const hoverId = syncAutoMaskHover(stage, e.evt)

    if (!isBrushMode && interactionMode === 'smart') {
      stage.container().style.cursor = hoverId ? 'pointer' : 'default'
    } else if (isBrushMode) {
      if (toolType === 'brush' && isDrawingRef.current) {
        stage.container().style.cursor = getBrushCursor()
      } else {
        stage.container().style.cursor = hoverId ? 'pointer' : getBrushCursor()
      }
    }

    if (isBrushMode) {
      handleBrushPointerMove(e)
    } else {
      handleSmartPointerMove(e)
    }
  }

  const handleSmartPointerMove = (e) => {
    if (!stageRef.current || interactionMode !== 'smart') {
      if (onStagePointerMove) {
        onStagePointerMove(e)
      }
      return
    }

    if (onStagePointerMove) {
      onStagePointerMove(e)
    }
  }

  const handleSmartPointerDown = (e) => {
    if (!stageRef.current || interactionMode !== 'smart') {
      if (onStagePointerUp) {
        onStagePointerUp(e)
      }
      return
    }

    const stage = stageRef.current
    const id = hitTestAutoMasks(stage, e.evt)

    if (onAutoMaskClick) {
      onAutoMaskClick(id, e)
    }
  }

  // 全域 pointerdown：Shift + 左鍵選取優先，其次才進入智慧/筆刷行為
  const handleStagePointerDownUnified = (e) => {
    const stage = e.target.getStage()
    if (!stage) return

    const evt = e.evt || {}
    const isLeftClick = evt.button === 0 || evt.button === undefined
    const isShiftClick = !!evt.shiftKey && isLeftClick

    // 最高優先級：不論模式，Shift+左鍵都先嘗試選取 auto mask
    if (isShiftClick) {
      const id = hitTestAutoMasks(stage, evt)
      if (id && onAutoMaskClick) {
        onAutoMaskClick(id, e)
        // 在筆刷模式下，Shift 點擊不應該產生新筆跡
        if (evt.preventDefault) evt.preventDefault()
        e.cancelBubble = true
        return
      }
    }

    if (isBrushMode) {
      handleBrushPointerDown(e)
      return
    }
    handleSmartPointerDown(e)
  }

  return (
    <div
      className="konva-canvas-shell"
      style={{
        display: 'block',
        width: stagePixelSize.width,
        height: stagePixelSize.height,
        overflow: 'visible',
        padding: 0,
        margin: 0,
        position: 'relative',
        flexShrink: 0
      }}
    >
      <Stage
        ref={stageRef}
        width={stagePixelSize.width}
        height={stagePixelSize.height}
        style={{
          border: '1px solid #e5e5e5',
          borderRadius: '4px',
          display: 'block',
          maxWidth: '100%',
          maxHeight: '100%'
        }}
        scaleX={canvasScale}
        scaleY={canvasScale}
        // 事件绑定在 Stage 上，确保整个画布都可以响应
        onPointerMove={handleStagePointerMoveUnified}
        onPointerUp={isBrushMode ? handleBrushPointerUp : onStagePointerUp}
        onPointerDown={handleStagePointerDownUnified}
        onClick={isBrushMode ? undefined : onStageClick}
        // 确保 Stage 的 position 为 (0, 0)，避免坐标偏移
        x={0}
        y={0}
        // 确保 Stage 可以接收所有事件
        listening={true}
      >
        <Layer>
          {/* 0. 與原始上傳圖同尺寸的純白底，墊在分割圖層下以減輕透明邊緣碎屑視覺 */}
          {imageSize.width > 0 && imageSize.height > 0 && (
            <Rect
              x={0}
              y={0}
              width={imageSize.width}
              height={imageSize.height}
              fill="#FFFFFF"
              listening={false}
            />
          )}
          {/* 1. 背景圖片（最底层） */}
          {/* 當圖層列表有圖層時，隱藏 baseImage */}
          {baseImage && layers.length === 0 && (
            <BackgroundImage
              src={baseImage}
              imageSize={imageSize}
              canvasScale={canvasScale}
            />
          )}
          
          {/* 2. Segment Everything 自動分割遮罩（半透明顏色疊加） */}
          {showAutoMasks && displayedAutoMasks && displayedAutoMasks.length > 0 && (
            <>
              {displayedAutoMasks.map((mask) => {
                const isHovered = hoveredAutoMaskId === mask.id
                const isSelected = selectedAutoMaskIds?.includes(mask.id)
                const selectedFillColor = '#ff4d4d'

                // opacity 交由 globalAlpha 控制（imageData alpha 固定 255）；全模式皆可 hover 發光
                let fillOpacity = 0.3
                let borderColor = '#4a90e2'
                let borderWidth = 2 / canvasScale
                let borderDash = undefined

                if (isSelected) {
                  fillOpacity = isHovered ? 0.72 : 0.6
                  borderColor = '#ff9800'
                  borderWidth = 4 / canvasScale
                  borderDash = [10, 6]
                } else if (isHovered) {
                  fillOpacity = 0.7
                  borderColor = '#1d4ed8'
                  borderWidth = 3 / canvasScale
                  borderDash = undefined
                }

                const bbox = mask.bbox || [0, 0, 0, 0]
                const [bx, by, bw, bh] = bbox
                const info = mask.imageDataInfo
                const poly = Array.isArray(mask.polygon) ? mask.polygon : []
                const hasPolygonOutline = poly.length >= 6

                return (
                  <React.Fragment key={`mask-${mask.id}-${isSelected}`}>
                    <Shape
                      key={`mask-shape-${mask.id}-${isSelected}`}
                      listening={false}
                      sceneFunc={(ctx) => {
                        const c = autoMaskCanvasCacheRef.current.get(mask.id)
                        if (!c || !info) return

                        ctx.save()
                        // 先繪製基礎遮罩
                        ctx.globalAlpha = isSelected ? 0.25 : fillOpacity
                        ctx.drawImage(c, info.offsetX, info.offsetY)

                        // 選取狀態：直接用亮紅色 fill（不使用 source-atop）
                        if (isSelected) {
                          console.log('正在繪製選取狀態的 Mask ID:', mask.id)
                          ctx.globalAlpha = fillOpacity
                          ctx.fillStyle = selectedFillColor
                          if (hasPolygonOutline) {
                            ctx.beginPath()
                            ctx.moveTo(poly[0], poly[1])
                            for (let i = 2; i < poly.length; i += 2) {
                              ctx.lineTo(poly[i], poly[i + 1])
                            }
                            ctx.closePath()
                            ctx.fill()
                          } else {
                            ctx.beginPath()
                            ctx.rect(bx, by, bw, bh)
                            ctx.closePath()
                            ctx.fill()
                          }
                        }
                        ctx.restore()
                      }}
                    />

                    {/* 貼合物件輪廓的外框（SAM Demo 風格）；無 polygon 時降級為 bbox 矩形 */}
                    {hasPolygonOutline ? (
                      <Line
                        points={poly}
                        closed
                        stroke={borderColor}
                        strokeWidth={borderWidth}
                        dash={borderDash}
                        lineJoin="round"
                        lineCap="round"
                        listening={false}
                        perfectDrawEnabled={false}
                      />
                    ) : (
                      <Rect
                        x={bx}
                        y={by}
                        width={bw}
                        height={bh}
                        stroke={borderColor}
                        strokeWidth={borderWidth}
                        dash={borderDash}
                        listening={false}
                      />
                    )}
                  </React.Fragment>
                )
              })}
            </>
          )}
          
          {/* 3. 分割圖層 */}
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
          
          {/* 4. 已完成的圈選路徑（brushPath、addPaths）- 旧的圈选范围 */}
          {isBrushMode && (
            <>
              {/* 主路徑（紅色線條 + 半透明紅色填充） */}
              {brushPath && brushPath.length > 0 && (
                <>
                  <Line
                    points={brushPath.flatMap(p => [p.x, p.y])}
                    stroke="#ff4d4d"
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
                      stroke="#ff4d4d"
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
          
          {/* 5. 當前正在繪製的路徑（currentPath、polygonPoints、rectangleStart/End）- 必须最后渲染，确保显示在最上层 */}
          {isBrushMode && (
            <>
              {/* Brush工具：當前正在繪製的路徑 */}
              {toolType === 'brush' && currentPath && currentPath.length > 0 && (
                <Line
                  ref={brushLayerRef}
                  points={currentPath.flatMap(p => [p.x, p.y])}
                  stroke={brushMode === 'subtract' ? '#007bff' : '#ff4d4d'}
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
                        stroke="#ff4d4d"
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
                          fill="#ff4d4d"
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
                          fill="#ff4d4d"
                          stroke="#fff"
                          strokeWidth={1 / canvasScale}
                          listening={false}
                        />
                      ))}
                      
                      {/* 繪製點之間的連線（已完成的部分） */}
                      {polygonPoints.length > 1 && (
                        <Line
                          points={polygonPoints.flatMap(p => [p.x, p.y])}
                          stroke="#ff4d4d"
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
                            stroke="#ff4d4d"
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
                                    stroke="#ff4d4d"
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
                    stroke="#ff4d4d"
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
