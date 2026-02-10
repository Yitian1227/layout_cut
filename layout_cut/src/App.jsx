import { useState, useRef, useEffect } from 'react'
import './App.css'

// 導入組件
import ProgressBar from './components/ProgressBar'
import UploadSection from './components/UploadSection'
import SegmentButton from './components/SegmentButton'
import SegmentedPreview from './components/SegmentedPreview'
import KonvaCanvas from './components/Canvas/KonvaCanvas'
import LeftSidebar from './components/LeftSidebar'
import { useBrushTool } from './components/BrushTool'

// 導入自定義 hooks
import { useImageSize } from './hooks/useImageSize'
import { useLayerManagement } from './hooks/useLayerManagement'
import { useCanvasInteraction } from './hooks/useCanvasInteraction'
import { useLayerInitialization } from './hooks/useLayerInitialization'

function App() {
  const stepNames = ['上傳圖片', '圈選物件', '物件去背', '圖層編輯', '生成動態']
  const [currentStep, setCurrentStep] = useState(1)
  const [completedSteps, setCompletedSteps] = useState([]) // 追蹤已完成的步驟
  const [baseImage, setBaseImage] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [isSegmenting, setIsSegmenting] = useState(false)
  const [segmentedMasks, setSegmentedMasks] = useState([])
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
    handleConfirmBrush: handleConfirmBrushInternal
  } = useBrushTool(baseImage, segmentedMasks, selectedFile, imageSize)
  
  // 圖層初始化（使用自定義 hook）
  useLayerInitialization(
    segmentedMasks,
    currentStep,
    isSegmenting,
    imageSize,
    layerManagement,
    setCurrentStep
  )

  // 圖片載入完成後，立即進入畫布模式
  useEffect(() => {
    if (baseImage && imageSize.width > 0) {
      setCurrentStep(3)
    }
  }, [baseImage, imageSize.width, setCurrentStep])

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

  // 畫筆確認回調
  const handleConfirmBrush = async () => {
    setIsSegmenting(true)
    try {
      await handleConfirmBrushInternal((data) => {
        setSegmentedMasks(data.masks || [])
        setCompletedSteps([1, 2])
        setCurrentStep(2)
      })
    } catch (error) {
      // 错误已在 handleConfirmBrushInternal 中处理
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
