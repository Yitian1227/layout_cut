import { useState, useRef, useCallback, useEffect } from 'react'

// 控制是否顯示多邊形和矩形工具（目前隱藏）
const SHOW_POLYGON_TOOL = false
const SHOW_RECTANGLE_TOOL = false

// useBrushTool Hook - 管理所有畫筆工具的狀態和邏輯
export function useBrushTool(baseImage, segmentedMasks, selectedFile, imageSize) {
  const [isBrushMode, setIsBrushMode] = useState(false)
  const [toolType, setToolType] = useState('brush') // 'brush', 'polygon', 'rectangle'
  const [brushMode, setBrushMode] = useState('normal') // 'normal', 'add', 'subtract'
  const [brushSize, setBrushSize] = useState(12)
  const [brushPath, setBrushPath] = useState([])
  const [addPaths, setAddPaths] = useState([])
  const [subtractPaths, setSubtractPaths] = useState([])
  const [currentPath, setCurrentPath] = useState([])
  const [polygonPoints, setPolygonPoints] = useState([])
  const [isPolygonClosed, setIsPolygonClosed] = useState(false)
  const [rectangleStart, setRectangleStart] = useState(null)
  const [rectangleEnd, setRectangleEnd] = useState(null)
  const [isDrawingRectangle, setIsDrawingRectangle] = useState(false)
  const hoverPointRef = useRef(null)
  
  const currentPathRef = useRef(currentPath)
  useEffect(() => {
    currentPathRef.current = currentPath
  }, [currentPath])

  // 當圖片改變時，重置畫筆狀態
  useEffect(() => {
    if (baseImage) {
      setIsBrushMode(true)
      setToolType('brush')
      setBrushMode('normal')
    }
  }, [baseImage])

  // 當工具被隱藏時，自動切換到 brush
  useEffect(() => {
    if (!SHOW_POLYGON_TOOL && toolType === 'polygon') {
      setToolType('brush')
    }
    if (!SHOW_RECTANGLE_TOOL && toolType === 'rectangle') {
      setToolType('brush')
    }
  }, [toolType])

  // 更新當前繪製路徑
  const handleBrushPathUpdate = useCallback((path) => {
    setCurrentPath(path)
  }, [])

  // 完成當前路徑
  const handlePathComplete = useCallback(() => {
    if (currentPathRef.current.length === 0) return

    const path = [...currentPathRef.current]
    setCurrentPath([])

    if (brushMode === 'add') {
      // 加選模式：如果 brushPath 為空，新路徑成為 brushPath；否則加入 addPaths
      if (brushPath.length === 0) {
        setBrushPath(path)
      } else {
        setAddPaths(prev => [...prev, path])
      }
    } else if (brushMode === 'subtract') {
      // 減選模式：加入 subtractPaths
      setSubtractPaths(prev => [...prev, path])
    } else {
      // 正常模式：設置為 brushPath
      setBrushPath(path)
    }
  }, [brushMode, brushPath])

  // 移除路徑
  const handleRemovePath = useCallback((type, index) => {
    if (type === 'main') {
      setBrushPath([])
    } else if (type === 'add') {
      setAddPaths(prev => prev.filter((_, i) => i !== index))
    } else if (type === 'subtract') {
      setSubtractPaths(prev => prev.filter((_, i) => i !== index))
    }
  }, [])

  // 多邊形：添加點
  const handlePolygonPointAdd = useCallback((point) => {
    if (isPolygonClosed) {
      // 如果多邊形已封閉，開始新的多邊形
      setPolygonPoints([point])
      setIsPolygonClosed(false)
      return
    }

    const newPoints = [...polygonPoints, point]
    
    // 檢查是否應該自動封閉（距離第一個點 < 15px）
    if (newPoints.length >= 3) {
      const firstPoint = newPoints[0]
      const distance = Math.sqrt(
        Math.pow(point.x - firstPoint.x, 2) + 
        Math.pow(point.y - firstPoint.y, 2)
      )
      
      if (distance < 15) {
        // 自動封閉多邊形
        setPolygonPoints(newPoints)
        setIsPolygonClosed(true)
        
        // 根據模式處理封閉的多邊形
        if (brushMode === 'add') {
          if (brushPath.length === 0) {
            setBrushPath(newPoints)
          } else {
            setAddPaths(prev => [...prev, newPoints])
          }
        } else if (brushMode === 'subtract') {
          setSubtractPaths(prev => [...prev, newPoints])
        } else {
          setBrushPath(newPoints)
        }
        return
      }
    }
    
    setPolygonPoints(newPoints)
  }, [polygonPoints, isPolygonClosed, brushMode, brushPath])

  // 矩形：開始繪製
  const handleRectangleStart = useCallback((point) => {
    setRectangleStart(point)
    setRectangleEnd(point)
    setIsDrawingRectangle(true)
  }, [])

  // 矩形：更新
  const handleRectangleUpdate = useCallback((point) => {
    setRectangleEnd(point)
  }, [])

  // 矩形：結束繪製
  const handleRectangleEnd = useCallback((point) => {
    setRectangleEnd(point)
    setIsDrawingRectangle(false)
    
    // 矩形完成後，根據模式處理
    if (brushMode === 'add') {
      if (brushPath.length === 0) {
        // 如果 brushPath 為空，將矩形轉換為路徑並設置為 brushPath
        const rectPath = [
          rectangleStart,
          { x: point.x, y: rectangleStart.y },
          point,
          { x: rectangleStart.x, y: point.y }
        ]
        setBrushPath(rectPath)
      } else {
        // 否則加入 addPaths
        const rectPath = [
          rectangleStart,
          { x: point.x, y: rectangleStart.y },
          point,
          { x: rectangleStart.x, y: point.y }
        ]
        setAddPaths(prev => [...prev, rectPath])
      }
    } else if (brushMode === 'subtract') {
      const rectPath = [
        rectangleStart,
        { x: point.x, y: rectangleStart.y },
        point,
        { x: rectangleStart.x, y: point.y }
      ]
      setSubtractPaths(prev => [...prev, rectPath])
    } else {
      const rectPath = [
        rectangleStart,
        { x: point.x, y: rectangleStart.y },
        point,
        { x: rectangleStart.x, y: point.y }
      ]
      setBrushPath(rectPath)
    }
  }, [rectangleStart, brushMode, brushPath])

  // 從 canvas 提取輪廓（簡化版本）
  const extractContourFromCanvas = (canvas, ctx) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    const width = canvas.width
    const height = canvas.height
    
    // 簡單的輪廓提取：找到所有邊界點
    const contour = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        if (data[idx] > 128) { // 白色區域
          // 檢查是否為邊界點
          const isBoundary = 
            x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
            data[((y - 1) * width + x) * 4] <= 128 ||
            data[((y + 1) * width + x) * 4] <= 128 ||
            data[(y * width + (x - 1)) * 4] <= 128 ||
            data[(y * width + (x + 1)) * 4] <= 128
          
          if (isBoundary) {
            contour.push({ x, y })
          }
        }
      }
    }
    
    return contour
  }

  // 合併路徑
  const mergePaths = useCallback((path1, path2) => {
    // 簡化版本：返回兩個路徑的合併輪廓
    // 實際應該使用 canvas 操作來合併
    return [...path1, ...path2]
  }, [])

  // 從現有路徑中擦除
  const erasePathFromExisting = useCallback((erasePath) => {
    // 簡化版本：返回擦除後的輪廓
    // 實際應該使用 canvas 操作來擦除
    return brushPath.filter(p => {
      // 簡單的點過濾
      return true
    })
  }, [brushPath])

  // 確認圈選並發送到後端
  const handleConfirmBrush = useCallback(async (onSuccess) => {
    if (!baseImage || !selectedFile) {
      throw new Error('請先上傳圖片')
    }

    // 檢查是否有圈選範圍
    const hasAnyPath = 
      (brushPath && brushPath.length > 0) ||
      (addPaths && addPaths.length > 0) ||
      (currentPathRef.current && currentPathRef.current.length > 0) ||
      (polygonPoints && polygonPoints.length >= 3 && isPolygonClosed) ||
      (rectangleStart && rectangleEnd)

    if (!hasAnyPath) {
      throw new Error('請先圈選區域')
    }

    try {
      // 創建離屏 canvas 來生成 mask
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      
      // 設置 canvas 尺寸為圖片尺寸
      canvas.width = imageSize.width || 1000
      canvas.height = imageSize.height || 800
      
      // 填充黑色背景
      ctx.fillStyle = 'black'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      // 設置為白色填充
      ctx.fillStyle = 'white'
      ctx.strokeStyle = 'white'
      
      // 繪製所有路徑
      const allPaths = []
      
      // 主路徑
      if (brushPath && brushPath.length > 0) {
        allPaths.push(brushPath)
      }
      
      // 加選路徑
      if (addPaths && addPaths.length > 0) {
        allPaths.push(...addPaths)
      }
      
      // 當前路徑
      if (currentPathRef.current && currentPathRef.current.length > 0) {
        allPaths.push(currentPathRef.current)
      }
      
      // 多邊形
      if (polygonPoints && polygonPoints.length >= 3 && isPolygonClosed) {
        allPaths.push(polygonPoints)
      }
      
      // 矩形
      if (rectangleStart && rectangleEnd) {
        const rectPath = [
          rectangleStart,
          { x: rectangleEnd.x, y: rectangleStart.y },
          rectangleEnd,
          { x: rectangleStart.x, y: rectangleEnd.y }
        ]
        allPaths.push(rectPath)
      }
      
      // 繪製所有路徑
      allPaths.forEach(path => {
        if (path && path.length > 0) {
          ctx.beginPath()
          ctx.moveTo(path[0].x, path[0].y)
          for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y)
          }
          ctx.closePath()
          ctx.fill()
        }
      })
      
      // 擦除 subtractPaths
      if (subtractPaths && subtractPaths.length > 0) {
        ctx.globalCompositeOperation = 'destination-out'
        subtractPaths.forEach(path => {
          if (path && path.length > 0) {
            ctx.beginPath()
            ctx.moveTo(path[0].x, path[0].y)
            for (let i = 1; i < path.length; i++) {
              ctx.lineTo(path[i].x, path[i].y)
            }
            ctx.closePath()
            ctx.fill()
          }
        })
        ctx.globalCompositeOperation = 'source-over'
      }
      
      // 轉換為 base64
      const base64Mask = canvas.toDataURL('image/png').split(',')[1]
      
      // 發送到後端
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('mask', base64Mask)
      
      const response = await fetch('http://localhost:8000/segment-with-mask', {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        let errorText = ''
        try {
          errorText = await response.text()
        } catch (e) {
          errorText = '無法讀取錯誤訊息'
        }
        throw new Error(`HTTP ${response.status}: ${errorText || '後端服務返回錯誤'}`)
      }
      
      const data = await response.json()
      
      if (onSuccess) {
        onSuccess(data)
      }
      
      return data
    } catch (error) {
      console.error('確認圈選時發生錯誤:', error)
      
      // 檢查是否是網路連接錯誤
      let errorMessage = '分割失敗'
      if (error.message && error.message.includes('Failed to fetch')) {
        errorMessage = '無法連接到後端服務。請確認：\n1. 後端服務是否已啟動（運行 python app.py）\n2. 後端服務是否運行在 http://localhost:8000'
      } else if (error.message && error.message.includes('HTTP')) {
        errorMessage = `後端服務錯誤：${error.message}`
      } else if (error.message) {
        errorMessage = `錯誤：${error.message}`
      } else {
        errorMessage = '分割失敗，請檢查後端服務是否正常運行'
      }
      
      alert(errorMessage)
      throw error
    }
  }, [baseImage, selectedFile, imageSize, brushPath, addPaths, subtractPaths, polygonPoints, isPolygonClosed, rectangleStart, rectangleEnd])

  return {
    isBrushMode,
    toolType,
    setToolType,
    brushMode,
    setBrushMode,
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

// BrushTool 組件 - UI 組件
function BrushTool({
  isBrushMode,
  toolType,
  onSetToolType,
  brushMode,
  onSetBrushMode,
  brushSize,
  onBrushSizeChange,
  hasBrushPath
}) {
  if (!isBrushMode) return null

  return (
    <div style={{
      padding: '15px',
      backgroundColor: '#fff',
      borderBottom: '1px solid #e0e0e0',
      flexShrink: 0
    }}>
      <div style={{ marginBottom: '15px' }}>
        <div style={{ 
          fontSize: '14px', 
          fontWeight: '600', 
          marginBottom: '10px',
          color: '#333'
        }}>
          選擇工具
        </div>
        
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {/* 畫筆工具 */}
          <button
            onClick={() => onSetToolType('brush')}
            style={{
              padding: '8px 12px',
              fontSize: '13px',
              backgroundColor: toolType === 'brush' ? '#4a90e2' : '#f0f0f0',
              color: toolType === 'brush' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: toolType === 'brush' ? '600' : '400'
            }}
          >
            畫筆
          </button>
          
          {/* 多邊形工具（隱藏） */}
          {SHOW_POLYGON_TOOL && (
            <button
              onClick={() => onSetToolType('polygon')}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                backgroundColor: toolType === 'polygon' ? '#4a90e2' : '#f0f0f0',
                color: toolType === 'polygon' ? 'white' : '#333',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: toolType === 'polygon' ? '600' : '400'
              }}
            >
              多邊形
            </button>
          )}
          
          {/* 矩形工具（隱藏） */}
          {SHOW_RECTANGLE_TOOL && (
            <button
              onClick={() => onSetToolType('rectangle')}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                backgroundColor: toolType === 'rectangle' ? '#4a90e2' : '#f0f0f0',
                color: toolType === 'rectangle' ? 'white' : '#333',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: toolType === 'rectangle' ? '600' : '400'
              }}
            >
              矩形
            </button>
          )}
        </div>
      </div>

      {/* 畫筆大小滑塊（僅在畫筆模式下顯示） */}
      {toolType === 'brush' && (
        <div style={{ marginBottom: '15px' }}>
          <div style={{ 
            fontSize: '14px', 
            fontWeight: '600', 
            marginBottom: '8px',
            color: '#333'
          }}>
            畫筆大小: {brushSize}px
          </div>
          <input
            type="range"
            min="5"
            max="30"
            value={brushSize}
            onChange={(e) => onBrushSizeChange(Number(e.target.value))}
            style={{
              width: '100%',
              cursor: 'pointer'
            }}
          />
        </div>
      )}

      {/* 加選/減選模式按鈕 */}
      <div>
        <div style={{ 
          fontSize: '14px', 
          fontWeight: '600', 
          marginBottom: '8px',
          color: '#333'
        }}>
          選擇模式
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onSetBrushMode('add')}
            title="加選模式：新增的範圍會與現有範圍合併"
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              backgroundColor: brushMode === 'add' ? '#4a90e2' : '#f0f0f0',
              color: brushMode === 'add' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: brushMode === 'add' ? '600' : '400',
              flex: 1
            }}
          >
            +
          </button>
          <button
            onClick={() => onSetBrushMode('subtract')}
            title="減選模式：點擊或經過的範圍會被移除"
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              backgroundColor: brushMode === 'subtract' ? '#dc3545' : '#f0f0f0',
              color: brushMode === 'subtract' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: brushMode === 'subtract' ? '600' : '400',
              flex: 1
            }}
          >
            -
          </button>
          <button
            onClick={() => onSetBrushMode('normal')}
            title="正常模式：繪製新的選擇範圍"
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              backgroundColor: brushMode === 'normal' ? '#28a745' : '#f0f0f0',
              color: brushMode === 'normal' ? 'white' : '#333',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: brushMode === 'normal' ? '600' : '400',
              flex: 1
            }}
          >
            正常
          </button>
        </div>
      </div>
    </div>
  )
}

export default BrushTool
