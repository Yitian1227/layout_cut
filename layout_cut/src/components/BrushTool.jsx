import React, { useState, useEffect, useCallback, useRef } from 'react'

// 自定义 hook：管理画笔状态和逻辑
export function useBrushTool(baseImage, segmentedMasks, selectedFile, imageSize) {
  const [isBrushMode, setIsBrushMode] = useState(false)
  const [toolType, setToolType] = useState('brush') // 'brush', 'polygon', 'rectangle'
  const [brushMode, setBrushMode] = useState('normal') // 'normal', 'add', 'subtract'
  const [brushPath, setBrushPath] = useState([]) // 主路径
  const [addPaths, setAddPaths] = useState([]) // 加选路径数组
  const [subtractPaths, setSubtractPaths] = useState([]) // 减选路径数组
  const [currentPath, setCurrentPath] = useState([]) // 当前正在绘制的路径
  const [brushSize, setBrushSize] = useState(12) // 画笔尺寸（默认12px）
  const [polygonPoints, setPolygonPoints] = useState([]) // Polygon工具的点数组
  const [isPolygonClosed, setIsPolygonClosed] = useState(false) // Polygon工具是否已完成封闭
  const [rectangleStart, setRectangleStart] = useState(null) // Rectangle工具的起始点
  const [rectangleEnd, setRectangleEnd] = useState(null) // Rectangle工具的结束点
  const [isDrawingRectangle, setIsDrawingRectangle] = useState(false) // 是否正在绘制矩形
  const currentPathRef = useRef([]) // 用于访问最新值的 ref
  const hoverPointRef = useRef(null) // Polygon工具中鼠标悬停点

  // 图片加载后自动进入画笔模式
  useEffect(() => {
    if (baseImage) {
      setIsBrushMode(true)
      setBrushMode('normal')
    }
  }, [baseImage])

  // 当有分割结果时，自动退出画笔模式
  useEffect(() => {
    if (segmentedMasks.length > 0) {
      setIsBrushMode(false)
      setBrushPath([])
      setAddPaths([])
      setSubtractPaths([])
      setCurrentPath([])
      currentPathRef.current = []
      setPolygonPoints([])
      setIsPolygonClosed(false)
      setRectangleStart(null)
      setRectangleEnd(null)
      setIsDrawingRectangle(false)
      hoverPointRef.current = null
      setBrushMode('normal')
    }
  }, [segmentedMasks])
  
  // 同步 currentPathRef 和 currentPath state
  useEffect(() => {
    currentPathRef.current = currentPath
  }, [currentPath])

  const handleBrushPathUpdate = (path) => {
    setCurrentPath(path)
    currentPathRef.current = path
  }

  // 合并路径函数（简化版，实际应该使用精确轮廓）
  const mergePaths = useCallback((path1, path2) => {
    if (!path1 || path1.length === 0) return path2
    if (!path2 || path2.length === 0) return path1
    // 返回合并后的路径点
    return [...path1, ...path2]
  }, [])

  // 擦除路径函数（简化版）
  const erasePathFromExisting = useCallback((erasePath, existingPaths) => {
    // 简化实现：返回空数组表示全部擦除
    return []
  }, [])

  // 完成当前路径绘制
  const handlePathComplete = useCallback(() => {
    const path = currentPathRef.current
    if (path.length === 0) return

    if (brushMode === 'normal') {
      // 正常模式：替换主路径
      setBrushPath(path)
      setAddPaths([])
      setSubtractPaths([])
    } else if (brushMode === 'add') {
      // 加选模式：保持路径独立，不立即合并
      // 如果 brushPath 为空，将新路径设为 brushPath
      // 否则将新路径添加到 addPaths 数组
      setBrushPath(prevPath => {
        if (!prevPath || prevPath.length === 0) {
          // brushPath 为空，设为新路径
          return path
        } else {
          // brushPath 已存在，将新路径添加到 addPaths
          setAddPaths(prev => [...prev, path])
          return prevPath
        }
      })
    } else if (brushMode === 'subtract') {
      // 减选模式：擦除路径相交的部分
      const allExistingPaths = [brushPath, ...addPaths].filter(p => p && p.length > 0)
      if (allExistingPaths.length > 0) {
        const erasedPath = erasePathFromExisting(path, allExistingPaths)
        if (erasedPath && erasedPath.length > 0) {
          setBrushPath(erasedPath)
          setAddPaths([])
        } else {
          // 如果全部被擦除，清空路径
          setBrushPath([])
          setAddPaths([])
        }
      }
      // 添加到减选路径数组（用于显示擦除轨迹）
      setSubtractPaths(prev => [...prev, path])
    }
    
    setCurrentPath([])
    currentPathRef.current = []
  }, [brushMode, mergePaths, erasePathFromExisting, brushPath, addPaths])

  // 切换画笔模式
  const setBrushModeType = useCallback((mode) => {
    // 完成当前路径
    const path = currentPathRef.current
    if (path.length > 0) {
      handlePathComplete()
    }
    setBrushMode(mode)
  }, [handlePathComplete])

  // 切换工具类型
  const setToolTypeType = useCallback((type) => {
    // 清理当前状态
    setCurrentPath([])
    currentPathRef.current = []
    setPolygonPoints([])
    setIsPolygonClosed(false)
    setRectangleStart(null)
    setRectangleEnd(null)
    setIsDrawingRectangle(false)
    hoverPointRef.current = null
    setToolType(type)
  }, [])

  // 移除路径
  const handleRemovePath = useCallback((type, index) => {
    if (type === 'main') {
      setBrushPath([])
    } else if (type === 'add' && index !== undefined) {
      setAddPaths(prev => prev.filter((_, i) => i !== index))
    } else if (type === 'subtract' && index !== undefined) {
      setSubtractPaths(prev => prev.filter((_, i) => i !== index))
    }
  }, [])

  // Polygon工具：添加点
  const handlePolygonPointAdd = useCallback((point) => {
    setPolygonPoints(prev => {
      // 如果已经完成封闭，点击新点时重新开始
      if (isPolygonClosed) {
        setIsPolygonClosed(false)
        return [point]
      }
      
      const newPoints = [...prev, point]
      
      // 检查是否回到原点附近（自动封闭）
      if (newPoints.length >= 3) {
        const firstPoint = newPoints[0]
        const distance = Math.sqrt(
          Math.pow(point.x - firstPoint.x, 2) +
          Math.pow(point.y - firstPoint.y, 2)
        )
        if (distance < 15) {
          // 自动封闭
          setIsPolygonClosed(true)
          return newPoints
        }
      }
      
      return newPoints
    })
  }, [isPolygonClosed])

  // Rectangle工具：开始绘制
  const handleRectangleStart = useCallback((point) => {
    setRectangleStart(point)
    setRectangleEnd(point)
    setIsDrawingRectangle(true)
  }, [])

  // Rectangle工具：更新矩形
  const handleRectangleUpdate = useCallback((point) => {
    if (isDrawingRectangle) {
      setRectangleEnd(point)
    }
  }, [isDrawingRectangle])

  // Rectangle工具：结束绘制
  const handleRectangleEnd = useCallback((point) => {
    if (rectangleStart) {
      // 更新矩形结束点，完成矩形绘制
      setRectangleEnd(point)
      setIsDrawingRectangle(false)
      
      // 立即完成圈选：根据 brushMode 转换为路径
      const rectPoints = [
        { x: rectangleStart.x, y: rectangleStart.y },
        { x: point.x, y: rectangleStart.y },
        { x: point.x, y: point.y },
        { x: rectangleStart.x, y: point.y }
      ]
      
      if (brushMode === 'normal') {
        setBrushPath(rectPoints)
        setAddPaths([])
        setSubtractPaths([])
      } else if (brushMode === 'add') {
        // 加选模式：保持路径独立，不立即合并
        setBrushPath(prevPath => {
          if (!prevPath || prevPath.length === 0) {
            // brushPath 为空，设为新路径
            return rectPoints
          } else {
            // brushPath 已存在，将新路径添加到 addPaths
            setAddPaths(prev => [...prev, rectPoints])
            return prevPath
          }
        })
      } else if (brushMode === 'subtract') {
        // 减选模式：擦除路径
        const allExistingPaths = [brushPath, ...addPaths].filter(p => p && p.length > 0)
        if (allExistingPaths.length > 0) {
          const erasedPath = erasePathFromExisting(rectPoints, allExistingPaths)
          if (erasedPath && erasedPath.length > 0) {
            setBrushPath(erasedPath)
            setAddPaths([])
          } else {
            setBrushPath([])
            setAddPaths([])
          }
        }
        setSubtractPaths(prev => [...prev, rectPoints])
      }
      
      // 保留 rectangleStart 和 rectangleEnd 用于显示（不清除）
    }
  }, [rectangleStart, brushMode, mergePaths, erasePathFromExisting, brushPath, addPaths])

  /**
   * 获取当前正在绘制的路径（用于确保渲染在最上层）
   * 
   * 重要：在 KonvaCanvas.jsx 中，渲染顺序应该是：
   * 1. 背景图片
   * 2. 分割图层（layers）
   * 3. 已完成的圈选路径（brushPath、addPaths）- 这些是旧的、已完成的圈选
   * 4. 当前正在绘制的路径（currentPath、polygonPoints、rectangleStart/End）- 这些必须最后渲染，确保显示在最上层
   * 
   * 这样可以确保：
   * - 当有已完成的圈选范围时，新开始的圈选不会被旧的圈选范围覆盖
   * - 最新的圈选范围总是可见的
   */
  const getCurrentDrawingPaths = useCallback(() => {
    const currentPaths = []
    
    // Brush工具：当前正在绘制的路径
    if (toolType === 'brush' && currentPath && currentPath.length > 0) {
      currentPaths.push({
        type: 'brush',
        path: currentPath,
        brushMode: brushMode
      })
    }
    
    // Polygon工具：未完成的多边形点
    if (toolType === 'polygon' && polygonPoints && polygonPoints.length > 0 && !isPolygonClosed) {
      currentPaths.push({
        type: 'polygon',
        points: polygonPoints,
        hoverPoint: hoverPointRef.current
      })
    }
    
    // Rectangle工具：正在绘制的矩形（包括已完成但未确认的）
    if (toolType === 'rectangle' && rectangleStart && rectangleEnd) {
      currentPaths.push({
        type: 'rectangle',
        start: rectangleStart,
        end: rectangleEnd,
        isDrawing: isDrawingRectangle
      })
    }
    
    return currentPaths
  }, [toolType, currentPath, brushMode, polygonPoints, isPolygonClosed, rectangleStart, rectangleEnd, isDrawingRectangle])

  /**
   * 检查是否有当前正在绘制的路径
   * 用于确保 KonvaCanvas 知道需要优先渲染这些路径
   */
  const hasCurrentDrawing = useCallback(() => {
    if (toolType === 'brush' && currentPath && currentPath.length > 0) return true
    if (toolType === 'polygon' && polygonPoints && polygonPoints.length > 0 && !isPolygonClosed) return true
    if (toolType === 'rectangle' && rectangleStart && rectangleEnd) return true
    return false
  }, [toolType, currentPath, polygonPoints, isPolygonClosed, rectangleStart, rectangleEnd])

  const handleConfirmBrush = useCallback(async (onSuccess) => {
    if (!selectedFile || !imageSize || imageSize.width === 0 || imageSize.height === 0) {
      console.error('无法确认：缺少图片文件或图片尺寸')
      if (onSuccess) {
        onSuccess({ masks: [] })
      }
      return
    }

    try {
      // 收集所有需要绘制的路径
      const pathsToDraw = []
      
      // 1. 处理当前正在绘制的路径（如果存在）
      if (toolType === 'brush' && currentPath && currentPath.length > 0) {
        pathsToDraw.push({ type: 'brush', path: currentPath })
      } else if (toolType === 'polygon' && polygonPoints && polygonPoints.length >= 3 && isPolygonClosed) {
        // Polygon工具：使用已封闭的多边形点
        pathsToDraw.push({ type: 'polygon', path: polygonPoints })
      } else if (toolType === 'rectangle' && rectangleStart && rectangleEnd) {
        // Rectangle工具：转换为路径点
        const rectPath = [
          { x: rectangleStart.x, y: rectangleStart.y },
          { x: rectangleEnd.x, y: rectangleStart.y },
          { x: rectangleEnd.x, y: rectangleEnd.y },
          { x: rectangleStart.x, y: rectangleEnd.y }
        ]
        pathsToDraw.push({ type: 'rectangle', path: rectPath })
      }
      
      // 2. 添加已存在的主路径和加选路径
      if (brushPath && brushPath.length > 0) {
        pathsToDraw.push({ type: 'brush', path: brushPath })
      }
      if (addPaths && addPaths.length > 0) {
        addPaths.forEach(path => {
          if (path && path.length > 0) {
            pathsToDraw.push({ type: 'brush', path })
          }
        })
      }

      if (pathsToDraw.length === 0) {
        console.error('无法确认：没有有效的圈选路径')
        if (onSuccess) {
          onSuccess({ masks: [] })
        }
        return
      }

      // 3. 创建临时 canvas 绘制 mask
      const canvas = document.createElement('canvas')
      canvas.width = imageSize.width
      canvas.height = imageSize.height
      const ctx = canvas.getContext('2d')

      // 填充黑色背景（mask 的 0 值）
      ctx.fillStyle = 'black'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 绘制所有路径为白色（mask 的 255 值）
      ctx.fillStyle = 'white'
      ctx.strokeStyle = 'white'
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      pathsToDraw.forEach(({ type, path }) => {
        if (!path || path.length === 0) return

        ctx.beginPath()
        ctx.moveTo(path[0].x, path[0].y)
        
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i].x, path[i].y)
        }
        
        if (type === 'polygon' || type === 'rectangle') {
          ctx.closePath()
          ctx.fill() // 填充封闭区域
        } else {
          // Brush工具：使用较粗的线条
          ctx.lineWidth = brushSize
          ctx.stroke()
        }
      })

      // 4. 将 canvas 转换为 base64
      const maskBase64 = canvas.toDataURL('image/png').split(',')[1] // 移除 data:image/png;base64, 前缀

      // 5. 发送到后端
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('mask', maskBase64)

      const response = await fetch('http://localhost:8000/segment-with-mask', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      
      // 6. 调用成功回调
      if (onSuccess) {
        onSuccess(data)
      }
    } catch (error) {
      console.error('确认圈选时发生错误:', error)
      alert('分割失败，请检查后端服务是否正常运行')
      if (onSuccess) {
        onSuccess({ masks: [] })
      }
    }
  }, [selectedFile, imageSize, toolType, currentPath, brushPath, addPaths, polygonPoints, isPolygonClosed, rectangleStart, rectangleEnd, brushSize])

  return {
    isBrushMode,
    toolType,
    setToolType: setToolTypeType,
    brushMode,
    setBrushMode: setBrushModeType,
    brushPath,
    addPaths,
    subtractPaths,
    currentPath,
    brushSize,
    setBrushSize,
    polygonPoints,
    isPolygonClosed,
    rectangleStart,
    rectangleEnd,
    isDrawingRectangle,
    hoverPointRef,
    getCurrentDrawingPaths, // 导出函数，帮助 KonvaCanvas 确定渲染顺序
    hasCurrentDrawing, // 检查是否有当前正在绘制的路径
    handleBrushPathUpdate,
    handlePathComplete,
    handleRemovePath,
    handlePolygonPointAdd,
    handleRectangleStart,
    handleRectangleUpdate,
    handleRectangleEnd,
    handleConfirmBrush
  }
}

