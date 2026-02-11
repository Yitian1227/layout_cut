import { useState, useRef, useEffect } from 'react'
import './App.css'

// 導入組件
import ProgressBar from './components/ProgressBar'
import SegmentButton from './components/SegmentButton'
import SegmentedPreview from './components/SegmentedPreview'
import KonvaCanvas from './components/Canvas/KonvaCanvas'
import LeftSidebar from './components/LeftSidebar'
import AnimationPrompt from './components/AnimationPrompt'
import { useBrushTool } from './components/BrushTool'

// 導入自定義 hooks
import { useImageSize } from './hooks/useImageSize'
import { useLayerManagement } from './hooks/useLayerManagement'
import { useCanvasInteraction } from './hooks/useCanvasInteraction'
import { useLayerInitialization } from './hooks/useLayerInitialization'

function App() {
  const stepNames = ['上傳圖片', '圈選物件', '物件分割', '圖層編輯', '生成動態']
  const [currentStep, setCurrentStep] = useState(1)
  const [completedSteps, setCompletedSteps] = useState([]) // 追蹤已完成的步驟
  const [baseImage, setBaseImage] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [isSegmenting, setIsSegmenting] = useState(false)
  const [segmentedMasks, setSegmentedMasks] = useState([])
  const [selectedLayerPosition, setSelectedLayerPosition] = useState(null) // 選中圖層的位置信息
  const fileInputRef = useRef(null)
  const stageRef = useRef(null) // Stage 引用
  
  // 圖片尺寸和縮放（使用自定義 hook）
  const { imageSize, canvasScale } = useImageSize(baseImage)
  
  // 圖層管理（使用自定義 hook）
  const layerManagement = useLayerManagement(imageSize, setSegmentedMasks)
  const {
    layers,
    selectedLayerIndex,
    selectedLayers,
    hoveredLayerIndex,
    transformerRef,
    selectedLayerRef,
    layerItemRefs,
    handleLayerClick,
    handleDeselect,
    handleTransformEnd,
    toggleLayerVisible,
    deleteLayer,
    scaleLayer,
    rotateLayer,
    mergeLayers,
    handleLayerMouseEnter,
    handleLayerMouseLeave
  } = layerManagement
  
  // 畫布交互（使用自定義 hook）
  const {
    draggingLayerIndex,
    handleLayerPointerDown,
    handleStagePointerMove,
    handleStagePointerUp,
    handleStageClick: handleStageClickInternal
  } = useCanvasInteraction(layers, layerManagement.setLayers)
  
  // 畫筆工具（使用自定義 hook）
  const {
    isBrushMode,
    setIsBrushMode,
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
    handleConfirmBrush: handleConfirmBrushInternal,
    clearAllPaths
  } = useBrushTool(baseImage, segmentedMasks, selectedFile, imageSize)
  
  // 圖層初始化（使用自定義 hook）
  useLayerInitialization(
    segmentedMasks,
    currentStep,
    isSegmenting,
    imageSize,
    layerManagement,
    setCurrentStep,
    setCompletedSteps
  )

  // 圖片載入完成後，立即進入畫布模式
  // 但不要在分割過程中干擾流程（當 isSegmenting 為 true 時不執行）
  useEffect(() => {
    if (baseImage && imageSize.width > 0 && !isSegmenting && layers.length === 0) {
      // 一上傳完圖片立刻轉入編輯畫面
      setCurrentStep(3)
    }
  }, [baseImage, imageSize.width, isSegmenting, layers.length, setCurrentStep])

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
        layerManagement.clearLayers()
        // 一上傳完圖片立刻轉入編輯畫面
        setCurrentStep(3)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleButtonClick = () => {
    // 如果目前有圖片，清空所有狀態
    if (baseImage !== null) {
      setBaseImage(null)
      setSelectedFile(null)
      setSegmentedMasks([])
      setCurrentStep(1)
      setCompletedSteps([])
      setIsSegmenting(false)
      layerManagement.clearLayers()
      // 清空 file input 的值，確保選擇相同檔案時也會觸發 onChange
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
    // 觸發檔案選擇
    fileInputRef.current?.click()
  }

  // 點擊畫布空白處取消選擇
  const handleStageClick = (e) => {
    handleStageClickInternal(e, handleDeselect)
    // 點擊空白處時隱藏動畫提示
    setSelectedLayerPosition(null)
  }

  // 處理圖層點擊（增強版，用於顯示動畫提示）
  // 位置更新統一由 useEffect 處理，避免重複設置導致閃現
  const handleLayerClickWithPosition = (index, e) => {
    // 只調用原始的 handleLayerClick，位置更新由 useEffect 統一處理
    handleLayerClick(index, e)
  }

  // 當選中圖層改變時，更新位置信息
  // 統一由這個 useEffect 處理位置更新，避免重複設置
  useEffect(() => {
    // 如果沒有選中圖層，清除位置
    if (selectedLayerIndex === null) {
      setSelectedLayerPosition(null)
      return
    }
    
    // 確保選中的圖層存在且 ref 已準備好
    if (!layers[selectedLayerIndex] || !selectedLayerRef.current) {
      return
    }
    
    const layer = layers[selectedLayerIndex]
    
    // 使用 setTimeout 確保 DOM 已更新
    const updatePosition = () => {
      // 再次檢查，確保圖層和 ref 仍然有效
      if (!layers[selectedLayerIndex] || !selectedLayerRef.current) {
        return
      }
      
      const currentLayer = layers[selectedLayerIndex]
      const x = currentLayer.x || 0
      const y = currentLayer.y || 0
      const width = (currentLayer.width || 0) * (currentLayer.scaleX || 1)
      const height = (currentLayer.height || 0) * (currentLayer.scaleY || 1)
      
      const canvasContainer = stageRef.current?.container()?.getBoundingClientRect()
      if (canvasContainer) {
        const absoluteX = canvasContainer.left + x * canvasScale
        const absoluteY = canvasContainer.top + y * canvasScale + 70
        
        setSelectedLayerPosition({
          x: absoluteX,
          y: absoluteY,
          width: width * canvasScale,
          height: height * canvasScale
        })
      } else {
        setSelectedLayerPosition({
          x: x * canvasScale + 320 + 20,
          y: y * canvasScale + 70 + 20,
          width: width * canvasScale,
          height: height * canvasScale
        })
      }
    }
    
    // 延遲執行以確保 ref 已更新
    const timer = setTimeout(updatePosition, 100)
    return () => clearTimeout(timer)
  }, [selectedLayerIndex, layers, canvasScale])

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

  // 畫筆確認回調 - 按下"開始分割圖層"按鈕時觸發圖層分割
  const handleConfirmBrush = async () => {
    // 立即標記 step 2（圈選物件）為完成，並開始分割
    setCompletedSteps([1, 2])
    setIsSegmenting(true)
    try {
      await handleConfirmBrushInternal((data) => {
        // 關鍵修復：確保狀態更新的正確順序，避免競態條件
        // React 18 會自動批處理這些狀態更新，但我們需要確保順序
        // 1. 先設置分割結果和當前步驟（在同一個渲染週期中）
        setSegmentedMasks(data.masks || [])
        setCurrentStep(2)
        // 2. 使用 requestAnimationFrame 確保在下一個渲染週期設置 isSegmenting
        // 這樣可以確保 useLayerInitialization 的 useEffect 能正確觸發
        // 因為 useLayerInitialization 需要 segmentedMasks.length > 0 && currentStep === 2 && !isSegmenting
        requestAnimationFrame(() => {
          setIsSegmenting(false)
        })
      })
    } catch (error) {
      // 错误已在 handleConfirmBrushInternal 中处理
      console.error('確認圈選時發生錯誤:', error)
      setIsSegmenting(false)
    }
  }

  // 當圖層列表有圖層時，清除筆刷路徑並退出筆刷模式
  useEffect(() => {
    if (layers.length > 0) {
      // 清除所有筆刷路徑和狀態
      if (clearAllPaths) {
        clearAllPaths()
      }
      // 確保退出筆刷模式
      if (setIsBrushMode) {
        setIsBrushMode(false)
      }
    }
  }, [layers.length, clearAllPaths, setIsBrushMode])

  return (
    <div className="card" style={currentStep === 3 && imageSize.width > 0 ? { padding: 0, margin: 0 } : {}}>
      {/* 非畫布模式時顯示的內容 - 垂直居中 */}
      {currentStep !== 3 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: '40px'
        }}>
          {/* 進度條 - 垂直居中 */}
          <ProgressBar 
            stepNames={stepNames}
            currentStep={currentStep}
            completedSteps={completedSteps}
            isSegmenting={isSegmenting}
          />

          {/* 上傳區域 */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px'
          }}>
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
            <button 
              onClick={handleButtonClick}
              style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: '#1a1a1a',
                color: '#e0e0e0',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              {baseImage ? '替換圖片' : '新增圖片'}
            </button>
            
            {baseImage && (
              <div style={{
                marginTop: '20px',
                maxWidth: '100%',
                textAlign: 'center'
              }}>
                <img 
                  src={baseImage} 
                  alt="預覽" 
                  style={{
                    maxWidth: '100%',
                    maxHeight: '400px',
                    borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                />
              </div>
            )}
          </div>

          {/* 分割按鈕 */}
          <SegmentButton
            baseImage={baseImage}
            isSegmenting={isSegmenting}
            hasSegmentedMasks={segmentedMasks.length > 0}
            onSegment={handleSegmentImage}
          />
        </div>
      )}

      {/* 畫布模式時進度條固定在頂部 */}
      {currentStep === 3 && imageSize.width > 0 && (
        <ProgressBar 
          stepNames={stepNames}
          currentStep={currentStep}
          completedSteps={completedSteps}
          isSegmenting={isSegmenting}
        />
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
            currentStep={currentStep}
            segmentedMasks={segmentedMasks}
            isBrushMode={isBrushMode}
            toolType={toolType}
            onSetToolType={setToolType}
            brushMode={brushMode}
            onSetBrushMode={setBrushMode}
            brushSize={brushSize}
            onBrushSizeChange={setBrushSize}
            onConfirmBrush={handleConfirmBrush}
            hasBrushPath={(brushPath && brushPath.length > 0) || (currentPath && currentPath.length > 0) || (addPaths && addPaths.length > 0) || (polygonPoints && polygonPoints.length > 0) || (rectangleStart && rectangleEnd)}
            isSegmenting={isSegmenting}
          />
            
          {/* 畫布區域 - 占滿剩餘空間（扣除進度條和左側面板） */}
          <div style={{
            marginLeft: '320px',
            marginTop: '10px', // 為進度條留出空間（原 80px，往上移 10px）
            width: 'calc(100% - 320px)',
            height: 'calc(100vh - 70px)', // 扣除進度條高度（原 80px，往上移 10px）
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
              onLayerClick={handleLayerClickWithPosition}
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
              isBrushMode={isBrushMode}
              toolType={toolType}
              brushMode={brushMode}
              brushPath={brushPath}
              addPaths={addPaths}
              subtractPaths={subtractPaths}
              currentPath={currentPath}
              brushSize={brushSize}
              polygonPoints={polygonPoints}
              isPolygonClosed={isPolygonClosed}
              rectangleStart={rectangleStart}
              rectangleEnd={rectangleEnd}
              isDrawingRectangle={isDrawingRectangle}
              hoverPointRef={hoverPointRef}
              onBrushPathUpdate={handleBrushPathUpdate}
              onPathComplete={handlePathComplete}
              onRemovePath={handleRemovePath}
              onPolygonPointAdd={handlePolygonPointAdd}
              onRectangleStart={handleRectangleStart}
              onRectangleUpdate={handleRectangleUpdate}
              onRectangleEnd={handleRectangleEnd}
            />
            
            {/* 動畫生成提示輸入 - 顯示在選中圖層右側 */}
            {selectedLayerIndex !== null && layers[selectedLayerIndex] && (
              <AnimationPrompt
                selectedLayerIndex={selectedLayerIndex}
                selectedLayer={layers[selectedLayerIndex]}
                layerPosition={selectedLayerPosition}
                canvasScale={canvasScale}
                onGenerate={(data) => {
                  console.log('生成動態影片:', data)
                  // 目前按鈕還沒功能，先做 UI
                }}
              />
            )}
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
