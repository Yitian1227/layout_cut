import { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Image as KonvaImage, Group, Transformer, Circle, Line } from 'react-konva'
import useImage from 'use-image'
import './App.css'

// 圖層組件
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

function App() {
  const stepNames = ['上傳圖片', '進行圖片自動分割', '圖層編輯', '生成動態']
  const [currentStep, setCurrentStep] = useState(1)
  const [completedSteps, setCompletedSteps] = useState([]) // 追蹤已完成的步驟
  const [baseImage, setBaseImage] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [isSegmenting, setIsSegmenting] = useState(false)
  const [segmentedMasks, setSegmentedMasks] = useState([])
  const fileInputRef = useRef(null)
  
  // 圖層編輯相關狀態
  const [layers, setLayers] = useState([]) // 圖層列表，每個包含 { id, src, visible, x, y }
  const [selectedLayerIndex, setSelectedLayerIndex] = useState(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [selectedLayers, setSelectedLayers] = useState([]) // 多選圖層（用於合併）
  const [hoveredLayerIndex, setHoveredLayerIndex] = useState(null) // 滑鼠懸停的圖層索引
  const [canvasScale, setCanvasScale] = useState(1) // 畫布縮放比例
  const transformerRef = useRef(null) // Transformer 引用
  const selectedLayerRef = useRef(null) // 選中圖層的引用
  
  // 手動拖拽相關狀態
  const [draggingLayerIndex, setDraggingLayerIndex] = useState(null) // 正在拖拽的圖層索引
  const dragStartPosRef = useRef({ x: 0, y: 0 }) // 拖拽開始時的滑鼠位置（畫布座標）
  const layerStartPosRef = useRef({ x: 0, y: 0 }) // 拖拽開始時的圖層位置
  const dragOffsetRef = useRef({ x: 0, y: 0 }) // 滑鼠相對於圖層的偏移量
  const isDraggingRef = useRef(false) // 是否正在拖拽（移動超過閾值）
  const stageRef = useRef(null) // Stage 引用
  const layerListRef = useRef(null) // 圖層列表容器引用
  const layerItemRefs = useRef([]) // 圖層列表項引用數組

  const handleImageUpload = (event) => {
    const file = event.target.files[0]
    if (file) {
      setSelectedFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setBaseImage(reader.result)
        // 標記 step 1 為完成
        setCompletedSteps([1])
        setCurrentStep(1)
        // 清空圖層編輯相關狀態
        setLayers([])
        setSelectedLayerIndex(null)
        setSelectedLayers([])
      }
      reader.readAsDataURL(file)
    }
  }
  
  // 獲取圖片尺寸並計算縮放比例
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
    }
  }, [baseImage])
  
  // 當分割完成時，自動進入圖層編輯模式
  useEffect(() => {
    if (segmentedMasks.length > 0 && currentStep === 2 && !isSegmenting) {
      // 初始化圖層列表
      // segmentedMasks 現在是包含 { image, offsetX, offsetY, width, height } 的對象數組
      const initialLayers = segmentedMasks.map((maskData, index) => ({
        id: index,
        src: maskData.image || maskData, // 兼容舊格式（如果還是字符串）
        visible: true,
        x: maskData.offsetX || 0, // 使用偏移量作為初始位置
        y: maskData.offsetY || 0,
        width: maskData.width || imageSize.width, // 記錄裁切後的寬度
        height: maskData.height || imageSize.height, // 記錄裁切後的高度
        scaleX: 1, // 圖層縮放 X
        scaleY: 1, // 圖層縮放 Y
        rotation: 0 // 圖層旋轉角度
      }))
      
      // 計算所有圖層的邊界框，使群體居中
      let newLayers = initialLayers
      if (initialLayers.length > 0) {
        // 計算所有圖層的邊界
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        
        initialLayers.forEach(layer => {
          const layerRight = layer.x + layer.width
          const layerBottom = layer.y + layer.height
          minX = Math.min(minX, layer.x)
          minY = Math.min(minY, layer.y)
          maxX = Math.max(maxX, layerRight)
          maxY = Math.max(maxY, layerBottom)
        })
        
        // 計算圖層群體的中心點
        const groupCenterX = (minX + maxX) / 2
        const groupCenterY = (minY + maxY) / 2
        
        // 計算畫布的中心點（考慮縮放後的實際尺寸）
        const canvasWidth = 1000 / canvasScale
        const canvasHeight = 800 / canvasScale
        const canvasCenterX = canvasWidth / 2
        const canvasCenterY = canvasHeight / 2
        
        // 計算偏移量，使圖層群體居中
        const offsetX = canvasCenterX - groupCenterX
        const offsetY = canvasCenterY - groupCenterY
        
        // 應用偏移量到所有圖層
        newLayers = initialLayers.map(layer => ({
          ...layer,
          x: layer.x + offsetX,
          y: layer.y + offsetY
        }))
      }
      
      setLayers(newLayers)
      setSelectedLayerIndex(null)
      setSelectedLayers([])
      setHoveredLayerIndex(null)
      setCurrentStep(3)
      // 初始化圖層列表項引用數組
      layerItemRefs.current = new Array(newLayers.length).fill(null).map(() => ({ current: null }))
    }
  }, [segmentedMasks, currentStep, isSegmenting, imageSize, canvasScale])
  
  // 當選中圖層改變時，自動滾動到該圖層項目
  useEffect(() => {
    if (selectedLayerIndex !== null && layerItemRefs.current[selectedLayerIndex]) {
      const element = layerItemRefs.current[selectedLayerIndex].current
      if (element) {
        // 使用 scrollIntoView 平滑滾動，並將項目置中
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        })
      }
    }
  }, [selectedLayerIndex])

  const handleButtonClick = () => {
    // 如果目前有圖片，清空所有狀態
    if (baseImage !== null) {
      setBaseImage(null)
      setSelectedFile(null)
      setSegmentedMasks([])
      setCurrentStep(1)
      setCompletedSteps([])
      setIsSegmenting(false)
      setLayers([])
      setSelectedLayerIndex(null)
      setSelectedLayers([])
      setHoveredLayerIndex(null)
      setImageSize({ width: 0, height: 0 })
      setCanvasScale(1)
      // 清空 file input 的值，確保選擇相同檔案時也會觸發 onChange
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
    // 觸發檔案選擇
    fileInputRef.current?.click()
  }

  // 圖層操作函數
  const handleLayerClick = (index, e) => {
    // 阻止事件冒泡
    if (e) {
      e.cancelBubble = true
      if (e.evt) {
        e.evt.cancelBubble = true
      }
    }
    
    setSelectedLayerIndex(index)
    // 多選：按住 Ctrl/Cmd 鍵可以多選（適用於畫布和側邊欄）
    const isCtrlKey = e?.ctrlKey || e?.metaKey || e?.evt?.ctrlKey || e?.evt?.metaKey
    if (isCtrlKey) {
      if (selectedLayers.includes(index)) {
        setSelectedLayers(selectedLayers.filter(i => i !== index))
        if (selectedLayers.length === 1) {
          setSelectedLayerIndex(null)
        }
      } else {
        setSelectedLayers([...selectedLayers, index])
      }
    } else {
      setSelectedLayers([index])
    }
  }
  
  // 當選中圖層改變時，更新 Transformer
  useEffect(() => {
    if (transformerRef.current && selectedLayerRef.current && selectedLayerIndex !== null && selectedLayers.length === 1) {
      // 確保 Transformer 綁定到選中的圖層
      transformerRef.current.nodes([selectedLayerRef.current])
      transformerRef.current.getLayer().batchDraw()
    } else if (transformerRef.current) {
      transformerRef.current.nodes([])
      transformerRef.current.getLayer().batchDraw()
    }
  }, [selectedLayerIndex, selectedLayers.length])
  
  // 點擊畫布空白處取消選擇
  const handleStageClick = (e) => {
    // 如果正在拖拽，不處理點擊事件
    if (draggingLayerIndex !== null) return
    
    const clickedOnEmpty = e.target === e.target.getStage()
    if (clickedOnEmpty) {
      setSelectedLayerIndex(null)
      setSelectedLayers([])
    }
  }
  
  // 監聽 Transformer 的變換事件
  const handleTransformEnd = (index) => {
    if (!selectedLayerRef.current) return
    
    const node = selectedLayerRef.current
    const newLayers = [...layers]
    
    // 獲取變換後的屬性
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    const rotation = node.rotation()
    const x = node.x()
    const y = node.y()
    
    // 更新圖層狀態
    newLayers[index] = {
      ...newLayers[index],
      x,
      y,
      scaleX: scaleX,
      scaleY: scaleY,
      rotation: rotation
    }
    
    setLayers(newLayers)
    
    // 重置縮放（因為 Konva 的縮放是累積的）
    node.scaleX(scaleX)
    node.scaleY(scaleY)
  }
  
  const toggleLayerVisible = (index) => {
    setLayers(layers.map((layer, i) => 
      i === index ? { ...layer, visible: !layer.visible } : layer
    ))
  }
  
  const deleteLayer = (index) => {
    setLayers(layers.filter((_, i) => i !== index))
    setSegmentedMasks(segmentedMasks.filter((_, i) => i !== index))
    if (selectedLayerIndex === index) {
      setSelectedLayerIndex(null)
    }
    setSelectedLayers(selectedLayers.filter(i => i !== index).map(i => i > index ? i - 1 : i))
  }
  
  // 圖層縮放功能
  const scaleLayer = (index, scaleDelta) => {
    const newLayers = [...layers]
    const currentScaleX = newLayers[index].scaleX || 1
    const currentScaleY = newLayers[index].scaleY || 1
    const newScaleX = Math.max(0.1, Math.min(3, currentScaleX + scaleDelta))
    const newScaleY = Math.max(0.1, Math.min(3, currentScaleY + scaleDelta))
    
    newLayers[index] = {
      ...newLayers[index],
      scaleX: newScaleX,
      scaleY: newScaleY
    }
    setLayers(newLayers)
  }
  
  // 圖層旋轉功能
  const rotateLayer = (index, rotationDelta) => {
    const newLayers = [...layers]
    const currentRotation = newLayers[index].rotation || 0
    const newRotation = (currentRotation + rotationDelta) % 360
    
    newLayers[index] = {
      ...newLayers[index],
      rotation: newRotation
    }
    setLayers(newLayers)
  }
  
  const mergeLayers = async () => {
    if (selectedLayers.length < 2) {
      alert('請至少選擇兩個圖層進行合併')
      return
    }
    
    // 創建一個臨時 canvas 來合併圖層
    const canvas = document.createElement('canvas')
    canvas.width = imageSize.width
    canvas.height = imageSize.height
    
    // 按順序繪製選中的圖層
    const layersToMerge = [...selectedLayers].sort((a, b) => a - b)
    
    // 使用 Promise 來等待所有圖片載入
    const loadImage = (src) => {
      return new Promise((resolve, reject) => {
        const img = new window.Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = src
      })
    }
    
    try {
      // 載入所有選中的圖層圖片
      const images = await Promise.all(
        layersToMerge.map(index => loadImage(layers[index].src))
      )
      
      // 計算合併圖層的邊界（用於確定偏移量和尺寸）
      const mergedBounds = {
        minX: Math.min(...layersToMerge.map(i => layers[i].x)),
        minY: Math.min(...layersToMerge.map(i => layers[i].y)),
        maxX: Math.max(...layersToMerge.map(i => layers[i].x + (layers[i].width || imageSize.width))),
        maxY: Math.max(...layersToMerge.map(i => layers[i].y + (layers[i].height || imageSize.height)))
      }
      
      // 設置 canvas 大小為合併後的邊界大小
      canvas.width = mergedBounds.maxX - mergedBounds.minX
      canvas.height = mergedBounds.maxY - mergedBounds.minY
      
      // 重新獲取 context（因為 canvas 大小改變了）
      const mergedCtx = canvas.getContext('2d')
      
      // 繪製所有圖層到 canvas，考慮它們的相對位置、縮放和旋轉
      images.forEach((img, imgIndex) => {
        const layerIndex = layersToMerge[imgIndex]
        const layer = layers[layerIndex]
        // 計算相對於合併邊界的偏移量
        const relativeX = layer.x - mergedBounds.minX
        const relativeY = layer.y - mergedBounds.minY
        
        // 保存當前狀態
        mergedCtx.save()
        
        // 移動到圖層中心點
        const centerX = relativeX + (layer.width || imageSize.width) / 2
        const centerY = relativeY + (layer.height || imageSize.height) / 2
        mergedCtx.translate(centerX, centerY)
        
        // 應用旋轉
        const rotation = layer.rotation || 0
        mergedCtx.rotate((rotation * Math.PI) / 180)
        
        // 應用縮放
        const scaleX = layer.scaleX || 1
        const scaleY = layer.scaleY || 1
        mergedCtx.scale(scaleX, scaleY)
        
        // 繪製圖片（從中心點繪製）
        mergedCtx.drawImage(
          img,
          -(layer.width || imageSize.width) / 2,
          -(layer.height || imageSize.height) / 2,
          layer.width || imageSize.width,
          layer.height || imageSize.height
        )
        
        // 恢復狀態
        mergedCtx.restore()
      })
      
      // 生成合併後的 base64
      const mergedDataUrl = canvas.toDataURL('image/png')
      
      // 移除舊的圖層，添加新的合併圖層
      const newLayers = layers.filter((_, i) => !layersToMerge.includes(i))
      const newMasks = segmentedMasks.filter((_, i) => !layersToMerge.includes(i))
      
      // 添加合併後的圖層到最前面
      newLayers.unshift({
        id: Date.now(),
        src: mergedDataUrl,
        visible: true,
        x: mergedBounds.minX,
        y: mergedBounds.minY,
        width: mergedBounds.maxX - mergedBounds.minX,
        height: mergedBounds.maxY - mergedBounds.minY
      })
      newMasks.unshift({
        image: mergedDataUrl,
        offsetX: mergedBounds.minX,
        offsetY: mergedBounds.minY,
        width: mergedBounds.maxX - mergedBounds.minX,
        height: mergedBounds.maxY - mergedBounds.minY
      })
      
      setLayers(newLayers)
      setSegmentedMasks(newMasks)
      setSelectedLayerIndex(0)
      setSelectedLayers([0])
    } catch (error) {
      console.error('合併圖層時發生錯誤:', error)
      alert('合併圖層失敗')
    }
  }
  
  // 滑鼠按下時，記錄初始位置
  const handleLayerPointerDown = (index, e) => {
    // 只處理左鍵點擊
    if (e.evt && e.evt.button !== 0) return
    
    // 阻止事件冒泡，避免觸發 Stage 的點擊事件
    e.cancelBubble = true
    
    const stage = e.target.getStage()
    const pointerPos = stage.getPointerPosition()
    const layerX = e.target.x()
    const layerY = e.target.y()
    
    // 記錄拖拽開始狀態
    setDraggingLayerIndex(index)
    dragStartPosRef.current = { x: pointerPos.x, y: pointerPos.y }
    layerStartPosRef.current = { x: layerX, y: layerY }
    isDraggingRef.current = false
    
    // 考慮畫布的縮放比例，計算滑鼠相對於圖層的偏移量
    const scale = stage.scaleX()
    const offsetX = (pointerPos.x / scale) - layerX
    const offsetY = (pointerPos.y / scale) - layerY
    dragOffsetRef.current = { x: offsetX, y: offsetY }
    
    // 設置滑鼠樣式為抓取
    stage.container().style.cursor = 'grabbing'
  }
  
  // 滑鼠移動時，檢查是否開始拖拽
  const handleStagePointerMove = (e) => {
    if (draggingLayerIndex === null) return
    
    // 檢查是否按住左鍵（按鈕 0）
    if (e.evt && e.evt.buttons !== undefined && e.evt.buttons !== 1) {
      // 如果沒有按住左鍵，結束拖拽
      handleStagePointerUp(e)
      return
    }
    
    const stage = e.target.getStage()
    const pointerPos = stage.getPointerPosition()
    
    if (!pointerPos) return
    
    const layer = layers[draggingLayerIndex]
    if (!layer) return
    
    // 計算移動距離（畫布座標）
    const deltaX = Math.abs(pointerPos.x - dragStartPosRef.current.x)
    const deltaY = Math.abs(pointerPos.y - dragStartPosRef.current.y)
    const dragThreshold = 5 // 拖拽閾值（像素）
    
    // 只有移動距離超過閾值時才認為是拖拽
    if (deltaX > dragThreshold || deltaY > dragThreshold) {
      if (!isDraggingRef.current) {
        isDraggingRef.current = true
      }
      
      // 考慮畫布的縮放比例
      const scale = stage.scaleX()
      const newX = (pointerPos.x / scale) - dragOffsetRef.current.x
      const newY = (pointerPos.y / scale) - dragOffsetRef.current.y
      
      // 更新圖層位置
      const newLayers = [...layers]
      newLayers[draggingLayerIndex] = {
        ...newLayers[draggingLayerIndex],
        x: newX,
        y: newY
      }
      setLayers(newLayers)
    }
  }
  
  // 滑鼠放開時，結束拖拽
  const handleStagePointerUp = (e) => {
    if (draggingLayerIndex === null) return
    
    const stage = e.target.getStage()
    
    // 恢復滑鼠樣式
    stage.container().style.cursor = 'default'
    
    // 如果沒有真正拖拽（只是點擊），恢復到原始位置
    if (!isDraggingRef.current) {
      const newLayers = [...layers]
      newLayers[draggingLayerIndex] = {
        ...newLayers[draggingLayerIndex],
        x: layerStartPosRef.current.x,
        y: layerStartPosRef.current.y
      }
      setLayers(newLayers)
    }
    
    // 清除拖拽狀態
    setDraggingLayerIndex(null)
    dragStartPosRef.current = { x: 0, y: 0 }
    layerStartPosRef.current = { x: 0, y: 0 }
    dragOffsetRef.current = { x: 0, y: 0 }
    isDraggingRef.current = false
  }
  
  // 滑鼠進入圖層時，設定 hoveredLayerIndex
  const handleLayerMouseEnter = (index) => {
    setHoveredLayerIndex(index)
  }
  
  // 滑鼠離開圖層時，清除 hoveredLayerIndex
  const handleLayerMouseLeave = () => {
    setHoveredLayerIndex(null)
  }

  const handleSegmentImage = async () => {
    if (!selectedFile) {
      alert('請先上傳圖片')
      return
    }

    // 如果已有分割結果，先清空
    if (segmentedMasks.length > 0) {
      setSegmentedMasks([])
    }

    setIsSegmenting(true)
    setCurrentStep(2)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch('http://localhost:8000/segment-image', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      // data.masks 現在是包含 { image, offsetX, offsetY, width, height } 的對象數組
      setSegmentedMasks(data.masks || [])
      // 分割成功後，標記 step 2 為完成，currentStep 設為 2（useEffect 會自動進入 step 3）
      setCompletedSteps([1, 2])
      setCurrentStep(2)
    } catch (error) {
      console.error('分割圖片時發生錯誤:', error)
      alert('分割圖片失敗，請檢查後端服務是否正常運行')
    } finally {
      setIsSegmenting(false)
    }
  }


  return (
    <div className="card">
      {/* 進度條 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        marginBottom: '30px',
        padding: '20px'
      }}>
        {stepNames.map((stepName, index) => {
          const stepNumber = index + 1
          const isCompleted = completedSteps.includes(stepNumber)
          const isCurrent = currentStep === stepNumber
          const isActive = isCurrent || (isCompleted && !isSegmenting)
          // 在 loading 狀態時，step 2 不應該顯示為完成
          const showCompleted = isCompleted && !(isSegmenting && index === 1)
          
          return (
            <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: showCompleted ? '#4a90e2' : 'transparent',
                    border: showCompleted ? 'none' : '2px solid #b0b0b0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: showCompleted ? 'white' : '#b0b0b0',
                    fontWeight: 'bold',
                    fontSize: '14px'
                  }}
                >
                  {showCompleted ? '✓' : stepNumber}
                </div>
                <div style={{ 
                  marginTop: '8px', 
                  fontSize: '14px',
                  color: isActive ? '#4a90e2' : '#b0b0b0',
                  fontWeight: isActive ? 'bold' : 'normal',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  {stepName}
                  {isSegmenting && index === 1 && (
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid #4a90e2',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }}
                    />
                  )}
                </div>
              </div>
              {index < stepNames.length - 1 && (
                <div
                  style={{
                    width: '80px',
                    height: '2px',
                    backgroundColor: completedSteps.includes(stepNumber + 1) ? '#4a90e2' : '#e0e0e0',
                    margin: '0 10px',
                    marginTop: '-20px'
                  }}
                />
              )}
            </div>
          )
        })}
      </div>

      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleImageUpload}
        style={{ display: 'none' }}
      />
      <button onClick={handleButtonClick}>
        {baseImage ? '替換圖片' : '新增圖片'}
      </button>
      {/* 圖片預覽（在 step 1-2 時顯示，step 3 時不顯示因為畫布上已有） */}
      {baseImage && currentStep !== 3 && (
        <div style={{ marginTop: '20px' }}>
          <img 
            src={baseImage} 
            alt="Base Image Preview" 
            style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px' }}
          />
        </div>
      )}

      {/* 分割按鈕（始終顯示，如果有圖片） */}
      {baseImage && (
        <div style={{ marginTop: '20px' }}>
          <button 
            onClick={handleSegmentImage}
            disabled={isSegmenting}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: isSegmenting ? '#ccc' : '#4a90e2',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isSegmenting ? 'not-allowed' : 'pointer'
            }}
          >
            {isSegmenting ? '分割中...' : (segmentedMasks.length > 0 ? '重新進行分割圖層' : '開始分割圖層')}
          </button>
        </div>
      )}

      {/* 圖層編輯模式 */}
      {currentStep === 3 && imageSize.width > 0 && (
        <div style={{ 
          display: 'flex', 
          gap: '20px', 
          marginTop: '30px',
          alignItems: 'flex-start'
        }}>
          {/* 畫布區域 */}
          <div style={{ 
            border: '1px solid #e0e0e0', 
            borderRadius: '8px',
            padding: '10px',
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
              onPointerMove={handleStagePointerMove}
              onPointerUp={handleStagePointerUp}
              onClick={handleStageClick}
            >
              <Layer>
                {/* 分割圖層（不使用底層基礎圖片） */}
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
                      onTransformEnd={handleTransformEnd}
                      onPointerDown={(e) => handleLayerPointerDown(index, e)}
                      onClick={(e) => handleLayerClick(index, e)}
                      onMouseEnter={() => handleLayerMouseEnter(index)}
                      onMouseLeave={handleLayerMouseLeave}
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
          
          {/* 右側面板容器 */}
          <div style={{
            width: '250px',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px'
          }}>
            {/* 控制面板 */}
            <div style={{
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              padding: '15px',
              backgroundColor: '#f5f5f5'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '18px', color: '#333' }}>
                控制面板
              </h3>
              
              {/* 合併按鈕 */}
              {selectedLayers.length >= 2 && (
                <button
                  onClick={mergeLayers}
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginBottom: '15px',
                    backgroundColor: '#4a90e2',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  合併選中圖層 ({selectedLayers.length})
                </button>
              )}
              
              {/* 選中圖層的控制 */}
              {selectedLayerIndex !== null && layers[selectedLayerIndex] && (
                <div style={{
                  padding: '10px',
                  marginBottom: '10px',
                  border: '1px solid #4a90e2',
                  borderRadius: '4px',
                  backgroundColor: '#f0f8ff'
                }}>
                  <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '14px', color: '#333' }}>
                    圖層 {selectedLayerIndex + 1} 控制
                  </div>
                  
                  {/* 縮放控制 */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '12px', marginBottom: '5px', color: '#333' }}>縮放: {((layers[selectedLayerIndex].scaleX || 1) * 100).toFixed(0)}%</div>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button
                        onClick={() => scaleLayer(selectedLayerIndex, -0.1)}
                        style={{
                          flex: 1,
                          padding: '4px',
                          fontSize: '12px',
                          backgroundColor: '#4a90e2',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        -10%
                      </button>
                      <button
                        onClick={() => scaleLayer(selectedLayerIndex, 0.1)}
                        style={{
                          flex: 1,
                          padding: '4px',
                          fontSize: '12px',
                          backgroundColor: '#4a90e2',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        +10%
                      </button>
                    </div>
                  </div>
                  
                  {/* 旋轉控制 */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '12px', marginBottom: '5px', color: '#333' }}>旋轉: {(layers[selectedLayerIndex].rotation || 0).toFixed(0)}°</div>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button
                        onClick={() => rotateLayer(selectedLayerIndex, -15)}
                        style={{
                          flex: 1,
                          padding: '4px',
                          fontSize: '12px',
                          backgroundColor: '#4a90e2',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        -15°
                      </button>
                      <button
                        onClick={() => rotateLayer(selectedLayerIndex, 15)}
                        style={{
                          flex: 1,
                          padding: '4px',
                          fontSize: '12px',
                          backgroundColor: '#4a90e2',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        +15°
                      </button>
                    </div>
                  </div>
                  
                  {/* 顯示/隱藏和刪除按鈕 */}
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button
                      onClick={() => toggleLayerVisible(selectedLayerIndex)}
                      style={{
                        flex: 1,
                        padding: '6px',
                        fontSize: '12px',
                        backgroundColor: layers[selectedLayerIndex].visible ? '#4caf50' : '#ccc',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      {layers[selectedLayerIndex].visible ? '顯示' : '隱藏'}
                    </button>
                    <button
                      onClick={() => deleteLayer(selectedLayerIndex)}
                      style={{
                        flex: 1,
                        padding: '6px',
                        fontSize: '12px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      刪除
                    </button>
                  </div>
                </div>
              )}
              
              {/* 未選中圖層時的提示 */}
              {selectedLayerIndex === null && selectedLayers.length === 0 && (
                <div style={{ 
                  padding: '10px', 
                  fontSize: '12px', 
                  color: '#888', 
                  textAlign: 'center',
                  fontStyle: 'italic'
                }}>
                  請選擇圖層以進行操作
                </div>
              )}
            </div>
            
            {/* 圖層列表 */}
            <div 
              ref={layerListRef}
              style={{
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '15px',
                backgroundColor: '#f5f5f5',
                maxHeight: '500px',
                overflowY: 'auto'
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '18px', color: '#333' }}>
                圖層列表 (共{layers.length}張)
              </h3>
            
            {layers.map((layer, index) => {
              const isSelected = selectedLayerIndex === index || selectedLayers.includes(index)
              const isHovered = hoveredLayerIndex === index
              
              // 確保引用數組有足夠的長度
              if (!layerItemRefs.current[index]) {
                layerItemRefs.current[index] = { current: null }
              }
              
              return (
                <div
                  key={layer.id}
                  ref={(el) => {
                    if (layerItemRefs.current[index]) {
                      layerItemRefs.current[index].current = el
                    }
                  }}
                  className={isHovered ? 'hovered' : ''}
                  style={{
                    padding: '10px',
                    marginBottom: '8px',
                    border: isSelected ? '2px solid #4a90e2' : (isHovered ? '2px solid #ffc107' : '1px solid #e0e0e0'),
                    borderRadius: '4px',
                    backgroundColor: isSelected ? '#e3f2fd' : (isHovered ? '#fff9c4' : '#f9f9f9'),
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                  onClick={(e) => handleLayerClick(index, e)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img 
                      src={layer.src} 
                      className="thumbnail" 
                      alt={`圖層 ${index + 1}`}
                      style={{
                        width: '60px',
                        height: '60px',
                        objectFit: 'contain',
                        border: isSelected ? '2px solid #4a90e2' : '1px solid #ddd',
                        borderRadius: '4px',
                        backgroundColor: '#fff',
                        padding: '2px',
                        opacity: layer.visible ? 1 : 0.3
                      }}
                    />
                  </div>
                  {!layer.visible && (
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: '12px',
                      color: '#f44336',
                      fontWeight: 'bold',
                      pointerEvents: 'none',
                      backgroundColor: 'rgba(255, 255, 255, 0.8)',
                      padding: '2px 6px',
                      borderRadius: '3px'
                    }}>
                      隱藏
                    </div>
                  )}
                </div>
              )
            })}
            </div>
          </div>
        </div>
      )}
      
      {/* 分割結果預覽（僅在 step 2 時顯示） */}
      {currentStep === 2 && segmentedMasks.length > 0 && (
        <div style={{ 
          marginTop: '30px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px'
        }}>
          {segmentedMasks.map((maskData, index) => {
            // 兼容新舊格式：如果是對象則使用 image 屬性，否則直接使用
            const maskSrc = typeof maskData === 'string' ? maskData : maskData.image
            return (
              <img
                key={index}
                src={maskSrc}
                alt={`Segmented Mask ${index + 1}`}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  objectFit: 'contain',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  backgroundColor: '#f5f5f5'
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export default App
