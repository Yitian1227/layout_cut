import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'

const API_BASE = 'http://localhost:8000'
const LEFT_SIDEBAR_WIDTH = 320
/** 步驟：1 上傳 → 2 圈選 → 3 分割/編輯畫布 → 4 生成動態（已移除「圖層編輯」獨立步驟） */
const STEP_CANVAS = 3
const STEP_GENERATE_DONE = 4

const isCanvasLayoutStep = (step) => step === STEP_CANVAS || step === STEP_GENERATE_DONE

// 導入組件
import ProgressBar from './components/ProgressBar'
import SegmentButton from './components/SegmentButton'
import SegmentedPreview from './components/SegmentedPreview'
import KonvaCanvas from './components/Canvas/KonvaCanvas'
import LeftSidebar from './components/LeftSidebar'
import AnimationPrompt from './components/AnimationPrompt'
import AnimationHistorySidebar, {
  ANIMATION_HISTORY_SIDEBAR_WIDTH
} from './components/AnimationHistorySidebar'
import { useBrushTool } from './components/BrushTool'

// RLE 工具
import { decodeRLEToColoredImageData, getRandomMaskColor } from './utils/rle'
import {
  loadAnimationHistoryRecords,
  saveAnimationHistoryRecords
} from './utils/animationHistoryStorage'

// 導入自定義 hooks
import { useImageSize } from './hooks/useImageSize'
import { useLayerManagement } from './hooks/useLayerManagement'
import { useCanvasInteraction } from './hooks/useCanvasInteraction'
import { useLayerInitialization } from './hooks/useLayerInitialization'

