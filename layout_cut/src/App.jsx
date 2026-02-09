import { useState, useRef, useEffect } from 'react'
import './App.css'

// 導入組件
import ProgressBar from './components/ProgressBar'
import UploadSection from './components/UploadSection'
import SegmentButton from './components/SegmentButton'
import SegmentedPreview from './components/SegmentedPreview'
import KonvaCanvas from './components/Canvas/KonvaCanvas'
import LeftSidebar from './components/LeftSidebar'
import InstructionText from './components/InstructionText'

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
        // 清空圖層編輯相關狀態
        setLayers([])
        setSelectedLayerIndex(null)
        setSelectedLayers([])
        // 注意：currentStep 會在 useEffect 中根據 imageSize 設置為 3
      }
      reader.readAsDataURL(file)
    }
  }
  
  // 獲取圖片尺寸並計算縮放比例，然後進入畫布模式
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
        
        // 圖片載入完成後，立即進入畫布模式（step 3）
        setCurrentStep(3)
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
    <div className="card" style={currentStep === 3 && imageSize.width > 0 ? { padding: 0, margin: 0 } : {}}>
      {/* 進度條 - 始終固定在頂部 */}
      <ProgressBar 
        stepNames={stepNames}
        currentStep={currentStep}
        completedSteps={completedSteps}
        isSegmenting={isSegmenting}
      />

      {/* 說明文字 - 顯示在進度條和畫布之間 */}
      <InstructionText
        currentStep={currentStep}
        baseImage={baseImage}
        segmentedMasks={segmentedMasks}
      />

      {/* 非畫布模式時顯示的內容 */}
      {currentStep !== 3 && (
        <>
          {/* 上傳區域 */}
          <UploadSection
            baseImage={baseImage}
            fileInputRef={fileInputRef}
            onImageUpload={handleImageUpload}
            onButtonClick={handleButtonClick}
            currentStep={currentStep}
          />

          {/* 分割按鈕 */}
          <SegmentButton
            baseImage={baseImage}
            isSegmenting={isSegmenting}
            hasSegmentedMasks={segmentedMasks.length > 0}
            onSegment={handleSegmentImage}
          />
        </>
      )}

      {/* 圖層編輯模式 */}
      {currentStep === 3 && imageSize.width > 0 && (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          width: '100%',
          height: '100vh'
        }}>
          {/* 左側面板 */}
          <LeftSidebar
            baseImage={baseImage}
            fileInputRef={fileInputRef}
            onImageUpload={handleImageUpload}
            onButtonClick={handleButtonClick}
            layers={layers}
            selectedLayerIndex={selectedLayerIndex}
            selectedLayers={selectedLayers}
            hoveredLayerIndex={hoveredLayerIndex}
            layerItemRefs={layerItemRefs}
            onLayerClick={handleLayerClick}
            onMergeLayers={mergeLayers}
            onScaleLayer={scaleLayer}
            onRotateLayer={rotateLayer}
            onToggleLayerVisible={toggleLayerVisible}
            onDeleteLayer={deleteLayer}
          />
            
          {/* 畫布區域 - 占滿剩餘空間（扣除進度條和左側面板） */}
          <div style={{
            marginLeft: '320px',
            marginTop: '80px', // 為進度條留出空間（padding 20px * 2 + 內容高度約 40px）
            width: 'calc(100% - 320px)',
            height: 'calc(100vh - 80px)', // 扣除進度條高度
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto'
          }}>
            <KonvaCanvas
              baseImage={baseImage}
              imageSize={imageSize}
              layers={layers}
              selectedLayerIndex={selectedLayerIndex}
              selectedLayers={selectedLayers}
              canvasScale={canvasScale}
              onLayerClick={handleLayerClick}
              onLayerPointerDown={handleLayerPointerDown}
              onStageClick={handleStageClick}
              onStagePointerMove={handleStagePointerMove}
              onStagePointerUp={handleStagePointerUp}
              onLayerMouseEnter={handleLayerMouseEnter}
              onLayerMouseLeave={handleLayerMouseLeave}
              onTransformEnd={handleTransformEnd}
              transformerRef={transformerRef}
              selectedLayerRef={selectedLayerRef}
              stageRef={stageRef}
            />
          </div>
        </div>
      )}
      
      {/* 分割結果預覽（僅在 step 2 時顯示） */}
      <SegmentedPreview
        segmentedMasks={segmentedMasks}
        currentStep={currentStep}
      />
    </div>
  )
}

export default App
