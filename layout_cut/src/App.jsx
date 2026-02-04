import { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Image as KonvaImage, Group } from 'react-konva'
import useImage from 'use-image'
import './App.css'

// 圖層組件
function LayerImage({ layer, index, isSelected, onDragStart, onDragMove, onDragEnd, onClick, imageSize, onMouseEnter, onMouseLeave }) {
  const [layerImage] = useImage(layer.src)
  
  if (!layerImage || !layer.visible) return null
  
  // 使用圖層的實際尺寸（裁切後的尺寸），而不是原始圖片尺寸
  // 這樣可以讓 hover 更精準，因為圖層只包含實際物件範圍
  const imageWidth = layer.width || layerImage.width || layerImage.naturalWidth || 0
  const imageHeight = layer.height || layerImage.height || layerImage.naturalHeight || 0
  
  return (
    <KonvaImage
      image={layerImage}
      width={imageWidth}
      height={imageHeight}
      x={layer.x}
      y={layer.y}
      draggable
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      stroke={isSelected ? '#4a90e2' : undefined}
      strokeWidth={isSelected ? 3 : 0}
      shadowColor={isSelected ? '#4a90e2' : undefined}
      shadowBlur={isSelected ? 10 : 0}
      shadowOpacity={isSelected ? 0.5 : 0}
      scaleX={isSelected ? 1.02 : 1}
      scaleY={isSelected ? 1.02 : 1}
    />
  )
}

function App() {
  const stepNames = ['上傳圖片', '進行圖片自動分割', '圖層編輯']
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
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }) // 拖拽時的偏移量
  

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
  
  // 獲取圖片尺寸
  useEffect(() => {
    if (baseImage) {
      const img = new window.Image()
      img.onload = () => {
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.src = baseImage
    }
  }, [baseImage])
  
  // 當分割完成時，自動進入圖層編輯模式
  useEffect(() => {
    if (segmentedMasks.length > 0 && currentStep === 2 && !isSegmenting) {
      // 初始化圖層列表
      // segmentedMasks 現在是包含 { image, offsetX, offsetY, width, height } 的對象數組
      const newLayers = segmentedMasks.map((maskData, index) => ({
        id: index,
        src: maskData.image || maskData, // 兼容舊格式（如果還是字符串）
        visible: true,
        x: maskData.offsetX || 0, // 使用偏移量作為初始位置
        y: maskData.offsetY || 0,
        width: maskData.width || imageSize.width, // 記錄裁切後的寬度
        height: maskData.height || imageSize.height // 記錄裁切後的高度
      }))
      setLayers(newLayers)
      setSelectedLayerIndex(null)
      setSelectedLayers([])
      setHoveredLayerIndex(null)
      setCurrentStep(3)
    }
  }, [segmentedMasks, currentStep, isSegmenting, imageSize])

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
  
  const mergeLayers = async () => {
    if (selectedLayers.length < 2) {
      alert('請至少選擇兩個圖層進行合併')
      return
    }
    
    // 創建一個臨時 canvas 來合併圖層
    const canvas = document.createElement('canvas')
    canvas.width = imageSize.width
    canvas.height = imageSize.height
    const ctx = canvas.getContext('2d')
    
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
      
      // 繪製所有圖層到 canvas，考慮它們的相對位置
      images.forEach((img, imgIndex) => {
        const layerIndex = layersToMerge[imgIndex]
        const layer = layers[layerIndex]
        // 計算相對於合併邊界的偏移量
        const relativeX = layer.x - mergedBounds.minX
        const relativeY = layer.y - mergedBounds.minY
        mergedCtx.drawImage(img, relativeX, relativeY)
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
  
  // 拖拽開始時，記錄滑鼠相對於圖層的位置
  const handleLayerDragStart = (index, e) => {
    const stage = e.target.getStage()
    const pointerPos = stage.getPointerPosition()
    const layerX = e.target.x()
    const layerY = e.target.y()
    
    // 計算滑鼠相對於圖層的偏移量
    const offsetX = pointerPos.x - layerX
    const offsetY = pointerPos.y - layerY
    
    setDragOffset({ x: offsetX, y: offsetY })
  }
  
  // 拖拽過程中，調整圖層位置，使滑鼠始終在圖層上的同一相對位置
  const handleLayerDragMove = (index, e) => {
    const stage = e.target.getStage()
    const pointerPos = stage.getPointerPosition()
    
    // 計算新的圖層位置，使滑鼠相對於圖層的位置保持不變
    const newX = pointerPos.x - dragOffset.x
    const newY = pointerPos.y - dragOffset.y
    
    // 更新圖層位置
    e.target.x(newX)
    e.target.y(newY)
  }
  
  const handleLayerDragEnd = (index, e) => {
    const newLayers = [...layers]
    const newX = e.target.x()
    const newY = e.target.y()
    
    // 更新圖層位置
    newLayers[index] = {
      ...newLayers[index],
      x: newX,
      y: newY
    }
    setLayers(newLayers)
    
    // 清除拖拽偏移量
    setDragOffset({ x: 0, y: 0 })
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
            maxWidth: '80vw',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <Stage 
              width={imageSize.width > 0 ? imageSize.width : 800} 
              height={imageSize.height > 0 ? imageSize.height : 600}
              style={{ border: '1px solid #ddd', borderRadius: '4px' }}
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
                      isSelected={isSelected}
                      imageSize={imageSize}
                      onDragStart={(e) => handleLayerDragStart(index, e)}
                      onDragMove={(e) => handleLayerDragMove(index, e)}
                      onDragEnd={(e) => handleLayerDragEnd(index, e)}
                      onClick={(e) => handleLayerClick(index, e)}
                      onMouseEnter={() => handleLayerMouseEnter(index)}
                      onMouseLeave={handleLayerMouseLeave}
                    />
                  )
                })}
              </Layer>
            </Stage>
          </div>
          
          {/* 側邊欄：圖層列表 */}
          <div style={{
            width: '250px',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            padding: '15px',
            backgroundColor: '#fff',
            maxHeight: '600px',
            overflowY: 'auto'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '18px' }}>
              圖層列表 ({layers.length})
            </h3>
            
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
            
            {layers.map((layer, index) => {
              const isSelected = selectedLayerIndex === index || selectedLayers.includes(index)
              const isHovered = hoveredLayerIndex === index
              
              return (
                <div
                  key={layer.id}
                  className={isHovered ? 'hovered' : ''}
                  style={{
                    padding: '10px',
                    marginBottom: '8px',
                    border: isSelected ? '2px solid #4a90e2' : (isHovered ? '2px solid #ffc107' : '1px solid #e0e0e0'),
                    borderRadius: '4px',
                    backgroundColor: isSelected ? '#e3f2fd' : (isHovered ? '#fff9c4' : '#f9f9f9'),
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={(e) => handleLayerClick(index, e)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: isSelected ? 'bold' : 'normal' }}>
                      圖層 {index + 1}
                    </span>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleLayerVisible(index)
                        }}
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          backgroundColor: layer.visible ? '#4caf50' : '#ccc',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer'
                        }}
                      >
                        {layer.visible ? '顯示' : '隱藏'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteLayer(index)
                        }}
                        style={{
                          padding: '4px 8px',
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
                </div>
              )
            })}
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