function App() {
  const stepNames = ['上傳圖片', '圈選物件', '物件分割', '生成動態']
  const [currentStep, setCurrentStep] = useState(1)
  const [completedSteps, setCompletedSteps] = useState([]) // 追蹤已完成的步驟
  const [baseImage, setBaseImage] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [isSegmenting, setIsSegmenting] = useState(false)
  const [segmentedMasks, setSegmentedMasks] = useState([])
  // Segment Everything 自動分割的遮罩
  const [autoMasks, setAutoMasks] = useState([])
  const [showAutoMasks, setShowAutoMasks] = useState(true)
  const [isAutoSegmenting, setIsAutoSegmenting] = useState(false)
  // 互動模式：智慧點擊 (smart) / 畫筆 (brush)
  const [interactionMode, setInteractionMode] = useState('smart')
  const [hoveredAutoMaskId, setHoveredAutoMaskId] = useState(null)
  const [selectedAutoMaskIds, setSelectedAutoMaskIds] = useState([])
  // 可調整的鄰近合併距離（像素）
  const mergeProximity = 40
  const [selectedLayerPosition, setSelectedLayerPosition] = useState(null) // 選中圖層的位置信息
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false)
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [videoModalSrc, setVideoModalSrc] = useState(null)
  const [generatedVideos, setGeneratedVideos] = useState([])
  const videoPollRef = useRef(null)
  /** 本次生成完成、尚未寫入紀錄的預覽（關閉 Modal 或下載後 commit） */
  const pendingVideoHistoryRef = useRef(null)
  /** 避免初次從 localStorage hydrate 時覆寫儲存 */
  const animationHistoryHydratedRef = useRef(false)
  const skipNextHistorySaveRef = useRef(true)
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
    clearAllPaths
  } = useBrushTool(baseImage, segmentedMasks, selectedFile, imageSize)

  // 模式切換：智慧點擊 / 手畫筆刷
  const toggleMode = (mode) => {
    if (mode === 'smart') {
      setInteractionMode('smart')
      setIsBrushMode(false)
      return
    }
    setInteractionMode('brush')
    setIsBrushMode(true)
  }
  
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
    console.log('handleImageUpload 觸發，選取檔案：', file)
    if (!file) return

    setSelectedFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      console.log('圖片 FileReader 讀取完成，準備更新 baseImage 並啟動自動分割流程')
      setBaseImage(reader.result)
      // 標記 step 1 為完成
      setCompletedSteps([1])
      // 清空舊狀態
      layerManagement.clearLayers()
      setSegmentedMasks([])
      setAutoMasks([])
      setShowAutoMasks(true)
      // 一上傳完圖片立刻轉入編輯畫面
      setCurrentStep(3)
      // 預設回到智慧選取模式
      setInteractionMode('smart')
      setIsBrushMode(false)

      // 上傳完成後，自動呼叫 /segment-everything
      ;(async () => {
        console.log('準備呼叫自動分割 API (/segment-everything)...')
        try {
          setIsAutoSegmenting(true)
          // 暫時關閉畫筆工具
          if (setIsBrushMode) {
            setIsBrushMode(false)
          }
          setInteractionMode('smart')
          setHoveredAutoMaskId(null)
          setSelectedAutoMaskIds([])

          const formData = new FormData()
          formData.append('file', file)
          console.log('自動分割 API formData 建立完成，開始 fetch...')

          const response = await fetch(
            'http://localhost:8000/segment-everything?max_masks=120&min_area=0',
            {
              method: 'POST',
              body: formData
            }
          )

          console.log('自動分割 API 回應物件：', response)

          if (!response.ok) {
            if (response.status === 404) {
              throw new Error('API_NOT_FOUND_404:/segment-everything')
            }
            throw new Error(`HTTP error! status: ${response.status}`)
          }

          const data = await response.json()
          console.log('自動分割 API 回傳資料：', data)

          const masks = Array.isArray(data.masks) ? data.masks : []

          const processed = masks
            .map((m, index) => {
              if (!m.rle || !m.bbox) return null
              const color = getRandomMaskColor()
              const imageDataInfo = decodeRLEToColoredImageData(
                m.rle,
                m.bbox,
                color
              )
              if (!imageDataInfo || imageDataInfo.width === 0 || imageDataInfo.height === 0) {
                return null
              }
              const polygon = Array.isArray(m.polygon) ? m.polygon.map((v) => Number(v)) : []
              return {
                id: `auto-mask-${index}`,
                bbox: m.bbox,
                area: m.area,
                score: m.score,
                stabilityScore: m.stability_score,
                color,
                imageDataInfo,
                polygon
              }
            })
            .filter(Boolean)

          console.log('自動分割處理後的遮罩數量：', processed.length)
          setAutoMasks(processed)
        } catch (error) {
          console.error('API 錯誤 (segment-everything):', error)
          if (String(error?.message || '').includes('API_NOT_FOUND_404')) {
            alert('找不到 /segment-everything API（404）。請重啟後端並確認已載入新版 app.py。')
          } else {
            alert('自動分割發生錯誤，請打開瀏覽器 Console 檢查詳細訊息。')
          }
        } finally {
          console.log('自動分割流程結束，關閉 Loading 狀態')
          setIsAutoSegmenting(false)
        }
      })()
    }
    reader.readAsDataURL(file)
  }

  const handleButtonClick = () => {
    // 如果目前有圖片，清空所有狀態
    if (baseImage !== null) {
      setBaseImage(null)
      setSelectedFile(null)
      setSegmentedMasks([])
      setAutoMasks([])
      setCurrentStep(1)
      setCompletedSteps([])
      setIsSegmenting(false)
      setIsAutoSegmenting(false)
      setInteractionMode('smart')
      setHoveredAutoMaskId(null)
      setSelectedAutoMaskIds([])
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

  useEffect(() => {
    return () => {
      if (videoPollRef.current) {
        clearInterval(videoPollRef.current)
        videoPollRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const list = loadAnimationHistoryRecords(API_BASE)
    setGeneratedVideos(list)
    animationHistoryHydratedRef.current = true
    skipNextHistorySaveRef.current = true
  }, [])

  useEffect(() => {
    if (!animationHistoryHydratedRef.current) return
    if (skipNextHistorySaveRef.current) {
      skipNextHistorySaveRef.current = false
      return
    }
    saveAnimationHistoryRecords(generatedVideos)
  }, [generatedVideos])

  const stopVideoPolling = () => {
    if (videoPollRef.current) {
      clearInterval(videoPollRef.current)
      videoPollRef.current = null
    }
  }

  const commitPendingVideoHistory = useCallback(() => {
    const p = pendingVideoHistoryRef.current
    if (!p || p.committed) {
      pendingVideoHistoryRef.current = null
      return
    }
    p.committed = true
    const { videoUrl, prompt: pPrompt, layerName } = p
    setGeneratedVideos((prev) => [
      ...prev,
      {
        id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        videoUrl,
        prompt: pPrompt,
        layerName,
        createdAt: Date.now()
      }
    ])
    pendingVideoHistoryRef.current = null
  }, [])

  const downloadVideoFile = useCallback(async (videoUrl, suggestedBase = 'animation') => {
    const name = `${suggestedBase}-${Date.now()}.mp4`
    try {
      if (videoUrl.startsWith('data:')) {
        const a = document.createElement('a')
        a.href = videoUrl
        a.download = name
        a.click()
        return
      }
      const res = await fetch(videoUrl)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = name
      a.click()
      URL.revokeObjectURL(objUrl)
    } catch (e) {
      console.error(e)
      window.open(videoUrl, '_blank')
    }
  }, [])

  const closeVideoModal = useCallback(() => {
    commitPendingVideoHistory()
    setShowVideoModal(false)
    setVideoModalSrc(null)
  }, [commitPendingVideoHistory])

  const handleModalDownloadClick = useCallback(() => {
    if (!videoModalSrc) return
    commitPendingVideoHistory()
    void downloadVideoFile(videoModalSrc, 'veo-animation')
  }, [videoModalSrc, commitPendingVideoHistory, downloadVideoFile])

  const handleViewHistoryAgain = useCallback((rec) => {
    setVideoModalSrc(rec.videoUrl)
    setShowVideoModal(true)
  }, [])

  const handleDownloadHistoryRecord = useCallback(
    (rec) => {
      const safe = (rec.layerName || 'layer').replace(/[^\w\u4e00-\u9fff-]+/g, '_')
      void downloadVideoFile(rec.videoUrl, safe)
    },
    [downloadVideoFile]
  )

  const handleAnimationGenerate = useCallback(async ({ layer, prompt, layerIndex }) => {
    if (!layer?.src) {
      alert('無法取得圖層圖片，請重新選擇圖層')
      return
    }
    const trimmed = (prompt || '').trim()
    if (!trimmed) {
      alert('請輸入動作描述')
      return
    }

    const layerName =
      layer?.name ||
      `圖層 ${typeof layerIndex === 'number' ? layerIndex + 1 : 1}`

    stopVideoPolling()
    setIsGeneratingVideo(true)

    try {
      const res = await fetch(`${API_BASE}/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_data: layer.src,
          prompt: trimmed
        })
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || `HTTP ${res.status}`)
      }
      const { job_id: jobId } = await res.json()
      if (!jobId) {
        throw new Error('回應中缺少 job_id')
      }

      /** @returns {Promise<boolean>} true 表示應繼續輪詢 */
      const pollOnce = async () => {
        try {
          const sres = await fetch(`${API_BASE}/video-status/${jobId}`)
          if (!sres.ok) {
            throw new Error(`狀態查詢失敗: HTTP ${sres.status}`)
          }
          const status = await sres.json()
          const st = status.status

          if (st === 'completed') {
            stopVideoPolling()
            setIsGeneratingVideo(false)
            let src = null
            if (status.video_url) {
              const path = status.video_url.startsWith('/')
                ? status.video_url
                : `/${status.video_url}`
              src = `${API_BASE}${path}`
            } else if (status.video_base64) {
              const mime = status.video_mime_type || 'video/mp4'
              src = `data:${mime};base64,${status.video_base64}`
            }
            if (!src) {
              alert('已完成但未取得影片網址或 Base64，請檢查後端設定')
              return false
            }
            pendingVideoHistoryRef.current = {
              videoUrl: src,
              prompt: trimmed,
              layerName,
              committed: false
            }
            setVideoModalSrc(src)
            setShowVideoModal(true)
            setCurrentStep(STEP_GENERATE_DONE)
            setCompletedSteps((prev) => {
              const s = new Set(prev)
              ;[1, 2, STEP_CANVAS, STEP_GENERATE_DONE].forEach((n) => s.add(n))
              return Array.from(s).sort((a, b) => a - b)
            })
            return false
          }
          if (st === 'failed') {
            stopVideoPolling()
            setIsGeneratingVideo(false)
            alert(status.error || status.message || '影片生成失敗')
            return false
          }
          return true
        } catch (e) {
          stopVideoPolling()
          setIsGeneratingVideo(false)
          console.error(e)
          alert(e.message || '輪詢狀態時發生錯誤')
          return false
        }
      }

      const keepPolling = await pollOnce()
      if (keepPolling) {
        videoPollRef.current = setInterval(() => {
          void pollOnce()
        }, 5000)
      }
    } catch (e) {
      stopVideoPolling()
      setIsGeneratingVideo(false)
      console.error(e)
      alert(e.message || '建立生成任務失敗')
    }
  }, [])

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

  const drawClosedPath = (ctx, path) => {
    if (!path || path.length < 2) return
    ctx.beginPath()
    ctx.moveTo(path[0].x, path[0].y)
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y)
    }
    ctx.closePath()
    ctx.fill()
  }

  const createMaskCanvas = () => {
    const width = imageSize.width || 1000
    const height = imageSize.height || 800

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    // 黑底（未選區）
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, width, height)

    // 白色為選取區
    ctx.fillStyle = 'white'
    drawSelectedAutoMasksToCanvas(ctx, width, height)

    if (brushPath?.length > 0) drawClosedPath(ctx, brushPath)
    if (addPaths?.length > 0) {
      addPaths.forEach((p) => drawClosedPath(ctx, p))
    }
    if (currentPath?.length > 1) drawClosedPath(ctx, currentPath)
    if (polygonPoints?.length >= 3 && isPolygonClosed) drawClosedPath(ctx, polygonPoints)
    if (rectangleStart && rectangleEnd) {
      const rectPath = [
        rectangleStart,
        { x: rectangleEnd.x, y: rectangleStart.y },
        rectangleEnd,
        { x: rectangleStart.x, y: rectangleEnd.y }
      ]
      drawClosedPath(ctx, rectPath)
    }

    // 減選區域
    if (subtractPaths?.length > 0) {
      ctx.globalCompositeOperation = 'destination-out'
      subtractPaths.forEach((p) => drawClosedPath(ctx, p))
      ctx.globalCompositeOperation = 'source-over'
    }

    return { canvas, ctx, width, height }
  }

  const extractConnectedComponentsMasks = (sourceCanvas, width, height) => {
    const srcCtx = sourceCanvas.getContext('2d')
    const imageData = srcCtx.getImageData(0, 0, width, height)
    const data = imageData.data
    const size = width * height
    const minPixels = 60 // 過濾小噪點

    // 1) 原始前景（二值）
    const original = new Uint8Array(size)
    for (let i = 0; i < size; i++) {
      original[i] = data[i * 4] > 127 ? 1 : 0
    }

    // 2) 膨脹（使用方形核半徑 mergeProximity），只用於分組
    const r = Math.max(0, Math.floor(mergeProximity))
    let dilated = original
    if (r > 0) {
      const integral = new Int32Array((width + 1) * (height + 1))
      for (let y = 1; y <= height; y++) {
        let rowSum = 0
        for (let x = 1; x <= width; x++) {
          rowSum += original[(y - 1) * width + (x - 1)]
          integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + rowSum
        }
      }

      const rectSum = (x0, y0, x1, y1) => {
        const A = integral[y0 * (width + 1) + x0]
        const B = integral[y0 * (width + 1) + x1]
        const C = integral[y1 * (width + 1) + x0]
        const D = integral[y1 * (width + 1) + x1]
        return D - B - C + A
      }

      dilated = new Uint8Array(size)
      for (let y = 0; y < height; y++) {
        const y0 = Math.max(0, y - r)
        const y1 = Math.min(height, y + r + 1)
        for (let x = 0; x < width; x++) {
          const x0 = Math.max(0, x - r)
          const x1 = Math.min(width, x + r + 1)
          if (rectSum(x0, y0, x1, y1) > 0) {
            dilated[y * width + x] = 1
          }
        }
      }
    }

    // 3) 在「膨脹後」做連通區域標記，得到群組 ID
    const labels = new Int32Array(size)
    let labelCount = 0
    const stack = []

    for (let i = 0; i < size; i++) {
      if (!dilated[i] || labels[i] !== 0) continue
      labelCount += 1
      labels[i] = labelCount
      stack.push(i)

      while (stack.length > 0) {
        const cur = stack.pop()
        const x = cur % width
        const y = Math.floor(cur / width)

        const n1 = x > 0 ? cur - 1 : -1
        const n2 = x < width - 1 ? cur + 1 : -1
        const n3 = y > 0 ? cur - width : -1
        const n4 = y < height - 1 ? cur + width : -1

        if (n1 >= 0 && dilated[n1] && labels[n1] === 0) { labels[n1] = labelCount; stack.push(n1) }
        if (n2 >= 0 && dilated[n2] && labels[n2] === 0) { labels[n2] = labelCount; stack.push(n2) }
        if (n3 >= 0 && dilated[n3] && labels[n3] === 0) { labels[n3] = labelCount; stack.push(n3) }
        if (n4 >= 0 && dilated[n4] && labels[n4] === 0) { labels[n4] = labelCount; stack.push(n4) }
      }
    }

    // 4) 用「原始未膨脹」前景像素回填每個群組，保持精確邊緣
    const groupedOriginal = new Map()
    for (let i = 0; i < size; i++) {
      if (!original[i]) continue
      const gid = labels[i]
      if (!gid) continue
      if (!groupedOriginal.has(gid)) groupedOriginal.set(gid, [])
      groupedOriginal.get(gid).push(i)
    }

    // 5) 每個群組生成獨立 mask（黑底白景），但內容使用原始邊界
    const resultMasks = []
    for (const [, pixelIndexes] of groupedOriginal.entries()) {
      if (!pixelIndexes || pixelIndexes.length < minPixels) continue

      const c = document.createElement('canvas')
      c.width = width
      c.height = height
      const cctx = c.getContext('2d')
      const out = cctx.createImageData(width, height)

      // 黑底 alpha=255
      for (let p = 0; p < out.data.length; p += 4) {
        out.data[p] = 0
        out.data[p + 1] = 0
        out.data[p + 2] = 0
        out.data[p + 3] = 255
      }

      for (const idx of pixelIndexes) {
        const base = idx * 4
        out.data[base] = 255
        out.data[base + 1] = 255
        out.data[base + 2] = 255
        out.data[base + 3] = 255
      }

      cctx.putImageData(out, 0, 0)
      resultMasks.push(c.toDataURL('image/png'))
    }

    return resultMasks
  }

  const drawSelectedAutoMasksToCanvas = (ctx, width, height) => {
    if (!selectedAutoMaskIds.length) return
    const selectedSet = new Set(selectedAutoMaskIds)

    autoMasks.forEach((mask) => {
      if (!selectedSet.has(mask.id)) return
      const info = mask.imageDataInfo
      if (!info || !info.data) return

      const { data, width: mw, height: mh, offsetX, offsetY } = info
      for (let y = 0; y < mh; y++) {
        const py = offsetY + y
        if (py < 0 || py >= height) continue
        for (let x = 0; x < mw; x++) {
          const px = offsetX + x
          if (px < 0 || px >= width) continue
          const srcIdx = (y * mw + x) * 4
          const alpha = data[srcIdx + 3]
          if (alpha > 0) {
            ctx.fillRect(px, py, 1, 1)
          }
        }
      }
    })
  }

  // 畫筆/智慧選取確認：按下「開始分割圖層」時，送出聯集遮罩
  const handleConfirmBrush = async () => {
    if (!selectedFile) {
      alert('請先上傳圖片')
      return
    }

    const hasAnySelection =
      selectedAutoMaskIds.length > 0 ||
      (brushPath && brushPath.length > 0) ||
      (addPaths && addPaths.length > 0) ||
      (currentPath && currentPath.length > 0) ||
      (polygonPoints && polygonPoints.length > 0) ||
      (rectangleStart && rectangleEnd)

    if (!hasAnySelection) {
      alert('請先用智慧點擊或畫筆圈選區域')
      return
    }

    setCompletedSteps([1, 2])
    setIsSegmenting(true)
    try {
      const { canvas, width, height } = createMaskCanvas()
      const componentMasks = extractConnectedComponentsMasks(canvas, width, height)

      if (componentMasks.length === 0) {
        throw new Error('未找到有效連通選取區域')
      }

      const mergedMasks = []
      for (const componentMask of componentMasks) {
        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('mask', componentMask)

        const response = await fetch('http://localhost:8000/segment-with-mask', {
          method: 'POST',
          body: formData
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        if (Array.isArray(data.masks)) {
          mergedMasks.push(...data.masks)
        }
      }

      setSegmentedMasks(mergedMasks)
      // 分割完成後只隱藏自動遮罩顯示（資料保留，方便回溯）
      setShowAutoMasks(false)
      setHoveredAutoMaskId(null)
      setCurrentStep(2)

      requestAnimationFrame(() => {
        setIsSegmenting(false)
      })
    } catch (error) {
      console.error('確認圈選時發生錯誤:', error)
      alert('分割失敗，請確認後端服務是否正常運行')
      setIsSegmenting(false)
    }
  }

  // 回到選取階段：保留 baseImage / autoMasks / 已選取 / 筆刷路徑，清空已生成圖層
  const handleBackToSelection = () => {
    setSegmentedMasks([])
    layerManagement.clearLayers()
    setShowAutoMasks(true)
    setCurrentStep(3)
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
    <div
      className="card"
      style={
        isCanvasLayoutStep(currentStep) && imageSize.width > 0
          ? { padding: 0, margin: 0 }
          : {}
      }
    >
      {/* 非畫布模式時顯示的內容 - 垂直居中 */}
      {!isCanvasLayoutStep(currentStep) && (
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
              <div className="upload-preview-frame">
                <img
                  src={baseImage}
                  alt="預覽"
                  className="upload-preview-img"
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
      {isCanvasLayoutStep(currentStep) && imageSize.width > 0 && (
        <ProgressBar 
          stepNames={stepNames}
          currentStep={currentStep}
          completedSteps={completedSteps}
          isSegmenting={isSegmenting}
        />
      )}

      {/* 分割／圖層編輯／生成動態（步驟 3–4 同一畫布） */}
      {isCanvasLayoutStep(currentStep) && imageSize.width > 0 && (
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
            onBackToSelection={handleBackToSelection}
            currentStep={currentStep}
            segmentedMasks={segmentedMasks}
            interactionMode={interactionMode}
            onToggleMode={toggleMode}
            hasAutoMasks={autoMasks.length > 0}
            isBrushMode={isBrushMode}
            toolType={toolType}
            onSetToolType={setToolType}
            brushMode={brushMode}
            onSetBrushMode={setBrushMode}
            brushSize={brushSize}
            onBrushSizeChange={setBrushSize}
            onConfirmBrush={handleConfirmBrush}
            hasBrushPath={
              selectedAutoMaskIds.length > 0 ||
              (brushPath && brushPath.length > 0) ||
              (currentPath && currentPath.length > 0) ||
              (addPaths && addPaths.length > 0) ||
              (polygonPoints && polygonPoints.length > 0) ||
              (rectangleStart && rectangleEnd)
            }
            isSegmenting={isSegmenting}
          />
            
          {/* 畫布區域 - 扣除左/右側欄與頂部進度條 */}
          <div
            className="canvas-workspace"
            style={{
              marginLeft: `${LEFT_SIDEBAR_WIDTH}px`,
              marginRight: `${ANIMATION_HISTORY_SIDEBAR_WIDTH}px`,
              marginTop: '10px',
              width: `calc(100% - ${LEFT_SIDEBAR_WIDTH + ANIMATION_HISTORY_SIDEBAR_WIDTH}px)`,
              height: 'calc(100vh - 70px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'auto',
              backgroundColor: 'transparent'
            }}
          >
            <KonvaCanvas
              baseImage={baseImage}
              imageSize={imageSize}
              layers={layers}
              autoMasks={autoMasks}
              showAutoMasks={showAutoMasks}
              interactionMode={interactionMode}
              hoveredAutoMaskId={hoveredAutoMaskId}
              selectedAutoMaskIds={selectedAutoMaskIds}
              onAutoMaskHover={setHoveredAutoMaskId}
              onAutoMaskClick={(id, evt) => {
                if (!id) {
                  setHoveredAutoMaskId(null)
                  if (!evt?.evt?.shiftKey) {
                    setSelectedAutoMaskIds([])
                  }
                  return
                }

                const isShiftMulti = !!evt?.evt?.shiftKey

                setSelectedAutoMaskIds((prev) => {
                  if (!isShiftMulti) {
                    return [id]
                  }
                  // Shift 多選：toggle（已選則移除，未選則加入）
                  if (prev.includes(id)) {
                    return prev.filter((x) => x !== id)
                  }
                  return [...prev, id]
                })
              }}
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
                onGenerate={(data) => handleAnimationGenerate(data)}
              />
            )}
          </div>

          <AnimationHistorySidebar
            records={generatedVideos}
            onViewAgain={handleViewHistoryAgain}
            onDownloadRecord={handleDownloadHistoryRecord}
          />
        </div>
      )}
      
      {/* 分割結果預覽（僅在 step 2 時顯示） */}
      <SegmentedPreview
        segmentedMasks={segmentedMasks}
        currentStep={currentStep}
      />

      {/* 全畫面 Loading：自動分析 / 圖層分割 / 生成動態（相同樣式） */}
      {(isAutoSegmenting || isSegmenting || isGeneratingVideo) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              padding: '24px 32px',
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              fontSize: '16px',
              color: '#333',
              maxWidth: '480px',
              textAlign: 'center',
              lineHeight: 1.6
            }}
          >
            {isGeneratingVideo
              ? 'AI 正在為您構思動畫，這可能需要 1-2 分鐘，請稍候...'
              : isAutoSegmenting
                ? 'AI 正在為您分析圖片中的物件，請稍候…'
                : '正在為您分割圖層，請稍候…'}
          </div>
        </div>
      )}

      {/* 生成影片結果 Modal */}
      {showVideoModal && videoModalSrc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="生成影片預覽"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '24px'
          }}
          onClick={closeVideoModal}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
              maxWidth: 'min(960px, 100%)',
              width: '100%',
              padding: '20px',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                display: 'flex',
                gap: '8px',
                alignItems: 'center'
              }}
            >
              <button
                type="button"
                onClick={handleModalDownloadClick}
                title="下載影片"
                aria-label="下載影片"
                style={{
                  border: 'none',
                  background: '#e8f4ff',
                  borderRadius: '6px',
                  width: '36px',
                  height: '36px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1a73e8'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              </button>
              <button
                type="button"
                onClick={closeVideoModal}
                style={{
                  border: 'none',
                  background: '#eee',
                  borderRadius: '6px',
                  width: '36px',
                  height: '36px',
                  cursor: 'pointer',
                  fontSize: '20px',
                  lineHeight: 1,
                  color: '#333'
                }}
                aria-label="關閉"
              >
                ×
              </button>
            </div>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', color: '#333' }}>
              生成結果
            </h3>
            <video
              key={videoModalSrc}
              src={videoModalSrc}
              controls
              autoPlay
              playsInline
              style={{
                width: '100%',
                maxHeight: '70vh',
                borderRadius: '8px',
                backgroundColor: '#000'
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default App
