import { useState, useRef } from 'react'

/**
 * 管理画布交互的 hook（拖拽、点击等）
 */
export function useCanvasInteraction(layers, setLayers) {
  const [draggingLayerIndex, setDraggingLayerIndex] = useState(null)
  const dragStartPosRef = useRef({ x: 0, y: 0 })
  const layerStartPosRef = useRef({ x: 0, y: 0 })
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)

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

  // 點擊畫布空白處取消選擇
  const handleStageClick = (e, onDeselect) => {
    // 如果正在拖拽，不處理點擊事件
    if (draggingLayerIndex !== null) return
    
    const clickedOnEmpty = e.target === e.target.getStage()
    if (clickedOnEmpty && onDeselect) {
      onDeselect()
    }
  }

  return {
    draggingLayerIndex,
    handleLayerPointerDown,
    handleStagePointerMove,
    handleStagePointerUp,
    handleStageClick
  }
}
