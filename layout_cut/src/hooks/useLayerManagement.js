import { useState, useEffect, useRef } from 'react'

/**
 * 管理图层操作的 hook（选择、删除、缩放、旋转、合并等）
 */
export function useLayerManagement(imageSize, setSegmentedMasks) {
  const [layers, setLayers] = useState([])
  const [selectedLayerIndex, setSelectedLayerIndex] = useState(null)
  const [selectedLayers, setSelectedLayers] = useState([])
  const [hoveredLayerIndex, setHoveredLayerIndex] = useState(null)
  const transformerRef = useRef(null)
  const selectedLayerRef = useRef(null)
  const layerItemRefs = useRef([])

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

  // 圖層點擊處理
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

  // 取消選擇
  const handleDeselect = () => {
    setSelectedLayerIndex(null)
    setSelectedLayers([])
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
    setSegmentedMasks(prev => prev.filter((_, i) => i !== index))
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
      
      setSegmentedMasks(prev => {
        const newMasks = prev.filter((_, i) => !layersToMerge.includes(i))
        newMasks.unshift({
          image: mergedDataUrl,
          offsetX: mergedBounds.minX,
          offsetY: mergedBounds.minY,
          width: mergedBounds.maxX - mergedBounds.minX,
          height: mergedBounds.maxY - mergedBounds.minY
        })
        return newMasks
      })
      
      setLayers(newLayers)
      setSelectedLayerIndex(0)
      setSelectedLayers([0])
    } catch (error) {
      console.error('合併圖層時發生錯誤:', error)
      alert('合併圖層失敗')
    }
  }

  // 滑鼠進入圖層時，設定 hoveredLayerIndex
  const handleLayerMouseEnter = (index) => {
    setHoveredLayerIndex(index)
  }

  // 滑鼠離開圖層時，清除 hoveredLayerIndex
  const handleLayerMouseLeave = () => {
    setHoveredLayerIndex(null)
  }

  // 清空所有圖層
  const clearLayers = () => {
    setLayers([])
    setSelectedLayerIndex(null)
    setSelectedLayers([])
    setHoveredLayerIndex(null)
    layerItemRefs.current = []
  }

  return {
    layers,
    setLayers,
    selectedLayerIndex,
    setSelectedLayerIndex,
    selectedLayers,
    setSelectedLayers,
    hoveredLayerIndex,
    setHoveredLayerIndex,
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
    handleLayerMouseLeave,
    clearLayers
  }
}