// BrushTool 组件
function BrushTool({
  isBrushMode,
  toolType,
  onSetToolType,
  brushMode,
  onSetBrushMode,
  onConfirmBrush,
  hasBrushPath,
  brushSize,
  onBrushSizeChange
}) {
  // 控制工具显示：true 显示所有工具，false 仅显示笔刷工具
  const SHOW_POLYGON_TOOL = false
  const SHOW_RECTANGLE_TOOL = false
  
  // 如果隐藏了工具选择，确保默认使用笔刷工具
  useEffect(() => {
    if (!SHOW_POLYGON_TOOL && !SHOW_RECTANGLE_TOOL && toolType !== 'brush') {
      onSetToolType('brush')
    }
  }, [SHOW_POLYGON_TOOL, SHOW_RECTANGLE_TOOL, toolType, onSetToolType])
  
  return (
    <div style={{
      padding: '15px',
      flexShrink: 0,
      backgroundColor: '#fff',
      borderTop: '1px solid #e0e0e0',
      borderBottom: '1px solid #e0e0e0'
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        {isBrushMode && (
          <>
            <div style={{
              fontSize: '12px',
              color: '#666',
              padding: '8px',
              backgroundColor: '#f9f9f9',
              borderRadius: '4px',
              lineHeight: '1.5'
            }}>
              使用滑鼠在畫布上圈選區域
            </div>
            
            {/* 工具类型选择 */}
            {(SHOW_POLYGON_TOOL || SHOW_RECTANGLE_TOOL) && (
              <div style={{
                display: 'flex',
                gap: '4px',
                marginBottom: '10px'
              }}>
                <button
                  onClick={() => onSetToolType('brush')}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: '12px',
                    backgroundColor: toolType === 'brush' ? '#4a90e2' : '#f0f0f0',
                    color: toolType === 'brush' ? 'white' : '#333',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: toolType === 'brush' ? '600' : '400'
                  }}
                >
                  畫筆
                </button>
                {SHOW_POLYGON_TOOL && (
                  <button
                    onClick={() => onSetToolType('polygon')}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      fontSize: '12px',
                      backgroundColor: toolType === 'polygon' ? '#4a90e2' : '#f0f0f0',
                      color: toolType === 'polygon' ? 'white' : '#333',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: toolType === 'polygon' ? '600' : '400'
                    }}
                  >
                    多邊形
                  </button>
                )}
                {SHOW_RECTANGLE_TOOL && (
                  <button
                    onClick={() => onSetToolType('rectangle')}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      fontSize: '12px',
                      backgroundColor: toolType === 'rectangle' ? '#4a90e2' : '#f0f0f0',
                      color: toolType === 'rectangle' ? 'white' : '#333',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: toolType === 'rectangle' ? '600' : '400'
                    }}
                  >
                    矩形
                  </button>
                )}
              </div>
            )}
            
            
            {/* 画笔尺寸调整 */}
            {toolType === 'brush' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '10px'
              }}>
                <label style={{
                  fontSize: '12px',
                  color: '#666',
                  flexShrink: 0
                }}>
                  畫筆粗細:
                </label>
                <input
                  type="range"
                  min="5"
                  max="30"
                  value={brushSize}
                  onChange={(e) => onBrushSizeChange(parseInt(e.target.value))}
                  style={{
                    flex: 1,
                    cursor: 'pointer'
                  }}
                />
                <span style={{
                  fontSize: '12px',
                  color: '#333',
                  minWidth: '30px',
                  textAlign: 'right'
                }}>
                  {brushSize}px
                </span>
              </div>
            )}
            
            {/* 模式切换按钮 */}
            <div style={{
              display: 'flex',
              gap: '8px'
            }}>
              <button
                onClick={() => onSetBrushMode('add')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '14px',
                  backgroundColor: brushMode === 'add' ? '#4a90e2' : '#f0f0f0',
                  color: brushMode === 'add' ? 'white' : '#333',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                +
              </button>
              <button
                onClick={() => onSetBrushMode('subtract')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '14px',
                  backgroundColor: brushMode === 'subtract' ? '#dc3545' : '#f0f0f0',
                  color: brushMode === 'subtract' ? 'white' : '#333',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                -
              </button>
            </div>
          </>
        )}
        
        {hasBrushPath && (
          <button
            onClick={onConfirmBrush}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontSize: '14px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            確認圈選
          </button>
        )}
      </div>
    </div>
  )
}

export default BrushTool
