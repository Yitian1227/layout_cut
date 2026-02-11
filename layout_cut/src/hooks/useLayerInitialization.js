import { useEffect, useRef } from 'react'

/**
 * 从分割结果初始化图层的 hook
 */
export function useLayerInitialization(
  segmentedMasks,
  currentStep,
  isSegmenting,
  imageSize,
  layerManagement,
  setCurrentStep,
  setCompletedSteps
) {
  // 使用 ref 來追蹤是否已經初始化，防止重複執行
  const hasInitializedRef = useRef(false)
  
  // 使用 ref 來存儲最新的 layerManagement，避免依賴項變化導致重複執行
  const layerManagementRef = useRef(layerManagement)
  layerManagementRef.current = layerManagement
  
  useEffect(() => {
    // 關鍵修復：只有在滿足條件且尚未初始化時才執行
    if (segmentedMasks.length > 0 && currentStep === 2 && !isSegmenting && !hasInitializedRef.current) {
      // 標記為已初始化，防止重複執行
      hasInitializedRef.current = true
      
      // 初始化圖層列表
      // segmentedMasks 現在是包含 { image, offsetX, offsetY, width, height } 的對象數組
      const initialLayers = segmentedMasks.map((maskData, index) => ({
        id: index,
        name: `圖層 ${index + 1}`, // 圖層名稱
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
      
      // 移除居中調整，直接使用原始位置
      layerManagementRef.current.setLayers(initialLayers)
      layerManagementRef.current.setSelectedLayerIndex(null)
      layerManagementRef.current.setSelectedLayers([])
      layerManagementRef.current.setHoveredLayerIndex(null)
      setCurrentStep(3)
      // 標記 step 3（物件分割）為完成
      if (setCompletedSteps) {
        setCompletedSteps(prev => {
          if (!prev.includes(3)) {
            return [...prev, 3]
          }
          return prev
        })
      }
      // 初始化圖層列表項引用數組
      layerManagementRef.current.layerItemRefs.current = new Array(initialLayers.length).fill(null).map(() => ({ current: null }))
    }
    
    // 當 segmentedMasks 被清空時，重置初始化標記
    if (segmentedMasks.length === 0) {
      hasInitializedRef.current = false
    }
    
    // 移除 layerManagement 和 setCompletedSteps 從依賴項，因為它們的引用可能不穩定
    // 使用 ref 來訪問最新的 layerManagement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentedMasks, currentStep, isSegmenting, imageSize.width, imageSize.height, setCurrentStep])
}
