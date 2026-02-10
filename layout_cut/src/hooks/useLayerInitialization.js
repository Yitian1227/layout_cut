import { useEffect } from 'react'

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
  useEffect(() => {
    if (segmentedMasks.length > 0 && currentStep === 2 && !isSegmenting) {
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
      layerManagement.setLayers(initialLayers)
      layerManagement.setSelectedLayerIndex(null)
      layerManagement.setSelectedLayers([])
      layerManagement.setHoveredLayerIndex(null)
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
      layerManagement.layerItemRefs.current = new Array(initialLayers.length).fill(null).map(() => ({ current: null }))
    }
    // 移除 setCompletedSteps 從依賴項，因為它是穩定的 setState 函數，不應該觸發重新執行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentedMasks, currentStep, isSegmenting, imageSize, layerManagement, setCurrentStep])
}
